-- =====================================================================
-- Migration 025 — application des codes promo au paiement
--
--  * orders.promo_code_id / discount_cents : code appliqué et remise totale (en centimes).
--  * apply_promo : à appeler juste après reserve_tickets, avant la session Stripe. Verrou de la commande ET du code ; le code doit être actif,
--    dans sa période, non épuisé (utilisations = commandes payées + réservations en cours) ; il s'applique aux seuls tarifs visés.
--    Remise par place : pourcentage arrondi ou montant fixe ; un prix payant ne descend jamais sous 0,50 € (minimum Stripe) ;
--    un code qui rendrait la commande GRATUITE est refusé (PROMO_FREE) : les billets gratuits ont leur propre parcours.
--    Frais de service recalculés sur le nouveau sous-total. Tout ou rien (une seule fonction = une transaction).
-- Additive. Retour arrière : supabase/down/025_down.sql.
-- =====================================================================

alter table public.orders
  add column if not exists promo_code_id uuid references public.promo_codes(id) on delete set null,
  add column if not exists discount_cents int not null default 0 check (discount_cents >= 0);
create index if not exists orders_promo_idx on public.orders (promo_code_id) where promo_code_id is not null;

create function public.apply_promo(p_user uuid, p_order uuid, p_code text, p_fee_percent numeric, p_fee_fixed_cents int)
returns table (subtotal_cents int, fee_cents int, total_cents int, discount_cents int)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare o public.orders; p public.promo_codes; it record; newp int; sub int := 0; disc int := 0; used int; fee int; elig boolean := false;
begin
  if p_fee_percent < 0 or p_fee_percent > 100 or p_fee_fixed_cents < 0 or p_fee_fixed_cents > 5000 then raise exception 'INVALID_ITEMS'; end if;
  select * into o from public.orders where id = p_order and user_id = p_user and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.promo_code_id is not null then raise exception 'PROMO_ALREADY'; end if;
  select * into p from public.promo_codes where ticketed_event_id = o.ticketed_event_id and code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found or not p.active then raise exception 'PROMO_INVALID'; end if;
  if (p.starts_at is not null and now() < p.starts_at) or (p.ends_at is not null and now() >= p.ends_at) then raise exception 'PROMO_EXPIRED'; end if;
  if p.max_uses is not null then
    select count(*) into used from public.orders x where x.promo_code_id = p.id and x.id <> o.id
       and (x.status in ('paid', 'partially_refunded') or (x.status = 'pending' and x.expires_at > now()));
    if used >= p.max_uses then raise exception 'PROMO_EXHAUSTED'; end if;
  end if;
  for it in select * from public.order_items where order_id = o.id order by id for update loop
    newp := it.unit_price_cents;
    if it.unit_price_cents > 0 and (p.tier_ids is null or it.tier_id = any (p.tier_ids)) then
      elig := true;
      newp := case p.kind when 'percent' then round(it.unit_price_cents * (100 - p.value) / 100.0)::int else greatest(it.unit_price_cents - p.value, 0) end;
      if newp > 0 and newp < 50 then newp := 50; end if;
      disc := disc + (it.unit_price_cents - newp) * it.quantity;
      update public.order_items set unit_price_cents = newp where id = it.id;
    end if;
    sub := sub + it.quantity * newp;
  end loop;
  if not elig then raise exception 'PROMO_NOT_APPLICABLE'; end if;
  if sub = 0 then raise exception 'PROMO_FREE'; end if;
  fee := round(sub * p_fee_percent / 100.0)::int + p_fee_fixed_cents;
  update public.orders set subtotal_cents = sub, fee_cents = fee, total_cents = sub + fee, promo_code_id = p.id, discount_cents = disc where id = o.id;
  update public.promo_codes set used_count = (select count(*) from public.orders x where x.promo_code_id = p.id and (x.status in ('paid', 'partially_refunded') or (x.status = 'pending' and x.expires_at > now()))) where id = p.id;
  perform public._audit(p_user, 'promo.apply', 'order', o.id::text, null, jsonb_build_object('code', p.code, 'discount_cents', disc));
  return query select sub, fee, sub + fee, disc;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'apply_promo'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
