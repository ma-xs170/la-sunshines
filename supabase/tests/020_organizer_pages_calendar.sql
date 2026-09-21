-- =====================================================================
-- Tests migration 020 — page auto à l'approbation, édition, lecture publique, suivi (opt-in, jeton), calendrier régional (isolation). ROLLBACK.
-- =====================================================================
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'a1@test.local'), ('01000000-0000-0000-0000-000000000001', 'owner@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local'), ('c1000000-0000-0000-0000-000000000001', 'client@test.local'), ('50000000-0000-0000-0000-000000000005', 'stranger@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.admin_accounts (user_id, level, must_change_password) values ('ad000000-0000-0000-0000-0000000000ad', 'super', false);
insert into public.organizers (id, name) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Été Créole & Co');
insert into public.organizer_members (organizer_id, user_id, role) values ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'), ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status) values
  ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 50, true, 'published'),
  ('e9000000-0000-0000-0000-00000000000c', 'evt-b-draft', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '4 days', 50, false, 'draft'),
  ('e9000000-0000-0000-0000-00000000000d', 'evt-b-private', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '5 days', 50, true, 'published');

do $$
declare a1 constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; ow constant uuid := '01000000-0000-0000-0000-000000000001'; ob constant uuid := '0b000000-0000-0000-0000-000000000003'; cl constant uuid := 'c1000000-0000-0000-0000-000000000001'; st constant uuid := '50000000-0000-0000-0000-000000000005';
  orga uuid := (select id from public.organizers where is_default); orgb constant uuid := '0b0b0b0b-0000-0000-0000-00000000000b'; j jsonb; va uuid; vb uuid; tok uuid;
