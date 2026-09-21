-- =====================================================================
-- Tests migration 017 — finance (owner / admin), versements manuels, tableau de bord, matrice de ventes, préférences de notification. ROLLBACK.
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
  ('01000000-0000-0000-0000-000000000002', 'manager@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizers (id, name) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'), ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'manager'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 50, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6);
-- commande 1 : 3000 + 100 de frais, payée ; commande 2 : 1500 + 50, remboursée en totalité ; commande 3 : invitation (0 €, ignorée)
insert into public.orders (id, ticketed_event_id, event_slug, status, source, buyer_email, subtotal_cents, fee_cents, total_cents, refunded_cents, paid_at) values
  ('09000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'web', 'a@test.local', 3000, 100, 3100, 0, now()),
  ('09000000-0000-0000-0000-000000000002', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'refunded', 'web', 'b@test.local', 1500, 50, 1550, 1550, now() - interval '1 day'),
  ('09000000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'manual', 'c@test.local', 0, 0, 0, 0, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('19000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 2, 1500, '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"}]', 'A', now(), 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name) values
  ('79000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K1', 'A', 'A'),
  ('79000000-0000-0000-0000-000000000002', '09000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K2', 'B', 'B');

do $$
declare adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; ow constant uuid := '01000000-0000-0000-0000-000000000001'; mg constant uuid := '01000000-0000-0000-0000-000000000002'; ob constant uuid := '0b000000-0000-0000-0000-000000000003';
  orga uuid := (select id from public.organizers where is_default); orgb constant uuid := '0b0b0b0b-0000-0000-0000-00000000000b'; j jsonb;
begin
  -- 1 : finance réservée owner / admin ; chiffres
  perform pg_temp.expect('FORBIDDEN', format('select public.org_finance(%L, ''evt-a'')', mg));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_finance(%L, ''evt-a'')', ob));
  j := public.org_finance(ow, 'evt-a');
  if (j ->> 'gross_cents')::int <> 4650 or (j ->> 'fees_cents')::int <> 100 or (j ->> 'refunded_cents')::int <> 1550 or (j ->> 'net_cents')::int <> 3000 or (j ->> 'remaining_cents')::int <> 3000 then raise exception 'FAIL 1 : %', j; end if;
  raise notice 'OK 1 : finance';
  -- 2 : versement manuel : admin seulement ; reste à verser
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_record_payout(%L, ''evt-a'', 1000, current_date)', ow));
  perform pg_temp.expect('new row for relation "event_payouts" violates check constraint "event_payouts_amount_cents_check"', format('select public.admin_record_payout(%L, ''evt-a'', 0, current_date)', adm));
  perform public.admin_record_payout(adm, 'evt-a', 1200, current_date, 'Virement 1');
  j := public.org_finance(adm, 'evt-a'); if (j ->> 'paid_out_cents')::int <> 1200 or (j ->> 'remaining_cents')::int <> 1800 or jsonb_array_length(j -> 'payouts') <> 1 then raise exception 'FAIL 2 : %', j; end if;
  if public.org_finance(ow, 'evt-a') ->> 'paid_out_cents' <> '1200' then raise exception 'FAIL 2b'; end if;
  perform public.admin_record_payout(adm, 'evt-a', 5000, current_date);
  if (public.org_finance(ow, 'evt-a') ->> 'remaining_cents')::int <> 0 then raise exception 'FAIL 2c : reste négatif'; end if;
  raise notice 'OK 2 : versements manuels';
  -- 3 : tableau de bord (organisation propre), matrice
  perform pg_temp.expect('FORBIDDEN', format('select public.org_dashboard(%L, %L)', ow, orgb));
  j := public.org_dashboard(ow, orga); if (j ->> 'today_cents')::int + (j ->> 'yesterday_cents')::int <> 3000 then raise exception 'FAIL 3a : %', j; end if;
  if (j ->> 'active_events')::int < 1 then raise exception 'FAIL 3b'; end if;
  j := public.org_sales_matrix(mg, 'evt-a'); if jsonb_array_length(j -> 'matrix') <> 1 or (j -> 'matrix' -> 0 ->> 'sold')::int <> 2 or jsonb_array_length(j -> 'heat') <> 1 then raise exception 'FAIL 3c : %', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_sales_matrix(%L, ''evt-b'')', ow));
  raise notice 'OK 3 : tableau de bord, matrice';
  -- 4 : notifications : défauts, écriture, isolation entre membres, type inconnu
  j := public.org_notif_get(ow, orga); if (j ->> 'daily_sales') <> 'true' or (select count(*) from jsonb_object_keys(j)) <> 5 then raise exception 'FAIL 4a : %', j; end if;
  perform public.org_notif_set(ow, orga, 'daily_sales', false);
  if public.org_notif_get(ow, orga) ->> 'daily_sales' <> 'false' or public.org_notif_get(mg, orga) ->> 'daily_sales' <> 'true' then raise exception 'FAIL 4b : isolation entre membres'; end if;
  perform pg_temp.expect('new row for relation "notification_prefs" violates check constraint "notification_prefs_kind_check"', format('select public.org_notif_set(%L, %L, ''spam'', true)', ow, orga));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_notif_set(%L, %L, ''refund'', false)', adm, orga));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_notif_set(%L, %L, ''refund'', false)', ow, orgb));
  raise notice 'OK 4 : notifications';
end $$;
rollback;
