-- =====================================================================
-- Phase 3 — Paiement Stripe : idempotence des webhooks, confirmation de commande
-- (création des billets), expiration, remboursements.
--
-- Prérequis : migrations 001 et 002.
-- Toutes les fonctions sont SECURITY DEFINER, search_path fixé, EXECUTE retiré à
-- public/anon/authenticated : seul service_role (routes serveur / webhook) les appelle.
-- Les billets ne sont créés QUE par fulfill_order, une fois la commande payée ; leurs
-- codes (token HMAC) sont calculés côté application et transmis ici (le secret n'est
-- jamais en base).
-- =====================================================================

alter table public.refunds
  add column idempotency_key text unique,                    -- « stock_lost:<order_id> », id de remboursement admin…
  add column source text not null default 'admin'
      check (source in ('admin', 'stock_lost', 'stripe_dashboard'));

-- ---------------------------------------------------------------------
-- Idempotence des webhooks : un événement Stripe n'est jamais traité deux fois
-- avec succès. Un événement en échec (ou interrompu) peut être retraité.
-- ---------------------------------------------------------------------
create function public.claim_stripe_event(p_id text, p_type text) returns text  -- 'process' | 'duplicate'
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare st text;
begin
  insert into public.stripe_events (id, type) values (p_id, p_type) on conflict (id) do nothing;
  if found then return 'process'; end if;
  select status into st from public.stripe_events where id = p_id for update;
  if st = 'done' then return 'duplicate'; end if;
  update public.stripe_events set status = 'processing', error = null where id = p_id;
  return 'process';
end $$;

create function public.finish_stripe_event(p_id text, p_ok boolean, p_error text default null) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.stripe_events
     set status = case when p_ok then 'done' else 'failed' end,
         error = left(p_error, 500), processed_at = now()
   where id = p_id
$$;

-- ---------------------------------------------------------------------
-- CONFIRMATION DE PAIEMENT — idempotente, atomique.
-- Verrous dans le même ordre que reserve_tickets (événement, puis commande).
-- Résultats : fulfilled | already_paid | stock_lost | amount_mismatch | not_found
--  * stock_lost : la réservation avait expiré ET le stock a été repris par d'autres.
--    La commande passe en 'cancelled' (payment_intent conservé) ; l'application
--    rembourse alors le TOTAL payé (frais compris) avec une clé d'idempotence.
--  * p_tickets : [{id, order_item_id, code, first_name, last_name}] — un par place.
-- ---------------------------------------------------------------------
create function public.fulfill_order(
  p_order uuid, p_session text, p_pi text, p_amount int, p_tickets jsonb
) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders; ev public.ticketed_events; ev_id uuid; oi record; need int;
begin
  select ticketed_event_id into ev_id from public.orders where id = p_order;
  if not found then return 'not_found'; end if;
  select * into ev from public.ticketed_events where id = ev_id for update;
  select * into o  from public.orders where id = p_order for update;

  if o.status in ('paid', 'partially_refunded', 'refunded') then return 'already_paid'; end if;
  -- rejeu d'un webhook sur une commande déjà classée « stock perdu »
  if o.status = 'cancelled' and p_pi is not null and o.stripe_payment_intent_id = p_pi then
    return 'stock_lost';
  end if;
  if p_amount is distinct from o.total_cents then return 'amount_mismatch'; end if;

  select coalesce(sum(quantity), 0) into need from public.order_items where order_id = o.id;

  -- réservation lâchée (expirée / annulée) : le stock a pu être repris → on revérifie
  if o.status <> 'pending' or o.expires_at <= now() then
    for oi in select tier_id, quantity from public.order_items where order_id = o.id loop
      if oi.quantity > (select quantity_total from public.ticket_tiers where id = oi.tier_id)
                       - public.tier_consumed(oi.tier_id) then
        update public.orders set status = 'cancelled', cancelled_at = now(),
               stripe_payment_intent_id = p_pi,
               stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session)
         where id = o.id;
        return 'stock_lost';
      end if;
    end loop;
    if public.event_consumed(ev.id) + need > ev.capacity then
      update public.orders set status = 'cancelled', cancelled_at = now(),
             stripe_payment_intent_id = p_pi,
             stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session)
       where id = o.id;
      return 'stock_lost';
    end if;
  end if;

  update public.orders
     set status = 'paid', paid_at = now(), expires_at = null, cancelled_at = null,
         stripe_payment_intent_id = p_pi,
         stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_session)
   where id = o.id;

  insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id,
                              code, holder_first_name, holder_last_name)
  select (x ->> 'id')::uuid, o.id, i.id, ev.id, i.tier_id, o.user_id,
         x ->> 'code', coalesce(x ->> 'first_name', ''), coalesce(x ->> 'last_name', '')
    from jsonb_array_elements(p_tickets) x
    join public.order_items i on i.id = (x ->> 'order_item_id')::uuid and i.order_id = o.id;

  if (select count(*) from public.tickets where order_id = o.id) <> need then
    raise exception 'TICKET_COUNT_MISMATCH';      -- annule TOUTE la transaction
  end if;
  return 'fulfilled';
end $$;

-- Session Checkout expirée / abandonnée : libère la réservation (le stock ne dépend pas de ceci).
create function public.expire_order_by_session(p_session text) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.orders set status = 'expired'
   where stripe_checkout_session_id = p_session and status = 'pending'
$$;

