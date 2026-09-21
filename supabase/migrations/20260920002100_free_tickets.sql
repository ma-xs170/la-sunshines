-- =====================================================================
-- 021 — Tarifs GRATUITS (0 €)
--  * prix : 0 OU ≥ 0,50 € (Stripe ne sait pas encaisser 0,01 – 0,49 €) ; 0 € n'est JAMAIS envoyé à Stripe ;
--  * ticket_tiers.max_per_account : plafond de billets gratuits par compte (défaut 2) ;
--  * reserve_tickets : tarif gratuit ⇒ e-mail confirmé + plafond par compte ; aucun frais si total = 0 ;
--    panier mixte ⇒ frais calculés sur la seule partie payante ;
--  * reserve_free_order : réservation du stock (reserve_tickets) + fulfill_order dans UNE transaction ;
--  * org_finance ignore les commandes à 0 €.
-- Additive : aucune donnée existante n'est modifiée.
-- =====================================================================

do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.ticket_tiers'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%price_cents%'
  loop
    execute format('alter table public.ticket_tiers drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.ticket_tiers
  add constraint ticket_tiers_price_cents_check
  check ((price_cents = 0 or price_cents >= 50) and price_cents <= 1000000);
alter table public.ticket_tiers
  add column max_per_account int not null default 2 check (max_per_account between 1 and 20);

-- 1) Réservation : contrôles « tarif gratuit » + frais nuls sur commande gratuite
create or replace function public.reserve_tickets(
  p_slug              text,
  p_user              uuid,
  p_event_title       text,     -- titre éditorial, résolu CÔTÉ SERVEUR (getAllEditions)
  p_items             jsonb,    -- [{tier_id, quantity, participants:[{first_name,last_name}]}]
  p_buyer             jsonb,    -- {email, first_name, last_name, phone}
  p_fee_percent       numeric,
  p_fee_fixed_cents   int,
  p_terms_version     text,
  p_guardian_consent  boolean,
  p_ttl               interval default interval '15 minutes'
)
returns table (
  order_id uuid, order_number text, subtotal_cents int, fee_cents int,
  total_cents int, expires_at timestamptz, superseded_sessions text[]
)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  ev   public.ticketed_events;
  t    public.ticket_tiers;
  it   jsonb;
  oid  uuid;
  qty  int;
  nb   int := 0;
  sub  int := 0;
  fee  int;
  sup  text[];
  seen uuid[] := '{}';
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(p_guardian_consent, false) or coalesce(p_terms_version, '') = '' then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 10
     or coalesce(p_buyer ->> 'email', '') = ''
     or p_fee_percent < 0 or p_fee_percent > 100
     or p_fee_fixed_cents < 0 or p_fee_fixed_cents > 5000 then
    raise exception 'INVALID_ITEMS';
  end if;

  -- 1) verrou de l'événement (sérialise les achats de cet événement)
  select * into ev from public.ticketed_events where event_slug = p_slug for update;
  if not found or not ev.ticketing_enabled or ev.status <> 'published' then
    raise exception 'EVENT_NOT_ON_SALE';
  end if;
  if now() < ev.sales_open_at then raise exception 'SALES_NOT_OPEN'; end if;
  if now() >= least(ev.sales_close_at, ev.starts_at) then raise exception 'SALES_CLOSED'; end if;

  -- 2) verrou des lignes de tarif demandées, dans un ordre stable
  perform 1 from public.ticket_tiers
   where ticketed_event_id = ev.id
     and id in (select (x ->> 'tier_id')::uuid from jsonb_array_elements(p_items) x)
   order by id for update;

  -- 3) réservations périmées → 'expired' (cosmétique : le calcul du stock les ignore déjà)
  update public.orders set status = 'expired'
   where ticketed_event_id = ev.id and status = 'pending' and expires_at <= now();
  -- une seule réservation active par client et par événement (anti-accaparement)
  with s as (
    update public.orders set status = 'expired'
     where user_id = p_user and ticketed_event_id = ev.id and status = 'pending'
    returning stripe_checkout_session_id
  )
  select coalesce(array_agg(stripe_checkout_session_id) filter (where stripe_checkout_session_id is not null),
                  array[]::text[])
    into sup from s;

  insert into public.orders (
    user_id, ticketed_event_id, event_slug, buyer_email, buyer_first_name, buyer_last_name,
    buyer_phone, expires_at, terms_accepted_at, terms_version, guardian_consent_at
  ) values (
    p_user, ev.id, p_slug, lower(p_buyer ->> 'email'),
    coalesce(p_buyer ->> 'first_name', ''), coalesce(p_buyer ->> 'last_name', ''),
    coalesce(p_buyer ->> 'phone', ''), now() + p_ttl, now(), p_terms_version, now()
  ) returning id into oid;

  for it in select value from jsonb_array_elements(p_items) loop
    qty := (it ->> 'quantity')::int;
    if (it ->> 'tier_id')::uuid = any (seen) then raise exception 'INVALID_ITEMS'; end if;
    seen := seen || (it ->> 'tier_id')::uuid;

    select * into t from public.ticket_tiers
     where id = (it ->> 'tier_id')::uuid and ticketed_event_id = ev.id;
    if not found or not t.is_active or t.archived_at is not null then
      raise exception 'TIER_UNAVAILABLE';
    end if;
    if now() < t.sales_start then raise exception 'SALES_NOT_OPEN'; end if;
    if now() >= t.sales_end   then raise exception 'SALES_CLOSED'; end if;
    if qty is null or qty < 1 or qty > t.max_per_order then raise exception 'QUANTITY_LIMIT'; end if;
    if jsonb_typeof(it -> 'participants') is distinct from 'array'
       or jsonb_array_length(it -> 'participants') <> qty then
      raise exception 'INVALID_PARTICIPANTS';
    end if;
    if qty > t.quantity_total - public.tier_consumed(t.id) then raise exception 'SOLD_OUT_TIER'; end if;

    -- Tarif GRATUIT : compte à e-mail confirmé + plafond par compte (billets déjà payés/réservés)
    if t.price_cents = 0 then
      if not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null) then
        raise exception 'EMAIL_NOT_CONFIRMED';
      end if;
      if qty + (select coalesce(sum(oi.quantity), 0) from public.order_items oi
                  join public.orders o on o.id = oi.order_id
                 where oi.tier_id = t.id and o.user_id = p_user and o.id <> oid
                   and (o.status in ('paid', 'partially_refunded')
                        or (o.status = 'pending' and o.expires_at > now()))) > t.max_per_account then
        raise exception 'ACCOUNT_LIMIT';
      end if;
    end if;

    insert into public.order_items (
      order_id, tier_id, quantity, unit_price_cents, participants,
      event_title, event_starts_at, venue_name, venue_address, tier_name
    ) values (
      oid, t.id, qty, t.price_cents, it -> 'participants',
      p_event_title, ev.starts_at, ev.venue_name, ev.venue_address, t.name
    );
    sub := sub + qty * t.price_cents;
    nb  := nb + qty;
  end loop;

  if nb > 20 then raise exception 'QUANTITY_LIMIT'; end if;
  -- event_consumed inclut déjà cette commande (pending, non expirée) :
  -- dépassement de la capacité de l'événement = échec de toute la transaction.
  if public.event_consumed(ev.id) > ev.capacity then raise exception 'SOLD_OUT_EVENT'; end if;

  -- Aucun frais sur une commande gratuite (ni % ni frais fixe). Panier mixte : frais sur la seule partie payante.
  fee := case when sub = 0 then 0 else round(sub * p_fee_percent / 100.0)::int + p_fee_fixed_cents end;
  update public.orders
     set subtotal_cents = sub, fee_cents = fee, total_cents = sub + fee
   where id = oid;

  return query
    select o.id, o.order_number, o.subtotal_cents, o.fee_cents, o.total_cents, o.expires_at, sup
      from public.orders o where o.id = oid;
