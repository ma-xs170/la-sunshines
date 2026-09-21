-- 025_down.sql — retour arrière de 20260920002500_promo_checkout (les remises déjà appliquées restent dans order_items ; seules la fonction et les colonnes disparaissent).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.apply_promo(uuid, uuid, text, numeric, int);
drop index if exists public.orders_promo_idx;
alter table public.orders drop column if exists promo_code_id, drop column if exists discount_cents;
