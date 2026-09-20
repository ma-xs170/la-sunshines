-- =====================================================================
-- Tests des règles métier — phase 2 (réservation, expiration, tarifs, admin)
-- À exécuter APRÈS les migrations 001 et 002 (SQL Editor Supabase).
-- Transaction annulée à la fin (ROLLBACK). « ALL OK » = tout est bon.
-- (La concurrence réelle — 50 connexions — est dans 002_concurrency.mjs.)
-- =====================================================================

begin;

-- ---------- Aides de test (temporaires, disparaissent avec la session) ----------
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin
    execute p_sql;
  exception when others then got := sqlerrm;
  end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;

create function pg_temp.expect_state(p_state text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin
    execute p_sql;
  exception when others then got := sqlstate;
  end;
  if got is null then raise exception 'FAIL : SQLSTATE % attendu, aucune erreur (%)', p_state, p_sql; end if;
  -- p_state peut lister plusieurs codes acceptables (« 23001|23503 ») : la version de Postgres change le code d'un DELETE bloqué par une FK RESTRICT.
  if got <> all (string_to_array(p_state, '|')) then raise exception 'FAIL : SQLSTATE % attendu, reçu % (%)', p_state, got, p_sql; end if;
end $$;

-- réserve `qty` places d'UN tarif ; renvoie l'id de commande
create function pg_temp.res(p_slug text, p_user uuid, p_tier uuid, p_qty int,
                            p_guardian boolean default true,
                            p_pct numeric default 0, p_fix int default 0) returns uuid language plpgsql as $$
declare r record;
begin
  select * into r from public.reserve_tickets(
    p_slug, p_user, 'Soirée de test',
    jsonb_build_array(jsonb_build_object('tier_id', p_tier, 'quantity', p_qty,
      'participants', coalesce((select jsonb_agg(jsonb_build_object('first_name', 'P', 'last_name', g::text))
                                from generate_series(1, greatest(p_qty, 0)) g), '[]'::jsonb))),
    '{"email":"Buyer@Test.local","first_name":"B","last_name":"B","phone":"0690"}',
    p_pct, p_fix, '2026-09', p_guardian);
  return r.order_id;
end $$;

create function pg_temp.remaining(p_slug text, p_tier uuid) returns int language sql as $$
  select remaining from public.get_availability(p_slug) where tier_id = p_tier $$;
create function pg_temp.state(p_slug text, p_tier uuid) returns text language sql as $$
  select state from public.get_availability(p_slug) where tier_id = p_tier $$;

-- ---------- Données ----------
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'u' || g || '@test.local'
from generate_series(1, 9) g;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';

-- Événement principal : 20 places, deux tarifs
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status, venue_name, venue_address) values
  ('e0000000-0000-0000-0000-000000000001', 'evt-main', now() + interval '30 days', 20, true, 'published', 'Salle Test', '1 rue du Test');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a0000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'Standard', 1500, 10, 4),
  ('b0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', 'Early',     800, 10, 6);

-- =====================================================================
-- 1. Prix minimum 0,50 €
-- =====================================================================
select pg_temp.expect_state('23514', $q$
  insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total)
  values ('e0000000-0000-0000-0000-000000000001', 'Trop bas', 49, 5) $q$);
select pg_temp.expect_state('23514', $q$
  select public.admin_save_tier('ad000000-0000-0000-0000-0000000000ad', 'evt-main', null, 'Trop bas', '', 49, 5, 4, null, null, true, 0) $q$);
insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total)
values ('e0000000-0000-0000-0000-000000000001', 'Pile 0,50', 50, 5);   -- 50 centimes = accepté
do $$ begin raise notice 'OK 1 : tarif < 0,50 € refusé (base + admin_save_tier), 0,50 € accepté'; end $$;