end $$;

-- 2) Tarifs : nouveau paramètre p_max_per_account (les anciennes signatures sont remplacées)
drop function public.admin_save_tier(uuid, text, uuid, text, text, int, int, int, timestamptz, timestamptz, boolean, int);
create function public.admin_save_tier(
  p_actor uuid, p_event_slug text, p_tier_id uuid, p_name text, p_description text,
  p_price_cents int, p_quantity_total int, p_max_per_order int,
  p_sales_start timestamptz, p_sales_end timestamptz, p_is_active boolean, p_sort_order int, p_max_per_account int default 2
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; old public.ticket_tiers; cur public.ticket_tiers;
begin
  perform public._assert_admin(p_actor);
  select * into ev from public.ticketed_events where event_slug = p_event_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if p_tier_id is null then
    insert into public.ticket_tiers (
      ticketed_event_id, name, description, price_cents, quantity_total, max_per_order,
      sales_start, sales_end, is_active, sort_order, max_per_account
    ) values (
      ev.id, p_name, p_description, p_price_cents, p_quantity_total, p_max_per_order,
      p_sales_start, p_sales_end, p_is_active, p_sort_order, coalesce(p_max_per_account, 2)
    ) returning * into cur;
    perform public._audit(p_actor, 'tier.create', 'ticket_tier', cur.id::text, null, to_jsonb(cur),
                          jsonb_build_object('event_slug', p_event_slug));
  else
    select * into old from public.ticket_tiers
     where id = p_tier_id and ticketed_event_id = ev.id for update;
    if not found then raise exception 'TIER_NOT_FOUND'; end if;
    if old.archived_at is not null then raise exception 'TIER_ARCHIVED'; end if;
    if p_quantity_total < public.tier_consumed(old.id) then
      raise exception 'QUANTITY_BELOW_SOLD' using detail = public.tier_consumed(old.id)::text;
    end if;
    update public.ticket_tiers set
      name = p_name, description = p_description, price_cents = p_price_cents,
      quantity_total = p_quantity_total, max_per_order = p_max_per_order,
      sales_start = p_sales_start, sales_end = p_sales_end,
      is_active = p_is_active, sort_order = p_sort_order, max_per_account = coalesce(p_max_per_account, max_per_account)
     where id = old.id returning * into cur;
    perform public._audit(p_actor, 'tier.update', 'ticket_tier', cur.id::text, to_jsonb(old), to_jsonb(cur),
                          jsonb_build_object('event_slug', p_event_slug));
  end if;
  return cur.id;
end $$;
drop function public.org_save_tier(uuid, text, uuid, text, text, int, int, int, timestamptz, timestamptz, boolean, int);
create function public.org_save_tier(
  p_actor uuid, p_slug text, p_tier_id uuid, p_name text, p_description text,
  p_price_cents int, p_quantity_total int, p_max_per_order int,
  p_sales_start timestamptz, p_sales_end timestamptz, p_is_active boolean, p_sort_order int, p_max_per_account int default 2
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; old public.ticket_tiers; cur public.ticket_tiers;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  perform 1 from public.ticketed_events where id = ev.id for update;          -- même verrou que côté admin (ventes concurrentes)
  if p_tier_id is null then
    insert into public.ticket_tiers (ticketed_event_id, name, description, price_cents, quantity_total, max_per_order, sales_start, sales_end, is_active, sort_order, max_per_account)
    values (ev.id, p_name, p_description, p_price_cents, p_quantity_total, p_max_per_order, p_sales_start, p_sales_end, p_is_active, p_sort_order, coalesce(p_max_per_account, 2))
    returning * into cur;
    perform public._audit(p_actor, 'tier.create', 'ticket_tier', cur.id::text, null, to_jsonb(cur),
                          jsonb_build_object('event_slug', p_slug, 'via', 'organizer'));
  else
    select * into old from public.ticket_tiers where id = p_tier_id and ticketed_event_id = ev.id for update;
    if not found then raise exception 'TIER_NOT_FOUND'; end if;
    if old.archived_at is not null then raise exception 'TIER_ARCHIVED'; end if;
    if p_quantity_total < public.tier_consumed(old.id) then
      raise exception 'QUANTITY_BELOW_SOLD' using detail = public.tier_consumed(old.id)::text;
    end if;
    update public.ticket_tiers set name = p_name, description = p_description, price_cents = p_price_cents, quantity_total = p_quantity_total,
      max_per_order = p_max_per_order, sales_start = p_sales_start, sales_end = p_sales_end, is_active = p_is_active, sort_order = p_sort_order, max_per_account = coalesce(p_max_per_account, max_per_account)
     where id = old.id returning * into cur;
    perform public._audit(p_actor, 'tier.update', 'ticket_tier', cur.id::text, to_jsonb(old), to_jsonb(cur),
                          jsonb_build_object('event_slug', p_slug, 'via', 'organizer'));
  end if;
  return cur.id;
end $$;
drop function public.org_tiers(uuid, text);
create function public.org_tiers(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return jsonb_build_object('capacity', ev.capacity, 'consumed', public.event_consumed(ev.id), 'tiers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents, 'quantity_total', t.quantity_total,
      'max_per_order', t.max_per_order, 'max_per_account', t.max_per_account, 'sales_start', t.sales_start, 'sales_end', t.sales_end, 'is_active', t.is_active,
      'archived', t.archived_at is not null, 'sort_order', t.sort_order,
      'sold', (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')),
      'consumed', public.tier_consumed(t.id)
    ) order by (t.archived_at is not null), t.sort_order, t.created_at)
    from public.ticket_tiers t where t.ticketed_event_id = ev.id), '[]'::jsonb));
