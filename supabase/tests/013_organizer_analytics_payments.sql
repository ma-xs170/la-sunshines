-- =====================================================================
-- Tests migration 013 — Analyse et Paiements : rôles, isolation, chiffres, verrouillage du compte Stripe. ROLLBACK.
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
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('01000000-0000-0000-0000-000000000002', 'manager@test.local'),
  ('01000000-0000-0000-0000-000000000003', 'staff@test.local'),
  ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizers (id, name, contact_email) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', 'b@test.local');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'manager'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status) values
  ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 50, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6),
  ('b9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000b', 'Autre', 1000, 10, 6);
-- A : 2 ventes en ligne (dont une remboursée en partie) + 1 invitation ; B : 1 vente
insert into public.orders (id, ticketed_event_id, event_slug, status, source, buyer_email, subtotal_cents, fee_cents, total_cents, refunded_cents, paid_at) values
  ('09000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'web', 'x@test.local', 3000, 100, 3100, 0, now() - interval '2 days'),
  ('09000000-0000-0000-0000-00000000001a', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'partially_refunded', 'web', 'y@test.local', 1500, 50, 1550, 500, now() - interval '40 days'),
  ('09000000-0000-0000-0000-00000000002a', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'manual', 'z@test.local', 0, 0, 0, 0, now() - interval '1 day'),
  ('09000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000b', 'evt-b', 'paid', 'web', 'b@test.local', 1000, 0, 1000, 0, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('19000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 2, 1500, '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"}]', 'A', now(), 'Standard'),
  ('19000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000001a', 'a9000000-0000-0000-0000-00000000000a', 1, 1500, '[{"first_name":"C","last_name":"C"}]', 'A', now(), 'Standard'),
  ('19000000-0000-0000-0000-00000000002a', '09000000-0000-0000-0000-00000000002a', 'a9000000-0000-0000-0000-00000000000a', 1, 0, '[{"first_name":"D","last_name":"D"}]', 'A', now(), 'Standard'),
  ('19000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b', 'b9000000-0000-0000-0000-00000000000b', 1, 1000, '[{"first_name":"E","last_name":"E"}]', 'B', now(), 'Autre');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name) values
  ('79000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K1', 'A', 'A'),
  ('79000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K2', 'B', 'B'),
  ('79000000-0000-0000-0000-00000000002a', '09000000-0000-0000-0000-00000000001a', '19000000-0000-0000-0000-00000000001a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K3', 'C', 'C'),
  ('79000000-0000-0000-0000-00000000003a', '09000000-0000-0000-0000-00000000002a', '19000000-0000-0000-0000-00000000002a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K4', 'D', 'D'),
  ('79000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b', '19000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000b', 'b9000000-0000-0000-0000-00000000000b', 'K5', 'E', 'E');
update public.tickets set status = 'used', used_at = now() where code = 'K1';

do $$
declare
  ow constant uuid := '01000000-0000-0000-0000-000000000001'; mg constant uuid := '01000000-0000-0000-0000-000000000002';
  st constant uuid := '01000000-0000-0000-0000-000000000003'; ow_b constant uuid := '0b000000-0000-0000-0000-000000000003';
  adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad';
  org_a uuid; org_b constant uuid := '0b0b0b0b-0000-0000-0000-00000000000b'; j jsonb;
begin
  select id into org_a from public.organizers where is_default;

  -- 1 : droits
  perform pg_temp.expect('FORBIDDEN', format('select public.org_analytics(%L, %L, 30)', st, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_analytics(%L, %L, 30)', ow_b, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_analytics(null, %L, 30)', org_a));
  perform pg_temp.expect('BAD_FILTER', format('select public.org_analytics(%L, %L, 0)', mg, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_payments_summary(%L, %L)', mg, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_payments_summary(%L, %L)', ow_b, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_stripe_account(%L, %L)', mg, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_stripe_set(%L, %L, ''acct_abcdef123'', true)', mg, org_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_stripe_set(%L, %L, ''acct_abcdef123'', true)', ow_b, org_a));
  raise notice 'OK 1 : Analyse = owner / manager / admin ; Paiements et Stripe = owner / admin ; staff et autres organisations refusés';

  -- 2 : analyse sur 30 jours (la commande de -40 j sort de la période), invitations exclues du chiffre d'affaires
  j := public.org_analytics(mg, org_a, 30);
  if (j -> 'totals' ->> 'sold')::int <> 3 then raise exception 'FAIL 2a : billets vendus sur 30 j = % (attendu 3 : 2 en ligne + 1 invitation)', j -> 'totals' ->> 'sold'; end if;
  if (j -> 'totals' ->> 'revenue_cents')::int <> 3100 then raise exception 'FAIL 2b : CA = %', j -> 'totals' ->> 'revenue_cents'; end if;
  if (j -> 'totals' ->> 'entered')::int <> 1 then raise exception 'FAIL 2c : entrées'; end if;
  if jsonb_array_length(j -> 'events') <> 1 or j -> 'events' -> 0 ->> 'slug' <> 'evt-a' then raise exception 'FAIL 2d : l''autre organisation apparaît (%)', j -> 'events'; end if;
  if jsonb_array_length(j -> 'series') <> 2 then raise exception 'FAIL 2e : série (%)', j -> 'series'; end if;
  if (j -> 'events' -> 0 ->> 'sold_total')::int <> 4 then raise exception 'FAIL 2f : total vendu'; end if;
  j := public.org_analytics(mg, org_a, null);
  if (j -> 'totals' ->> 'sold')::int <> 4 or (j -> 'totals' ->> 'revenue_cents')::int <> 3100 + 1050 or (j -> 'totals' ->> 'refunded_cents')::int <> 500 then
    raise exception 'FAIL 2g : depuis toujours = %', j -> 'totals'; end if;
  if j -> 'tiers' -> 0 ->> 'name' <> 'Standard' or (j -> 'tiers' -> 0 ->> 'sold')::int <> 4 then raise exception 'FAIL 2h : tarifs %', j -> 'tiers'; end if;
  j := public.org_analytics(ow_b, org_b, 30);
  if (j -> 'totals' ->> 'sold')::int <> 1 or jsonb_array_length(j -> 'events') <> 1 then raise exception 'FAIL 2i : isolation de B'; end if;
  j := public.org_analytics(adm, org_a, 30);  -- l'admin peut consulter n'importe quelle organisation
  raise notice 'OK 2 : analyse (période, invitations exclues du CA, isolation entre organisations)';

  -- 3 : paiements
  j := public.org_payments_summary(ow, org_a);
  if (j -> 'events' -> 0 ->> 'gross_cents')::int <> 4650 or (j -> 'events' -> 0 ->> 'refunded_cents')::int <> 500 or (j -> 'events' -> 0 ->> 'fees_cents')::int <> 150 or (j -> 'events' -> 0 ->> 'orders')::int <> 2 then
    raise exception 'FAIL 3 : paiements % (attendu brut 4650, remboursé 500, frais 150, 2 commandes)', j -> 'events' -> 0; end if;
  if jsonb_array_length(j -> 'events') <> 1 then raise exception 'FAIL 3b : autre organisation visible'; end if;
  raise notice 'OK 3 : encaissements (ventes en ligne seulement)';

  -- 4 : compte Stripe : liaison unique, journal, pas de fuite via org_list
  perform pg_temp.expect('new row for relation "organizers" violates check constraint "organizers_stripe_account_id_check"', format('select public.org_stripe_set(%L, %L, ''pas-un-compte'', false)', ow, org_a));
  perform public.org_stripe_set(ow, org_a, 'acct_abcdef123', false);
  if (public.org_stripe_account(ow, org_a) ->> 'account_id') <> 'acct_abcdef123' then raise exception 'FAIL 4a'; end if;
  perform pg_temp.expect('STRIPE_ACCOUNT_LOCKED', format('select public.org_stripe_set(%L, %L, ''acct_autre99999'', true)', ow, org_a));
  perform public.org_stripe_set(ow, org_a, 'acct_abcdef123', true);
  if not (select stripe_ready from public.organizers where id = org_a) then raise exception 'FAIL 4b : état prêt'; end if;
  if (select count(*) from public.audit_log where action = 'organizer.stripe_update' and actor_id = ow) <> 2 then raise exception 'FAIL 4c : audit'; end if;
  perform public.org_stripe_set(ow, org_a, 'acct_abcdef123', true);   -- sans changement : pas de ligne d'audit en plus
  if (select count(*) from public.audit_log where action = 'organizer.stripe_update') <> 2 then raise exception 'FAIL 4d : audit dupliqué'; end if;
  if (public.org_list(mg)::text like '%acct_%') then raise exception 'FAIL 4e : l''identifiant du compte fuit dans org_list'; end if;
  raise notice 'OK 4 : compte Stripe lié une fois, journalisé, jamais exposé';
end $$;
rollback;
