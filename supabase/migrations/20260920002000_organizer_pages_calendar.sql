-- =====================================================================
-- Migration 020 — pages publiques d'organisateurs, « Suivre », calendrier régional (Phase 7)
--
--  * organizer_pages : créée AUTOMATIQUEMENT à l'approbation du compte (et rétro-remplie pour les organisations approuvées) ; slug unique, description, logo, bannière, réseaux.
--  * organizer_follows : suivi par un compte client ; notifications e-mail en opt-in explicite, désabonnement en un clic (jeton).
--  * public_organizer_page / public_event_organizer : lecture publique (uniquement organisations approuvées ; évènements publics et publiés).
--  * calendar_events : évènements PUBLICS de la région pour un organisateur (jamais les brouillons / privés d'un autre), tous pour un admin.
-- Additive.
-- =====================================================================

create function public._slugify(p text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(p, 'àâäáãéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^a-z0-9]+', '-', 'g')), ''), 'organisateur')
$$;

create table public.organizer_pages (
  organizer_id uuid primary key references public.organizers(id) on delete cascade,
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  description  text not null default '' check (char_length(description) <= 3000),
  logo_url     text check (logo_url is null or logo_url ~ '^https://'),
  banner_url   text check (banner_url is null or banner_url ~ '^https://'),
  website      text not null default '' check (website = '' or website ~ '^https://'),
  socials      jsonb not null default '{}'::jsonb check (jsonb_typeof(socials) = 'object' and pg_column_size(socials) < 4000),
  updated_at   timestamptz not null default now()
);
create table public.organizer_follows (
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  notify       boolean not null default false,                       -- opt-in explicite
  token        uuid not null default gen_random_uuid(),               -- désabonnement en un clic
  created_at   timestamptz not null default now(),
  primary key (organizer_id, user_id)
);
create unique index organizer_follows_token_idx on public.organizer_follows (token);
alter table public.organizer_pages enable row level security; alter table public.organizer_follows enable row level security;
revoke all on public.organizer_pages, public.organizer_follows from anon, authenticated;

