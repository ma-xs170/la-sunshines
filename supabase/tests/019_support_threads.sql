-- =====================================================================
-- Tests migration 019 — support : visibilité, notes internes, prise en charge atomique, ajout par référence ORG, ticket fermé en lecture seule. ROLLBACK.
-- =====================================================================
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'a1@test.local'), ('ad000000-0000-0000-0000-0000000000a2', 'a2@test.local'),
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'), ('01000000-0000-0000-0000-000000000003', 'staff@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local'), ('0c000000-0000-0000-0000-000000000003', 'owner-c@test.local');
update public.profiles set role = 'admin', first_name = 'Ada' where id = 'ad000000-0000-0000-0000-0000000000ad';
update public.profiles set role = 'admin', first_name = 'Bob' where id = 'ad000000-0000-0000-0000-0000000000a2';
insert into public.admin_accounts (user_id, level, must_change_password) values ('ad000000-0000-0000-0000-0000000000ad', 'super', false), ('ad000000-0000-0000-0000-0000000000a2', 'admin', false);
insert into public.organizers (id, name, contact_email, account_status) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Orga B', 'b@test.local', 'approved'), ('0c0c0c0c-0000-0000-0000-00000000000c', 'Orga C', 'c@test.local', 'approved');
insert into public.organizer_members (organizer_id, user_id, role) values ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'), ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner'), ('0c0c0c0c-0000-0000-0000-00000000000c', '0c000000-0000-0000-0000-000000000003', 'owner');

do $$
declare a1 constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; a2 constant uuid := 'ad000000-0000-0000-0000-0000000000a2'; ow constant uuid := '01000000-0000-0000-0000-000000000001'; st constant uuid := '01000000-0000-0000-0000-000000000003';
  ob constant uuid := '0b000000-0000-0000-0000-000000000003'; oc constant uuid := '0c000000-0000-0000-0000-000000000003';
  orga uuid := (select id from public.organizers where is_default); orgb constant uuid := '0b0b0b0b-0000-0000-0000-00000000000b'; orgc constant uuid := '0c0c0c0c-0000-0000-0000-00000000000c';
  t jsonb; tid uuid; j jsonb; refb text := (select reference from public.organizers where id = '0b0b0b0b-0000-0000-0000-00000000000b'); refc text := (select reference from public.organizers where id = '0c0c0c0c-0000-0000-0000-00000000000c');
