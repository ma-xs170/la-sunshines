-- =====================================================================
-- Tests phase 3 — confirmation de paiement, idempotence, stock perdu, remboursements
-- À exécuter APRÈS les migrations 001-003. Transaction annulée (ROLLBACK).
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % »', p_msg, got; end if;
end $$;

-- réserve `qty` places d'un tarif pour un utilisateur ; renvoie l'id de commande
create function pg_temp.res(p_slug text, p_user uuid, p_tier uuid, p_qty int) returns uuid language plpgsql as $$
declare r record;
begin
  select * into r from public.reserve_tickets(p_slug, p_user, 'Soirée test',
    jsonb_build_array(jsonb_build_object('tier_id', p_tier, 'quantity', p_qty,
      'participants', (select jsonb_agg(jsonb_build_object('first_name', 'Part', 'last_name', g::text)) from generate_series(1, p_qty) g))),
    '{"email":"b@test.local","first_name":"B","last_name":"B"}', 0, 0, 'v1', true);
  return r.order_id;
end $$;

-- construit le tableau p_tickets attendu par fulfill_order pour une commande
create function pg_temp.tickets_for(p_order uuid, p_prefix text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'order_item_id', oi.id,
           'code', p_prefix || oi.id::text || g, 'first_name', 'Part', 'last_name', g::text)), '[]'::jsonb)
  from public.order_items oi cross join lateral generate_series(1, oi.quantity) g
  where oi.order_id = p_order $$;

create function pg_temp.status(p_order uuid) returns text language sql as $$ select status from public.orders where id = p_order $$;
create function pg_temp.ntickets(p_order uuid) returns int language sql as $$ select count(*)::int from public.tickets where order_id = p_order $$;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000000' || lpad(g::text, 2, '0'))::uuid, 'u' || g || '@test.local' from generate_series(1, 9) g;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';

insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e3000000-0000-0000-0000-000000000001', 'evt-pay', now() + interval '30 days', 100, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a3000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000001', 'Std', 1500, 5, 6),
  ('b3000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-000000000001', 'Autre', 1000, 50, 6);

-- =====================================================================
-- 1-3. Confirmation nominale, rejeu, montant incohérent
-- =====================================================================
do $$
declare tA constant uuid := 'a3000000-0000-0000-0000-00000000000a'; o uuid; r text; n int;
begin
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000001', tA, 3);
  -- montant incohérent → rien ne se passe
  r := public.fulfill_order(o, 'cs_1', 'pi_1', 999, pg_temp.tickets_for(o, 'A'));
  if r <> 'amount_mismatch' or pg_temp.status(o) <> 'pending' or pg_temp.ntickets(o) <> 0
  then raise exception 'FAIL 1 : montant incohérent → % / % / % billets', r, pg_temp.status(o), pg_temp.ntickets(o); end if;
  -- commande inconnue
  if public.fulfill_order(gen_random_uuid(), 'cs', 'pi', 1, '[]') <> 'not_found' then raise exception 'FAIL 1b : commande inconnue'; end if;

  r := public.fulfill_order(o, 'cs_1', 'pi_1', 4500, pg_temp.tickets_for(o, 'A'));
  if r <> 'fulfilled' then raise exception 'FAIL 2 : % (attendu fulfilled)', r; end if;
  if pg_temp.status(o) <> 'paid' or pg_temp.ntickets(o) <> 3 then raise exception 'FAIL 2b : statut % / % billets', pg_temp.status(o), pg_temp.ntickets(o); end if;
  if (select paid_at is null or expires_at is not null or stripe_payment_intent_id <> 'pi_1' from public.orders where id = o)
  then raise exception 'FAIL 2c : paid_at / expires_at / payment_intent incorrects'; end if;
  if exists (select 1 from public.tickets where order_id = o and (user_id <> '00000000-0000-0000-0000-000000000001' or status <> 'valid' or holder_first_name <> 'Part'))
  then raise exception 'FAIL 2d : billets mal renseignés'; end if;
  -- le stock consommé ne change pas quand la réservation devient paiement (3, pas 6)
  if public.tier_consumed(tA) <> 3 then raise exception 'FAIL 2e : consommé = % (attendu 3)', public.tier_consumed(tA); end if;

  -- rejeu (webhook livré 2 fois) : aucun billet supplémentaire
  r := public.fulfill_order(o, 'cs_1', 'pi_1', 4500, pg_temp.tickets_for(o, 'B'));
  if r <> 'already_paid' or pg_temp.ntickets(o) <> 3 then raise exception 'FAIL 3 : rejeu → % / % billets', r, pg_temp.ntickets(o); end if;
  raise notice 'OK 1-3 : montant incohérent refusé, confirmation nominale, rejeu sans doublon';
