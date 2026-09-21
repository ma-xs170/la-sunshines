-- 026_down.sql — retour arrière de 20260920002600_publication (supprime les demandes de publication ; les évènements déjà publiés restent publiés).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.public_db_event(text), public.admin_review_publication(uuid, uuid, boolean, text), public.admin_publications(uuid, text), public.org_cancel_publication(uuid, text),
  public.org_request_publication(uuid, text), public.org_publication_state(uuid, text), public._publication_checklist(uuid), public.org_set_flyer(uuid, text, text);
drop table if exists public.publication_requests;
alter table public.event_details drop constraint if exists event_details_flyer_url_check;
alter table public.event_details drop column if exists flyer_url;