begin
  -- 1 : création : référence TK., rôle, validation
  perform pg_temp.expect('FORBIDDEN', format('select public.support_create(%L, %L, ''Objet du ticket'', ''technical'', ''high'', ''Bonjour'')', st, orga));   -- staff : pas de support
  perform pg_temp.expect('FORBIDDEN', format('select public.support_create(%L, %L, ''Objet du ticket'', ''technical'', ''high'', ''Bonjour'')', ow, orgb));
  perform pg_temp.expect('EMPTY_MESSAGE', format('select public.support_create(%L, %L, ''Objet du ticket'', ''technical'', ''high'', ''  '')', ow, orga));
  perform pg_temp.expect('BAD_PRIORITY', format('select public.support_create(%L, %L, ''Objet du ticket'', ''technical'', ''zzz'', ''x'')', ow, orga));
  perform pg_temp.expect('new row for relation "support_threads" violates check constraint "support_threads_category_check"', format('select public.support_create(%L, %L, ''Objet du ticket'', ''blabla'', ''low'', ''x'')', ow, orga));
  t := public.support_create(ow, orga, 'Problème de scan', 'technical', 'urgent', 'Le scan ne marche pas', '[{"path":"support/x.pdf","name":"x.pdf","size":1000,"type":"application/pdf"}]', '{"page":"/organisateur"}');
  tid := (t ->> 'id')::uuid; if t ->> 'reference' !~ '^TK\.[0-9]{6}$' then raise exception 'FAIL 1a'; end if;
  raise notice 'OK 1';
  -- 2 : visibilité : créateur, admins ; jamais une autre organisation
  perform pg_temp.expect('THREAD_NOT_FOUND', format('select public.support_get(%L, %L)', ob, tid));
  perform pg_temp.expect('THREAD_NOT_FOUND', format('select public.support_get(%L, %L)', st, tid));
  perform pg_temp.expect('THREAD_NOT_FOUND', format('select public.support_post(%L, %L, ''intrus'')', ob, tid));
  j := public.support_get(a1, tid); if j ->> 'role' <> 'admin' or jsonb_array_length(j -> 'messages') <> 1 then raise exception 'FAIL 2a'; end if;
  if jsonb_array_length(public.support_list(ob, orgb)) <> 0 or jsonb_array_length(public.support_list(ow, orga)) <> 1 then raise exception 'FAIL 2b'; end if;
  if (public.support_list(ow, orga) -> 0 ->> 'unread') <> 'false' then raise exception 'FAIL 2c : son propre message non lu'; end if;
  raise notice 'OK 2';
  -- 3 : prise en charge atomique, nom de l'admin visible, réponse, note interne invisible
  perform public.support_claim(a1, tid);
  perform pg_temp.expect('ALREADY_CLAIMED', format('select public.support_claim(%L, %L)', a2, tid));
  perform pg_temp.expect('FORBIDDEN', format('select public.support_claim(%L, %L)', ow, tid));
  if public.support_get(ow, tid) -> 'thread' ->> 'admin_name' <> 'Ada' or public.support_get(ow, tid) -> 'thread' ->> 'status' <> 'claimed' then raise exception 'FAIL 3a'; end if;
  perform public.support_post(a1, tid, 'Nous regardons.');
  perform public.support_post(a1, tid, 'Note interne : client compliqué', '[]', true);
  perform pg_temp.expect('FORBIDDEN', format('select public.support_post(%L, %L, ''x'', ''[]'', true)', ow, tid));
  if jsonb_array_length(public.support_get(ow, tid) -> 'messages') <> 2 then raise exception 'FAIL 3b : note interne visible'; end if;
  if jsonb_array_length(public.support_get(a1, tid) -> 'messages') <> 3 then raise exception 'FAIL 3c'; end if;
  perform public.support_post(a1, tid, 'Deuxième message.');
  if (public.support_list(ow, orga) -> 0 ->> 'unread') <> 'true' then raise exception 'FAIL 3d : non lu attendu'; end if;
  perform public.support_get(ow, tid); if (public.support_list(ow, orga) -> 0 ->> 'unread') <> 'false' then raise exception 'FAIL 3e : lu'; end if;
  perform public.support_transfer(a1, tid, a2); if public.support_get(ow, tid) -> 'thread' ->> 'admin_name' <> 'Bob' then raise exception 'FAIL 3f : transfert'; end if;
  raise notice 'OK 3';
  -- 4 : ajout d'une organisation PAR RÉFÉRENCE uniquement ; on ne révèle que le nom après ajout
  perform pg_temp.expect('BAD_REFERENCE', format('select public.support_add_participant(%L, %L, ''Orga B'')', ow, tid));
  perform pg_temp.expect('BAD_REFERENCE', format('select public.support_add_participant(%L, %L, ''b@test.local'')', ow, tid));
  perform pg_temp.expect('BAD_REFERENCE', format('select public.support_add_participant(%L, %L, ''ORG.00000000'')', ow, tid));
  perform pg_temp.expect('THREAD_NOT_FOUND', format('select public.support_add_participant(%L, %L, %L)', ob, tid, refc));
  if public.support_add_participant(ow, tid, lower(refb)) ->> 'name' <> 'Orga B' then raise exception 'FAIL 4a'; end if;
  perform pg_temp.expect('ALREADY_ADDED', format('select public.support_add_participant(%L, %L, %L)', ow, tid, refb));
  perform pg_temp.expect('ALREADY_ADDED', format('select public.support_add_participant(%L, %L, %L)', ow, tid, (select reference from public.organizers where id = orga)));
  if public.support_get(ob, tid) ->> 'role' <> 'org' or jsonb_array_length(public.support_list(ob, orgb)) <> 1 then raise exception 'FAIL 4b : le participant ne voit pas le ticket'; end if;
  perform pg_temp.expect('THREAD_NOT_FOUND', format('select public.support_get(%L, %L)', oc, tid));      -- une troisième organisation ne voit toujours rien
  perform public.support_add_participant(a1, tid, refc); if public.support_get(oc, tid) is null then raise exception 'FAIL 4c : ajout par un admin'; end if;
  raise notice 'OK 4';
  -- 5 : fermeture : lecture seule, notes, réouverture admin seulement
  perform pg_temp.expect('FORBIDDEN', format('select public.support_close(%L, %L, ''ok'')', ow, tid));
  perform public.support_close(a2, tid, 'Résolu');
  perform pg_temp.expect('CLOSED', format('select public.support_post(%L, %L, ''encore'')', ow, tid));
  perform pg_temp.expect('CLOSED', format('select public.support_add_participant(%L, %L, %L)', ow, tid, refc));
  if public.support_get(ow, tid) -> 'thread' ->> 'status' <> 'closed' or public.support_get(ow, tid) -> 'thread' ->> 'closed_note' <> 'Résolu' then raise exception 'FAIL 5a'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.support_reopen(%L, %L)', ow, tid));
  perform public.support_reopen(a1, tid); if public.support_get(ow, tid) -> 'thread' ->> 'status' <> 'claimed' then raise exception 'FAIL 5b'; end if;
  if jsonb_array_length(public.support_get(a1, tid) -> 'events') < 6 then raise exception 'FAIL 5c : historique'; end if;
  raise notice 'OK 5';
  -- 6 : listes admin : compteurs de non pris en charge, tri par priorité, filtres, recherche TK.
  t := public.support_create(ob, orgb, 'Question paiement', 'money', 'low', 'Où est mon virement ?');
  j := public.admin_support_list(a1); if (j -> 'counts' ->> 'money')::int <> 1 or (j -> 'counts' ->> 'all')::int <> 1 or (j -> 'counts' ->> 'mine')::int <> 0 then raise exception 'FAIL 6a : %', j -> 'counts'; end if;
  if j -> 'rows' -> 0 ->> 'priority' <> 'urgent' then raise exception 'FAIL 6b : tri par priorité'; end if;
  if jsonb_array_length(public.admin_support_list(a1, 'money') -> 'rows') <> 1 or jsonb_array_length(public.admin_support_list(a2, null, 'mine') -> 'rows') <> 1 or jsonb_array_length(public.admin_support_list(a1, null, 'closed') -> 'rows') <> 0 then raise exception 'FAIL 6c'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_support_list(%L)', ow));
  if jsonb_array_length(public.admin_support_search(a1, substr(t ->> 'reference', 4, 4))) < 1 then raise exception 'FAIL 6d : recherche TK'; end if;
  if jsonb_array_length(public.support_quick_replies(a1, '{"title":"Merci","body":"Merci pour votre message."}')) <> 1 then raise exception 'FAIL 6e'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.support_quick_replies(%L)', ow));
  if not public.support_can_read(ow, tid) or public.support_can_read(st, tid) then raise exception 'FAIL 6f'; end if;
  raise notice 'OK 6';
end $$;
rollback;