-- Création automatique de la page à l'approbation
create function public._ensure_organizer_page(p_org uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare base text; s text; i int := 1; nm text;
begin
  if exists (select 1 from public.organizer_pages where organizer_id = p_org) then return; end if;
  select name into nm from public.organizers where id = p_org;
  base := left(public._slugify(nm), 60); s := base;
  while exists (select 1 from public.organizer_pages where slug = s) loop i := i + 1; s := base || '-' || i; end loop;
  insert into public.organizer_pages (organizer_id, slug) values (p_org, s);
end $$;
create function public._organizer_page_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_status = 'approved' then perform public._ensure_organizer_page(new.id); end if;
  return new;
end $$;
create trigger organizers_page_after after insert or update of account_status on public.organizers for each row execute function public._organizer_page_trigger();
select public._ensure_organizer_page(id) from public.organizers where account_status = 'approved';

-- Édition par l'organisateur (owner / manager / admin)
create function public.org_page_get(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pg public.organizer_pages;
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  select * into pg from public.organizer_pages where organizer_id = p_org;
  if not found then return null; end if;
  return jsonb_build_object('slug', pg.slug, 'description', pg.description, 'logo_url', pg.logo_url, 'banner_url', pg.banner_url, 'website', pg.website, 'socials', pg.socials,
    'followers', (select count(*) from public.organizer_follows where organizer_id = p_org));
end $$;

create function public.org_page_save(p_actor uuid, p_org uuid, p_patch jsonb) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare k text;
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'BAD_PATCH'; end if;
  for k in select jsonb_object_keys(p_patch) loop if k not in ('description', 'logo_url', 'banner_url', 'website', 'socials') then raise exception 'BAD_FIELD'; end if; end loop;
  if not exists (select 1 from public.organizer_pages where organizer_id = p_org) then raise exception 'PAGE_NOT_FOUND'; end if;
  update public.organizer_pages set
    description = coalesce(p_patch ->> 'description', description),
    logo_url = case when p_patch ? 'logo_url' then nullif(p_patch ->> 'logo_url', '') else logo_url end,
    banner_url = case when p_patch ? 'banner_url' then nullif(p_patch ->> 'banner_url', '') else banner_url end,
    website = coalesce(p_patch ->> 'website', website), socials = coalesce(p_patch -> 'socials', socials), updated_at = now()
  where organizer_id = p_org;
  perform public._audit(p_actor, 'organizer.page_save', 'organizer', p_org::text, null, jsonb_build_object('fields', (select jsonb_agg(x) from jsonb_object_keys(p_patch) x)));
end $$;

-- Lecture publique : organisation APPROUVÉE uniquement ; évènements publics, publiés, publication non différée
create function public._event_is_public(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.ticketed_events e where e.id = p_event and e.status in ('published', 'closed'))
     and not exists (select 1 from public.event_details d where d.ticketed_event_id = p_event and (d.visibility <> 'public' or (d.publish_mode = 'later' and d.publish_at > now())))
$$;

create function public.public_organizer_page(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pg public.organizer_pages; o public.organizers;
begin
  select * into pg from public.organizer_pages where slug = p_slug;
  if not found then return null; end if;
  select * into o from public.organizers where id = pg.organizer_id and account_status = 'approved';
  if not found then return null; end if;
  return jsonb_build_object('name', o.name, 'slug', pg.slug, 'description', pg.description, 'logo_url', pg.logo_url, 'banner_url', pg.banner_url, 'website', pg.website, 'socials', pg.socials,
    'events', coalesce((select jsonb_agg(jsonb_build_object('slug', e.event_slug, 'starts_at', e.starts_at, 'upcoming', e.starts_at > now()) order by e.starts_at desc)
                          from public.ticketed_events e where e.organizer_id = o.id and public._event_is_public(e.id)), '[]'::jsonb));
end $$;

create function public.public_event_organizer(p_event_slug text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('name', o.name, 'slug', pg.slug, 'logo_url', pg.logo_url)
    from public.ticketed_events e join public.organizers o on o.id = e.organizer_id and o.account_status = 'approved' join public.organizer_pages pg on pg.organizer_id = o.id
   where e.event_slug = p_event_slug and public._event_is_public(e.id)
$$;

-- Suivre : compte client requis (p_user vient de la session serveur). Notification = opt-in.
create function public.follow_organizer(p_user uuid, p_slug text, p_notify boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare oid uuid;
begin
  select pg.organizer_id into oid from public.organizer_pages pg join public.organizers o on o.id = pg.organizer_id where pg.slug = p_slug and o.account_status = 'approved';
  if oid is null then raise exception 'ORG_NOT_FOUND'; end if;
  insert into public.organizer_follows (organizer_id, user_id, notify) values (oid, p_user, coalesce(p_notify, false))
  on conflict (organizer_id, user_id) do update set notify = excluded.notify;
  return jsonb_build_object('following', true, 'notify', coalesce(p_notify, false));
end $$;
create function public.unfollow_organizer(p_user uuid, p_slug text) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from public.organizer_follows where user_id = p_user and organizer_id = (select organizer_id from public.organizer_pages where slug = p_slug)
$$;
create function public.follow_state(p_user uuid, p_slug text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('following', true, 'notify', f.notify) from public.organizer_follows f join public.organizer_pages pg on pg.organizer_id = f.organizer_id where f.user_id = p_user and pg.slug = p_slug), jsonb_build_object('following', false, 'notify', false))
$$;
create function public.unsubscribe_by_token(p_token uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update public.organizer_follows set notify = false where token = p_token;
  return found;
end $$;

-- Calendrier régional
create function public.calendar_events(p_actor uuid, p_region text, p_from timestamptz, p_to timestamptz, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare adm boolean; own uuid[];
begin
  if p_region not in ('france', 'martinique', 'guadeloupe', 'sxm') then raise exception 'BAD_REGION'; end if;
  if p_status is not null and p_status not in ('draft', 'published', 'closed', 'cancelled') then raise exception 'BAD_FILTER'; end if;
  adm := exists (select 1 from public.profiles p join public.admin_accounts a on a.user_id = p.id where p.id = p_actor and p.role = 'admin' and a.active);
  select coalesce(array_agg(organizer_id), '{}') into own from public.organizer_members where user_id = p_actor and role in ('owner', 'manager');
  if not adm and cardinality(own) = 0 then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
    select e.event_slug as slug, e.status, s.starts_at, s.ends_at, o.name as organizer, o.id as organizer_id, (e.organizer_id = any (own)) as mine,
           v.name as venue, v.city, v.region, v.id as venue_id,
           case when v.hide_address and not adm and not (e.organizer_id = any (own)) then null else v.lat end as lat,
           case when v.hide_address and not adm and not (e.organizer_id = any (own)) then null else v.lng end as lng
      from public.event_sessions s join public.ticketed_events e on e.id = s.ticketed_event_id join public.event_venues v on v.id = s.venue_id join public.organizers o on o.id = e.organizer_id
     where v.region = p_region and s.starts_at >= p_from and s.starts_at < p_to
       and (p_status is null or e.status = p_status or not adm)
       and (adm or e.organizer_id = any (own) or public._event_is_public(e.id))
     limit 1000) x), '[]'::jsonb);
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_ensure_organizer_page', '_organizer_page_trigger', 'org_page_get', 'org_page_save', '_event_is_public', 'public_organizer_page', 'public_event_organizer', 'follow_organizer',
        'unfollow_organizer', 'follow_state', 'unsubscribe_by_token', 'calendar_events')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