-- Le client abandonne sa propre réservation (retour « paiement annulé »).
create function public.cancel_pending_order(p_order uuid, p_user uuid)
returns table (cancelled boolean, session_id text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare sid text;
begin
  update public.orders set status = 'cancelled', cancelled_at = now()
   where id = p_order and user_id = p_user and status = 'pending'
  returning stripe_checkout_session_id into sid;
  if found then return query select true, sid; else return query select false, null::text; end if;
end $$;

-- ---------------------------------------------------------------------
-- REMBOURSEMENTS
-- refunded_cents = somme des remboursements non échoués (pending + succeeded) :
-- le total engagé, jamais dépassé. Remboursement total → billets valides « refunded »
-- (les billets déjà scannés restent « used »).
-- ---------------------------------------------------------------------
create function public._recalc_order_refund(p_order uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare total int; paid int; ost text;
begin
  select total_cents, status into total, ost from public.orders where id = p_order;
  select coalesce(sum(amount_cents), 0) into paid
    from public.refunds where order_id = p_order and status <> 'failed';
  if ost not in ('paid', 'partially_refunded', 'refunded', 'cancelled') then return; end if;

  update public.orders set
    refunded_cents = least(paid, total_cents),
    status = case
      when paid >= total_cents and total_cents > 0 then 'refunded'
      when paid > 0 then 'partially_refunded'
      -- remboursement échoué / annulé : on revient à l'état d'avant. Une commande jamais confirmée
      -- (paid_at null : « stock perdu », sans billet) redevient 'cancelled', JAMAIS 'paid'.
      when status in ('partially_refunded', 'refunded') then case when paid_at is null then 'cancelled' else 'paid' end
      else status end
  where id = p_order;

  if paid >= total and total > 0 then
    update public.tickets set status = 'refunded', cancelled_at = now()
     where order_id = p_order and status = 'valid';
  end if;
end $$;

-- Réserve un remboursement AVANT d'appeler Stripe (le webhook ne le comptera donc pas deux fois).
-- p_amount null = tout le reste. p_key : clé d'idempotence (unique) — rejeu = même ligne.
create function public.begin_refund(
  p_order uuid, p_amount int, p_reason text, p_actor uuid, p_source text, p_key text
) returns table (refund_id uuid, payment_intent text, amount_cents int, already_done boolean)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare o public.orders; remaining int; amt int; rid uuid; existing public.refunds;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_key is not null then
    select * into existing from public.refunds where idempotency_key = p_key;
    if found then
      -- rejeu après un échec Stripe : on RÉACTIVE la même ligne (même clé, même montant)
      if existing.status = 'failed' then
        update public.refunds set status = 'pending' where id = existing.id;
        perform public._recalc_order_refund(o.id);
      end if;
      return query select existing.id, o.stripe_payment_intent_id, existing.amount_cents, true; return;
    end if;
  end if;

  if o.status not in ('paid', 'partially_refunded', 'cancelled') or o.stripe_payment_intent_id is null then
    raise exception 'NOT_REFUNDABLE';
  end if;
  select o.total_cents - coalesce(sum(r.amount_cents), 0) into remaining
    from public.refunds r where r.order_id = o.id and r.status <> 'failed';
  amt := coalesce(p_amount, remaining);
  if amt <= 0 or amt > remaining then raise exception 'REFUND_EXCEEDS'; end if;

  insert into public.refunds (order_id, amount_cents, reason, status, created_by, source, idempotency_key)
  values (o.id, amt, left(p_reason, 200), 'pending', p_actor, p_source, p_key)
  returning id into rid;
  perform public._recalc_order_refund(o.id);
  if p_actor is not null then
    perform public._audit(p_actor, 'refund.create', 'order', o.id::text, null,
                          jsonb_build_object('refund_id', rid, 'amount_cents', amt, 'reason', p_reason));
  end if;
  return query select rid, o.stripe_payment_intent_id, amt, false;
end $$;

create function public.finish_refund(p_refund uuid, p_stripe_refund_id text, p_ok boolean) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare oid uuid;
begin
  update public.refunds
     set status = case when p_ok then 'succeeded' else 'failed' end,
         stripe_refund_id = coalesce(p_stripe_refund_id, stripe_refund_id)
   where id = p_refund returning order_id into oid;
  if oid is not null then perform public._recalc_order_refund(oid); end if;
end $$;

-- Webhook charge.refunded : aligne la base sur le TOTAL remboursé côté Stripe (valeur
-- absolue → rejeu sans effet). Un remboursement fait depuis le dashboard Stripe est
-- réconcilié par une ligne « stripe_dashboard » pour la différence.
create function public.apply_order_refund(p_pi text, p_refunded_total int) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare o public.orders; have int; diff int;
begin
  select * into o from public.orders where stripe_payment_intent_id = p_pi for update;
  if not found then return null; end if;
  select coalesce(sum(amount_cents), 0) into have
    from public.refunds where order_id = o.id and status <> 'failed';
  diff := least(p_refunded_total, o.total_cents) - have;
  if diff > 0 then
    insert into public.refunds (order_id, amount_cents, reason, status, source)
    values (o.id, diff, 'Remboursement effectué depuis Stripe', 'succeeded', 'stripe_dashboard');
  end if;
  -- les remboursements 'pending' confirmés par Stripe passent 'succeeded'
  update public.refunds set status = 'succeeded' where order_id = o.id and status = 'pending'
     and p_refunded_total >= (select coalesce(sum(amount_cents), 0) from public.refunds
                               where order_id = o.id and status <> 'failed');
  perform public._recalc_order_refund(o.id);
  return o.id;
end $$;

-- =====================================================================
-- EXECUTE : service_role uniquement
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('claim_stripe_event', 'finish_stripe_event', 'fulfill_order',
                        'expire_order_by_session', 'cancel_pending_order', '_recalc_order_refund',
                        'begin_refund', 'finish_refund', 'apply_order_refund')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
