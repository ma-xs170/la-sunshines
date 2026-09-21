-- =====================================================================
-- Tests migration 014 — références ORG / ADM (format, unicité, immuabilité), statut de compte, recherche admin. ROLLBACK.
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';

do $$
declare
  adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; ow constant uuid := '01000000-0000-0000-0000-000000000001';
  o1 uuid; o2 uuid; r1 text; j jsonb; n int; refs text[]; i int;
begin
  -- 1 : THE MOUV rétro-rempli et approuvé ; l'admin a sa référence ADM
  if (select reference from public.organizers where is_default) !~ '^ORG\.[0-9]{8}$' then raise exception 'FAIL 1a : THE MOUV sans référence'; end if;
  if (select account_status from public.organizers where is_default) <> 'approved' then raise exception 'FAIL 1b : THE MOUV non approuvé'; end if;
  if (select admin_reference from public.profiles where id = adm) !~ '^ADM\.[0-9]{8}$' then raise exception 'FAIL 1c : admin sans ADM'; end if;
  if (select admin_reference from public.profiles where id = ow) is not null then raise exception 'FAIL 1d : un non-admin a une ADM'; end if;
  raise notice 'OK 1 : rétro-remplissage';

  -- 2 : nouvelle organisation = en attente, sans référence ; référence créée à l'approbation seulement
  insert into public.organizers (name) values ('Orga Test A') returning id into o1;
  if (select account_status || coalesce(reference, '-') from public.organizers where id = o1) <> 'pending-' then raise exception 'FAIL 2a : état initial'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_set_organizer_status(%L, %L, ''approved'')', ow, o1));
  perform pg_temp.expect('BAD_TRANSITION', format('select public.admin_set_organizer_status(%L, %L, ''suspended'')', adm, o1));
  perform pg_temp.expect('BAD_STATUS', format('select public.admin_set_organizer_status(%L, %L, ''pending'')', adm, o1));
  j := public.admin_set_organizer_status(adm, o1, 'approved');
  r1 := j ->> 'reference';
  if r1 !~ '^ORG\.[0-9]{8}$' or (j ->> 'changed')::boolean is not true then raise exception 'FAIL 2b : % ', j; end if;
  -- suspendre puis réactiver : la référence ne change JAMAIS
  perform public.admin_set_organizer_status(adm, o1, 'suspended');
  j := public.admin_set_organizer_status(adm, o1, 'approved');
  if j ->> 'reference' <> r1 then raise exception 'FAIL 2c : la référence a changé'; end if;
  if (select count(*) from public.audit_log where entity = 'organizer' and entity_id = o1::text and action like 'organizer.%') <> 3 then raise exception 'FAIL 2d : audit'; end if;
  raise notice 'OK 2 : cycle en attente → approuvé → suspendu → approuvé, audit écrit';

  -- 3 : immuabilité
  perform pg_temp.expect('REFERENCE_IMMUTABLE', format('update public.organizers set reference = ''ORG.00000001'' where id = %L', o1));
  perform pg_temp.expect('REFERENCE_IMMUTABLE', format('update public.organizers set reference = null where id = %L', o1));
  perform pg_temp.expect('REFERENCE_IMMUTABLE', format('update public.profiles set admin_reference = ''ADM.00000001'' where id = %L', adm));
  perform pg_temp.expect('new row for relation "organizers" violates check constraint "organizers_reference_format"', format('insert into public.organizers (name, reference, account_status) values (''X'', ''ORG.12'', ''pending'')'));
  raise notice 'OK 3 : références immuables et bien formées';

  -- 4 : unicité + non séquentiel sur 300 tirages
  refs := array[]::text[];
  for i in 1..300 loop refs := refs || public._new_reference('ORG', 'organizers'); end loop;
  select count(distinct x) into n from unnest(refs) x;
  if n < 299 then raise exception 'FAIL 4a : % références distinctes sur 300', n; end if;   -- collision toléree ≤ 1 (aucune attendue)
  select count(*) into n from (select x, lag(x) over () p from unnest(refs) x) t where substr(x, 5)::bigint = substr(p, 5)::bigint + 1;
  if n > 3 then raise exception 'FAIL 4b : tirages séquentiels (%)', n; end if;
  perform pg_temp.expect('BAD_PREFIX', 'select public._new_reference(''XXX'', ''organizers'')');
  raise notice 'OK 4 : 300 références uniques, non séquentielles';

  -- 5 : recherche admin (référence, nom, e-mail), pas pour un organisateur
  insert into public.organizers (name, contact_email, account_status) values ('Beach Party Crew', 'crew@beach.test', 'approved') returning id into o2;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_find_organizers(%L, ''beach'')', ow));
  j := public.admin_find_organizers(adm, 'beach');           if jsonb_array_length(j) <> 1 then raise exception 'FAIL 5a : nom'; end if;
  j := public.admin_find_organizers(adm, 'CREW@BEACH');      if jsonb_array_length(j) <> 1 then raise exception 'FAIL 5b : e-mail'; end if;
  j := public.admin_find_organizers(adm, (select reference from public.organizers where id = o2)); if (j -> 0 ->> 'id')::uuid <> o2 then raise exception 'FAIL 5c : référence'; end if;
  j := public.admin_find_organizers(adm, '%');               if jsonb_array_length(j) <> 0 then raise exception 'FAIL 5d : joker non échappé'; end if;
  insert into public.organizers (name) values ('Orga En Attente');
  j := public.admin_find_organizers(adm, null, 'pending');   if jsonb_array_length(j) <> 1 then raise exception 'FAIL 5e : filtre statut (%)', jsonb_array_length(j); end if;
  perform pg_temp.expect('BAD_FILTER', format('select public.admin_find_organizers(%L, null, ''zzz'')', adm));
  raise notice 'OK 5 : recherche admin';

  -- 6 : org_list expose référence et statut à un membre, sans fuite d''autres organisations
  insert into public.organizer_members (organizer_id, user_id, role) values (o2, ow, 'owner');
  j := public.org_list(ow);
  if jsonb_array_length(j) <> 1 or j -> 0 ->> 'reference' <> (select reference from public.organizers where id = o2) or j -> 0 ->> 'account_status' <> 'approved' then raise exception 'FAIL 6 : %', j; end if;
  raise notice 'OK 6 : org_list';

  -- 7 : un client ne voit pas les références ADM des autres (RLS) ; les fonctions ne sont pas appelables par authenticated
  perform set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if (select count(*) from public.profiles where admin_reference is not null) <> 0 then raise exception 'FAIL 7a : un client voit la référence ADM d''un autre'; end if;
  perform pg_temp.expect('permission denied for function admin_find_organizers', format('select public.admin_find_organizers(%L)', ow));
  reset role;
  raise notice 'OK 7 : droits';
end $$;

rollback;