begin
  -- 1 : THE MOUV a sa page (rétro-remplie) ; une organisation en attente n'en a pas ; l'approbation la crée (slug sans accents, unique)
  if (select slug from public.organizer_pages where organizer_id = orga) <> 'the-mouv' then raise exception 'FAIL 1a : %', (select slug from public.organizer_pages where organizer_id = orga); end if;
  if exists (select 1 from public.organizer_pages where organizer_id = orgb) then raise exception 'FAIL 1b'; end if;
  if public.public_organizer_page('the-mouv') is null then raise exception 'FAIL 1c'; end if;
  perform public.admin_set_organizer_status(a1, orgb, 'approved');
  if (select slug from public.organizer_pages where organizer_id = orgb) <> 'ete-creole-co' then raise exception 'FAIL 1d : %', (select slug from public.organizer_pages where organizer_id = orgb); end if;
  insert into public.organizers (id, name, account_status) values ('0d0d0d0d-0000-0000-0000-00000000000d', 'THE  MOUV!', 'approved');
  if (select slug from public.organizer_pages where organizer_id = '0d0d0d0d-0000-0000-0000-00000000000d') <> 'the-mouv-2' then raise exception 'FAIL 1e : collision'; end if;
  insert into public.organizers (id, name) values ('0e0e0e0e-0000-0000-0000-00000000000e', 'Pas encore');
  if public.public_organizer_page('pas-encore') is not null then raise exception 'FAIL 1f'; end if;
  raise notice 'OK 1 : page créée à l''approbation';
  -- 2 : édition : owner / admin, champs bornés, https
  perform pg_temp.expect('FORBIDDEN', format('select public.org_page_get(%L, %L)', ow, orgb));
  perform pg_temp.expect('BAD_FIELD', format('select public.org_page_save(%L, %L, ''{"slug":"x"}'')', ob, orgb));
  perform pg_temp.expect('new row for relation "organizer_pages" violates check constraint "organizer_pages_logo_url_check"', format('select public.org_page_save(%L, %L, ''{"logo_url":"javascript:alert(1)"}'')', ob, orgb));
  perform pg_temp.expect('new row for relation "organizer_pages" violates check constraint "organizer_pages_website_check"', format('select public.org_page_save(%L, %L, ''{"website":"http://x.io"}'')', ob, orgb));
  perform public.org_page_save(ob, orgb, '{"description":"Nos soirées d''été","website":"https://ete.example","socials":{"instagram":"https://www.instagram.com/ete"}}');
  if public.public_organizer_page('ete-creole-co') ->> 'description' <> 'Nos soirées d''été' then raise exception 'FAIL 2a'; end if;
  raise notice 'OK 2';
  -- 3 : évènements publics seulement sur la page publique
  va := public.org_venue_save(ow, orga, null, '{"name":"W CLUB","city":"Jarry","region":"guadeloupe","hide_address":false,"lat":16.24,"lng":-61.56}');
  vb := public.org_venue_save(ob, orgb, null, '{"name":"Plage B","city":"Gosier","region":"guadeloupe","hide_address":true,"lat":16.2,"lng":-61.5}');
  perform public.org_session_save(ow, 'evt-a', null, va, 'S', now() + interval '3 days', null, null, true);
  perform public.org_session_save(ob, 'evt-b', null, vb, 'S', now() + interval '3 days 1 hour', null, null, true);
  perform public.org_session_save(ob, 'evt-b-draft', null, vb, 'S', now() + interval '4 days', null, null, true);
  perform public.org_session_save(ob, 'evt-b-private', null, vb, 'S', now() + interval '5 days', null, null, true);
  perform public.org_event_details_save(ob, 'evt-b-private', '{"visibility":"private"}');
  j := public.public_organizer_page('ete-creole-co'); if jsonb_array_length(j -> 'events') <> 1 or j -> 'events' -> 0 ->> 'slug' <> 'evt-b' then raise exception 'FAIL 3a : %', j -> 'events'; end if;
  if public.public_event_organizer('evt-b') ->> 'slug' <> 'ete-creole-co' or public.public_event_organizer('evt-b-draft') is not null or public.public_event_organizer('evt-b-private') is not null then raise exception 'FAIL 3b'; end if;
  raise notice 'OK 3';
  -- 4 : suivre : opt-in par défaut, jeton de désabonnement, un seul suivi, page inconnue
  j := public.follow_organizer(cl, 'ete-creole-co'); if (j ->> 'notify') <> 'false' then raise exception 'FAIL 4a : pas d''opt-in par défaut'; end if;
  perform public.follow_organizer(cl, 'ete-creole-co', true); if (select count(*) from public.organizer_follows where user_id = cl) <> 1 then raise exception 'FAIL 4b'; end if;
  if public.follow_state(cl, 'ete-creole-co') ->> 'notify' <> 'true' then raise exception 'FAIL 4c'; end if;
  tok := (select token from public.organizer_follows where user_id = cl);
  if not public.unsubscribe_by_token(tok) then raise exception 'FAIL 4d'; end if;
  if public.follow_state(cl, 'ete-creole-co') ->> 'notify' <> 'false' or public.follow_state(cl, 'ete-creole-co') ->> 'following' <> 'true' then raise exception 'FAIL 4d2'; end if;
  if public.unsubscribe_by_token(gen_random_uuid()) then raise exception 'FAIL 4e'; end if;
  perform pg_temp.expect('ORG_NOT_FOUND', format('select public.follow_organizer(%L, ''pas-encore'')', cl));
  perform public.unfollow_organizer(cl, 'ete-creole-co'); if public.follow_state(cl, 'ete-creole-co') ->> 'following' <> 'false' then raise exception 'FAIL 4f'; end if;
  if (public.org_page_get(ob, orgb) ->> 'followers')::int <> 0 then raise exception 'FAIL 4g'; end if;
  raise notice 'OK 4';
  -- 5 : calendrier : région obligatoire, isolation des brouillons / privés, adresse masquée, admin voit tout + filtre de statut
  perform pg_temp.expect('BAD_REGION', format('select public.calendar_events(%L, ''mars'', now(), now() + interval ''30 days'')', ow));
  perform pg_temp.expect('FORBIDDEN', format('select public.calendar_events(%L, ''guadeloupe'', now(), now() + interval ''30 days'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.calendar_events(%L, ''guadeloupe'', now(), now() + interval ''30 days'')', cl));
  j := public.calendar_events(ow, 'guadeloupe', now(), now() + interval '30 days');
  if jsonb_array_length(j) <> 2 or j::text like '%evt-b-draft%' or j::text like '%evt-b-private%' then raise exception 'FAIL 5a : % ', j; end if;
  if (select x.value ->> 'lat' from jsonb_array_elements(j) x where x.value ->> 'slug' = 'evt-b') is not null then raise exception 'FAIL 5b : adresse masquée exposée'; end if;
  if (select (x.value ->> 'lat')::float from jsonb_array_elements(j) x where x.value ->> 'slug' = 'evt-a') <> 16.24 then raise exception 'FAIL 5c : coordonnées de son propre lieu'; end if;
  j := public.calendar_events(ob, 'guadeloupe', now(), now() + interval '30 days'); if jsonb_array_length(j) <> 4 or (select x.value ->> 'lat' from jsonb_array_elements(j) x where x.value ->> 'slug' = 'evt-b') is null then raise exception 'FAIL 5d : ses propres évènements'; end if;
  if jsonb_array_length(public.calendar_events(ob, 'martinique', now(), now() + interval '30 days')) <> 0 then raise exception 'FAIL 5e : région'; end if;
  j := public.calendar_events(a1, 'guadeloupe', now(), now() + interval '30 days'); if jsonb_array_length(j) <> 4 then raise exception 'FAIL 5f : admin'; end if;
  if jsonb_array_length(public.calendar_events(a1, 'guadeloupe', now(), now() + interval '30 days', 'draft')) <> 1 then raise exception 'FAIL 5g : filtre statut admin'; end if;
  if jsonb_array_length(public.calendar_events(ow, 'guadeloupe', now() + interval '10 days', now() + interval '30 days')) <> 0 then raise exception 'FAIL 5h : période'; end if;
  raise notice 'OK 5';
end $$;
rollback;
