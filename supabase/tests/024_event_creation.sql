-- Tests migration 024 — création d'évènement : rattachement vérifié côté serveur, organisation non approuvée refusée, brouillon, mode de billetterie. ROLLBACK.
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'), ('01000000-0000-0000-0000-000000000001', 'owner-a@test.local'), ('02000000-0000-0000-0000-000000000002', 'owner-b@test.local'),
  ('03000000-0000-0000-0000-000000000003', 'staff-a@test.local'), ('04000000-0000-0000-0000-000000000004', 'owner-p@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizers (id, name, account_status) values ('a0a0a0a0-0000-0000-0000-00000000000a', 'Orga A', 'approved'), ('b0b0b0b0-0000-0000-0000-00000000000b', 'Orga B', 'approved'), ('c0c0c0c0-0000-0000-0000-00000000000c', 'Orga en attente', 'pending');
insert into public.organizer_members (organizer_id, user_id, role) values ('a0a0a0a0-0000-0000-0000-00000000000a', '01000000-0000-0000-0000-000000000001', 'owner'), ('b0b0b0b0-0000-0000-0000-00000000000b', '02000000-0000-0000-0000-000000000002', 'owner'),
  ('a0a0a0a0-0000-0000-0000-00000000000a', '03000000-0000-0000-0000-000000000003', 'staff'), ('c0c0c0c0-0000-0000-0000-00000000000c', '04000000-0000-0000-0000-000000000004', 'owner');
create function pg_temp.d(p_slug text, p_mode text default 'none') returns jsonb language sql as $$
  select jsonb_build_object('slug', p_slug, 'title', 'Ma soirée', 'ticketing_mode', p_mode, 'starts_at', '2027-01-15T22:00:00-04:00', 'venue_name', 'Salle X', 'city', 'Pointe-à-Pitre', 'region', 'guadeloupe', 'visibility', 'public', 'event_type', 'Soirée') $$;
do $$ declare r jsonb; begin
  r := public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('ma-soiree-1'));
  if (select status from public.ticketed_events where event_slug = 'ma-soiree-1') <> 'draft' then raise exception 'FAIL : brouillon attendu'; end if;
  if (select organizer_id from public.ticketed_events where event_slug = 'ma-soiree-1') <> 'a0a0a0a0-0000-0000-0000-00000000000a' then raise exception 'FAIL : rattachement à l''organisation choisie'; end if;
  if (select title from public.event_details where ticketed_event_id = (r->>'id')::uuid) <> 'Ma soirée' then raise exception 'FAIL : titre'; end if;
  if (select count(*) from public.event_sessions where ticketed_event_id = (r->>'id')::uuid) <> 1 then raise exception 'FAIL : session'; end if;
  if not exists (select 1 from public.audit_log where action = 'event.create' and entity_id = r->>'id') then raise exception 'FAIL : audit'; end if;
  -- admin : n'importe quelle organisation approuvée
  perform public.org_create_event('ad000000-0000-0000-0000-0000000000ad', 'b0b0b0b0-0000-0000-0000-00000000000b', pg_temp.d('soiree-b'));
  -- bizouk : identifiant numérique conservé
  perform public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('soiree-bz', 'bizouk') || '{"bizouk_event_id":"128267"}');
  if (select bizouk_event_id from public.ticketed_events where event_slug = 'soiree-bz') <> '128267' then raise exception 'FAIL : identifiant Bizouk'; end if;
end $$;
-- un organisateur ne peut pas créer sur l'organisation d'un autre
select pg_temp.expect('FORBIDDEN', $q$ select public.org_create_event('02000000-0000-0000-0000-000000000002', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('vol-1')) $q$);
-- le staff ne peut pas créer
select pg_temp.expect('FORBIDDEN', $q$ select public.org_create_event('03000000-0000-0000-0000-000000000003', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('staff-1')) $q$);
-- organisation non approuvée refusée (même pour son propriétaire et pour un admin)
select pg_temp.expect('ORG_NOT_APPROVED', $q$ select public.org_create_event('04000000-0000-0000-0000-000000000004', 'c0c0c0c0-0000-0000-0000-00000000000c', pg_temp.d('attente-1')) $q$);
select pg_temp.expect('ORG_NOT_APPROVED', $q$ select public.org_create_event('ad000000-0000-0000-0000-0000000000ad', 'c0c0c0c0-0000-0000-0000-00000000000c', pg_temp.d('attente-2')) $q$);
select pg_temp.expect('BAD_BIZOUK', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('bz-2', 'bizouk') || '{"bizouk_event_id":"<script>"}') $q$);
select pg_temp.expect('BAD_BIZOUK', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('bz-3', 'bizouk')) $q$);
select pg_temp.expect('BAD_MODE', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('m-1', 'x')) $q$);
select pg_temp.expect('BAD_REGION', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('r-1') || '{"region":"mars"}') $q$);
select pg_temp.expect('BAD_SLUG', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('Slug Invalide')) $q$);
select pg_temp.expect('SLUG_TAKEN', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('ma-soiree-1')) $q$);
select pg_temp.expect('TITLE_REQUIRED', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('t-1') || '{"title":" "}') $q$);
select pg_temp.expect('BAD_DATE', $q$ select public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a', pg_temp.d('d-1') || '{"starts_at":"pas une date"}') $q$);
-- changement de mode : par le propriétaire ; refusé pour un autre organisateur
do $$ begin
  perform public.org_set_ticketing('01000000-0000-0000-0000-000000000001', 'ma-soiree-1', 'bizouk', '111794');
  if (select ticketing_mode from public.ticketed_events where event_slug = 'ma-soiree-1') <> 'bizouk' then raise exception 'FAIL : mode bizouk'; end if;
  perform public.org_set_ticketing('01000000-0000-0000-0000-000000000001', 'ma-soiree-1', 'none');
  if (select bizouk_event_id from public.ticketed_events where event_slug = 'ma-soiree-1') is not null then raise exception 'FAIL : identifiant Bizouk retiré'; end if;
end $$;
select pg_temp.expect('FORBIDDEN', $q$ select public.org_set_ticketing('02000000-0000-0000-0000-000000000002', 'ma-soiree-1', 'none') $q$);
select pg_temp.expect('BAD_BIZOUK', $q$ select public.org_set_ticketing('01000000-0000-0000-0000-000000000001', 'ma-soiree-1', 'bizouk', 'x') $q$);
do $$ begin if has_function_privilege('authenticated', 'public.org_create_event(uuid,uuid,jsonb)', 'execute') then raise exception 'FAIL : org_create_event exécutable par authenticated'; end if; end $$;
rollback;