end $$;

-- 3) Achat 100 % gratuit : réservation du stock + confirmation dans la MÊME transaction.
-- p_tickets : [{tier_id, id, code, first_name, last_name}] — un élément par place ; le tier_id
-- (unique dans une commande) désigne la ligne ; codes générés côté serveur (HMAC).
create function public.reserve_free_order(
  p_slug text, p_user uuid, p_event_title text, p_items jsonb, p_buyer jsonb,
  p_terms_version text, p_guardian_consent boolean, p_tickets jsonb
) returns table (order_id uuid, order_number text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record; res text; lines jsonb;
begin
  select * into r from public.reserve_tickets(p_slug, p_user, p_event_title, p_items, p_buyer,
                                              0, 0, p_terms_version, p_guardian_consent);
  -- un tarif est devenu payant entre-temps : on annule tout (rollback)
  if r.total_cents <> 0 then raise exception 'PRICE_CHANGED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x ->> 'id', 'code', x ->> 'code', 'first_name', x ->> 'first_name', 'last_name', x ->> 'last_name',
           'order_item_id', oi.id)), '[]'::jsonb)
    into lines
    from jsonb_array_elements(p_tickets) x
    join public.order_items oi on oi.order_id = r.order_id and oi.tier_id = (x ->> 'tier_id')::uuid;

  res := public.fulfill_order(r.order_id, null, null, 0, lines);
  if res <> 'fulfilled' then raise exception 'FULFILL_FAILED:%', res; end if;
  return query select r.order_id, r.order_number;
