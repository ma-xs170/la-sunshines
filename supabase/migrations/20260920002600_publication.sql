-- =====================================================================
-- Migration 026 — publication d'un évènement créé en ligne, sous contrôle d'un admin
--
--  * event_details.flyer_url : visuel de l'évènement (URL https du stockage public), enregistré par l'organisateur.
--  * publication_requests : demandes « Demander la publication » (pending / approved / rejected / cancelled), une seule demande en cours par évènement.
--  * org_publication_state : ce qui manque (description, date, lieu, visuel, tarifs ou widget) + dernière demande.
--  * org_request_publication / org_cancel_publication : organisation APPROUVÉE, gestionnaire ou propriétaire, évènement en brouillon, checklist complète.
--  * admin_publications / admin_review_publication : file d'attente admin ; approuver = statut « published » (billetterie interne activée seulement si Stripe est prêt et un tarif existe) ; refuser = motif obligatoire.
--  * public_db_event : lecture publique d'un évènement publié, public, d'une organisation approuvée (appelée côté serveur uniquement).
-- Additive. Le réglage global « mode public » reste l'interrupteur de sécurité (rien n'est vendu tant qu'il est sur bizouk).
-- =====================================================================

alter table public.event_details add column if not exists flyer_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_details_flyer_url_check') then
    alter table public.event_details add constraint event_details_flyer_url_check check (flyer_url is null or (flyer_url ~ '^https://' and char_length(flyer_url) <= 500));
  end if;
end $$;

