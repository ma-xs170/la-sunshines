-- 020_down.sql — retour arrière de 20260920002000_organizer_pages_calendar (supprime les pages d'organisateurs et les abonnements « Suivre »).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop trigger if exists organizers_page_after on public.organizers;
drop function if exists public.calendar_events(uuid, text, timestamptz, timestamptz, text), public.unsubscribe_by_token(uuid), public.follow_state(uuid, text), public.unfollow_organizer(uuid, text),
  public.follow_organizer(uuid, text, boolean), public.public_event_organizer(text), public.public_organizer_page(text), public._event_is_public(uuid), public.org_page_save(uuid, uuid, jsonb),
  public.org_page_get(uuid, uuid), public._organizer_page_trigger(), public._ensure_organizer_page(uuid), public._slugify(text);
drop table if exists public.organizer_follows, public.organizer_pages;
