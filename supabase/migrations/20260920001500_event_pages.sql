-- =====================================================================
-- Migration 015 — pages évènement côté organisateur (Phase 2)
--
--  * event_details : description, visibilité, publication différée, dresscode STRUCTURÉ (couleurs), contact, réseaux,
--    formulaire acheteur, conditions propres à l'évènement, cases de consentement. Une ligne par ticketed_events.
--  * event_venues (par organisation) et event_sessions (par évènement) : région, coordonnées, adresse masquable.
--  * event_media : flyer vidéo (statuts envoyée / en traitement / prête / échec, reprise automatique).
--  * order_consents : historique horodaté des consentements par commande (RGPD).
--  * Fonctions org_* : contrôle du rôle refait en SQL, audit_log, un organisateur ne voit JAMAIS l'évènement d'un autre.
-- Additive : aucune table existante modifiée.
-- =====================================================================

create table public.event_details (
  ticketed_event_id uuid primary key references public.ticketed_events(id) on delete restrict,
  event_type      text not null default '' check (char_length(event_type) <= 60),
  subtitle        text not null default '' check (char_length(subtitle) <= 140),
  description     text not null default '' check (char_length(description) <= 6000),   -- Markdown limité (gras, italique, listes, lien, citation)
  visibility      text not null default 'public' check (visibility in ('public', 'private')),
  publish_mode    text not null default 'now' check (publish_mode in ('now', 'later')),
  publish_at      timestamptz,
  dresscode       jsonb not null default '{"colors":[],"free":false,"note":""}'::jsonb,
  contact_email   text not null default '' check (char_length(contact_email) <= 254),
  contact_phone   text not null default '' check (char_length(contact_phone) <= 30),
  socials         jsonb not null default '{}'::jsonb,
  form_questions  jsonb not null default '[]'::jsonb,
  guardian_form   boolean not null default false,       -- modèle « autorisation parentale » : NON obligatoire tant qu'il n'est pas activé
  terms           text not null default '' check (char_length(terms) <= 12000),
  consents        jsonb not null default '[]'::jsonb,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  check (publish_mode = 'now' or publish_at is not null),
  check (jsonb_typeof(dresscode) = 'object' and jsonb_typeof(socials) = 'object' and jsonb_typeof(form_questions) = 'array' and jsonb_typeof(consents) = 'array'),
  check (jsonb_array_length(form_questions) <= 20 and jsonb_array_length(consents) <= 10 and pg_column_size(dresscode) < 2000 and pg_column_size(socials) < 4000)
);

create table public.event_venues (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete restrict,
  name         text not null check (char_length(name) between 1 and 120),
  address      text not null default '' check (char_length(address) <= 250),
  postal_code  text not null default '' check (char_length(postal_code) <= 12),
  city         text not null default '' check (char_length(city) <= 80),
  country      text not null default 'France' check (char_length(country) <= 60),
  region       text not null check (region in ('france', 'martinique', 'guadeloupe', 'sxm')),
  lat          double precision check (lat is null or lat between -90 and 90),
  lng          double precision check (lng is null or lng between -180 and 180),
  hide_address boolean not null default false,
  created_at   timestamptz not null default now()
);
create index event_venues_org_idx on public.event_venues (organizer_id);

