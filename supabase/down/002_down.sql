-- =====================================================================
-- 002_down.sql — retour arrière de la migration 20260920000200_ticketing_core
--
-- ⚠ DESTRUCTIF : supprime les événements de billetterie, tarifs, COMMANDES, BILLETS,
--   remboursements et le journal d'audit. À utiliser uniquement sur une base de test
--   ou pour annuler une migration qui vient d'être appliquée.
--
-- Si des migrations 003, 004, 005 ont été appliquées, exécute d'abord leurs fichiers
-- down (005 → 004 → 003), dans cet ordre.
--
-- Sécurité : le script refuse de s'exécuter tant que tu n'as pas DÉCOMMENTÉ la ligne
-- ci-dessous, ET il s'arrête s'il existe des commandes payées (sauf si tu ajoutes
-- aussi la ligne « force »).
-- =====================================================================
-- select set_config('app.confirm_drop', 'yes', false);
-- select set_config('app.force_drop_paid', 'yes', false);   -- seulement pour détruire des commandes payées

do $$
begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false) en tête du fichier.';
  end if;
  if to_regclass('public.orders') is not null
     and coalesce(current_setting('app.force_drop_paid', true), '') <> 'yes'
     and exists (select 1 from public.orders where status in ('paid', 'partially_refunded', 'refunded')) then
    raise exception 'Des commandes payées existent : retour arrière refusé (décommente app.force_drop_paid pour les détruire).';
  end if;
end $$;

-- fonctions (toutes signatures) — nom par nom
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('get_availability', 'reserve_tickets', 'expire_stale_orders', 'tier_consumed',
                        'event_consumed', 'admin_save_event', 'admin_save_tier', 'admin_remove_tier',
                        'admin_set_setting', '_audit', '_assert_admin', '_guard_tier_quantity',
                        '_guard_event_capacity')
  loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

drop table if exists public.audit_log, public.refunds, public.stripe_events, public.tickets,
                     public.order_items, public.orders, public.ticket_tiers, public.ticketed_events cascade;
drop sequence if exists public.order_number_seq;
-- (profiles, app_settings, is_admin(), is_staff() appartiennent à la migration 001 : conservés)
