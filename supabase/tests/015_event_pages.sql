-- =====================================================================
-- Tests migration 015 — pages évènement : rôles, isolation entre organisations, validation, sessions (date après ouverture des ventes), vidéo, lecture publique. ROLLBACK.
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
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'), ('01000000-0000-0000-0000-000000000002', 'manager@test.local'),
  ('01000000-0000-0000-0000-000000000003', 'staff@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
insert into public.organizers (id, name, contact_email) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', 'b@test.local');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'manager'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 50, false, 'draft');

do $$
declare
  ow constant uuid := '01000000-0000-0000-0000-000000000001'; mg constant uuid := '01000000-0000-0000-0000-000000000002';
  st constant uuid := '01000000-0000-0000-0000-000000000003'; ob constant uuid := '0b000000-0000-0000-0000-000000000003';
  orga uuid := (select id from public.organizers where is_default); orgb constant uuid := '0b0b0b0b-0000-0000-0000-00000000000b';
  j jsonb; v uuid; s uuid; m uuid; n int;
begin
  -- 1 : rôles et isolation
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_details(%L, ''evt-a'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_details(%L, ''evt-b'')', ow));          -- autre organisation
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_details_save(%L, ''evt-a'', ''{"subtitle":"x"}'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_details_save(%L, ''evt-b'', ''{"subtitle":"x"}'')', mg));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_details_save(%L, ''evt-nope'', ''{"subtitle":"x"}'')', ow));   -- inexistant : même réponse
  raise notice 'OK 1 : rôles et isolation';

  -- 2 : enregistrement, validation
  perform public.org_event_details_save(mg, 'evt-a', jsonb_build_object('subtitle', 'Nuit blanche', 'description', E'**Gras**\n- liste', 'visibility', 'public',
    'dresscode', '{"colors":[{"name":"Bordeaux","hex":"#7A1F2B"}],"free":false,"note":"Total look"}'::jsonb, 'socials', '{"instagram":"https://www.instagram.com/x"}'::jsonb));
  j := public.org_event_details(ow, 'evt-a');
  if j -> 'details' ->> 'subtitle' <> 'Nuit blanche' or j -> 'details' -> 'dresscode' -> 'colors' -> 0 ->> 'name' <> 'Bordeaux' then raise exception 'FAIL 2a : %', j; end if;
  perform pg_temp.expect('BAD_FIELD', format('select public.org_event_details_save(%L, ''evt-a'', ''{"updated_by":"x"}'')', ow));
  perform pg_temp.expect('BAD_VISIBILITY', format('select public.org_event_details_save(%L, ''evt-a'', ''{"visibility":"secret"}'')', ow));
  perform pg_temp.expect('BAD_EMAIL', format('select public.org_event_details_save(%L, ''evt-a'', ''{"contact_email":"pas un mail"}'')', ow));
  perform pg_temp.expect('new row for relation "event_details" violates check constraint "event_details_check"', format('select public.org_event_details_save(%L, ''evt-a'', ''{"publish_mode":"later"}'')', ow));
  if (select count(*) from public.audit_log where action = 'organizer.details_save') <> 1 then raise exception 'FAIL 2b : audit'; end if;
  raise notice 'OK 2 : détails enregistrés, validés, journalisés';

  -- 3 : lieux (par organisation) et sessions
  v := public.org_venue_save(mg, orga, null, '{"name":"W CLUB","city":"Jarry","region":"guadeloupe","lat":16.24,"lng":-61.56,"hide_address":true,"address":"Zone Jarry"}');
  perform pg_temp.expect('new row for relation "event_venues" violates check constraint "event_venues_region_check"', format('select public.org_venue_save(%L, %L, null, ''{"name":"X","region":"mars"}'')', mg, orga));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_venue_save(%L, %L, null, ''{"name":"X","region":"france"}'')', mg, orgb));
  perform pg_temp.expect('VENUE_NOT_FOUND', format('select public.org_venue_save(%L, %L, %L, ''{"name":"Y"}'')', ob, orgb, v));   -- lieu d'une autre organisation
  s := public.org_session_save(mg, 'evt-a', null, v, 'Soirée', now() + interval '3 days', now() + interval '3 days 6 hours', 50);
  perform pg_temp.expect('VENUE_NOT_FOUND', format('select public.org_session_save(%L, ''evt-b'', null, %L, ''X'', now(), null, null)', ob, v));
  -- ventes ouvertes : changer la date exige une confirmation, puis est journalisé ; changer autre chose non
  perform pg_temp.expect('CONFIRM_DATE_CHANGE', format('select public.org_session_save(%L, ''evt-a'', %L, %L, ''Soirée'', now() + interval ''4 days'', null, 50)', mg, s, v));
  perform public.org_session_save(mg, 'evt-a', s, v, 'Soirée (renommée)', (select starts_at from public.event_sessions where id = s), null, 60);
  if (select count(*) from public.audit_log where action = 'organizer.session_date_change') <> 0 then raise exception 'FAIL 3a'; end if;
  perform public.org_session_save(mg, 'evt-a', s, v, 'Soirée', now() + interval '4 days', null, 50, true);
  if (select count(*) from public.audit_log where action = 'organizer.session_date_change' and meta ->> 'sales_open' = 'true') <> 1 then raise exception 'FAIL 3b : audit date'; end if;
  -- billetterie fermée : pas de confirmation
  perform public.org_session_save(ob, 'evt-b', null, null, 'B', now() + interval '2 days', null, null);
  perform pg_temp.expect('SESSION_NOT_FOUND', format('select public.org_session_delete(%L, ''evt-a'', %L)', mg, gen_random_uuid()));
  perform public.org_session_delete(mg, 'evt-a', s);
  raise notice 'OK 3 : lieux, sessions, avertissement de changement de date';

  -- 4 : vidéo
  perform pg_temp.expect('BAD_URL', format('select public.org_media_register(%L, ''evt-a'', ''https://evil.example/v.mp4'')', mg));
  m := public.org_media_register(mg, 'evt-a', 'https://abc123.public.blob.vercel-storage.com/v.mp4', '{"w":1920}');
  if (select status from public.event_media where id = m) <> 'uploaded' then raise exception 'FAIL 4a'; end if;
  perform public.media_set_status(m, 'processing');
  perform public.media_set_status(m, 'failed', null, null, null, 'ffmpeg a échoué');
  perform public.media_set_status(m, 'processing');
  if (select attempts from public.event_media where id = m) <> 2 then raise exception 'FAIL 4b : tentatives'; end if;
  perform pg_temp.expect('BAD_STATUS', format('select public.media_set_status(%L, ''hacked'')', m));
  -- la vidéo n'est pas publique tant qu'elle n'est pas prête ; l'affiche reste l'image
  if public.public_event_details('evt-a') -> 'video' <> 'null'::jsonb then raise exception 'FAIL 4c : vidéo non prête exposée'; end if;
  perform public.media_set_status(m, 'ready', 'https://x.public.blob.vercel-storage.com/h.mp4', 'https://x.public.blob.vercel-storage.com/a.mp4', 'https://x.public.blob.vercel-storage.com/p.jpg');
  if public.public_event_details('evt-a') -> 'video' ->> 'poster_url' is null then raise exception 'FAIL 4d'; end if;
  raise notice 'OK 4 : vidéo, statuts, reprise';

  -- 5 : lecture publique : adresse masquée, privé / différé invisibles
  j := public.public_event_details('evt-a');
  if j is null or j ->> 'subtitle' <> 'Nuit blanche' then raise exception 'FAIL 5a'; end if;
  perform public.org_session_save(mg, 'evt-a', null, v, 'Retour', now() + interval '5 days', null, null, true);
  j := public.public_event_details('evt-a');
  if j -> 'venues' -> 0 -> 'address' <> 'null'::jsonb or j -> 'venues' -> 0 -> 'lat' <> 'null'::jsonb then raise exception 'FAIL 5b : adresse masquée exposée (%)', j -> 'venues'; end if;
  perform public.org_event_details_save(ow, 'evt-a', '{"visibility":"private"}');
  if public.public_event_details('evt-a') is not null then raise exception 'FAIL 5c : évènement privé exposé'; end if;
  perform public.org_event_details_save(ow, 'evt-a', jsonb_build_object('visibility', 'public', 'publish_mode', 'later', 'publish_at', (now() + interval '1 day')::text));
  if public.public_event_details('evt-a') is not null then raise exception 'FAIL 5d : publication différée exposée'; end if;
  if public.public_event_details('evt-inconnu') is not null then raise exception 'FAIL 5e'; end if;
  raise notice 'OK 5 : lecture publique';

  -- 6 : RLS : aucun accès direct pour un utilisateur connecté
  perform set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform pg_temp.expect('permission denied for table event_details', 'select * from public.event_details');
  perform pg_temp.expect('permission denied for table event_media', 'select * from public.event_media');
  perform pg_temp.expect('permission denied for table order_consents', 'select * from public.order_consents');
  perform pg_temp.expect('permission denied for function org_event_details', format('select public.org_event_details(%L, ''evt-a'')', ow));
  reset role;
  raise notice 'OK 6 : RLS';
end $$;

rollback;
