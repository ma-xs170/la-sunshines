-- =====================================================================
-- Tests migration 016 — commandes, remboursements, scans, invitations, codes promo : rôles, isolation entre organisations. ROLLBACK.
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
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'), ('01000000-0000-0000-0000-000000000003', 'staff@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
insert into public.organizers (id, name, contact_email) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', 'b@test.local');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 50, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6),
  ('a9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000b', 'Autre', 1000, 10, 6);
insert into public.orders (id, ticketed_event_id, event_slug, status, buyer_email, buyer_first_name, buyer_last_name, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('09000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'dupont@test.local', 'Jean', 'Dupont', 3000, 0, 3000, now()),
  ('09000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000b', 'evt-b', 'paid', 'secret@test.local', 'Secret', 'Autre', 1000, 0, 1000, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('19000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 2, 1500, '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"}]', 'A', now() + interval '3 days', 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name) values
  ('79000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'CODE-1', 'A', 'A'),
  ('79000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'CODE-2', 'B', 'B');
update public.tickets set status = 'used', used_at = now(), used_by = '01000000-0000-0000-0000-000000000001' where id = '79000000-0000-0000-0000-00000000000a';
insert into public.refunds (order_id, amount_cents, reason, status) values ('09000000-0000-0000-0000-00000000000a', 500, 'geste', 'pending');

do $$
declare ow constant uuid := '01000000-0000-0000-0000-000000000001'; st constant uuid := '01000000-0000-0000-0000-000000000003'; ob constant uuid := '0b000000-0000-0000-0000-000000000003';
  j jsonb; pid uuid; oid uuid;
begin
  -- 1 : commandes : rôles, isolation, recherche, pagination
  perform pg_temp.expect('FORBIDDEN', format('select public.org_orders(%L, ''evt-a'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_orders(%L, ''evt-b'')', ow));
  j := public.org_orders(ow, 'evt-a'); if (j ->> 'total')::int <> 1 or j::text like '%secret@test.local%' then raise exception 'FAIL 1a : %', j; end if;
  j := public.org_orders(ow, 'evt-a', 'DUPONT'); if (j ->> 'total')::int <> 1 then raise exception 'FAIL 1b'; end if;
  j := public.org_orders(ow, 'evt-a', 'zzz'); if (j ->> 'total')::int <> 0 then raise exception 'FAIL 1c'; end if;
  j := public.org_orders(ow, 'evt-a', '%'); if (j ->> 'total')::int <> 0 then raise exception 'FAIL 1d : joker'; end if;
  perform pg_temp.expect('BAD_FILTER', format('select public.org_orders(%L, ''evt-a'', null, ''hack'')', ow));
  raise notice 'OK 1';
  -- 2 : détail : commande d'un autre évènement introuvable
  j := public.org_order_detail(ow, 'evt-a', '09000000-0000-0000-0000-00000000000a');
  if jsonb_array_length(j -> 'tickets') <> 2 or jsonb_array_length(j -> 'refunds') <> 1 then raise exception 'FAIL 2a : %', j; end if;
  perform pg_temp.expect('ORDER_NOT_FOUND', format('select public.org_order_detail(%L, ''evt-a'', %L)', ow, '09000000-0000-0000-0000-00000000000b'));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_order_detail(%L, ''evt-b'', %L)', ow, '09000000-0000-0000-0000-00000000000b'));
  raise notice 'OK 2';
  -- 3 : remboursements, scans
  if jsonb_array_length(public.org_refunds(ow, 'evt-a', 'pending')) <> 1 or jsonb_array_length(public.org_refunds(ow, 'evt-a', 'failed')) <> 0 then raise exception 'FAIL 3a'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_refunds(%L, ''evt-b'')', ow));
  j := public.org_scan_history(ow, 'evt-a'); if (j ->> 'entered')::int <> 1 or (j ->> 'expected')::int <> 2 or jsonb_array_length(j -> 'rows') <> 1 then raise exception 'FAIL 3b : %', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_scan_history(%L, ''evt-a'')', st));
  raise notice 'OK 3';
  -- 4 : invitations : création par l'organisateur, stock respecté, isolation
  oid := public.org_create_invitation(ow, 'evt-a', 'a9000000-0000-0000-0000-00000000000a', 'A', 'invite@test.local', 'Inès', 'Invitée', '[{"id":"79000000-0000-0000-0000-0000000000f1","code":"CODE-INV-1","first_name":"Inès","last_name":"Invitée"}]');
  j := public.org_invitations(ow, 'evt-a'); if (j ->> 'issued')::int <> 1 or j::text like '%invite@test.local%' then raise exception 'FAIL 4a : coordonnées exposées ou compte faux (%)', j; end if;
  perform pg_temp.expect('TIER_UNAVAILABLE', format('select public.org_create_invitation(%L, ''evt-a'', %L, ''A'', ''x@test.local'', ''a'', ''b'', ''[{"id":"79000000-0000-0000-0000-0000000000f2","code":"C2","first_name":"a","last_name":"b"}]'')', ow, 'a9000000-0000-0000-0000-00000000000b'));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_create_invitation(%L, ''evt-a'', %L, ''A'', ''x@test.local'', ''a'', ''b'', ''[]'')', ob, 'a9000000-0000-0000-0000-00000000000a'));
  perform pg_temp.expect('SOLD_OUT_TIER', format('select public.org_create_invitation(%L, ''evt-a'', %L, ''A'', ''x@test.local'', ''a'', ''b'', (select jsonb_agg(jsonb_build_object(''id'', gen_random_uuid(), ''code'', ''C'' || g, ''first_name'', ''a'', ''last_name'', ''b'')) from generate_series(1, 9) g))', ow, 'a9000000-0000-0000-0000-00000000000a'));
  raise notice 'OK 4';
  -- 5 : promos
  pid := public.org_promo_save(ow, 'evt-a', null, '{"code":" summer10 ","title":"Été","kind":"percent","value":10,"max_uses":2}');
  perform pg_temp.expect('duplicate key value violates unique constraint "promo_codes_ticketed_event_id_code_key"', format('select public.org_promo_save(%L, ''evt-a'', null, ''{"code":"SUMMER10","kind":"fixed","value":100}'')', ow));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_promo_save(%L, ''evt-a'', null, ''{"code":"XYZ","kind":"fixed","value":100}'')', st));
  perform pg_temp.expect('new row for relation "promo_codes" violates check constraint "promo_codes_check"', format('select public.org_promo_save(%L, ''evt-a'', null, ''{"code":"BIG","kind":"percent","value":150}'')', ow));
  perform pg_temp.expect('new row for relation "promo_codes" violates check constraint "promo_codes_code_check"', format('select public.org_promo_save(%L, ''evt-a'', null, ''{"code":"a b","kind":"fixed","value":5}'')', ow));
  perform pg_temp.expect('TIER_UNAVAILABLE', format('select public.org_promo_save(%L, ''evt-a'', null, jsonb_build_object(''code'', ''OTHER'', ''kind'', ''fixed'', ''value'', 5, ''tier_ids'', jsonb_build_array(%L)))', ow, 'a9000000-0000-0000-0000-00000000000b'));
  j := public.promo_preview('evt-a', 'summer10', 3000); if j <> '{"valid": true, "discount_cents": 300, "total_cents": 2700}'::jsonb then raise exception 'FAIL 5a : %', j; end if;
  if (public.promo_preview('evt-a', 'NOPE', 3000) ->> 'valid') <> 'false' then raise exception 'FAIL 5b'; end if;
  perform public.org_promo_save(ow, 'evt-a', pid, '{"active":false}');
  if (public.promo_preview('evt-a', 'SUMMER10', 3000) ->> 'valid') <> 'false' then raise exception 'FAIL 5c : code désactivé accepté'; end if;
  perform public.org_promo_save(ow, 'evt-a', pid, '{"active":true}'); update public.promo_codes set used_count = 2 where id = pid;
  if (public.promo_preview('evt-a', 'SUMMER10', 3000) ->> 'valid') <> 'false' then raise exception 'FAIL 5d : quantité maximale dépassée'; end if;
  perform pg_temp.expect('PROMO_NOT_FOUND', format('select public.org_promo_save(%L, ''evt-b'', %L, ''{"active":false}'')', ob, pid));
  if jsonb_array_length(public.org_promos(ob, 'evt-b')) <> 0 then raise exception 'FAIL 5e : isolation'; end if;
  raise notice 'OK 5';
end $$;
rollback;