create table public.publication_requests (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by      uuid references auth.users(id) on delete set null,
  reason            text not null default '' check (char_length(reason) <= 500),
  reviewed_by       uuid references auth.users(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default clock_timestamp(),   -- ordre strict même dans une transaction
  check (status <> 'rejected' or char_length(btrim(reason)) >= 5)
);
create unique index publication_one_pending on public.publication_requests (ticketed_event_id) where status = 'pending';
create index publication_status_idx on public.publication_requests (status, created_at);
alter table public.publication_requests enable row level security;
revoke all on public.publication_requests from anon, authenticated;

create function public.org_set_flyer(p_actor uuid, p_slug text, p_url text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_url is not null and (p_url !~ '^https://[a-z0-9.-]+\.public\.blob\.vercel-storage\.com/' or char_length(p_url) > 500) then raise exception 'BAD_URL'; end if;
  insert into public.event_details (ticketed_event_id, flyer_url, updated_by) values (ev.id, p_url, p_actor)
  on conflict (ticketed_event_id) do update set flyer_url = excluded.flyer_url, updated_by = p_actor, updated_at = now();
  perform public._audit(p_actor, 'event.flyer', 'ticketed_event', ev.id::text, null, jsonb_build_object('set', p_url is not null));
end $$;

create function public._publication_checklist(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'description', coalesce((select char_length(btrim(d.description)) >= 20 from public.event_details d where d.ticketed_event_id = e.id), false),
    'date',        e.starts_at > now(),
    'venue',       btrim(e.venue_name) <> '',
    'visual',      coalesce((select d.flyer_url is not null from public.event_details d where d.ticketed_event_id = e.id), false) or exists (select 1 from public.event_media m where m.ticketed_event_id = e.id),
    'tickets',     case e.ticketing_mode
                     when 'internal' then exists (select 1 from public.ticket_tiers t where t.ticketed_event_id = e.id and t.is_active and t.archived_at is null)
                     when 'bizouk'   then e.bizouk_event_id is not null
                     else true end)
  from public.ticketed_events e where e.id = p_event
$$;

create function public.org_publication_state(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; c jsonb; r public.publication_requests;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  c := public._publication_checklist(ev.id);
  select * into r from public.publication_requests where ticketed_event_id = ev.id order by created_at desc limit 1;
  return jsonb_build_object('checklist', c, 'ready', not exists (select 1 from jsonb_each(c) x where x.value = 'false'::jsonb), 'event_status', ev.status, 'mode', ev.ticketing_mode,
    'org_approved', (select account_status = 'approved' from public.organizers where id = ev.organizer_id),
    'request', case when r.id is null then null else jsonb_build_object('id', r.id, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at, 'reviewed_at', r.reviewed_at) end);
end $$;

create function public.org_request_publication(p_actor uuid, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; c jsonb; rid uuid; o public.organizers;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select * into o from public.organizers where id = ev.organizer_id;
  if o.account_status <> 'approved' then raise exception 'ORG_NOT_APPROVED'; end if;
  if ev.status <> 'draft' then raise exception 'NOT_DRAFT'; end if;
  c := public._publication_checklist(ev.id);
  if exists (select 1 from jsonb_each(c) x where x.value = 'false'::jsonb) then raise exception 'CHECKLIST_INCOMPLETE'; end if;
  begin
    insert into public.publication_requests (ticketed_event_id, requested_by) values (ev.id, p_actor) returning id into rid;
  exception when unique_violation then raise exception 'ALREADY_PENDING'; end;
  perform public._audit(p_actor, 'publication.request', 'ticketed_event', ev.id::text, null, jsonb_build_object('request', rid));
  return jsonb_build_object('id', rid, 'slug', ev.event_slug, 'title', coalesce((select title from public.event_details where ticketed_event_id = ev.id), ev.event_slug), 'organizer', o.name);
end $$;

create function public.org_cancel_publication(p_actor uuid, p_slug text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; n int;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  update public.publication_requests set status = 'cancelled', reviewed_at = now() where ticketed_event_id = ev.id and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'NO_PENDING'; end if;
  perform public._audit(p_actor, 'publication.cancel', 'ticketed_event', ev.id::text, null, '{}'::jsonb);
end $$;

create function public.admin_publications(p_actor uuid, p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  if p_status not in ('pending', 'approved', 'rejected', 'cancelled', 'all') then raise exception 'BAD_FILTER'; end if;
  return jsonb_build_object('counts', jsonb_build_object('pending', (select count(*) from public.publication_requests where status = 'pending')),
    'rows', coalesce((select jsonb_agg(x) from (
      select r.id, r.status, r.reason, r.created_at, r.reviewed_at, e.event_slug as slug, e.starts_at, e.ticketing_mode as mode,
             coalesce(d.title, e.event_slug) as title, o.name as organizer, o.reference as organizer_reference, o.id as organizer_id,
             (select u.email from auth.users u where u.id = r.requested_by) as requester_email,
             public._publication_checklist(e.id) as checklist
        from public.publication_requests r join public.ticketed_events e on e.id = r.ticketed_event_id join public.organizers o on o.id = e.organizer_id
        left join public.event_details d on d.ticketed_event_id = e.id
       where p_status = 'all' or r.status = p_status order by r.created_at desc limit 200) x), '[]'::jsonb));
end $$;

create function public.admin_review_publication(p_actor uuid, p_id uuid, p_approve boolean, p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.publication_requests; ev public.ticketed_events; o public.organizers; c jsonb; enable boolean; v_reason text := left(btrim(coalesce(p_reason, '')), 500);
begin
  perform public._assert_admin(p_actor);
  select * into r from public.publication_requests where id = p_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  select * into ev from public.ticketed_events where id = r.ticketed_event_id for update;
  select * into o from public.organizers where id = ev.organizer_id;
  if p_approve then
    if o.account_status <> 'approved' then raise exception 'ORG_NOT_APPROVED'; end if;
    c := public._publication_checklist(ev.id);
    if exists (select 1 from jsonb_each(c) x where x.value = 'false'::jsonb) then raise exception 'CHECKLIST_INCOMPLETE'; end if;
    enable := ev.ticketing_mode = 'internal' and o.stripe_ready and exists (select 1 from public.ticket_tiers t where t.ticketed_event_id = ev.id and t.is_active and t.archived_at is null);
    update public.ticketed_events set status = 'published', ticketing_enabled = enable where id = ev.id;
    update public.publication_requests set status = 'approved', reviewed_by = p_actor, reviewed_at = now(), reason = v_reason where id = r.id;
  else
    if char_length(v_reason) < 5 then raise exception 'REASON_REQUIRED'; end if;
    update public.publication_requests set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), reason = v_reason where id = r.id;
  end if;
  perform public._audit(p_actor, case when p_approve then 'publication.approve' else 'publication.reject' end, 'ticketed_event', ev.id::text, null, jsonb_build_object('request', r.id, 'reason', v_reason));
  return jsonb_build_object('slug', ev.event_slug, 'approved', p_approve, 'reason', v_reason, 'organizer', o.name,
    'title', coalesce((select title from public.event_details where ticketed_event_id = ev.id), ev.event_slug),
    'requester_email', (select email from auth.users where id = r.requested_by));
end $$;

create function public.public_db_event(p_slug text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('slug', e.event_slug, 'title', d.title, 'event_type', d.event_type, 'subtitle', d.subtitle, 'description', d.description, 'starts_at', e.starts_at, 'venue', e.venue_name,
    'city', (select v.city from public.event_sessions s join public.event_venues v on v.id = s.venue_id where s.ticketed_event_id = e.id order by s.starts_at limit 1),
    'flyer_url', d.flyer_url, 'dresscode', d.dresscode, 'mode', e.ticketing_mode, 'bizouk_event_id', e.bizouk_event_id, 'organizer', o.name)
    from public.ticketed_events e join public.event_details d on d.ticketed_event_id = e.id join public.organizers o on o.id = e.organizer_id and o.account_status = 'approved'
   where e.event_slug = p_slug and e.status = 'published' and d.visibility = 'public' and d.title <> ''
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('org_set_flyer', '_publication_checklist', 'org_publication_state', 'org_request_publication', 'org_cancel_publication', 'admin_publications', 'admin_review_publication', 'public_db_event')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
