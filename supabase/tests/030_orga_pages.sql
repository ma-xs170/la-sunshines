-- =====================================================================
-- Tests migration 030 — frais et paiement, lineup, membres, staff, impression, statistiques, audience. ROLLBACK.
-- =====================================================================
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'), ('01000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('01000000-0000-0000-0000-000000000002', 'manager@test.local'), ('01000000-0000-0000-0000-000000000003', 'staff@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizers (id, name) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'), ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'manager'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'), ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e3000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ('a3000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6);
-- commande 1 : 3000 + 100 de frais (client) ; commande 2 : 2000, frais 300 inclus dans le prix (absorbés) ; commande 3 : invitation
insert into public.orders (id, ticketed_event_id, event_slug, status, source, buyer_email, subtotal_cents, fee_cents, total_cents, refunded_cents, paid_at, fee_absorbed_cents) values
  ('03000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'web', 'a@test.local', 3000, 100, 3100, 0, now(), 0),
  ('03000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'web', 'a@test.local', 2000, 0, 2000, 0, now(), 300),
  ('03000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'manual', 'c@test.local', 0, 0, 0, 0, now(), 0),
  ('03000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-00000000000a', 'evt-a', 'expired', 'web', 'd@test.local', 1500, 0, 1500, 0, null, 0);
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('13000000-0000-0000-0000-000000000001', '03000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-00000000000a', 2, 1500, '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"}]', 'A', now(), 'Standard'),
  ('13000000-0000-0000-0000-000000000002', '03000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-00000000000a', 1, 2000, '[{"first_name":"C","last_name":"C"}]', 'A', now(), 'Standard'),
  ('13000000-0000-0000-0000-000000000003', '03000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-00000000000a', 1, 0, '[{"first_name":"I","last_name":"I"}]', 'A', now(), 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name, status, used_at, used_by) values
  ('73000000-0000-0000-0000-000000000001', '03000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a', 'K1', 'A', 'A', 'used', now(), '01000000-0000-0000-0000-000000000003'),
  ('73000000-0000-0000-0000-000000000002', '03000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a', 'K2', 'B', 'B', 'valid', null, null),
  ('73000000-0000-0000-0000-000000000003', '03000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a', 'K3', 'C', 'C', 'valid', null, null),
  ('73000000-0000-0000-0000-000000000004', '03000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-00000000000a', 'K4', 'I', 'I', 'valid', null, null);

do $$
declare adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; ow constant uuid := '01000000-0000-0000-0000-000000000001'; mg constant uuid := '01000000-0000-0000-0000-000000000002';
  st constant uuid := '01000000-0000-0000-0000-000000000003'; ob constant uuid := '0b000000-0000-0000-0000-000000000003';
  orga uuid := (select id from public.organizers where is_default); j jsonb; n int;
begin
  -- 1 : frais et paiement
  j := public.org_fee_settings(mg, 'evt-a');
  if j ->> 'mode' <> 'customer' or (j ->> 'min_order_cents')::int <> 0 then raise exception 'FAIL 1a : valeurs par défaut (%)', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_fee_settings(%L, ''evt-a'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_set_fee_settings(%L, ''evt-a'', ''included'', 0)', ob));
  perform pg_temp.expect('BAD_FEE_MODE', format('select public.org_set_fee_settings(%L, ''evt-a'', ''gratuit'', 0)', ow));
  perform pg_temp.expect('BAD_MIN', format('select public.org_set_fee_settings(%L, ''evt-a'', ''customer'', 20)', ow));
  perform public.org_set_fee_settings(ow, 'evt-a', 'included', 500);
  j := public.event_fee_config('evt-a');
  if j ->> 'mode' <> 'included' or (j ->> 'min_order_cents')::int <> 500 or j -> 'percent' <> 'null'::jsonb then raise exception 'FAIL 1b : configuration (%)', j; end if;
  update public.organizers set fee_percent_override = 5, fee_fixed_override = 30 where id = orga;
  j := public.event_fee_config('evt-a');
  if (j ->> 'percent')::numeric <> 5 or (j ->> 'fixed')::int <> 30 then raise exception 'FAIL 1c : surcharge organisateur (%)', j; end if;
  update public.ticketed_events set fee_percent_override = 2 where id = 'e3000000-0000-0000-0000-00000000000a';
  if ((public.event_fee_config('evt-a')) ->> 'percent')::numeric <> 2 then raise exception 'FAIL 1d : la surcharge de l''évènement prime'; end if;
  if not exists (select 1 from public.audit_log where action = 'event.fee_settings') then raise exception 'FAIL 1e : audit'; end if;
  -- finance : frais = 100 + 300, net = 3000 + (2000 - 300) = 4700
  j := public.org_finance(ow, 'evt-a');
  if (j ->> 'fees_cents')::int <> 400 or (j ->> 'net_cents')::int <> 4700 or (j ->> 'gross_cents')::int <> 5100 then raise exception 'FAIL 1f : finance avec frais inclus (%)', j; end if;
  j := public.org_payments_summary(ow, orga);
  if ((j -> 'events' -> 0) ->> 'fees_cents')::int <> 400 then raise exception 'FAIL 1g : synthèse des paiements (%)', j; end if;
  perform public.record_absorbed_fee('03000000-0000-0000-0000-000000000004', 99);
  if (select fee_absorbed_cents from public.orders where id = '03000000-0000-0000-0000-000000000004') <> 0 then raise exception 'FAIL 1h : seule une commande en attente est modifiable'; end if;

  -- 2 : lineup
  perform pg_temp.expect('FORBIDDEN', format('select public.org_lineup_save(%L, ''evt-a'', ''[]'')', st));
  perform pg_temp.expect('BAD_LINEUP', format('select public.org_lineup_save(%L, ''evt-a'', ''[{"name":""}]'')', mg));
  n := public.org_lineup_save(mg, 'evt-a', '[{"name":"DJ Syxtee","role":"dj"},{"name":"Invitée","role":"artiste","starts_at":"2026-10-17T23:00:00Z"}]');
  if n <> 2 or jsonb_array_length(public.org_lineup(ow, 'evt-a')) <> 2 or (public.org_lineup(ow, 'evt-a') -> 0 ->> 'name') <> 'DJ Syxtee' then raise exception 'FAIL 2a : enregistrement et ordre'; end if;
  perform public.org_lineup_save(mg, 'evt-a', '[{"name":"Seul"}]');
  if jsonb_array_length(public.org_lineup(ow, 'evt-a')) <> 1 then raise exception 'FAIL 2b : remplacement complet'; end if;
  perform pg_temp.expect('BAD_LINEUP', format('select public.org_lineup_save(%L, ''evt-a'', ''[{"name":"X","role":"roi"}]'')', mg)) ;

  -- 3 : membres
  perform pg_temp.expect('FORBIDDEN', format('select public.org_members(%L, %L)', mg, orga));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_members(%L, %L)', ob, orga));
  if jsonb_array_length(public.org_members(ow, orga)) <> 3 or jsonb_array_length(public.org_members(adm, orga)) <> 3 then raise exception 'FAIL 3a : liste des membres'; end if;
  perform pg_temp.expect('USER_NOT_FOUND', format('select public.org_member_add(%L, %L, ''personne@test.local'', ''staff'')', ow, orga));
  perform pg_temp.expect('BAD_ROLE', format('select public.org_member_add(%L, %L, ''owner-b@test.local'', ''roi'')', ow, orga));
  perform public.org_member_add(ow, orga, 'OWNER-B@test.local', 'staff');
  perform pg_temp.expect('ALREADY_MEMBER', format('select public.org_member_add(%L, %L, ''owner-b@test.local'', ''staff'')', ow, orga));
  perform public.org_member_set_role(ow, orga, ob, 'manager');
  if (select role from public.organizer_members where organizer_id = orga and user_id = ob) <> 'manager' then raise exception 'FAIL 3b : changement de rôle'; end if;
  perform pg_temp.expect('LAST_OWNER', format('select public.org_member_set_role(%L, %L, %L, ''manager'')', ow, orga, ow));
  perform pg_temp.expect('LAST_OWNER', format('select public.org_member_remove(%L, %L, %L)', ow, orga, ow));
  perform public.org_member_remove(ow, orga, ob);
  if exists (select 1 from public.organizer_members where organizer_id = orga and user_id = ob) then raise exception 'FAIL 3c : retrait'; end if;
  if (select count(*) from public.audit_log where action in ('org.member_add', 'org.member_role', 'org.member_remove')) <> 3 then raise exception 'FAIL 3d : audit des membres'; end if;

  -- 4 : staff et présences
  perform pg_temp.expect('FORBIDDEN', format('select public.org_staff(%L, ''evt-a'')', st));
  j := public.org_staff(mg, 'evt-a');
  if jsonb_array_length(j) <> 3 or (j -> 0 ->> 'email') <> 'staff@test.local' or (j -> 0 ->> 'scans')::int <> 1 then raise exception 'FAIL 4a : présences (%)', j; end if;

  -- 5 : impression
  j := public.org_print_ticket_ids(mg, 'evt-a');
  if (j ->> 'total')::int <> 3 or jsonb_array_length(j -> 'ids') <> 3 then raise exception 'FAIL 5a : billets valides seulement (%)', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_print_ticket_ids(%L, ''evt-a'')', st));

  -- 6 : statistiques
  j := public.org_stats_extra(mg, 'evt-a');
  if (j #>> '{orders,paid}')::int <> 2 or (j #>> '{orders,expired}')::int <> 1 or (j #>> '{buyers,unique}')::int <> 1 or (j #>> '{buyers,repeat}')::int <> 1 then raise exception 'FAIL 6a : commandes / acheteurs (%)', j; end if;
  if (select (x ->> 'tickets')::int from jsonb_array_elements(j -> 'by_channel') x where x ->> 'channel' = 'invitation') <> 1 then raise exception 'FAIL 6b : canal invitation (%)', j; end if;
  if (j ->> 'avg_order_cents')::int <> 2550 then raise exception 'FAIL 6c : panier moyen (%)', j; end if;

  -- 7 : audience agrégée
  perform public.track_event_view('evt-a', 'instagram', 'fr');
  perform public.track_event_view('evt-a', 'instagram', 'fr');
  perform public.track_event_view('evt-a', 'nimporte', 'zz9');
  perform public.track_event_view('inconnu', 'direct', 'FR');
  j := public.org_event_views(mg, 'evt-a');
  if (j ->> 'total')::int <> 3 or jsonb_array_length(j -> 'sources') <> 2 or (j -> 'countries' -> 0 ->> 'country') <> 'FR' then raise exception 'FAIL 7a : audience (%)', j; end if;
  if exists (select 1 from public.event_views where event_slug = 'inconnu') then raise exception 'FAIL 7b : évènement inconnu ignoré'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_views(%L, ''evt-a'')', st));

  -- 8 : droits : rien n'est exécutable par le navigateur
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('event_fee_config', 'org_fee_settings', 'org_set_fee_settings', 'record_absorbed_fee', 'org_lineup', 'org_lineup_save', 'org_members', 'org_member_add', 'org_member_set_role', 'org_member_remove', 'org_staff', 'org_print_ticket_ids', 'org_stats_extra', 'track_event_view', 'org_event_views')
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then raise exception 'FAIL 8 : fonction exécutable par anon / authenticated'; end if;
  raise notice 'ALL OK — 030';
end $$;
rollback;