end $$;

-- =====================================================================
-- 4. Nombre de billets incohérent → tout est annulé
-- =====================================================================
do $$
declare tA constant uuid := 'a3000000-0000-0000-0000-00000000000a'; o uuid;
begin
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000002', tA, 2);
  perform pg_temp.expect('TICKET_COUNT_MISMATCH', format(
    $f$select public.fulfill_order(%L, 'cs_2', 'pi_2', 3000, (select jsonb_path_query_array(pg_temp.tickets_for(%L, 'X'), '$[0]')))$f$, o, o));
  if pg_temp.status(o) <> 'pending' or pg_temp.ntickets(o) <> 0
  then raise exception 'FAIL 4 : la transaction n''a pas été annulée (% / % billets)', pg_temp.status(o), pg_temp.ntickets(o); end if;
  raise notice 'OK 4 : nombre de billets incohérent → commande intacte (rollback)';
end $$;

-- =====================================================================
-- 5-6. Paiement tardif : stock encore libre → confirmé ; stock repris → stock_lost
-- =====================================================================
do $$
declare tA constant uuid := 'a3000000-0000-0000-0000-00000000000a';
        o2 uuid; o3 uuid; o4 uuid; r text;
begin
  -- état : tA a 5 places ; 3 payées (test 1) + 2 réservées (test 4, user 2, statut pending)
  update public.orders set expires_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-000000000002';
  -- la réservation de l'user 2 est périmée : 2 places libres ; il paie quand même avant que quiconque les prenne
  o2 := (select id from public.orders where user_id = '00000000-0000-0000-0000-000000000002');
  r := public.fulfill_order(o2, 'cs_2', 'pi_2', 3000, pg_temp.tickets_for(o2, 'C'));
  if r <> 'fulfilled' or pg_temp.status(o2) <> 'paid' then raise exception 'FAIL 5 : paiement tardif, stock libre → % / %', r, pg_temp.status(o2); end if;
  raise notice 'OK 5 : paiement après expiration, stock encore libre → confirmé';

  -- tA est maintenant plein (5/5). User 3 réserve un tarif AUTRE, puis on force la situation « stock repris » :
  o3 := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-00000000000b', 2);
  update public.ticket_tiers set quantity_total = 2 where id = 'b3000000-0000-0000-0000-00000000000b';
  update public.orders set expires_at = now() - interval '1 minute' where id = o3;          -- réservation périmée
  o4 := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000004', 'b3000000-0000-0000-0000-00000000000b', 2);  -- un autre achète les 2 places
  r := public.fulfill_order(o3, 'cs_3', 'pi_3', 2000, pg_temp.tickets_for(o3, 'D'));
  if r <> 'stock_lost' then raise exception 'FAIL 6 : stock repris → % (attendu stock_lost)', r; end if;
  if pg_temp.status(o3) <> 'cancelled' or pg_temp.ntickets(o3) <> 0
     or (select stripe_payment_intent_id from public.orders where id = o3) <> 'pi_3'
  then raise exception 'FAIL 6b : stock_lost → statut % / payment_intent non conservé', pg_temp.status(o3); end if;
  -- rejeu du même webhook : même réponse, aucun billet
  r := public.fulfill_order(o3, 'cs_3', 'pi_3', 2000, pg_temp.tickets_for(o3, 'D'));
  if r <> 'stock_lost' or pg_temp.ntickets(o3) <> 0 then raise exception 'FAIL 6c : rejeu stock_lost → % ', r; end if;
  raise notice 'OK 6 : stock repris → stock_lost, commande annulée, payment_intent conservé, rejeu idempotent';

  -- remboursement du TOTAL payé, frais compris, avec clé d'idempotence (rejeu = même remboursement)
  declare rf record; rf2 record;
  begin
    select * into rf from public.begin_refund(o3, null, 'Stock épuisé', null, 'stock_lost', 'stock_lost:' || o3);
    if rf.amount_cents <> 2000 or rf.already_done or rf.payment_intent <> 'pi_3' then raise exception 'FAIL 6d : remboursement % / %', rf.amount_cents, rf.already_done; end if;
    select * into rf2 from public.begin_refund(o3, null, 'Stock épuisé', null, 'stock_lost', 'stock_lost:' || o3);
    if not rf2.already_done or rf2.refund_id <> rf.refund_id then raise exception 'FAIL 6e : le rejeu doit renvoyer le même remboursement'; end if;
    if (select count(*) from public.refunds where order_id = o3) <> 1 then raise exception 'FAIL 6f : remboursement en double'; end if;
    perform public.finish_refund(rf.refund_id, 're_stock', true);
    if pg_temp.status(o3) <> 'refunded' or (select refunded_cents from public.orders where id = o3) <> 2000
    then raise exception 'FAIL 6g : commande % après remboursement total', pg_temp.status(o3); end if;
  end;
  raise notice 'OK 6h : stock_lost remboursé en totalité, clé d''idempotence unique (un seul remboursement)';
