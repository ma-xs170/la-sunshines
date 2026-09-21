-- 021_down.sql — retour arrière de 20260920002100_free_tickets.
-- ATTENTION : échoue s'il existe des tarifs à 0 € (à archiver / corriger avant). Les anciennes fonctions
-- (reserve_tickets, admin_save_tier, org_save_tier, org_tiers, org_finance) sont à restaurer depuis les migrations 002, 011 et 017.
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.reserve_free_order(text, uuid, text, jsonb, jsonb, text, boolean, jsonb);
drop function if exists public.admin_save_tier(uuid, text, uuid, text, text, int, int, int, timestamptz, timestamptz, boolean, int, int);
drop function if exists public.org_save_tier(uuid, text, uuid, text, text, int, int, int, timestamptz, timestamptz, boolean, int, int);
alter table public.ticket_tiers drop constraint if exists ticket_tiers_price_check;
alter table public.ticket_tiers drop column if exists max_per_account;
alter table public.ticket_tiers add constraint ticket_tiers_price_cents_check check (price_cents >= 50 and price_cents <= 1000000);
