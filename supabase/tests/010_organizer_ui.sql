-- =====================================================================
-- Tests migration 010 — rôles owner / manager / staff, informations légales, archivage, revenus masqués. ROLLBACK.
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true); end $$;

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('01000000-0000-0000-0000-000000000002', 'manager@test.local'),
  ('01000000-0000-0000-0000-000000000003', 'staff@test.local'),
  ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';

insert into public.organizers (id, name, contact_email) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', '');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'manager'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 20, true, 'published', 'Salle A');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 20, true, 'published', 'Salle B');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6);
insert into public.orders (id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('09000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'x@test.local', 1500, 0, 1500, now());

do $$
declare
  ow constant uuid := '01000000-0000-0000-0000-000000000001'; mg constant uuid := '01000000-0000-0000-0000-000000000002';
  st constant uuid := '01000000-0000-0000-0000-000000000003'; ow_b constant uuid := '0b000000-0000-0000-0000-000000000003';
  adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; org_a uuid; j jsonb; n int; got text;
begin
  select id into org_a from public.organizers where is_default;

  -- 1 : rôle « viewer » supprimé, « staff » accepté
  begin insert into public.organizer_members (organizer_id, user_id, role) values (org_a, 'ad000000-0000-0000-0000-0000000000ad', 'viewer'); got := 'insere';
  exception when check_violation then got := null; end;
  if got is not null then raise exception 'FAIL 1 : le rôle viewer existe encore'; end if;
  raise notice 'OK 1 : rôles owner / manager / staff';

  -- 2 : accès aux fonctions selon le rôle (staff = aucune lecture, mais accès « scan » implicite via _org_role)
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_stats(%L, ''evt-a'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_archive_event(%L, ''evt-a'', true)', st));
  perform public.org_event_stats(mg, 'evt-a'); perform public.org_event_stats(ow, 'evt-a');
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_stats(%L, ''evt-a'')', ow_b));
  raise notice 'OK 2 : staff sans lecture ; manager et owner lisent ; autre organisateur refusé';

  -- 3 : RLS navigateur — le staff ne lit ni billets, ni commandes, ni la fiche légale de l'organisateur
  perform pg_temp.as_user(st); set local role authenticated;
  select count(*) into n from public.orders;     if n <> 0 then raise exception 'FAIL 3a : le staff lit les commandes'; end if;
  select count(*) into n from public.organizers; if n <> 0 then raise exception 'FAIL 3b : le staff lit la fiche organisateur'; end if;
  select count(*) into n from public.ticketed_events where event_slug = 'evt-a'; if n <> 1 then raise exception 'FAIL 3c : le staff doit voir l''événement'; end if;
  reset role;
  perform pg_temp.as_user(mg); set local role authenticated;
  select count(*) into n from public.orders;     if n <> 1 then raise exception 'FAIL 3d : le manager doit lire les commandes'; end if;
  reset role;
  raise notice 'OK 3 : RLS par rôle';

  -- 4 : org_events — rôle, revenus masqués pour le staff, archivage
  j := public.org_events(st);  if (j -> 0 ->> 'revenue_cents') is not null or j -> 0 ->> 'my_role' <> 'staff' then raise exception 'FAIL 4a : revenus visibles par le staff (%)', j; end if;
  j := public.org_events(mg);  if (j -> 0 ->> 'revenue_cents')::int <> 1500 or (j -> 0 ->> 'archived')::boolean then raise exception 'FAIL 4b : %', j; end if;
  perform public.org_archive_event(mg, 'evt-a', true);
  j := public.org_events(mg);  if not (j -> 0 ->> 'archived')::boolean then raise exception 'FAIL 4c : archivage'; end if;
  perform public.org_archive_event(mg, 'evt-a', false);
  j := public.org_events(mg);  if (j -> 0 ->> 'archived')::boolean then raise exception 'FAIL 4d : désarchivage'; end if;
  select count(*) into n from public.audit_log where actor_id = mg and action in ('organizer.event_archive', 'organizer.event_unarchive');
  if n <> 2 then raise exception 'FAIL 4e : audit archivage (%)', n; end if;
  raise notice 'OK 4 : revenus masqués au staff, archivage réversible et journalisé';

  -- 5 : org_list — le staff ne reçoit pas les informations légales
  j := public.org_list(st);  if j -> 0 ->> 'siret' is not null or j -> 0 ->> 'my_role' <> 'staff' then raise exception 'FAIL 5a : %', j; end if;
  j := public.org_list(mg);  if j -> 0 ->> 'siret' <> '10425394300013' then raise exception 'FAIL 5b'; end if;
  j := public.org_list(adm); if jsonb_array_length(j) <> 2 then raise exception 'FAIL 5c : l''admin voit toutes les organisations'; end if;
  raise notice 'OK 5 : org_list selon le rôle';

  -- 6 : informations légales — owner / admin seulement, validées, journalisées
  perform pg_temp.expect('FORBIDDEN', format('select public.org_update_organizer(%L, %L, ''X'', '''', '''', '''', '''', '''')', mg, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_update_organizer(%L, %L, ''X'', '''', '''', '''', '''', '''')', st, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_update_organizer(%L, %L, ''X'', '''', '''', '''', '''', '''')', ow_b, org_a));
  perform pg_temp.expect('BAD_SIRET', format('select public.org_update_organizer(%L, %L, ''X'', '''', ''123'', '''', '''', '''')', ow, org_a));
  perform pg_temp.expect('BAD_EMAIL', format('select public.org_update_organizer(%L, %L, ''X'', '''', '''', '''', '''', ''pas-un-email'')', ow, org_a));
  perform pg_temp.expect('ORG_NAME_REQUIRED', format('select public.org_update_organizer(%L, %L, '' '', '''', '''', '''', '''', '''')', ow, org_a));
  perform public.org_update_organizer(ow, org_a, 'THE MOUV 2', 'Association', '104 253 943 00013', 'Dupont Jean', '1 rue Test', 'Contact@Test.Local');
  if (select siret || '|' || contact_email || '|' || name from public.organizers where id = org_a) <> '10425394300013|contact@test.local|THE MOUV 2' then raise exception 'FAIL 6a : mise à jour'; end if;
  if not exists (select 1 from public.audit_log where actor_id = ow and action = 'organizer.legal_update' and entity_id = org_a::text) then raise exception 'FAIL 6b : audit'; end if;
  perform public.org_update_organizer(adm, org_a, 'THE MOUV', 'Association loi 1901', '10425394300013', '', '1 Morne Caruel', 'themouv2.0971@gmail.com');
  raise notice 'OK 6 : informations légales — owner / admin, validation, journal';

  -- 7 : fonctions non appelables par le navigateur
  set local role authenticated;
  begin perform public.org_list(ow); got := 'ok'; exception when insufficient_privilege then got := null; end;
  if got is not null then raise exception 'FAIL 7 : org_list appelable par authenticated'; end if;
  reset role;
  raise notice 'OK 7 : fonctions org_* réservées au service_role';
end $$;
rollback;