end $$;

-- =====================================================================
-- 6bis. Remboursement stock_lost qui ÉCHOUE chez Stripe : la commande ne doit JAMAIS
--       devenir « paid » (elle n'a aucun billet) ; le rejeu doit retrouver « stock_lost ».
-- =====================================================================
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('d3000000-0000-0000-0000-00000000000d', 'e3000000-0000-0000-0000-000000000001', 'Dernières', 1000, 2, 6);
do $$
declare t constant uuid := 'd3000000-0000-0000-0000-00000000000d'; o uuid; rf record; r text;
begin
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000005', t, 2);
  update public.orders set expires_at = now() - interval '1 minute' where id = o;           -- la réservation expire
  perform pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000006', t, 2);              -- un autre prend les 2 places
  r := public.fulfill_order(o, 'cs_f', 'pi_f', 2000, pg_temp.tickets_for(o, 'F'));
  if r <> 'stock_lost' then raise exception 'FAIL 6bis : % (attendu stock_lost)', r; end if;
  select * into rf from public.begin_refund(o, null, 'Stock', null, 'stock_lost', 'stock_lost:' || o);
  if pg_temp.status(o) <> 'refunded' then raise exception 'FAIL 6bis-a : statut % pendant le remboursement', pg_temp.status(o); end if;
  perform public.finish_refund(rf.refund_id, null, false);                                   -- Stripe a refusé
  if pg_temp.status(o) <> 'cancelled' or (select refunded_cents from public.orders where id = o) <> 0
  then raise exception 'FAIL 6bis-b : après un remboursement échoué la commande est « % » (attendu cancelled)', pg_temp.status(o); end if;
  if pg_temp.ntickets(o) <> 0 then raise exception 'FAIL 6bis-c : billets créés pour une commande stock_lost'; end if;
  -- le rejeu du webhook retrouve bien « stock_lost » (et non « already_paid »)
  r := public.fulfill_order(o, 'cs_f', 'pi_f', 2000, pg_temp.tickets_for(o, 'F'));
  if r <> 'stock_lost' then raise exception 'FAIL 6bis-d : rejeu → % (attendu stock_lost)', r; end if;
  -- la même ligne est réactivée puis réussit
  select * into rf from public.begin_refund(o, null, 'Stock', null, 'stock_lost', 'stock_lost:' || o);
  perform public.finish_refund(rf.refund_id, 're_f', true);
  if pg_temp.status(o) <> 'refunded' or (select count(*) from public.refunds where order_id = o) <> 1
  then raise exception 'FAIL 6bis-e : statut % / % ligne(s)', pg_temp.status(o), (select count(*) from public.refunds where order_id = o); end if;
  raise notice 'OK 6bis : remboursement échoué → commande reste « cancelled » (jamais « paid »), rejeu correct';
end $$;

-- =====================================================================
-- 7. Capacité de l'ÉVÉNEMENT reprise pendant l'expiration → stock_lost
-- =====================================================================
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e3000000-0000-0000-0000-000000000002', 'evt-cap3', now() + interval '30 days', 3, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('c3000000-0000-0000-0000-00000000000c', 'e3000000-0000-0000-0000-000000000002', 'T', 1000, 100, 6);
do $$
declare t constant uuid := 'c3000000-0000-0000-0000-00000000000c'; a uuid; b uuid; r text;
begin
  a := pg_temp.res('evt-cap3', '00000000-0000-0000-0000-000000000005', t, 2);
  update public.orders set expires_at = now() - interval '1 minute' where id = a;
  b := pg_temp.res('evt-cap3', '00000000-0000-0000-0000-000000000006', t, 3);   -- prend toute la capacité de l'événement
  r := public.fulfill_order(a, 'cs_a', 'pi_a', 2000, pg_temp.tickets_for(a, 'E'));
  if r <> 'stock_lost' then raise exception 'FAIL 7 : capacité événement reprise → % (attendu stock_lost)', r; end if;
  raise notice 'OK 7 : capacité de l''événement reprise → stock_lost';
end $$;

-- =====================================================================
-- 8. Idempotence des événements Stripe
-- =====================================================================
do $$
begin
  if public.claim_stripe_event('evt_1', 'checkout.session.completed') <> 'process' then raise exception 'FAIL 8'; end if;
  -- toujours 'processing' (interrompu) : retraité
  if public.claim_stripe_event('evt_1', 'checkout.session.completed') <> 'process' then raise exception 'FAIL 8b : événement interrompu non retraité'; end if;
  perform public.finish_stripe_event('evt_1', false, 'boom');
  if (select status || error from public.stripe_events where id = 'evt_1') <> 'failedboom' then raise exception 'FAIL 8c'; end if;
  if public.claim_stripe_event('evt_1', 'checkout.session.completed') <> 'process' then raise exception 'FAIL 8d : événement en échec non retraité'; end if;
  perform public.finish_stripe_event('evt_1', true);
  if public.claim_stripe_event('evt_1', 'checkout.session.completed') <> 'duplicate' then raise exception 'FAIL 8e : événement traité rejoué'; end if;
  if (select count(*) from public.stripe_events where id = 'evt_1') <> 1 then raise exception 'FAIL 8f'; end if;
  raise notice 'OK 8 : événement Stripe traité une fois, retraité s''il a échoué, doublon ignoré';
end $$;

-- =====================================================================
-- 9. Expiration / annulation de réservation
-- =====================================================================
do $$
declare t constant uuid := 'b3000000-0000-0000-0000-00000000000b'; o uuid; c record;
begin
  update public.ticket_tiers set quantity_total = 50 where id = t;
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000007', t, 1);
  update public.orders set stripe_checkout_session_id = 'cs_exp' where id = o;
  -- un autre client ne peut pas annuler ma réservation
  select * into c from public.cancel_pending_order(o, '00000000-0000-0000-0000-000000000008');
  if c.cancelled or pg_temp.status(o) <> 'pending' then raise exception 'FAIL 9 : un tiers a annulé la réservation'; end if;
  select * into c from public.cancel_pending_order(o, '00000000-0000-0000-0000-000000000007');
  if not c.cancelled or c.session_id <> 'cs_exp' or pg_temp.status(o) <> 'cancelled' then raise exception 'FAIL 9b : annulation propriétaire'; end if;
  -- checkout.session.expired : ne touche que les commandes pending
  perform public.expire_order_by_session('cs_exp');
  if pg_temp.status(o) <> 'cancelled' then raise exception 'FAIL 9c : expiration d''une commande déjà annulée'; end if;
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000007', t, 1);
  update public.orders set stripe_checkout_session_id = 'cs_exp2' where id = o;
  perform public.expire_order_by_session('cs_exp2');
  if pg_temp.status(o) <> 'expired' then raise exception 'FAIL 9d : session expirée non traitée'; end if;
  raise notice 'OK 9 : annulation réservée au propriétaire, session expirée → commande expired';
end $$;

-- =====================================================================
-- 10. Remboursements : partiel / total / échec / dashboard Stripe / rejeux
-- =====================================================================
do $$
declare t constant uuid := 'b3000000-0000-0000-0000-00000000000b'; o uuid; rf record; n int;
begin
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000009', t, 2);          -- 2 × 10,00 €
  perform public.fulfill_order(o, 'cs_r', 'pi_r', 2000, pg_temp.tickets_for(o, 'R'));

  -- partiel : la commande passe partially_refunded, les billets restent valides
  select * into rf from public.begin_refund(o, 500, 'Geste', 'ad000000-0000-0000-0000-0000000000ad', 'admin', 'admin:r1');
  perform public.finish_refund(rf.refund_id, 're_1', true);
  if pg_temp.status(o) <> 'partially_refunded' or (select refunded_cents from public.orders where id = o) <> 500
     or (select count(*) from public.tickets where order_id = o and status = 'valid') <> 2
  then raise exception 'FAIL 10 : remboursement partiel → %', pg_temp.status(o); end if;

  -- dépassement refusé
  perform pg_temp.expect('REFUND_EXCEEDS', format($f$select public.begin_refund(%L, 1501, 'x', null, 'admin', 'admin:r2')$f$, o));
  perform pg_temp.expect('REFUND_EXCEEDS', format($f$select public.begin_refund(%L, 0, 'x', null, 'admin', 'admin:r3')$f$, o));

  -- un remboursement qui échoue chez Stripe est retiré du total
  select * into rf from public.begin_refund(o, 700, 'Test échec', null, 'admin', 'admin:r4');
  if (select refunded_cents from public.orders where id = o) <> 1200 then raise exception 'FAIL 10b : total engagé attendu 1200'; end if;
  perform public.finish_refund(rf.refund_id, null, false);
  if (select refunded_cents from public.orders where id = o) <> 500 or pg_temp.status(o) <> 'partially_refunded'
  then raise exception 'FAIL 10c : échec Stripe non retiré du total'; end if;

  -- rejeu avec la même clé après un échec : la ligne est réactivée, sans doublon
  select * into rf from public.begin_refund(o, 700, 'Test rejeu', null, 'admin', 'admin:r5');
  perform public.finish_refund(rf.refund_id, null, false);
  select * into rf from public.begin_refund(o, 700, 'Test rejeu', null, 'admin', 'admin:r5');
  if not rf.already_done or (select count(*) from public.refunds where idempotency_key = 'admin:r5') <> 1
     or (select status from public.refunds where idempotency_key = 'admin:r5') <> 'pending'
     or (select refunded_cents from public.orders where id = o) <> 1200
  then raise exception 'FAIL 10c2 : rejeu après échec (ligne non réactivée proprement)'; end if;
  perform public.finish_refund(rf.refund_id, null, false);

  -- webhook charge.refunded confirme le remboursement partiel (500) : pas de ligne en double
  perform public.apply_order_refund('pi_r', 500);
  perform public.apply_order_refund('pi_r', 500);
  select count(*) into n from public.refunds where order_id = o and status <> 'failed';
  if n <> 1 then raise exception 'FAIL 10d : % lignes de remboursement (attendu 1)', n; end if;

  -- remboursement fait depuis le dashboard Stripe (total 2000) : réconcilié, billets remboursés
  perform public.apply_order_refund('pi_r', 2000);
  perform public.apply_order_refund('pi_r', 2000);   -- rejeu
  if pg_temp.status(o) <> 'refunded' or (select refunded_cents from public.orders where id = o) <> 2000
     or (select count(*) from public.tickets where order_id = o and status = 'refunded') <> 2
     or (select sum(amount_cents) from public.refunds where order_id = o and status <> 'failed') <> 2000
  then raise exception 'FAIL 10e : réconciliation dashboard incorrecte (statut %)', pg_temp.status(o); end if;
  if public.apply_order_refund('pi_inconnu', 100) is not null then raise exception 'FAIL 10f : payment_intent inconnu'; end if;

  -- un billet déjà scanné reste « used » après un remboursement total
  o := pg_temp.res('evt-pay', '00000000-0000-0000-0000-000000000001', t, 1);
  perform public.fulfill_order(o, 'cs_u', 'pi_u', 1000, pg_temp.tickets_for(o, 'U'));
  update public.tickets set status = 'used', used_at = now() where order_id = o;
  select * into rf from public.begin_refund(o, null, 'x', null, 'admin', 'admin:u');
  perform public.finish_refund(rf.refund_id, 're_u', true);
  if (select status from public.tickets where order_id = o) <> 'used' then raise exception 'FAIL 10g : billet scanné remboursé'; end if;
  raise notice 'OK 10 : remboursement partiel / total / échec / dashboard Stripe / rejeux — sans double comptage';
end $$;

do $$ begin raise notice 'ALL OK — phase 3 validée'; end $$;
rollback;
