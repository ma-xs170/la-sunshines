-- 017_down.sql — retour arrière de 20260920001700_org_finance_stats (supprime les versements enregistrés et les préférences de notification).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.org_notif_set(uuid, uuid, text, boolean), public.org_notif_get(uuid, uuid), public.org_sales_matrix(uuid, text), public.org_dashboard(uuid, uuid),
  public.org_finance(uuid, text), public.admin_record_payout(uuid, text, int, date, text);
drop table if exists public.notification_prefs, public.event_payouts;
