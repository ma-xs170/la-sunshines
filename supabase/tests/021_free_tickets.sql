-- =====================================================================
-- Tests 021 — tarifs gratuits : prix 0 accepté, 0,01–0,49 refusé, achat gratuit atomique,
-- stock, panier mixte, frais nuls, anti-abus (e-mail confirmé, plafond par compte).
-- Transaction annulée (ROLLBACK).
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % »', p_msg, got; end if;
end $$;

-- p_tickets attendu par reserve_free_order : un billet par place, avec le tier_id
create function pg_temp.seats(p_tier uuid, p_qty int, p_prefix text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('tier_id', p_tier, 'id', gen_random_uuid(), 'code', p_prefix || g,
                                      'first_name', 'Part', 'last_name', g::text))
    from generate_series(1, p_qty) g $$;
create function pg_temp.items(p_tier uuid, p_qty int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('tier_id', p_tier, 'quantity', p_qty,
    'participants', (select jsonb_agg(jsonb_build_object('first_name', 'Part', 'last_name', g::text)) from generate_series(1, p_qty) g))) $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('f1000000-0000-0000-0000-000000000001', 'ok@test.local', now()),
  ('f1000000-0000-0000-0000-000000000002', 'ok2@test.local', now()),
  ('f1000000-0000-0000-0000-000000000003', 'ko@test.local', null);

insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e4000000-0000-0000-0000-000000000001', 'evt-free', now() + interval '30 days', 100, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order, max_per_account) values
  ('a4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'Gratuit', 0, 5, 3, 3),
  ('b4000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000001', 'Payant', 1500, 50, 6, 2),
  ('c4000000-0000-0000-0000-00000000000c', 'e4000000-0000-0000-0000-000000000001', 'Rare', 0, 1, 3, 3);

do $$
declare
  tF constant uuid := 'a4000000-0000-0000-0000-00000000000a';
  tP constant uuid := 'b4000000-0000-0000-0000-00000000000b';
  tR constant uuid := 'c4000000-0000-0000-0000-00000000000c';
  u1 constant uuid := 'f1000000-0000-0000-0000-000000000001';
  u2 constant uuid := 'f1000000-0000-0000-0000-000000000002';
  u3 constant uuid := 'f1000000-0000-0000-0000-000000000003';
  buyer constant jsonb := '{"email":"b@test.local","first_name":"B","last_name":"B"}';
  r record; o record; n int;
begin
  -- 1. prix : 0 accepté ; 0,01–0,49 refusé ; négatif refusé
  insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total)
    values ('e4000000-0000-0000-0000-000000000001', 'Zéro', 0, 1);
  insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total)
    values ('e4000000-0000-0000-0000-000000000001', 'Cinquante', 50, 1);
  perform pg_temp.expect('new row for relation "ticket_tiers" violates check constraint "ticket_tiers_price_cents_check"',
    $q$insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total) values ('e4000000-0000-0000-0000-000000000001', 'T30', 30, 1)$q$);
  perform pg_temp.expect('new row for relation "ticket_tiers" violates check constraint "ticket_tiers_price_cents_check"',
    $q$insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total) values ('e4000000-0000-0000-0000-000000000001', 'T49', 49, 1)$q$);
  perform pg_temp.expect('new row for relation "ticket_tiers" violates check constraint "ticket_tiers_price_cents_check"',
    $q$insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total) values ('e4000000-0000-0000-0000-000000000001', 'Neg', -100, 1)$q$);

  -- 2. achat gratuit valide : commande payée, 0 €, 0 frais, billets créés, aucun paiement Stripe
  select * into r from public.reserve_free_order('evt-free', u1, 'Soirée', pg_temp.items(tF, 2), buyer, 'v1', true, pg_temp.seats(tF, 2, 'FREEA'));
  select * into o from public.orders where id = r.order_id;
  if o.status <> 'paid' or o.total_cents <> 0 or o.fee_cents <> 0 or o.paid_at is null or o.expires_at is not null
     or o.stripe_payment_intent_id is not null or o.stripe_checkout_session_id is not null
  then raise exception 'FAIL 2 : commande gratuite mal formée (% / % / %)', o.status, o.total_cents, o.fee_cents; end if;
  select count(*) into n from public.tickets where order_id = o.id and status = 'valid' and user_id = u1;
  if n <> 2 then raise exception 'FAIL 2b : % billets (attendu 2)', n; end if;
  if public.tier_consumed(tF) <> 2 then raise exception 'FAIL 2c : consommé % (attendu 2)', public.tier_consumed(tF); end if;

  -- 3. frais : aucun frais même avec 10 % + 0,50 € de frais fixes demandés
  select * into r from public.reserve_tickets('evt-free', u2, 'Soirée', pg_temp.items(tF, 1), buyer, 10, 50, 'v1', true);
  if r.total_cents <> 0 or r.fee_cents <> 0 then raise exception 'FAIL 3 : frais % sur commande gratuite', r.fee_cents; end if;

  -- 4. panier mixte : frais sur la seule partie payante, total = payant + frais
  select * into r from public.reserve_tickets('evt-free', u2, 'Soirée',
    (pg_temp.items(tF, 1) || pg_temp.items(tP, 2)), buyer, 10, 50, 'v1', true);
  if r.subtotal_cents <> 3000 or r.fee_cents <> 350 or r.total_cents <> 3350
  then raise exception 'FAIL 4 : mixte sous-total % frais % total %', r.subtotal_cents, r.fee_cents, r.total_cents; end if;
  -- la ligne gratuite est bien à 0 dans la commande (elle n'ira pas dans Stripe)
  if (select count(*) from public.order_items where order_id = r.order_id and unit_price_cents = 0) <> 1
  then raise exception 'FAIL 4b : ligne gratuite absente'; end if;

  -- 5. achat gratuit sans stock : rien n'est créé, rien n'est consommé
  select * into r from public.reserve_free_order('evt-free', u1, 'Soirée', pg_temp.items(tR, 1), buyer, 'v1', true, pg_temp.seats(tR, 1, 'RARE1'));
  select count(*) into n from public.orders;
  perform pg_temp.expect('SOLD_OUT_TIER',
    format($q$select public.reserve_free_order('evt-free', %L, 'S', %L::jsonb, %L::jsonb, 'v1', true, %L::jsonb)$q$,
      u2, pg_temp.items(tR, 1), buyer, pg_temp.seats(tR, 1, 'RARE2')));
  if (select count(*) from public.orders) <> n then raise exception 'FAIL 5 : commande créée malgré l''échec'; end if;
  if public.tier_consumed(tR) <> 1 then raise exception 'FAIL 5b : stock corrompu (%)', public.tier_consumed(tR); end if;

  -- 6. anti-abus : e-mail non confirmé, plafond par compte (3 max sur « Gratuit », u1 en a déjà 2)
  perform pg_temp.expect('EMAIL_NOT_CONFIRMED',
    format($q$select public.reserve_free_order('evt-free', %L, 'S', %L::jsonb, %L::jsonb, 'v1', true, %L::jsonb)$q$,
      u3, pg_temp.items(tF, 1), buyer, pg_temp.seats(tF, 1, 'KO')));
  perform pg_temp.expect('ACCOUNT_LIMIT',
    format($q$select public.reserve_free_order('evt-free', %L, 'S', %L::jsonb, %L::jsonb, 'v1', true, %L::jsonb)$q$,
      u1, pg_temp.items(tF, 2), buyer, pg_temp.seats(tF, 2, 'LIM')));
  select * into r from public.reserve_free_order('evt-free', u1, 'Soirée', pg_temp.items(tF, 1), buyer, 'v1', true, pg_temp.seats(tF, 1, 'FREEB'));
  perform pg_temp.expect('ACCOUNT_LIMIT',
    format($q$select public.reserve_free_order('evt-free', %L, 'S', %L::jsonb, %L::jsonb, 'v1', true, %L::jsonb)$q$,
      u1, pg_temp.items(tF, 1), buyer, pg_temp.seats(tF, 1, 'LIM2')));

  -- 7. un tarif payant reste refusé par reserve_free_order (prix changé) ; rien n'est créé
  perform pg_temp.expect('PRICE_CHANGED',
    format($q$select public.reserve_free_order('evt-free', %L, 'S', %L::jsonb, %L::jsonb, 'v1', true, %L::jsonb)$q$,
      u2, pg_temp.items(tP, 1), buyer, pg_temp.seats(tP, 1, 'PAY')));

  raise notice 'tests 021 : OK';
end $$;

rollback;