create table public.event_sessions (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  venue_id          uuid references public.event_venues(id) on delete set null,
  label             text not null default '' check (char_length(label) <= 80),
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  timezone          text not null default 'America/Guadeloupe' check (char_length(timezone) <= 60),
  capacity          int check (capacity is null or capacity between 1 and 100000),
  created_at        timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index event_sessions_event_idx on public.event_sessions (ticketed_event_id, starts_at);

create table public.event_media (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  kind              text not null default 'video' check (kind = 'video'),
  status            text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  source_url        text not null check (source_url ~ '^https://'),
  hevc_url          text check (hevc_url is null or hevc_url ~ '^https://'),
  h264_url          text check (h264_url is null or h264_url ~ '^https://'),
  poster_url        text check (poster_url is null or poster_url ~ '^https://'),
  attempts          int not null default 0,
  last_error        text not null default '' check (char_length(last_error) <= 400),
  meta              jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index event_media_event_idx on public.event_media (ticketed_event_id, created_at desc);
create trigger event_media_set_updated_at before update on public.event_media for each row execute function public.set_updated_at();

create table public.order_consents (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete restrict,
  consent_key text not null check (char_length(consent_key) between 1 and 60),
  label       text not null check (char_length(label) <= 400),   -- texte exact affiché au moment du consentement
  accepted    boolean not null,
  created_at  timestamptz not null default now()
);
create index order_consents_order_idx on public.order_consents (order_id);

-- RLS : tables réservées aux fonctions serveur (aucun accès direct du navigateur)
alter table public.event_details  enable row level security;
alter table public.event_venues   enable row level security;
alter table public.event_sessions enable row level security;
alter table public.event_media    enable row level security;
alter table public.order_consents enable row level security;
revoke all on public.event_details, public.event_venues, public.event_sessions, public.event_media, public.order_consents from anon, authenticated;

-- ---------------------------------------------------------------------
-- Lecture : tout ce qu'un membre voit de la page évènement
-- ---------------------------------------------------------------------
create function public.org_event_details(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; d public.event_details;
begin
  ev := public._org_access(p_actor, p_slug, 'read');
  select * into d from public.event_details where ticketed_event_id = ev.id;
  return jsonb_build_object(
    'event', jsonb_build_object('id', ev.id, 'slug', ev.event_slug, 'status', ev.status, 'starts_at', ev.starts_at, 'ticketing_enabled', ev.ticketing_enabled,
                                'sales_open_at', ev.sales_open_at, 'organizer_id', ev.organizer_id),
    'details', case when d.ticketed_event_id is null then null else to_jsonb(d) - 'ticketed_event_id' - 'updated_by' end,
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) - 'ticketed_event_id' order by s.starts_at) from public.event_sessions s where s.ticketed_event_id = ev.id), '[]'::jsonb),
    'venues', coalesce((select jsonb_agg(to_jsonb(v) - 'organizer_id' order by v.name) from public.event_venues v where v.organizer_id = ev.organizer_id), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'status', m.status, 'attempts', m.attempts, 'last_error', m.last_error, 'poster_url', m.poster_url,
                       'hevc_url', m.hevc_url, 'h264_url', m.h264_url, 'created_at', m.created_at) order by m.created_at desc)
                       from (select * from public.event_media where ticketed_event_id = ev.id order by created_at desc limit 5) m), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Écriture des détails (liste blanche de clés, validation, audit)
-- ---------------------------------------------------------------------
create function public.org_event_details_save(p_actor uuid, p_slug text, p_patch jsonb) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; k text; allowed text[] := array['event_type', 'subtitle', 'description', 'visibility', 'publish_mode', 'publish_at', 'dresscode',
  'contact_email', 'contact_phone', 'socials', 'form_questions', 'guardian_form', 'terms', 'consents'];
  cur public.event_details;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'BAD_PATCH'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then raise exception 'BAD_FIELD'; end if;
  end loop;
  if p_patch ? 'visibility' and p_patch ->> 'visibility' not in ('public', 'private') then raise exception 'BAD_VISIBILITY'; end if;
  if p_patch ? 'publish_mode' and p_patch ->> 'publish_mode' not in ('now', 'later') then raise exception 'BAD_PUBLISH'; end if;
  if p_patch ? 'contact_email' and p_patch ->> 'contact_email' <> '' and p_patch ->> 'contact_email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'BAD_EMAIL'; end if;
  insert into public.event_details (ticketed_event_id) values (ev.id) on conflict do nothing;
  select * into cur from public.event_details where ticketed_event_id = ev.id for update;
  update public.event_details set
    event_type     = coalesce(p_patch ->> 'event_type', event_type),
    subtitle       = coalesce(p_patch ->> 'subtitle', subtitle),
    description    = coalesce(p_patch ->> 'description', description),
    visibility     = coalesce(p_patch ->> 'visibility', visibility),
    publish_mode   = coalesce(p_patch ->> 'publish_mode', publish_mode),
    publish_at     = case when p_patch ? 'publish_at' then nullif(p_patch ->> 'publish_at', '')::timestamptz else publish_at end,
    dresscode      = coalesce(p_patch -> 'dresscode', dresscode),
    contact_email  = coalesce(p_patch ->> 'contact_email', contact_email),
    contact_phone  = coalesce(p_patch ->> 'contact_phone', contact_phone),
    socials        = coalesce(p_patch -> 'socials', socials),
    form_questions = coalesce(p_patch -> 'form_questions', form_questions),
    guardian_form  = coalesce((p_patch ->> 'guardian_form')::boolean, guardian_form),
    terms          = coalesce(p_patch ->> 'terms', terms),
    consents       = coalesce(p_patch -> 'consents', consents),
    updated_by = p_actor, updated_at = now()
  where ticketed_event_id = ev.id;
  perform public._org_audit(p_actor, ev.id, 'organizer.details_save', jsonb_build_object('fields', (select jsonb_agg(x) from jsonb_object_keys(p_patch) x)), 0);
