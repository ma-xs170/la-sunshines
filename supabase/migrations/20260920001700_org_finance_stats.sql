-- =====================================================================
-- Migration 017 — tableau de bord, statistiques de ventes, finance, notifications (Phase 4)
--
--  * event_payouts : versements MANUELS enregistrés par un admin (aucun virement automatique, aucune donnée bancaire stockée).
--  * org_finance : recette brute, frais de service, remboursements, recette nette, déjà versé, reste à verser (lecture owner / admin).
--  * org_dashboard : ventes aujourd'hui / hier / ce mois (fuseau America/Guadeloupe) avec variation, évènements actifs.
--  * org_sales_matrix : ventes par tarif et par jour, et par jour de semaine × heure.
--  * notification_prefs : préférences par membre et par organisation (l'envoi des e-mails n'est pas encore branché).
-- Additive. Aucun IBAN, aucune donnée bancaire dans cette base.
-- =====================================================================

create table public.event_payouts (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  amount_cents      int  not null check (amount_cents > 0),
  paid_on           date not null,
  note              text not null default '' check (char_length(note) <= 200),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index event_payouts_event_idx on public.event_payouts (ticketed_event_id, paid_on);

create table public.notification_prefs (
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('daily_sales', 'support_message', 'low_stock', 'refund', 'send_error')),
  email        boolean not null default true,
  primary key (organizer_id, user_id, kind)
);
alter table public.event_payouts enable row level security;
alter table public.notification_prefs enable row level security;
revoke all on public.event_payouts, public.notification_prefs from anon, authenticated;

-- Versement enregistré par un admin (après un virement fait à la main)
create function public.admin_record_payout(p_actor uuid, p_slug text, p_amount_cents int, p_paid_on date, p_note text default '') returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; pid uuid;
begin
  perform public._assert_admin(p_actor);
  select * into ev from public.ticketed_events where event_slug = p_slug;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  insert into public.event_payouts (ticketed_event_id, amount_cents, paid_on, note, created_by) values (ev.id, p_amount_cents, p_paid_on, left(coalesce(p_note, ''), 200), p_actor) returning id into pid;
  perform public._audit(p_actor, 'payout.record', 'ticketed_event', ev.id::text, null, jsonb_build_object('amount_cents', p_amount_cents, 'paid_on', p_paid_on));
  return pid;
end $$;

-- Finance d'un évènement. Recette nette organisateur = sous-total encaissé − remboursements (jamais négatif) ; les frais de service sont la part de la plateforme.
create function public.org_finance(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; gross bigint; fees bigint; refunded bigint; net bigint; paid bigint;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select coalesce(sum(total_cents), 0), coalesce(sum(fee_cents) filter (where status <> 'refunded'), 0), coalesce(sum(refunded_cents), 0), coalesce(sum(greatest(subtotal_cents - refunded_cents, 0)), 0)
    into gross, fees, refunded, net
    from public.orders where ticketed_event_id = ev.id and source = 'web' and status in ('paid', 'partially_refunded', 'refunded');
  select coalesce(sum(amount_cents), 0) into paid from public.event_payouts where ticketed_event_id = ev.id;
  perform public._org_audit(p_actor, ev.id, 'organizer.finance_view', '{}'::jsonb, 30);
  return jsonb_build_object('gross_cents', gross, 'fees_cents', fees, 'refunded_cents', refunded, 'net_cents', net, 'paid_out_cents', paid, 'remaining_cents', greatest(net - paid, 0),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'paid_on', p.paid_on, 'note', p.note) order by p.paid_on desc) from public.event_payouts p where p.ticketed_event_id = ev.id), '[]'::jsonb));
end $$;

-- Tableau de bord global de l'organisation
create function public.org_dashboard(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tz constant text := 'America/Guadeloupe'; d0 timestamptz := date_trunc('day', now() at time zone tz) at time zone tz; m0 timestamptz := date_trunc('month', now() at time zone tz) at time zone tz;
  today int; yest int; month int; pmonth int;
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  select coalesce(sum(o.subtotal_cents - least(o.refunded_cents, o.subtotal_cents)) filter (where o.paid_at >= d0), 0),
         coalesce(sum(o.subtotal_cents - least(o.refunded_cents, o.subtotal_cents)) filter (where o.paid_at >= d0 - interval '1 day' and o.paid_at < d0), 0),
         coalesce(sum(o.subtotal_cents - least(o.refunded_cents, o.subtotal_cents)) filter (where o.paid_at >= m0), 0),
         coalesce(sum(o.subtotal_cents - least(o.refunded_cents, o.subtotal_cents)) filter (where o.paid_at >= m0 - interval '1 month' and o.paid_at < m0), 0)
    into today, yest, month, pmonth
    from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id
   where e.organizer_id = p_org and o.source = 'web' and o.status in ('paid', 'partially_refunded', 'refunded');
  return jsonb_build_object('today_cents', today, 'yesterday_cents', yest, 'month_cents', month, 'prev_month_cents', pmonth,
    'active_events', (select count(*) from public.ticketed_events e where e.organizer_id = p_org and e.status = 'published' and e.starts_at > now() and e.organizer_archived_at is null));
end $$;

-- Ventes : matrice tarif × jour (30 derniers jours d'activité) et chaleur jour de semaine × heure (heure de Guadeloupe)
create function public.org_sales_matrix(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return jsonb_build_object(
    'matrix', coalesce((select jsonb_agg(x) from (
        select (o.paid_at at time zone 'America/Guadeloupe')::date as day, tr.name as tier, count(*)::int as sold
          from public.tickets t join public.orders o on o.id = t.order_id join public.ticket_tiers tr on tr.id = t.tier_id
         where t.ticketed_event_id = ev.id and t.status in ('valid', 'used') and o.source = 'web' and o.paid_at is not null and o.paid_at > now() - interval '60 days'
         group by 1, 2 order by 1 desc, 2 limit 600) x), '[]'::jsonb),
    'heat', coalesce((select jsonb_agg(x) from (
        select extract(isodow from o.paid_at at time zone 'America/Guadeloupe')::int as dow, extract(hour from o.paid_at at time zone 'America/Guadeloupe')::int as hour, count(*)::int as sold
          from public.tickets t join public.orders o on o.id = t.order_id
         where t.ticketed_event_id = ev.id and t.status in ('valid', 'used') and o.source = 'web' and o.paid_at is not null group by 1, 2) x), '[]'::jsonb));
end $$;

-- Notifications : chacun ne lit et n'écrit QUE ses propres préférences (membre de l'organisation, rôle owner / manager)
create function public.org_notif_get(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  return coalesce((select jsonb_object_agg(k.kind, coalesce((select email from public.notification_prefs n where n.organizer_id = p_org and n.user_id = p_actor and n.kind = k.kind), true))
                     from (values ('daily_sales'), ('support_message'), ('low_stock'), ('refund'), ('send_error')) k(kind)), '{}'::jsonb);
end $$;

create function public.org_notif_set(p_actor uuid, p_org uuid, p_kind text, p_email boolean) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  if not exists (select 1 from public.organizer_members where organizer_id = p_org and user_id = p_actor) then raise exception 'FORBIDDEN'; end if;   -- un admin de passage n'a pas de préférences d'équipe
  insert into public.notification_prefs (organizer_id, user_id, kind, email) values (p_org, p_actor, p_kind, coalesce(p_email, true))
  on conflict (organizer_id, user_id, kind) do update set email = excluded.email;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('admin_record_payout', 'org_finance', 'org_dashboard', 'org_sales_matrix', 'org_notif_get', 'org_notif_set')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
