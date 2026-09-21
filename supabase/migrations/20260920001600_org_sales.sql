-- =====================================================================
-- Migration 016 — billetterie et ventes côté organisateur (Phase 3)
--
--  * promo_codes : codes de réduction par évènement (fixe en € ou en %), quantité maximale, dates, tarifs concernés.
--    Le contrôle d'un code (promo_preview) est prêt ; son application au paiement Stripe n'est PAS branchée (chemin d'argent : décision à part).
--  * org_orders / org_order_detail : commandes paginées, recherche, détail complet (participants, remboursements, consentements).
--  * org_refunds : remboursements par statut (lecture) ; l'action de remboursement reste réservée aux admins.
--  * org_scan_history / org_invitations / org_create_invitation : contrôle d'accès et distribution.
-- Additive : aucune table existante modifiée. Chaque fonction revérifie le rôle et l'appartenance (_org_access).
-- =====================================================================

create table public.promo_codes (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  code              text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  title             text not null default '' check (char_length(title) <= 80),
  active            boolean not null default true,
  kind              text not null check (kind in ('fixed', 'percent')),
  value             int  not null check (value > 0),
  max_uses          int  check (max_uses is null or max_uses between 1 and 100000),
  used_count        int  not null default 0 check (used_count >= 0),
  starts_at         timestamptz,
  ends_at           timestamptz,
  tier_ids          uuid[],                                          -- null = tous les tarifs
  created_at        timestamptz not null default now(),
  unique (ticketed_event_id, code),
  check ((kind = 'percent' and value between 1 and 100) or (kind = 'fixed' and value <= 100000)),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

-- ---------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------
create function public.org_orders(p_actor uuid, p_slug text, p_q text default null, p_status text default null, p_limit int default 20, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; q text := nullif(btrim(coalesce(p_q, '')), ''); total int; rows jsonb; lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_status is not null and p_status not in ('paid', 'pending', 'expired', 'cancelled', 'partially_refunded', 'refunded') then raise exception 'BAD_FILTER'; end if;
  if q is not null then q := replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_'); end if;
  select count(*) into total from public.orders o
   where o.ticketed_event_id = ev.id and (p_status is null or o.status = p_status)
     and (q is null or o.order_number ilike '%' || q || '%' or o.buyer_email ilike '%' || q || '%' or o.buyer_last_name ilike '%' || q || '%' or o.buyer_first_name ilike '%' || q || '%');
  select coalesce(jsonb_agg(r), '[]'::jsonb) into rows from (
    select o.id, o.order_number, o.status, o.source, o.buyer_first_name, o.buyer_last_name, o.buyer_email, o.total_cents, o.refunded_cents, o.paid_at, o.created_at,
           (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id) as tickets
      from public.orders o
     where o.ticketed_event_id = ev.id and (p_status is null or o.status = p_status)
       and (q is null or o.order_number ilike '%' || q || '%' or o.buyer_email ilike '%' || q || '%' or o.buyer_last_name ilike '%' || q || '%' or o.buyer_first_name ilike '%' || q || '%')
     order by o.created_at desc limit lim offset greatest(coalesce(p_offset, 0), 0)) r;
  perform public._org_audit(p_actor, ev.id, 'organizer.orders_view', jsonb_build_object('filtered', q is not null or p_status is not null), 5);
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

create function public.org_order_detail(p_actor uuid, p_slug text, p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; o public.orders;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select * into o from public.orders where id = p_order and ticketed_event_id = ev.id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  perform public._org_audit(p_actor, ev.id, 'organizer.order_view', jsonb_build_object('order', o.order_number), 5);
  return jsonb_build_object(
    'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'source', o.source, 'buyer_first_name', o.buyer_first_name,
      'buyer_last_name', o.buyer_last_name, 'buyer_email', o.buyer_email, 'buyer_phone', o.buyer_phone, 'subtotal_cents', o.subtotal_cents, 'fee_cents', o.fee_cents,
      'total_cents', o.total_cents, 'refunded_cents', o.refunded_cents, 'paid_at', o.paid_at, 'created_at', o.created_at, 'email_status', o.email_status,
      'terms_accepted_at', o.terms_accepted_at, 'guardian_consent_at', o.guardian_consent_at),
    'items', coalesce((select jsonb_agg(jsonb_build_object('tier', i.tier_name, 'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents)) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'reference', t.reference, 'first_name', t.holder_first_name, 'last_name', t.holder_last_name, 'status', t.status, 'used_at', t.used_at) order by t.created_at)
                         from public.tickets t where t.order_id = o.id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', r.amount_cents, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at) order by r.created_at) from public.refunds r where r.order_id = o.id), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('key', c.consent_key, 'label', c.label, 'accepted', c.accepted, 'at', c.created_at) order by c.id) from public.order_consents c where c.order_id = o.id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Remboursements (lecture) : En attente / Approuvée (effectué) / Refusée (échec) / Toutes
-- ---------------------------------------------------------------------
create function public.org_refunds(p_actor uuid, p_slug text, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_status is not null and p_status not in ('pending', 'succeeded', 'failed') then raise exception 'BAD_FILTER'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'order_id', o.id, 'order_number', o.order_number, 'buyer', o.buyer_last_name || ' ' || o.buyer_first_name,
            'amount_cents', r.amount_cents, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at, 'stripe_refund_id', r.stripe_refund_id) order by r.created_at desc)
          from public.refunds r join public.orders o on o.id = r.order_id where o.ticketed_event_id = ev.id and (p_status is null or r.status = p_status)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Contrôle d'accès : historique des scans (agent nommé par prénom)
-- ---------------------------------------------------------------------
create function public.org_scan_history(p_actor uuid, p_slug text, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return jsonb_build_object(
    'entered', (select count(*) from public.tickets where ticketed_event_id = ev.id and status = 'used'),
    'expected', (select count(*) from public.tickets where ticketed_event_id = ev.id and status in ('valid', 'used')),
    'rows', coalesce((select jsonb_agg(x) from (
        select t.reference, t.holder_first_name, t.holder_last_name, t.used_at, tr.name as tier, p.first_name as agent
          from public.tickets t join public.ticket_tiers tr on tr.id = t.tier_id left join public.profiles p on p.id = t.used_by
         where t.ticketed_event_id = ev.id and t.status = 'used' order by t.used_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Distribuer : suivi des invitations (aucune coordonnée) et création
-- ---------------------------------------------------------------------
create function public.org_invitations(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return jsonb_build_object(
    'issued', (select count(*) from public.tickets t join public.orders o on o.id = t.order_id where t.ticketed_event_id = ev.id and o.source = 'manual'),
    'used', (select count(*) from public.tickets t join public.orders o on o.id = t.order_id where t.ticketed_event_id = ev.id and o.source = 'manual' and t.status = 'used'),
    'rows', coalesce((select jsonb_agg(x) from (
        select o.order_number, o.created_at, o.email_status, tr.name as tier, count(*) as tickets, count(*) filter (where t.status = 'used') as used
          from public.orders o join public.tickets t on t.order_id = o.id join public.ticket_tiers tr on tr.id = t.tier_id
         where o.ticketed_event_id = ev.id and o.source = 'manual' group by o.id, tr.name order by o.created_at desc limit 200) x), '[]'::jsonb));
end $$;

create function public.org_create_invitation(p_actor uuid, p_slug text, p_tier uuid, p_event_title text, p_email text, p_first text, p_last text, p_holders jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; t public.ticket_tiers; qty int; oid uuid; iid uuid; uid uuid;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if jsonb_typeof(p_holders) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  qty := jsonb_array_length(p_holders);
  if qty < 1 or qty > 20 or coalesce(p_email, '') = '' then raise exception 'INVALID_ITEMS'; end if;
  select * into ev from public.ticketed_events where id = ev.id for update;
  select * into t from public.ticket_tiers where id = p_tier and ticketed_event_id = ev.id for update;
  if not found or t.archived_at is not null then raise exception 'TIER_UNAVAILABLE'; end if;
  if qty > t.quantity_total - public.tier_consumed(t.id) then raise exception 'SOLD_OUT_TIER'; end if;
  if public.event_consumed(ev.id) + qty > ev.capacity then raise exception 'SOLD_OUT_EVENT'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;
  insert into public.orders (user_id, ticketed_event_id, event_slug, status, source, buyer_email, buyer_first_name, buyer_last_name, paid_at)
  values (uid, ev.id, p_slug, 'paid', 'manual', lower(p_email), left(coalesce(p_first, ''), 60), left(coalesce(p_last, ''), 60), now()) returning id into oid;
  insert into public.order_items (order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, venue_name, venue_address, tier_name)
  select oid, t.id, qty, 0, (select jsonb_agg(jsonb_build_object('first_name', x ->> 'first_name', 'last_name', x ->> 'last_name')) from jsonb_array_elements(p_holders) x),
         p_event_title, ev.starts_at, ev.venue_name, ev.venue_address, t.name returning id into iid;
  insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code, holder_first_name, holder_last_name)
  select (x ->> 'id')::uuid, oid, iid, ev.id, t.id, uid, x ->> 'code', left(coalesce(x ->> 'first_name', ''), 60), left(coalesce(x ->> 'last_name', ''), 60) from jsonb_array_elements(p_holders) x;
  perform public._audit(p_actor, 'invitation.create', 'order', oid::text, null, jsonb_build_object('email', lower(p_email), 'quantity', qty, 'tier', t.name, 'event', p_slug, 'by', 'organizer'));
  return oid;
end $$;

-- ---------------------------------------------------------------------
-- Codes promo
-- ---------------------------------------------------------------------
create function public.org_promos(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return coalesce((select jsonb_agg(to_jsonb(p) - 'ticketed_event_id' order by p.created_at desc) from public.promo_codes p where p.ticketed_event_id = ev.id), '[]'::jsonb);
end $$;

create function public.org_promo_save(p_actor uuid, p_slug text, p_id uuid, p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; pid uuid; c text := upper(btrim(coalesce(p_data ->> 'code', '')));
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'BAD_PATCH'; end if;
  if p_data ? 'tier_ids' and jsonb_typeof(p_data -> 'tier_ids') = 'array' and exists (
       select 1 from jsonb_array_elements_text(p_data -> 'tier_ids') x where not exists (select 1 from public.ticket_tiers t where t.id = x::uuid and t.ticketed_event_id = ev.id)) then raise exception 'TIER_UNAVAILABLE'; end if;
  if p_id is null then
    insert into public.promo_codes (ticketed_event_id, code, title, active, kind, value, max_uses, starts_at, ends_at, tier_ids)
    values (ev.id, c, coalesce(p_data ->> 'title', ''), coalesce((p_data ->> 'active')::boolean, true), p_data ->> 'kind', (p_data ->> 'value')::int, nullif(p_data ->> 'max_uses', '')::int,
            nullif(p_data ->> 'starts_at', '')::timestamptz, nullif(p_data ->> 'ends_at', '')::timestamptz,
            case when jsonb_typeof(p_data -> 'tier_ids') = 'array' and jsonb_array_length(p_data -> 'tier_ids') > 0 then array(select jsonb_array_elements_text(p_data -> 'tier_ids')::uuid) end)
    returning id into pid;
  else
    update public.promo_codes set title = coalesce(p_data ->> 'title', title), active = coalesce((p_data ->> 'active')::boolean, active),
      max_uses = case when p_data ? 'max_uses' then nullif(p_data ->> 'max_uses', '')::int else max_uses end,
      starts_at = case when p_data ? 'starts_at' then nullif(p_data ->> 'starts_at', '')::timestamptz else starts_at end,
      ends_at = case when p_data ? 'ends_at' then nullif(p_data ->> 'ends_at', '')::timestamptz else ends_at end
    where id = p_id and ticketed_event_id = ev.id returning id into pid;    -- le code, le type et la valeur ne changent plus une fois créés (les acheteurs s'y fient)
    if pid is null then raise exception 'PROMO_NOT_FOUND'; end if;
  end if;
  perform public._org_audit(p_actor, ev.id, 'organizer.promo_save', jsonb_build_object('promo', pid), 0);
  return pid;
end $$;

-- Contrôle d'un code (aperçu du prix) : utilisable par le paiement quand il sera branché.
create function public.promo_preview(p_slug text, p_code text, p_subtotal_cents int, p_tier uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.promo_codes; d int;
begin
  select pc.* into p from public.promo_codes pc join public.ticketed_events e on e.id = pc.ticketed_event_id where e.event_slug = p_slug and pc.code = upper(btrim(coalesce(p_code, '')));
  if not found or not p.active or (p.starts_at is not null and now() < p.starts_at) or (p.ends_at is not null and now() > p.ends_at)
     or (p.max_uses is not null and p.used_count >= p.max_uses) or (p.tier_ids is not null and (p_tier is null or not p_tier = any (p.tier_ids))) then
    return jsonb_build_object('valid', false);
  end if;
  d := case when p.kind = 'percent' then floor(p_subtotal_cents * p.value / 100.0)::int else least(p.value, p_subtotal_cents) end;
  return jsonb_build_object('valid', true, 'discount_cents', d, 'total_cents', p_subtotal_cents - d);
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('org_orders', 'org_order_detail', 'org_refunds', 'org_scan_history', 'org_invitations', 'org_create_invitation', 'org_promos', 'org_promo_save', 'promo_preview')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
