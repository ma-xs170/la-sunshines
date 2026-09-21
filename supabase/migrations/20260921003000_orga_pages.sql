-- =====================================================================
-- Migration 030 — pages organisateur réelles (plus aucune entrée « Bientôt »)
--
--  * Frais et paiement : ticketed_events.fee_mode (customer | included), min_order_cents, surcharges de frais par évènement
--    ET par organisateur (posées par un admin), orders.fee_absorbed_cents (frais « inclus dans le prix » : le client paie le prix
--    affiché, la plateforme garde ses frais sur la part de l'organisateur). org_finance / org_payments_summary en tiennent compte.
--  * Lineup : table event_lineup + org_lineup / org_lineup_save.
--  * Membres de l'organisation : org_members / org_member_add / org_member_set_role / org_member_remove (propriétaire, dernier propriétaire protégé).
--  * Staff et présences : org_staff (membres + scanners, nombre de scans, premier / dernier scan).
--  * Impression de lots de billets : org_print_ticket_ids.
--  * Statistiques : org_stats_extra (commandes, canaux, acheteurs, performance), event_views (compteurs AGRÉGÉS anonymes : jour,
--    canal, pays — aucune adresse IP, aucun identifiant) + track_event_view / org_event_views.
-- Additive : aucune donnée existante modifiée ni supprimée.
-- =====================================================================

alter table public.ticketed_events
  add column if not exists fee_mode text not null default 'customer' check (fee_mode in ('customer', 'included')),
  add column if not exists min_order_cents int not null default 0 check (min_order_cents between 0 and 100000),
  add column if not exists fee_percent_override numeric check (fee_percent_override is null or fee_percent_override between 0 and 100),
  add column if not exists fee_fixed_override int check (fee_fixed_override is null or fee_fixed_override between 0 and 5000);
alter table public.organizers
  add column if not exists fee_percent_override numeric check (fee_percent_override is null or fee_percent_override between 0 and 100),
  add column if not exists fee_fixed_override int check (fee_fixed_override is null or fee_fixed_override between 0 and 5000);
alter table public.orders
  add column if not exists fee_absorbed_cents int not null default 0 check (fee_absorbed_cents >= 0);

-- Frais effectifs d'un évènement (service_role) : surcharge de l'évènement > surcharge de l'organisateur > null (= réglage global côté application).
create function public.event_fee_config(p_slug text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('mode', e.fee_mode, 'min_order_cents', e.min_order_cents,
    'percent', coalesce(e.fee_percent_override, o.fee_percent_override), 'fixed', coalesce(e.fee_fixed_override, o.fee_fixed_override))
  from public.ticketed_events e left join public.organizers o on o.id = e.organizer_id where e.event_slug = p_slug
$$;

create function public.org_fee_settings(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; org public.organizers;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select * into org from public.organizers where id = ev.organizer_id;
  return jsonb_build_object('mode', ev.fee_mode, 'min_order_cents', ev.min_order_cents,
    'event_percent', ev.fee_percent_override, 'event_fixed', ev.fee_fixed_override, 'org_percent', org.fee_percent_override, 'org_fixed', org.fee_fixed_override,
    'stripe_ready', coalesce(org.stripe_ready, false));
end $$;

create function public.org_set_fee_settings(p_actor uuid, p_slug text, p_mode text, p_min_order_cents int) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_mode not in ('customer', 'included') then raise exception 'BAD_FEE_MODE'; end if;
  if p_min_order_cents is null or p_min_order_cents < 0 or p_min_order_cents > 100000 then raise exception 'BAD_MIN'; end if;
  if p_min_order_cents > 0 and p_min_order_cents < 50 then raise exception 'BAD_MIN'; end if;   -- Stripe refuse moins de 0,50 €
  update public.ticketed_events set fee_mode = p_mode, min_order_cents = p_min_order_cents where id = ev.id;
  perform public._audit(p_actor, 'event.fee_settings', 'ticketed_event', ev.id::text,
    jsonb_build_object('mode', ev.fee_mode, 'min_order_cents', ev.min_order_cents), jsonb_build_object('mode', p_mode, 'min_order_cents', p_min_order_cents));
end $$;

create function public.record_absorbed_fee(p_order uuid, p_cents int) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.orders set fee_absorbed_cents = greatest(p_cents, 0) where id = p_order and status = 'pending'
$$;

-- Finance : les frais « inclus dans le prix » (fee_absorbed_cents) sont pris sur la part de l'organisateur.
create or replace function public.org_finance(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; gross bigint; fees bigint; refunded bigint; net bigint; paid bigint;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select coalesce(sum(total_cents), 0), coalesce(sum(fee_cents + fee_absorbed_cents) filter (where status <> 'refunded'), 0), coalesce(sum(refunded_cents), 0),
         coalesce(sum(greatest(subtotal_cents - fee_absorbed_cents - refunded_cents, 0)), 0)
    into gross, fees, refunded, net
    from public.orders where ticketed_event_id = ev.id and source = 'web' and total_cents > 0 and status in ('paid', 'partially_refunded', 'refunded');
  select coalesce(sum(amount_cents), 0) into paid from public.event_payouts where ticketed_event_id = ev.id;
  perform public._org_audit(p_actor, ev.id, 'organizer.finance_view', '{}'::jsonb, 30);
  return jsonb_build_object('gross_cents', gross, 'fees_cents', fees, 'refunded_cents', refunded, 'net_cents', net, 'paid_out_cents', paid, 'remaining_cents', greatest(net - paid, 0),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'paid_on', p.paid_on, 'note', p.note) order by p.paid_on desc) from public.event_payouts p where p.ticketed_event_id = ev.id), '[]'::jsonb));
