-- =====================================================================
-- Migration 024 — création d'évènement en 3 étapes (demande E)
--
--  * ticketed_events.ticketing_mode (internal / bizouk / none) et bizouk_event_id (identifiant numérique extrait du code d'intégration ; JAMAIS le code collé).
--    Les évènements existants restent en « internal » (comportement inchangé).
--  * event_details.title : titre d'un évènement créé en ligne (les éditions du site gardent leur titre dans le code / content.json).
--  * org_create_event : crée un BROUILLON pour une organisation APPROUVÉE dont l'acteur est gestionnaire (ou admin). Refus FORBIDDEN sinon, ORG_NOT_APPROVED si non approuvée.
--  * org_set_ticketing : change le mode de billetterie d'un évènement (menu Billetterie).
-- Additive. Aucun évènement créé n'est public : la publication reste une action séparée.
-- =====================================================================

alter table public.ticketed_events
  add column if not exists ticketing_mode  text not null default 'internal',
  add column if not exists bizouk_event_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ticketed_events_ticketing_mode_check') then
    alter table public.ticketed_events add constraint ticketed_events_ticketing_mode_check check (ticketing_mode in ('internal', 'bizouk', 'none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ticketed_events_bizouk_event_id_check') then
    alter table public.ticketed_events add constraint ticketed_events_bizouk_event_id_check check (bizouk_event_id is null or bizouk_event_id ~ '^[0-9]{1,9}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ticketed_events_bizouk_needs_id') then
    alter table public.ticketed_events add constraint ticketed_events_bizouk_needs_id check (ticketing_mode <> 'bizouk' or bizouk_event_id is not null);
  end if;
end $$;
alter table public.event_details add column if not exists title text not null default '' check (char_length(title) <= 120);

create function public.org_create_event(p_actor uuid, p_org uuid, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare o public.organizers; ev_id uuid := gen_random_uuid(); ven uuid; mode text := coalesce(p_data->>'ticketing_mode', ''); slug text := coalesce(p_data->>'slug', '');
  title text := btrim(coalesce(p_data->>'title', '')); region text := coalesce(p_data->>'region', ''); starts timestamptz; vname text := btrim(coalesce(p_data->>'venue_name', ''));
  bid text := nullif(p_data->>'bizouk_event_id', '');
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  select * into o from public.organizers where id = p_org;
  if o.account_status <> 'approved' then raise exception 'ORG_NOT_APPROVED'; end if;
  if char_length(title) < 3 or char_length(title) > 120 then raise exception 'TITLE_REQUIRED'; end if;
  if slug !~ '^[a-z0-9][a-z0-9-]{0,98}$' then raise exception 'BAD_SLUG'; end if;
  if mode not in ('internal', 'bizouk', 'none') then raise exception 'BAD_MODE'; end if;
  if mode = 'bizouk' and (bid is null or bid !~ '^[0-9]{1,9}$') then raise exception 'BAD_BIZOUK'; end if;
  if mode <> 'bizouk' then bid := null; end if;
  if region not in ('france', 'martinique', 'guadeloupe', 'sxm') then raise exception 'BAD_REGION'; end if;
  if coalesce(p_data->>'visibility', 'public') not in ('public', 'private') then raise exception 'BAD_VISIBILITY'; end if;
  begin starts := (p_data->>'starts_at')::timestamptz; exception when others then raise exception 'BAD_DATE'; end;
  if starts is null then raise exception 'BAD_DATE'; end if;
  if vname = '' or char_length(vname) > 120 then raise exception 'VENUE_REQUIRED'; end if;
  if exists (select 1 from public.ticketed_events where event_slug = slug) then raise exception 'SLUG_TAKEN'; end if;
  insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, venue_name, capacity, ticketing_enabled, status, ticketing_mode, bizouk_event_id)
  values (ev_id, slug, p_org, starts, vname, 100, false, 'draft', mode, bid);
  insert into public.event_details (ticketed_event_id, title, event_type, visibility, updated_by)
  values (ev_id, title, left(coalesce(p_data->>'event_type', ''), 60), coalesce(p_data->>'visibility', 'public'), p_actor);
  insert into public.event_venues (organizer_id, name, city, region) values (p_org, vname, left(coalesce(p_data->>'city', ''), 80), region) returning id into ven;
  insert into public.event_sessions (ticketed_event_id, venue_id, label, starts_at) values (ev_id, ven, '', starts);
  perform public._audit(p_actor, 'event.create', 'ticketed_event', ev_id::text, null, jsonb_build_object('slug', slug, 'organizer', p_org, 'ticketing_mode', mode));
  return jsonb_build_object('id', ev_id, 'slug', slug);
end $$;

create function public.org_set_ticketing(p_actor uuid, p_slug text, p_mode text, p_bizouk_event_id text default null) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_mode not in ('internal', 'bizouk', 'none') then raise exception 'BAD_MODE'; end if;
  if p_mode = 'bizouk' and (p_bizouk_event_id is null or p_bizouk_event_id !~ '^[0-9]{1,9}$') then raise exception 'BAD_BIZOUK'; end if;
  if p_mode <> 'internal' and ev.status = 'published' and ev.ticketing_enabled and exists (select 1 from public.orders o where o.ticketed_event_id = ev.id and o.status in ('paid', 'partially_refunded')) then raise exception 'HAS_SALES'; end if;
  update public.ticketed_events set ticketing_mode = p_mode, bizouk_event_id = case when p_mode = 'bizouk' then p_bizouk_event_id end,
    ticketing_enabled = case when p_mode = 'internal' then ticketing_enabled else false end where id = ev.id;
  perform public._audit(p_actor, 'event.ticketing_mode', 'ticketed_event', ev.id::text, jsonb_build_object('mode', ev.ticketing_mode), jsonb_build_object('mode', p_mode));
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_create_event', 'org_set_ticketing')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