-- =====================================================================
-- 2. Réservation nominale : prix relu en base, expiration 15 min, snapshot, frais
-- =====================================================================
do $$
declare o uuid; r public.orders; i public.order_items; mins numeric;
begin
  o := pg_temp.res('evt-main', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 2);
  select * into r from public.orders where id = o;
  if r.status <> 'pending' then raise exception 'FAIL 2 : statut % (attendu pending)', r.status; end if;
  if r.total_cents <> 3000 or r.subtotal_cents <> 3000 or r.fee_cents <> 0
  then raise exception 'FAIL 2b : montants % / % / %', r.subtotal_cents, r.fee_cents, r.total_cents; end if;
  if r.buyer_email <> 'buyer@test.local' then raise exception 'FAIL 2c : email non normalisé (%)', r.buyer_email; end if;
  mins := extract(epoch from (r.expires_at - now())) / 60;
  if mins < 14.9 or mins > 15.01 then raise exception 'FAIL 2d : expiration dans % min (attendu 15)', mins; end if;
  if r.terms_accepted_at is null or r.guardian_consent_at is null or r.terms_version <> '2026-09'
  then raise exception 'FAIL 2e : consentements non enregistrés'; end if;

  select * into i from public.order_items where order_id = o;
  if i.event_title <> 'Soirée de test' or i.tier_name <> 'Standard' or i.unit_price_cents <> 1500
     or i.venue_name <> 'Salle Test' or i.venue_address <> '1 rue du Test' or i.quantity <> 2
  then raise exception 'FAIL 2f : snapshot incomplet'; end if;

  -- modifier le tarif et l'événement ne change PAS la commande passée
  update public.ticket_tiers set price_cents = 2500, name = 'Standard+' where id = 'a0000000-0000-0000-0000-00000000000a';
  update public.ticketed_events set venue_name = 'Autre salle' where id = 'e0000000-0000-0000-0000-000000000001';
  select * into i from public.order_items where order_id = o;
  if i.unit_price_cents <> 1500 or i.tier_name <> 'Standard' or i.venue_name <> 'Salle Test'
  then raise exception 'FAIL 2g : le snapshot a bougé après modification du tarif/événement'; end if;
  update public.ticket_tiers set price_cents = 1500, name = 'Standard' where id = 'a0000000-0000-0000-0000-00000000000a';
  update public.ticketed_events set venue_name = 'Salle Test' where id = 'e0000000-0000-0000-0000-000000000001';

  -- frais de service : 10 % + 50 c fixes sur 1 × 1500 = 150 + 50
  o := pg_temp.res('evt-main', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 1, true, 10, 50);
  select * into r from public.orders where id = o;
  if r.subtotal_cents <> 1500 or r.fee_cents <> 200 or r.total_cents <> 1700
  then raise exception 'FAIL 2h : frais % / total % (attendu 200 / 1700)', r.fee_cents, r.total_cents; end if;
  raise notice 'OK 2 : commande pending, prix relu en base, expire à 15 min, snapshot figé, frais calculés';
end $$;

-- =====================================================================
-- 3. Règles de vente
-- =====================================================================
-- (les commandes du test 2 consomment 3 places du tarif Standard)
do $$
declare tA constant uuid := 'a0000000-0000-0000-0000-00000000000a';
        u3 constant uuid := '00000000-0000-0000-0000-000000000003';