end $$;

create or replace function public.org_payments_summary(p_actor uuid, p_org uuid) returns jsonb
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
        'fees_cents', coalesce((select sum(o.fee_cents + o.fee_absorbed_cents) from public.orders o where o.ticketed_event_id = e.id and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded')), 0)
      ) order by e.starts_at desc)
      from public.ticketed_events e where e.organizer_id = p_org), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Lineup
-- ---------------------------------------------------------------------
create table public.event_lineup (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete cascade,
  position          int  not null default 0,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  role              text not null default 'dj' check (role in ('dj', 'artiste', 'invité', 'animateur', 'autre')),
  starts_at         timestamptz,
  ends_at           timestamptz,
  created_at        timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index event_lineup_event_idx on public.event_lineup (ticketed_event_id, position);
alter table public.event_lineup enable row level security;
revoke all on public.event_lineup from anon, authenticated;

create function public.org_lineup(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return coalesce((select jsonb_agg(jsonb_build_object('name', l.name, 'role', l.role, 'starts_at', l.starts_at, 'ends_at', l.ends_at) order by l.position, l.created_at)
                   from public.event_lineup l where l.ticketed_event_id = ev.id), '[]'::jsonb);
end $$;

-- Remplace tout le lineup (l'ordre du tableau = l'ordre d'affichage), en une transaction.
create function public.org_lineup_save(p_actor uuid, p_slug text, p_items jsonb) returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; it jsonb; i int := 0; n text;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then raise exception 'BAD_LINEUP'; end if;
  delete from public.event_lineup where ticketed_event_id = ev.id;
  for it in select * from jsonb_array_elements(p_items) loop
    n := btrim(coalesce(it ->> 'name', ''));
    if char_length(n) < 1 or char_length(n) > 80 or coalesce(nullif(it ->> 'role', ''), 'dj') not in ('dj', 'artiste', 'invité', 'animateur', 'autre') then raise exception 'BAD_LINEUP'; end if;
    insert into public.event_lineup (ticketed_event_id, position, name, role, starts_at, ends_at)
    values (ev.id, i, n, coalesce(nullif(it ->> 'role', ''), 'dj'), nullif(it ->> 'starts_at', '')::timestamptz, nullif(it ->> 'ends_at', '')::timestamptz);
    i := i + 1;
  end loop;
  perform public._audit(p_actor, 'event.lineup_save', 'ticketed_event', ev.id::text, null, jsonb_build_object('count', i));
  return i;
end $$;

-- ---------------------------------------------------------------------
-- Membres de l'organisation (propriétaire ou admin)
-- ---------------------------------------------------------------------
create function public.org_members(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'since', m.created_at,
      'first_name', coalesce(p.first_name, ''), 'last_name', coalesce(p.last_name, ''), 'email', u.email)
      order by (m.role = 'owner') desc, (m.role = 'manager') desc, m.created_at)
    from public.organizer_members m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
    where m.organizer_id = p_org), '[]'::jsonb);
end $$;

create function public.org_member_add(p_actor uuid, p_org uuid, p_email text, p_role text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  if p_role not in ('owner', 'manager', 'staff') then raise exception 'BAD_ROLE'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if uid is null then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from public.organizer_members where organizer_id = p_org and user_id = uid) then raise exception 'ALREADY_MEMBER'; end if;
  insert into public.organizer_members (organizer_id, user_id, role) values (p_org, uid, p_role);
  perform public._audit(p_actor, 'org.member_add', 'organizer', p_org::text, null, jsonb_build_object('user_id', uid, 'role', p_role));
