-- 015_down.sql — retour arrière de 20260920001500_event_pages (supprime les détails, lieux, sessions, vidéos et consentements saisis).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.public_event_details(text), public.media_set_status(uuid, text, text, text, text, text), public.org_media_register(uuid, text, text, jsonb),
  public.org_session_delete(uuid, text, uuid), public.org_session_save(uuid, text, uuid, uuid, text, timestamptz, timestamptz, int, boolean),
  public.org_venue_save(uuid, uuid, uuid, jsonb), public.org_event_details_save(uuid, text, jsonb), public.org_event_details(uuid, text);
drop table if exists public.order_consents, public.event_media, public.event_sessions, public.event_venues, public.event_details;
