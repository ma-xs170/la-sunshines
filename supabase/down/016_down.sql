-- 016_down.sql — retour arrière de 20260920001600_org_sales (supprime les codes promo saisis).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.promo_preview(text, text, int, uuid), public.org_promo_save(uuid, text, uuid, jsonb), public.org_promos(uuid, text),
  public.org_create_invitation(uuid, text, uuid, text, text, text, text, jsonb), public.org_invitations(uuid, text), public.org_scan_history(uuid, text, int),
  public.org_refunds(uuid, text, text), public.org_order_detail(uuid, text, uuid), public.org_orders(uuid, text, text, text, int, int);
drop table if exists public.promo_codes;
