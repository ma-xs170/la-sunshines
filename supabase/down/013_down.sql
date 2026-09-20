-- 013_down.sql — retour arrière de 20260920001300_organizer_analytics_payments.
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.org_stripe_set(uuid, uuid, text, boolean), public.org_stripe_account(uuid, uuid), public.org_payments_summary(uuid, uuid),
  public.org_analytics(uuid, uuid, int), public._org_assert(uuid, uuid, text);