end $$;

create function public.org_member_set_role(p_actor uuid, p_org uuid, p_user uuid, p_role text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old text;
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  if p_role not in ('owner', 'manager', 'staff') then raise exception 'BAD_ROLE'; end if;
  select role into old from public.organizer_members where organizer_id = p_org and user_id = p_user for update;
  if old is null then raise exception 'USER_NOT_FOUND'; end if;
  if old = 'owner' and p_role <> 'owner' and (select count(*) from public.organizer_members where organizer_id = p_org and role = 'owner') <= 1 then raise exception 'LAST_OWNER'; end if;
  update public.organizer_members set role = p_role where organizer_id = p_org and user_id = p_user;
  perform public._audit(p_actor, 'org.member_role', 'organizer', p_org::text, jsonb_build_object('user_id', p_user, 'role', old), jsonb_build_object('user_id', p_user, 'role', p_role));
end $$;

create function public.org_member_remove(p_actor uuid, p_org uuid, p_user uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old text;
begin
  perform public._org_assert(p_actor, p_org, 'owner');
  select role into old from public.organizer_members where organizer_id = p_org and user_id = p_user for update;
  if old is null then raise exception 'USER_NOT_FOUND'; end if;
  if old = 'owner' and (select count(*) from public.organizer_members where organizer_id = p_org and role = 'owner') <= 1 then raise exception 'LAST_OWNER'; end if;
  delete from public.organizer_members where organizer_id = p_org and user_id = p_user;
  perform public._audit(p_actor, 'org.member_remove', 'organizer', p_org::text, jsonb_build_object('user_id', p_user, 'role', old), null);
end $$;

-- ---------------------------------------------------------------------
-- Staff et présences d'un évènement : membres de l'organisation + toute personne qui a scanné ici.
-- ---------------------------------------------------------------------
create function public.org_staff(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return coalesce((
    select jsonb_agg(row order by (row ->> 'scans')::int desc, row ->> 'name') from (
      select jsonb_build_object('user_id', x.uid, 'role', x.role, 'name', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), 'email', u.email,
             'scans', coalesce(s.n, 0), 'first_scan_at', s.first_at, 'last_scan_at', s.last_at) as row
      from (select m.user_id as uid, m.role from public.organizer_members m where m.organizer_id = ev.organizer_id
            union
            select t.used_by, null from public.tickets t where t.ticketed_event_id = ev.id and t.used_by is not null
              and not exists (select 1 from public.organizer_members m2 where m2.organizer_id = ev.organizer_id and m2.user_id = t.used_by)) x
      join auth.users u on u.id = x.uid left join public.profiles p on p.id = x.uid
      left join (select used_by, count(*) as n, min(used_at) as first_at, max(used_at) as last_at from public.tickets where ticketed_event_id = ev.id and used_by is not null group by used_by) s on s.used_by = x.uid
    ) q(row)), '[]'::jsonb);
end $$;

-- Billets valides à imprimer (identifiants seulement ; le PDF est produit côté serveur). Au plus p_limit (300).
create function public.org_print_ticket_ids(p_actor uuid, p_slug text, p_tier uuid default null, p_limit int default 300) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; total int; ids jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select count(*) into total from public.tickets t where t.ticketed_event_id = ev.id and t.status = 'valid' and (p_tier is null or t.tier_id = p_tier);
  select coalesce(jsonb_agg(q.id), '[]'::jsonb) into ids from (
    select t.id from public.tickets t where t.ticketed_event_id = ev.id and t.status = 'valid' and (p_tier is null or t.tier_id = p_tier)
    order by t.holder_last_name, t.holder_first_name, t.created_at limit least(greatest(p_limit, 1), 300)) q;
  return jsonb_build_object('total', total, 'ids', ids);
end $$;

-- ---------------------------------------------------------------------
-- Statistiques : commandes, canaux, acheteurs, performance
-- ---------------------------------------------------------------------
create function public.org_stats_extra(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; res jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select jsonb_build_object(
    'orders', (select jsonb_build_object('total', count(*), 'paid', count(*) filter (where status in ('paid', 'partially_refunded', 'refunded')),
                 'pending', count(*) filter (where status = 'pending'), 'expired', count(*) filter (where status = 'expired'), 'cancelled', count(*) filter (where status = 'cancelled'))
               from public.orders where ticketed_event_id = ev.id and source = 'web'),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object('channel', c.channel, 'tickets', c.n, 'revenue_cents', c.rev)) from (
                   select x.channel, sum(x.n)::int as n, sum(x.sub)::bigint as rev from (
                     select case when o.source = 'manual' then 'invitation' when o.total_cents = 0 then 'gratuit' else 'en ligne' end as channel,
                            (select count(*) from public.tickets tk where tk.order_id = o.id and tk.status in ('valid', 'used')) as n, o.subtotal_cents as sub
                     from public.orders o where o.ticketed_event_id = ev.id and o.status in ('paid', 'partially_refunded', 'refunded')) x
                   group by x.channel) c), '[]'::jsonb),
    'tickets_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from public.tickets where ticketed_event_id = ev.id group by status) s), '{}'::jsonb),
    'buyers', (select jsonb_build_object('unique', count(distinct lower(buyer_email)),
                 'repeat', count(*) filter (where n > 1)) from (select lower(buyer_email) as buyer_email, count(*) as n from public.orders
                 where ticketed_event_id = ev.id and source = 'web' and status in ('paid', 'partially_refunded', 'refunded') group by 1) b),
    'first_sale_at', (select min(paid_at) from public.orders where ticketed_event_id = ev.id and source = 'web' and paid_at is not null),
    'last_sale_at', (select max(paid_at) from public.orders where ticketed_event_id = ev.id and source = 'web' and paid_at is not null),
    'avg_order_cents', coalesce((select round(avg(total_cents))::int from public.orders where ticketed_event_id = ev.id and source = 'web' and total_cents > 0 and status in ('paid', 'partially_refunded', 'refunded')), 0),
    'tickets_per_order', coalesce((select round(avg(q), 2) from (select count(*)::numeric as q from public.tickets where ticketed_event_id = ev.id and status in ('valid', 'used') group by order_id) z), 0)
  ) into res;
  return res;
