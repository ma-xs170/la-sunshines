-- 003_down.sql — retour arrière de 20260920000300_stripe_fulfillment
-- ⚠ Supprime les fonctions de paiement (fulfill_order…) et les colonnes refunds.idempotency_key / source.
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('claim_stripe_event','finish_stripe_event','fulfill_order','expire_order_by_session',
                      'cancel_pending_order','_recalc_order_refund','begin_refund','finish_refund','apply_order_refund')
  loop execute format('drop function if exists %s cascade', f.sig); end loop;
end $$;
alter table public.refunds drop column if exists idempotency_key, drop column if exists source;