end $$;

-- ---------------------------------------------------------------------
-- Lieux (par organisation) et sessions (par évènement)
-- ---------------------------------------------------------------------
create function public.org_venue_save(p_actor uuid, p_org uuid, p_id uuid, p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare vid uuid;
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'BAD_PATCH'; end if;
  if p_id is null then
    insert into public.event_venues (organizer_id, name, address, postal_code, city, country, region, lat, lng, hide_address)
    values (p_org, btrim(coalesce(p_data ->> 'name', '')), coalesce(p_data ->> 'address', ''), coalesce(p_data ->> 'postal_code', ''), coalesce(p_data ->> 'city', ''),
            coalesce(nullif(p_data ->> 'country', ''), 'France'), p_data ->> 'region', (p_data ->> 'lat')::double precision, (p_data ->> 'lng')::double precision,
            coalesce((p_data ->> 'hide_address')::boolean, false))
    returning id into vid;
  else
    update public.event_venues set
      name = coalesce(nullif(btrim(p_data ->> 'name'), ''), name), address = coalesce(p_data ->> 'address', address), postal_code = coalesce(p_data ->> 'postal_code', postal_code),
      city = coalesce(p_data ->> 'city', city), country = coalesce(nullif(p_data ->> 'country', ''), country), region = coalesce(p_data ->> 'region', region),
      lat = case when p_data ? 'lat' then (p_data ->> 'lat')::double precision else lat end, lng = case when p_data ? 'lng' then (p_data ->> 'lng')::double precision else lng end,
      hide_address = coalesce((p_data ->> 'hide_address')::boolean, hide_address)
    where id = p_id and organizer_id = p_org returning id into vid;
    if vid is null then raise exception 'VENUE_NOT_FOUND'; end if;
  end if;
  perform public._audit(p_actor, 'organizer.venue_save', 'event_venue', vid::text, null, jsonb_build_object('organizer_id', p_org));
  return vid;
end $$;

-- Une session dont la date change alors que les ventes sont ouvertes exige p_confirm = true (avertissement côté interface) ; toujours journalisé.
create function public.org_session_save(p_actor uuid, p_slug text, p_id uuid, p_venue uuid, p_label text, p_starts timestamptz, p_ends timestamptz, p_capacity int, p_confirm boolean default false) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; sid uuid; old public.event_sessions; sales_open boolean;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_venue is not null and not exists (select 1 from public.event_venues where id = p_venue and organizer_id = ev.organizer_id) then raise exception 'VENUE_NOT_FOUND'; end if;
  sales_open := ev.ticketing_enabled and (ev.sales_open_at is null or ev.sales_open_at <= now());
  if p_id is null then
    insert into public.event_sessions (ticketed_event_id, venue_id, label, starts_at, ends_at, capacity)
    values (ev.id, p_venue, coalesce(p_label, ''), p_starts, p_ends, p_capacity) returning id into sid;
  else
    select * into old from public.event_sessions where id = p_id and ticketed_event_id = ev.id for update;
    if not found then raise exception 'SESSION_NOT_FOUND'; end if;
    if sales_open and old.starts_at is distinct from p_starts and not coalesce(p_confirm, false) then raise exception 'CONFIRM_DATE_CHANGE'; end if;
    update public.event_sessions set venue_id = p_venue, label = coalesce(p_label, ''), starts_at = p_starts, ends_at = p_ends, capacity = p_capacity where id = p_id returning id into sid;
    if old.starts_at is distinct from p_starts then
      perform public._audit(p_actor, 'organizer.session_date_change', 'event_session', sid::text, jsonb_build_object('starts_at', old.starts_at), jsonb_build_object('starts_at', p_starts),
        jsonb_build_object('sales_open', sales_open, 'event', p_slug));
    end if;
  end if;
  perform public._org_audit(p_actor, ev.id, 'organizer.session_save', jsonb_build_object('session', sid), 0);
  return sid;
end $$;

create function public.org_session_delete(p_actor uuid, p_slug text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  delete from public.event_sessions where id = p_id and ticketed_event_id = ev.id;   -- ligne créée par l'organisateur lui-même (nouvelle table)
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  perform public._org_audit(p_actor, ev.id, 'organizer.session_delete', jsonb_build_object('session', p_id), 0);
end $$;

-- ---------------------------------------------------------------------
-- Flyer vidéo : enregistrement d'un envoi, suivi d'état (traitement = service_role uniquement)
-- ---------------------------------------------------------------------
create function public.org_media_register(p_actor uuid, p_slug text, p_source_url text, p_meta jsonb default '{}') returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; mid uuid;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_source_url is null or p_source_url !~ '^https://[a-z0-9.-]+\.public\.blob\.vercel-storage\.com/' then raise exception 'BAD_URL'; end if;
  insert into public.event_media (ticketed_event_id, source_url, meta, created_by) values (ev.id, p_source_url, coalesce(p_meta, '{}'), p_actor) returning id into mid;
  perform public._org_audit(p_actor, ev.id, 'organizer.video_upload', jsonb_build_object('media', mid), 0);
  return mid;
end $$;

create function public.media_set_status(p_id uuid, p_status text, p_hevc text default null, p_h264 text default null, p_poster text default null, p_error text default '') returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('processing', 'ready', 'failed') then raise exception 'BAD_STATUS'; end if;
  update public.event_media set status = p_status, hevc_url = coalesce(p_hevc, hevc_url), h264_url = coalesce(p_h264, h264_url), poster_url = coalesce(p_poster, poster_url),
    last_error = left(coalesce(p_error, ''), 400), attempts = attempts + case when p_status = 'processing' then 1 else 0 end
  where id = p_id;
  if not found then raise exception 'MEDIA_NOT_FOUND'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Lecture PUBLIQUE (fiche évènement) : uniquement ce qui est publiable ; rien si privé, brouillon ou publication différée dans le futur
-- ---------------------------------------------------------------------
create function public.public_event_details(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; d public.event_details;
begin
  select * into ev from public.ticketed_events where event_slug = p_slug;
  if not found then return null; end if;
  select * into d from public.event_details where ticketed_event_id = ev.id;
  if d.ticketed_event_id is null or d.visibility <> 'public' or (d.publish_mode = 'later' and d.publish_at > now()) then return null; end if;
  return jsonb_build_object(
    'subtitle', d.subtitle, 'description', d.description, 'dresscode', d.dresscode, 'socials', d.socials, 'contact_email', d.contact_email,
    'guardian_form', d.guardian_form, 'terms', d.terms,
    'venues', coalesce((select jsonb_agg(jsonb_build_object('name', v.name, 'city', v.city, 'region', v.region,
                'address', case when v.hide_address then null else v.address end, 'lat', case when v.hide_address then null else v.lat end,
                'lng', case when v.hide_address then null else v.lng end) order by s.starts_at)
                from public.event_sessions s join public.event_venues v on v.id = s.venue_id where s.ticketed_event_id = ev.id), '[]'::jsonb),
    'video', (select jsonb_build_object('hevc_url', m.hevc_url, 'h264_url', coalesce(m.h264_url, m.source_url), 'poster_url', m.poster_url)
              from public.event_media m where m.ticketed_event_id = ev.id and m.status = 'ready' order by m.created_at desc limit 1));
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('org_event_details', 'org_event_details_save', 'org_venue_save', 'org_session_save', 'org_session_delete', 'org_media_register', 'media_set_status', 'public_event_details')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