end $$;

-- Compteurs d'audience AGRÉGÉS : (évènement, jour, canal, pays) → nombre de vues. Ni IP, ni identifiant, ni cookie.
create table public.event_views (
  event_slug text not null,
  day        date not null,
  source     text not null check (source in ('direct', 'instagram', 'tiktok', 'facebook', 'whatsapp', 'google', 'site', 'autre')),
  country    text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  views      int  not null default 0 check (views >= 0),
  primary key (event_slug, day, source, country)
);
alter table public.event_views enable row level security;
revoke all on public.event_views from anon, authenticated;

create function public.track_event_view(p_slug text, p_source text, p_country text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare src text := p_source; c text := upper(coalesce(p_country, ''));
begin
  if not exists (select 1 from public.ticketed_events where event_slug = p_slug) then return; end if;
  if src not in ('direct', 'instagram', 'tiktok', 'facebook', 'whatsapp', 'google', 'site', 'autre') then src := 'autre'; end if;
  if c !~ '^[A-Z]{2}$' then c := ''; end if;
  insert into public.event_views (event_slug, day, source, country, views) values (p_slug, (now() at time zone 'America/Guadeloupe')::date, src, c, 1)
  on conflict (event_slug, day, source, country) do update set views = public.event_views.views + 1;
end $$;

create function public.org_event_views(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return jsonb_build_object(
    'total', coalesce((select sum(views) from public.event_views where event_slug = ev.event_slug), 0),
    'since', (select min(day) from public.event_views where event_slug = ev.event_slug),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'views', d.v) order by d.day) from (select day, sum(views)::int as v from public.event_views where event_slug = ev.event_slug group by day order by day desc limit 30) d), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', s.source, 'views', s.v) order by s.v desc) from (select source, sum(views)::int as v from public.event_views where event_slug = ev.event_slug group by source) s), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', c.country, 'views', c.v) order by c.v desc) from (select country, sum(views)::int as v from public.event_views where event_slug = ev.event_slug and country <> '' group by country order by 2 desc limit 15) c), '[]'::jsonb));
end $$;

-- Droits : uniquement le service_role (le navigateur n'appelle jamais ces fonctions directement).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('event_fee_config', 'org_fee_settings', 'org_set_fee_settings', 'record_absorbed_fee', 'org_lineup', 'org_lineup_save', 'org_members', 'org_member_add',
                        'org_member_set_role', 'org_member_remove', 'org_staff', 'org_print_ticket_ids', 'org_stats_extra', 'track_event_view', 'org_event_views')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
