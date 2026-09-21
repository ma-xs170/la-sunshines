-- 024_down.sql — retour arrière de 20260920002400_event_creation (supprime les fonctions et les colonnes ajoutées ; les évènements créés restent mais perdent leur titre et leur mode de billetterie).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.org_set_ticketing(uuid, text, text, text), public.org_create_event(uuid, uuid, jsonb);
alter table public.ticketed_events drop constraint if exists ticketed_events_bizouk_needs_id, drop constraint if exists ticketed_events_bizouk_event_id_check, drop constraint if exists ticketed_events_ticketing_mode_check;
alter table public.ticketed_events drop column if exists bizouk_event_id, drop column if exists ticketing_mode;
alter table public.event_details drop column if exists title;
