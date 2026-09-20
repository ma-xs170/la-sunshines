-- =====================================================================
-- Migration 013 — espace organisateur : Analyse et Paiements.
--
--  * org_analytics : ventes de l'organisation dans le temps (série par jour), par événement et par tarif ; owner / manager / admin.
--  * org_payments_summary : encaissements de l'organisation (brut, remboursements, net, frais de service) par événement ; owner / admin.
--  * org_stripe_account / org_stripe_set : compte Stripe connecté de l'organisation (identifiant + état « prêt »), owner / admin ; journalisé.
--  Rien ici ne modifie le flux d'encaissement des commandes.
-- =====================================================================

-- Rôle requis sur une organisation : 'manage' (owner / manager / admin) ou 'owner' (owner / admin). FORBIDDEN sinon.
create function public._org_assert(p_actor uuid, p_org uuid, p_need text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r text;
begin
  r := public._org_role(p_actor, p_org);
  if r is null or (p_need = 'manage' and r not in ('admin', 'owner', 'manager')) or (p_need = 'owner' and r not in ('admin', 'owner')) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (select 1 from public.organizers where id = p_org) then raise exception 'FORBIDDEN'; end if;
end $$;

-- p_days : nombre de jours (1..730) ou nul = depuis toujours. La période porte sur la date de paiement des commandes.
create function public.org_analytics(p_actor uuid, p_org uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare cutoff timestamptz; res jsonb;
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  if p_days is not null and (p_days < 1 or p_days > 730) then raise exception 'BAD_FILTER'; end if;
  cutoff := case when p_days is null then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;

  select jsonb_build_object(
    'days', p_days,
    'totals', jsonb_build_object(
      'sold', coalesce((select count(*) from public.tickets t join public.orders o on o.id = t.order_id join public.ticketed_events e on e.id = t.ticketed_event_id
                        where e.organizer_id = p_org and t.status in ('valid', 'used') and o.paid_at >= cutoff), 0),
      'revenue_cents', coalesce((select sum(o.total_cents - o.refunded_cents) from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id
                        where e.organizer_id = p_org and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded') and o.paid_at >= cutoff), 0),
      'refunded_cents', coalesce((select sum(o.refunded_cents) from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id
                        where e.organizer_id = p_org and o.paid_at >= cutoff), 0),
      'entered', (select count(*) from public.tickets t join public.ticketed_events e on e.id = t.ticketed_event_id
                        where e.organizer_id = p_org and t.status = 'used')),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', e.event_slug, 'starts_at', e.starts_at, 'capacity', e.capacity, 'status', e.status,
        'sold_total', (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status in ('valid', 'used')),
        'sold', (select count(*) from public.tickets t join public.orders o on o.id = t.order_id where t.ticketed_event_id = e.id and t.status in ('valid', 'used') and o.paid_at >= cutoff),
        'entered', (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status = 'used'),
        'revenue_cents', coalesce((select sum(o.total_cents - o.refunded_cents) from public.orders o where o.ticketed_event_id = e.id and o.source = 'web'
                        and o.status in ('paid', 'partially_refunded', 'refunded') and o.paid_at >= cutoff), 0)
      ) order by e.starts_at desc)
      from public.ticketed_events e where e.organizer_id = p_org and e.organizer_archived_at is null), '[]'::jsonb),
    'tiers', coalesce((
      select jsonb_agg(x order by x.sold desc, x.name) from (
        select oi.tier_name as name, count(*)::int as sold, coalesce(sum(oi.unit_price_cents), 0)::int as revenue_cents
        from public.tickets t join public.orders o on o.id = t.order_id join public.order_items oi on oi.id = t.order_item_id
        join public.ticketed_events e on e.id = t.ticketed_event_id
        where e.organizer_id = p_org and t.status in ('valid', 'used') and o.paid_at >= cutoff
        group by oi.tier_name) x), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('day', s.d, 'sold', s.n, 'revenue_cents', s.r) order by s.d)
      from (
        select (o.paid_at at time zone 'America/Guadeloupe')::date as d, count(*)::int as n, coalesce(sum(oi.unit_price_cents), 0)::int as r
        from public.tickets t join public.orders o on o.id = t.order_id join public.order_items oi on oi.id = t.order_item_id
        join public.ticketed_events e on e.id = t.ticketed_event_id
        where e.organizer_id = p_org and t.status in ('valid', 'used') and o.paid_at is not null and o.paid_at >= cutoff
        group by 1) s), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Encaissements : uniquement les ventes en ligne payées (les invitations ne rapportent rien). Montants en centimes.
create function public.org_payments_summary(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  return jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', e.event_slug, 'starts_at', e.starts_at,
        'orders', (select count(*) from public.orders o where o.ticketed_event_id = e.id and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded')),
        'gross_cents', coalesce((select sum(o.total_cents) from public.orders o where o.ticketed_event_id = e.id and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded')), 0),
        'refunded_cents', coalesce((select sum(o.refunded_cents) from public.orders o where o.ticketed_event_id = e.id and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded')), 0),
        'fees_cents', coalesce((select sum(o.fee_cents) from public.orders o where o.ticketed_event_id = e.id and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded')), 0)
      ) order by e.starts_at desc)
      from public.ticketed_events e where e.organizer_id = p_org), '[]'::jsonb));
end $$;

-- Identifiant du compte Stripe connecté (jamais renvoyé par org_list). owner / admin.
create function public.org_stripe_account(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o public.organizers;
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  select * into o from public.organizers where id = p_org;
  return jsonb_build_object('account_id', o.stripe_account_id, 'ready', o.stripe_ready, 'email', o.contact_email, 'name', o.name);
end $$;

-- Enregistre le compte connecté (une seule fois : un compte déjà lié ne peut pas être remplacé) et son état « prêt ».
create function public.org_stripe_set(p_actor uuid, p_org uuid, p_account text, p_ready boolean) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare o public.organizers;
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  select * into o from public.organizers where id = p_org for update;
  if o.stripe_account_id <> '' and o.stripe_account_id <> p_account then raise exception 'STRIPE_ACCOUNT_LOCKED'; end if;
  update public.organizers set stripe_account_id = p_account, stripe_ready = coalesce(p_ready, false) where id = p_org;
  if o.stripe_account_id is distinct from p_account or o.stripe_ready is distinct from coalesce(p_ready, false) then
    insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
    values (p_actor, 'organizer.stripe_update', 'organizer', p_org::text,
            jsonb_build_object('connected', o.stripe_account_id <> '', 'ready', o.stripe_ready),
            jsonb_build_object('connected', true, 'ready', coalesce(p_ready, false)));
  end if;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('_org_assert', 'org_analytics', 'org_payments_summary', 'org_stripe_account', 'org_stripe_set')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
