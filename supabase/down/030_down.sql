-- Retour arrière de la migration 030 (à n'utiliser que si tout est vide / sauvegardé).
drop function if exists public.org_event_views(uuid, text);
drop function if exists public.track_event_view(text, text, text);
drop table if exists public.event_views;
drop function if exists public.org_stats_extra(uuid, text);
drop function if exists public.org_print_ticket_ids(uuid, text, uuid, int);
drop function if exists public.org_staff(uuid, text);
drop function if exists public.org_member_remove(uuid, uuid, uuid);
drop function if exists public.org_member_set_role(uuid, uuid, uuid, text);
drop function if exists public.org_member_add(uuid, uuid, text, text);
drop function if exists public.org_members(uuid, uuid);
drop function if exists public.org_lineup_save(uuid, text, jsonb);
drop function if exists public.org_lineup(uuid, text);
drop table if exists public.event_lineup;
drop function if exists public.record_absorbed_fee(uuid, int);
drop function if exists public.org_set_fee_settings(uuid, text, text, int);
drop function if exists public.org_fee_settings(uuid, text);
drop function if exists public.event_fee_config(text);
-- org_finance / org_payments_summary : reprendre les définitions des migrations 021 et 013 avant de supprimer la colonne.
-- alter table public.orders drop column fee_absorbed_cents;   (après retour des deux fonctions)