begin
  perform pg_temp.expect('CONSENT_REQUIRED',    format('select pg_temp.res(%L, %L, %L, 1, false)', 'evt-main', u3, tA));
  perform pg_temp.expect('QUANTITY_LIMIT',      format('select pg_temp.res(%L, %L, %L, 5)',        'evt-main', u3, tA));  -- max 4
  perform pg_temp.expect('INVALID_PARTICIPANTS',format($f$select public.reserve_tickets(%L, %L, 't',
      '[{"tier_id":"%s","quantity":2,"participants":[{"first_name":"a","last_name":"b"}]}]',
      '{"email":"x@y.fr"}', 0, 0, 'v', true)$f$, 'evt-main', u3, tA));
  perform pg_temp.expect('AUTH_REQUIRED',       format('select public.reserve_tickets(%L, null, ''t'', ''[]'', ''{}'', 0, 0, ''v'', true)', 'evt-main'));
  perform pg_temp.expect('EVENT_NOT_ON_SALE',   format('select pg_temp.res(%L, %L, %L, 1)', 'inconnu', u3, tA));
  raise notice 'OK 3a : consentement, max par commande, participants, identité, événement inconnu';

  -- événement non activé / brouillon / fermé
  update public.ticketed_events set ticketing_enabled = false where id = 'e0000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('EVENT_NOT_ON_SALE', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticketed_events set ticketing_enabled = true, status = 'draft' where id = 'e0000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('EVENT_NOT_ON_SALE', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticketed_events set status = 'closed' where id = 'e0000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('EVENT_NOT_ON_SALE', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticketed_events set status = 'published' where id = 'e0000000-0000-0000-0000-000000000001';
  raise notice 'OK 3b : événement désactivé / brouillon / fermé refusé';

  -- fenêtre de vente de l'ÉVÉNEMENT
  update public.ticketed_events set sales_open_at = now() + interval '1 hour' where id = 'e0000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('SALES_NOT_OPEN', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  if pg_temp.state('evt-main', tA) <> 'upcoming' then raise exception 'FAIL 3c : état % (attendu upcoming)', pg_temp.state('evt-main', tA); end if;
  update public.ticketed_events set sales_open_at = null, sales_close_at = now() - interval '1 minute' where id = 'e0000000-0000-0000-0000-000000000001';
  perform pg_temp.expect('SALES_CLOSED', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  if pg_temp.state('evt-main', tA) <> 'closed' then raise exception 'FAIL 3d : état % (attendu closed)', pg_temp.state('evt-main', tA); end if;
  update public.ticketed_events set sales_close_at = null where id = 'e0000000-0000-0000-0000-000000000001';
  raise notice 'OK 3c : fenêtre de vente de l''événement (Bientôt disponible / fermé)';

  -- fenêtre de vente du TARIF
  update public.ticket_tiers set sales_start = now() + interval '1 hour' where id = tA;
  perform pg_temp.expect('SALES_NOT_OPEN', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticket_tiers set sales_start = null, sales_end = now() - interval '1 minute' where id = tA;
  perform pg_temp.expect('SALES_CLOSED', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticket_tiers set sales_end = null where id = tA;
  raise notice 'OK 3d : fenêtre de vente du tarif';

  -- tarif inactif / archivé / d'un autre événement
  update public.ticket_tiers set is_active = false where id = tA;
  perform pg_temp.expect('TIER_UNAVAILABLE', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticket_tiers set is_active = true, archived_at = now() where id = tA;
  perform pg_temp.expect('TIER_UNAVAILABLE', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-main', u3, tA));
  update public.ticket_tiers set archived_at = null where id = tA;
  raise notice 'OK 3e : tarif inactif / archivé refusé';
end $$;

-- tarif d'un autre événement
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e0000000-0000-0000-0000-000000000002', 'evt-other', now() + interval '30 days', 10, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total) values
  ('c0000000-0000-0000-0000-00000000000c', 'e0000000-0000-0000-0000-000000000002', 'Autre', 1000, 10);
select pg_temp.expect('TIER_UNAVAILABLE', $q$
  select pg_temp.res('evt-main', '00000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-00000000000c', 1) $q$);
do $$ begin raise notice 'OK 3f : un tarif d''un autre événement est refusé'; end $$;

-- =====================================================================
-- 4. Capacité du TARIF et capacité de l'ÉVÉNEMENT (les deux sont vérifiées)
-- =====================================================================
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e0000000-0000-0000-0000-000000000003', 'evt-cap', now() + interval '30 days', 5, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('d0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-000000000003', 'X', 1000, 10, 6),
  ('d1000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-000000000003', 'Y', 1000, 10, 6);
do $$
declare tX constant uuid := 'd0000000-0000-0000-0000-00000000000d';
        tY constant uuid := 'd1000000-0000-0000-0000-00000000000d';
begin
  perform pg_temp.res('evt-cap', '00000000-0000-0000-0000-000000000001', tX, 3);
  -- le tarif Y a 10 places, mais l'événement n'en a plus que 2 : refusé
  perform pg_temp.expect('SOLD_OUT_EVENT', format('select pg_temp.res(%L, %L, %L, 3)', 'evt-cap', '00000000-0000-0000-0000-000000000002', tY));
  perform pg_temp.res('evt-cap', '00000000-0000-0000-0000-000000000002', tY, 2);   -- 2 : accepté, l'événement est plein
  if pg_temp.remaining('evt-cap', tX) <> 0 or pg_temp.state('evt-cap', tX) <> 'sold_out'
     or pg_temp.remaining('evt-cap', tY) <> 0 or pg_temp.state('evt-cap', tY) <> 'sold_out'
  then raise exception 'FAIL 4 : les deux tarifs doivent être épuisés quand la capacité de l''événement est atteinte'; end if;
  perform pg_temp.expect('SOLD_OUT_EVENT', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-cap', '00000000-0000-0000-0000-000000000004', tY));

  -- capacité du TARIF : 10 places sur un événement de 100
  update public.ticketed_events set capacity = 100 where id = 'e0000000-0000-0000-0000-000000000003';
  update public.ticket_tiers set quantity_total = 4 where id = tX;      -- 3 déjà réservées
  perform pg_temp.expect('SOLD_OUT_TIER', format('select pg_temp.res(%L, %L, %L, 2)', 'evt-cap', '00000000-0000-0000-0000-000000000005', tX));
  perform pg_temp.res('evt-cap', '00000000-0000-0000-0000-000000000005', tX, 1);
  raise notice 'OK 4 : capacité du tarif ET de l''événement vérifiées';
end $$;

-- =====================================================================
-- 5. Réservations expirées libèrent le stock SANS cron
-- =====================================================================
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e0000000-0000-0000-0000-000000000004', 'evt-exp', now() + interval '30 days', 10, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('f0000000-0000-0000-0000-00000000000f', 'e0000000-0000-0000-0000-000000000004', 'T', 1000, 10, 6);
do $$
declare t constant uuid := 'f0000000-0000-0000-0000-00000000000f'; o1 uuid; o2 uuid; st text;
begin
  o1 := pg_temp.res('evt-exp', '00000000-0000-0000-0000-000000000001', t, 4);
  o2 := pg_temp.res('evt-exp', '00000000-0000-0000-0000-000000000002', t, 6);
  if pg_temp.remaining('evt-exp', t) <> 0 or pg_temp.state('evt-exp', t) <> 'sold_out'
  then raise exception 'FAIL 5 : le tarif devrait être épuisé'; end if;
  perform pg_temp.expect('SOLD_OUT_TIER', format('select pg_temp.res(%L, %L, %L, 1)', 'evt-exp', '00000000-0000-0000-0000-000000000003', t));

  -- 16 minutes plus tard : la 1re réservation est périmée. AUCUN cron, AUCUN nettoyage.
  update public.orders set expires_at = now() - interval '1 minute' where id = o1;
  select status into st from public.orders where id = o1;
  if st <> 'pending' then raise exception 'FAIL 5b : le test suppose que le statut est encore pending (%)', st; end if;
  if pg_temp.remaining('evt-exp', t) <> 4 or pg_temp.state('evt-exp', t) <> 'on_sale'
  then raise exception 'FAIL 5c : les 4 places d''une réservation périmée ne sont pas libérées (reste %)', pg_temp.remaining('evt-exp', t); end if;
  perform pg_temp.res('evt-exp', '00000000-0000-0000-0000-000000000003', t, 4);   -- quelqu'un d'autre les achète
  if pg_temp.remaining('evt-exp', t) <> 0 then raise exception 'FAIL 5d : stock incohérent après rachat'; end if;
  raise notice 'OK 5 : réservation périmée = stock libéré immédiatement, sans cron';
end $$;

-- =====================================================================
-- 6. Une seule réservation active par client et par événement
-- =====================================================================
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e0000000-0000-0000-0000-000000000005', 'evt-sup', now() + interval '30 days', 50, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a5000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005', 'S', 1000, 50, 6);
do $$
declare t constant uuid := 'a5000000-0000-0000-0000-000000000005'; o1 uuid; o2 uuid;
begin
  o1 := pg_temp.res('evt-sup', '00000000-0000-0000-0000-000000000001', t, 2);
  update public.orders set stripe_checkout_session_id = 'cs_test_old' where id = o1;
  o2 := pg_temp.res('evt-sup', '00000000-0000-0000-0000-000000000001', t, 3);
  if (select status from public.orders where id = o1) <> 'expired' then raise exception 'FAIL 6 : l''ancienne réservation n''est pas libérée'; end if;
  if pg_temp.remaining('evt-sup', t) <> 47 then raise exception 'FAIL 6b : reste % (attendu 47)', pg_temp.remaining('evt-sup', t); end if;
  raise notice 'OK 6 : la nouvelle réservation remplace l''ancienne (stock non doublé)';
end $$;

-- =====================================================================
-- 7. Administration : plancher de stock, archivage, audit
-- =====================================================================
do $$
declare adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad';
        tX constant uuid := 'd0000000-0000-0000-0000-00000000000d';
        tid uuid; res text; n int; det text;
begin
  -- tX : 3 réservées (évt cap) + 1 = 4 consommées, quantity_total = 4
  perform pg_temp.expect('QUANTITY_BELOW_SOLD', format(
    'select public.admin_save_tier(%L, %L, %L, ''X'', '''', 1000, 3, 6, null, null, true, 0)', adm, 'evt-cap', tX));
  begin
    perform public.admin_save_tier(adm, 'evt-cap', tX, 'X', '', 1000, 3, 6, null, null, true, 0);
  exception when others then get stacked diagnostics det = pg_exception_detail;
  end;
  if det <> '4' then raise exception 'FAIL 7 : le détail devrait indiquer le plancher 4 (reçu %)', det; end if;
  perform public.admin_save_tier(adm, 'evt-cap', tX, 'X', '', 1000, 4, 6, null, null, true, 0);   -- = consommé : accepté
  -- garde-fou de dernier recours : même un UPDATE direct est refusé
  perform pg_temp.expect('QUANTITY_BELOW_SOLD', format('update public.ticket_tiers set quantity_total = 1 where id = %L', tX));
  -- capacité de l'événement sous le consommé
  perform pg_temp.expect('CAPACITY_BELOW_SOLD', $q$
    select public.admin_save_event('ad000000-0000-0000-0000-0000000000ad', 'evt-cap', now() + interval '30 days', null, null, '', '', 3, null, null, true, 'published') $q$);
  perform pg_temp.expect('CAPACITY_BELOW_SOLD', $q$update public.ticketed_events set capacity = 1 where event_slug = 'evt-cap'$q$);
  raise notice 'OK 7a : impossible de descendre sous (vendus + réservés en cours), tarif et événement';

  -- billets payés comptent aussi dans le plancher
  insert into public.orders (id, user_id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, total_cents)
  values ('0f000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000005', 'evt-sup', 'paid', 'p@test.local', 2000, 2000);
  insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name)
  values ('1f000000-0000-0000-0000-00000000000f', '0f000000-0000-0000-0000-00000000000f', 'a5000000-0000-0000-0000-000000000005', 2, 1000,
          '[{"first_name":"a","last_name":"b"},{"first_name":"c","last_name":"d"}]', 'T', now(), 'S');
  insert into public.tickets (order_id, order_item_id, ticketed_event_id, tier_id, code) values
    ('0f000000-0000-0000-0000-00000000000f', '1f000000-0000-0000-0000-00000000000f', 'e0000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000005', 'c1'),
    ('0f000000-0000-0000-0000-00000000000f', '1f000000-0000-0000-0000-00000000000f', 'e0000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000005', 'c2');
  -- consommé du tarif S = 3 (pending du test 6) + 2 (billets) = 5
  perform pg_temp.expect('QUANTITY_BELOW_SOLD', $q$
    select public.admin_save_tier('ad000000-0000-0000-0000-0000000000ad', 'evt-sup', 'a5000000-0000-0000-0000-000000000005', 'S', '', 1000, 4, 6, null, null, true, 0) $q$);
  raise notice 'OK 7b : les billets payés comptent dans le plancher';

  -- un tarif vendu s'ARCHIVE, il ne se supprime pas
  res := public.admin_remove_tier(adm, 'a5000000-0000-0000-0000-000000000005');
  if res <> 'archived' then raise exception 'FAIL 7c : tarif vendu → % (attendu archived)', res; end if;
  select count(*) into n from public.ticket_tiers where id = 'a5000000-0000-0000-0000-000000000005' and archived_at is not null and not is_active;
  if n <> 1 then raise exception 'FAIL 7d : le tarif vendu n''est pas archivé'; end if;
  perform pg_temp.expect_state('23001|23503', $q$delete from public.ticket_tiers where id = 'a5000000-0000-0000-0000-000000000005'$q$);
  perform pg_temp.expect('TIER_ARCHIVED', $q$
    select public.admin_save_tier('ad000000-0000-0000-0000-0000000000ad', 'evt-sup', 'a5000000-0000-0000-0000-000000000005', 'S', '', 1000, 50, 6, null, null, true, 0) $q$);
  -- un tarif jamais vendu se supprime
  tid := public.admin_save_tier(adm, 'evt-sup', null, 'Jetable', '', 1000, 5, 2, null, null, true, 9);
  res := public.admin_remove_tier(adm, tid);
  if res <> 'deleted' or exists (select 1 from public.ticket_tiers where id = tid)
  then raise exception 'FAIL 7e : tarif jamais vendu → % (attendu deleted)', res; end if;
  raise notice 'OK 7c : tarif vendu archivé (jamais supprimé), tarif vierge supprimé';

  -- seul un compte admin peut appeler
  perform pg_temp.expect('FORBIDDEN', $q$
    select public.admin_save_tier('00000000-0000-0000-0000-000000000001', 'evt-sup', null, 'Pirate', '', 1000, 5, 2, null, null, true, 0) $q$);
  perform pg_temp.expect('FORBIDDEN', $q$
    select public.admin_save_tier(null, 'evt-sup', null, 'Pirate', '', 1000, 5, 2, null, null, true, 0) $q$);
  perform pg_temp.expect('FORBIDDEN', $q$
    select public.admin_set_setting('00000000-0000-0000-0000-000000000001', 'ticketing_mode', '"native"') $q$);
  raise notice 'OK 7d : les fonctions admin_* refusent un acteur non admin';
end $$;

-- =====================================================================
-- 8. Audit : toute modification d'événement / tarif / réglage est journalisée
-- =====================================================================
do $$
declare adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; a record; n int;
begin
  perform public.admin_save_event(adm, 'evt-audit', now() + interval '10 days', null, null, 'Lieu', 'Adresse', 30, null, null, false, 'draft');
  perform public.admin_save_event(adm, 'evt-audit', now() + interval '10 days', null, null, 'Lieu 2', 'Adresse', 30, null, null, true, 'published');
  perform public.admin_set_setting(adm, 'ticketing_mode', '"native"');
  perform pg_temp.expect_state('23514', $q$select public.admin_set_setting('ad000000-0000-0000-0000-0000000000ad', 'ticketing_mode', '"n''importe quoi"')$q$);

  for a in select * from (values ('event.create', 1), ('event.update', 1), ('tier.create', 1), ('tier.update', 1),
                                 ('tier.archive', 1), ('tier.delete', 1), ('setting.update', 1)) v(action, expected)
  loop
    select count(*) into n from public.audit_log where action = a.action and actor_id = adm;
    if n < a.expected then raise exception 'FAIL 8 : audit « % » : % ligne(s), attendu au moins %', a.action, n, a.expected; end if;
  end loop;
  -- avant / après renseignés
  if not exists (select 1 from public.audit_log where action = 'event.update' and before ->> 'venue_name' = 'Lieu' and after ->> 'venue_name' = 'Lieu 2')
  then raise exception 'FAIL 8b : audit event.update sans valeurs avant/après'; end if;
  if not exists (select 1 from public.audit_log where action = 'tier.update' and (before ->> 'quantity_total')::int = 4)
  then raise exception 'FAIL 8c : audit tier.update sans valeurs avant/après'; end if;
  if (select count(*) from public.audit_log where action = 'setting.update' and after -> 'value' = '"native"') <> 1
  then raise exception 'FAIL 8d : audit setting.update incorrect'; end if;
  -- un refus (FORBIDDEN, QUANTITY_BELOW_SOLD…) annule la transaction : pas de ligne d'audit orpheline
  if exists (select 1 from public.audit_log where action = 'tier.create' and after ->> 'name' = 'Pirate')
  then raise exception 'FAIL 8e : une action refusée a laissé une trace d''audit'; end if;
  raise notice 'OK 8 : chaque création / modification / archivage / suppression / réglage est audité (avant/après)';
end $$;

-- =====================================================================
-- 9. Contraintes de données
-- =====================================================================
do $$
begin
  insert into public.stripe_events (id, type) values ('evt_dup', 'checkout.session.completed');
  perform pg_temp.expect_state('23505', $q$insert into public.stripe_events (id, type) values ('evt_dup', 'checkout.session.completed')$q$);
  raise notice 'OK 9a : stripe_events.id unique (idempotence webhook)';

  perform pg_temp.expect_state('23514', $q$
    update public.orders set status = 'foo' where id = '0f000000-0000-0000-0000-00000000000f' $q$);
  update public.orders set status = 'partially_refunded', refunded_cents = 500 where id = '0f000000-0000-0000-0000-00000000000f';
  update public.orders set status = 'refunded', refunded_cents = 2000 where id = '0f000000-0000-0000-0000-00000000000f';
  update public.orders set status = 'cancelled' where id = '0f000000-0000-0000-0000-00000000000f';
  update public.orders set status = 'paid', refunded_cents = 0 where id = '0f000000-0000-0000-0000-00000000000f';
  perform pg_temp.expect_state('23514', $q$
    update public.orders set total_cents = 9999 where id = '0f000000-0000-0000-0000-00000000000f' $q$);   -- total ≠ sous-total + frais
  perform pg_temp.expect_state('23514', $q$
    update public.orders set currency = 'usd' where id = '0f000000-0000-0000-0000-00000000000f' $q$);
  raise notice 'OK 9b : statuts de commande valides, montants cohérents, devise EUR uniquement';
end $$;

do $$ begin raise notice 'ALL OK — règles métier phase 2 validées'; end $$;
rollback;