end $$;

-- 4) Finance : les commandes gratuites sont ignorées
create or replace function public.org_finance(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; gross bigint; fees bigint; refunded bigint; net bigint; paid bigint;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select coalesce(sum(total_cents), 0), coalesce(sum(fee_cents) filter (where status <> 'refunded'), 0), coalesce(sum(refunded_cents), 0), coalesce(sum(greatest(subtotal_cents - refunded_cents, 0)), 0)
    into gross, fees, refunded, net
    from public.orders where ticketed_event_id = ev.id and source = 'web' and total_cents > 0 and status in ('paid', 'partially_refunded', 'refunded');
  select coalesce(sum(amount_cents), 0) into paid from public.event_payouts where ticketed_event_id = ev.id;
  perform public._org_audit(p_actor, ev.id, 'organizer.finance_view', '{}'::jsonb, 30);
  return jsonb_build_object('gross_cents', gross, 'fees_cents', fees, 'refunded_cents', refunded, 'net_cents', net, 'paid_out_cents', paid, 'remaining_cents', greatest(net - paid, 0),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'paid_on', p.paid_on, 'note', p.note) order by p.paid_on desc) from public.event_payouts p where p.ticketed_event_id = ev.id), '[]'::jsonb));
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('reserve_tickets', 'reserve_free_order', 'admin_save_tier', 'org_save_tier', 'org_tiers', 'org_finance')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
