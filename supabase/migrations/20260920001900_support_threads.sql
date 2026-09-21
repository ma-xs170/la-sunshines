-- =====================================================================
-- Migration 019 — support organisateurs ↔ admins (Phase 6)
--
--  * support_threads (référence TK.XXXXXX) : objet, catégorie, priorité, statut (open / claimed / closed), prise en charge par UN admin (atomique).
--  * support_participants : organisations ajoutées à la discussion PAR RÉFÉRENCE ORG uniquement (jamais par nom ni e-mail).
--  * support_messages : messages, notes internes (admins seulement), pièces jointes (chemins de stockage PRIVÉ, images / PDF, 10 Mo).
--  * support_events : historique complet des changements de statut. support_reads : non lu. support_quick_replies : réponses rapides admin.
-- Additive. Visibilité : membres owner / manager de l'organisation du ticket ou d'une organisation ajoutée, et admins actifs. Tout le reste : introuvable.
-- =====================================================================

create table public.support_threads (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique check (reference ~ '^TK\.[0-9]{6}$'),
  organizer_id  uuid not null references public.organizers(id) on delete restrict,
  created_by    uuid references auth.users(id) on delete set null,
  subject       text not null check (char_length(subject) between 3 and 140),
  category      text not null check (category in ('technical', 'account', 'money', 'feature', 'other')),
  priority      text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status        text not null default 'open' check (status in ('open', 'claimed', 'closed')),
  claimed_by    uuid references auth.users(id) on delete set null,
  closed_note   text not null default '' check (char_length(closed_note) <= 500),
  context       jsonb not null default '{}'::jsonb,            -- page d'origine, évènement…
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((status = 'claimed') = (claimed_by is not null) or status = 'closed')
);
create index support_threads_org_idx on public.support_threads (organizer_id, updated_at desc);
create index support_threads_status_idx on public.support_threads (status, category, priority);

create table public.support_participants (
  thread_id    uuid not null references public.support_threads(id) on delete cascade,
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  added_by     uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (thread_id, organizer_id)
);

create table public.support_messages (
  id          bigint generated always as identity primary key,
  thread_id   uuid not null references public.support_threads(id) on delete cascade,
  author_id   uuid references auth.users(id) on delete set null,
  author_kind text not null check (author_kind in ('organizer', 'admin')),
  body        text not null check (char_length(body) between 1 and 5000),
  internal    boolean not null default false,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5),
  created_at  timestamptz not null default now(),
  check (not internal or author_kind = 'admin')
);
create index support_messages_thread_idx on public.support_messages (thread_id, id);

create table public.support_events (
  id         bigint generated always as identity primary key,
  thread_id  uuid not null references public.support_threads(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('created', 'claimed', 'transferred', 'closed', 'reopened', 'participant_added', 'priority')),
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index support_events_thread_idx on public.support_events (thread_id, id);

create table public.support_reads (
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  last_id   bigint not null default 0,
  primary key (thread_id, user_id)
);

create table public.support_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 60),
  body       text not null check (char_length(body) between 1 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.support_threads enable row level security; alter table public.support_participants enable row level security; alter table public.support_messages enable row level security;
alter table public.support_events enable row level security; alter table public.support_reads enable row level security; alter table public.support_quick_replies enable row level security;
revoke all on public.support_threads, public.support_participants, public.support_messages, public.support_events, public.support_reads, public.support_quick_replies from anon, authenticated;

-- ---------------------------------------------------------------------
-- Accès : 'admin' (admin actif), 'org' (membre owner / manager de l'organisation du ticket ou d'une organisation ajoutée), sinon null
-- ---------------------------------------------------------------------
create function public._support_role(p_actor uuid, p_thread uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.support_threads;
begin
  select * into t from public.support_threads where id = p_thread;
  if not found then return null; end if;
  if exists (select 1 from public.profiles p join public.admin_accounts a on a.user_id = p.id where p.id = p_actor and p.role = 'admin' and a.active) then return 'admin'; end if;
  if exists (select 1 from public.organizer_members m where m.user_id = p_actor and m.role in ('owner', 'manager')
             and (m.organizer_id = t.organizer_id or exists (select 1 from public.support_participants sp where sp.thread_id = t.id and sp.organizer_id = m.organizer_id))) then return 'org'; end if;
  return null;
end $$;

create function public._new_ticket_ref() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r text; i int := 0;
begin
  loop
    r := 'TK.' || lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.support_threads where reference = r);
    i := i + 1; if i > 50 then raise exception 'REFERENCE_EXHAUSTED'; end if;
  end loop;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Création et lecture
-- ---------------------------------------------------------------------
create function public.support_create(p_actor uuid, p_org uuid, p_subject text, p_category text, p_priority text, p_body text, p_attachments jsonb default '[]', p_context jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare tid uuid; ref text; mid bigint;
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  if btrim(coalesce(p_body, '')) = '' then raise exception 'EMPTY_MESSAGE'; end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'BAD_PRIORITY'; end if;
  if (select count(*) from public.support_threads where created_by = p_actor and created_at > now() - interval '1 hour') >= 10 then raise exception 'RATE_LIMIT'; end if;
  ref := public._new_ticket_ref();
  insert into public.support_threads (reference, organizer_id, created_by, subject, category, priority, context) values (ref, p_org, p_actor, btrim(p_subject), p_category, p_priority, coalesce(p_context, '{}')) returning id into tid;
  insert into public.support_messages (thread_id, author_id, author_kind, body, attachments) values (tid, p_actor, 'organizer', btrim(p_body), coalesce(p_attachments, '[]')) returning id into mid;
  insert into public.support_events (thread_id, actor_id, kind) values (tid, p_actor, 'created');
  insert into public.support_reads (thread_id, user_id, last_id) values (tid, p_actor, mid);
  return jsonb_build_object('id', tid, 'reference', ref);
end $$;

create function public.support_list(p_actor uuid, p_org uuid, p_q text default null, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform public._org_assert(p_actor, p_org, 'manage');
  if p_status is not null and p_status not in ('open', 'claimed', 'closed') then raise exception 'BAD_FILTER'; end if;
  if q is not null then q := replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'updated_at') desc) from (
    select jsonb_build_object('id', t.id, 'reference', t.reference, 'subject', t.subject, 'category', t.category, 'priority', t.priority, 'status', t.status, 'updated_at', t.updated_at,
      'admin_name', (select p.first_name from public.profiles p where p.id = t.claimed_by),
      'unread', exists (select 1 from public.support_messages m where m.thread_id = t.id and not m.internal and m.author_id is distinct from p_actor and m.id > coalesce((select r.last_id from public.support_reads r where r.thread_id = t.id and r.user_id = p_actor), 0))) as x
      from public.support_threads t
     where (t.organizer_id = p_org or exists (select 1 from public.support_participants sp where sp.thread_id = t.id and sp.organizer_id = p_org))
       and (p_status is null or t.status = p_status) and (q is null or t.subject ilike '%' || q || '%' or t.reference ilike '%' || q || '%')
     order by t.updated_at desc limit 100) s), '[]'::jsonb);
end $$;

create function public.support_get(p_actor uuid, p_id uuid, p_after bigint default 0) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r text := public._support_role(p_actor, p_id); t public.support_threads; last bigint;
begin
  if r is null then raise exception 'THREAD_NOT_FOUND'; end if;
  select * into t from public.support_threads where id = p_id;
  select coalesce(max(id), 0) into last from public.support_messages where thread_id = p_id and (r = 'admin' or not internal);
  insert into public.support_reads (thread_id, user_id, last_id) values (p_id, p_actor, last) on conflict (thread_id, user_id) do update set last_id = greatest(public.support_reads.last_id, excluded.last_id);
  return jsonb_build_object(
    'role', r,
    'thread', jsonb_build_object('id', t.id, 'reference', t.reference, 'subject', t.subject, 'category', t.category, 'priority', t.priority, 'status', t.status, 'closed_note', t.closed_note, 'created_at', t.created_at,
      'claimed_by', t.claimed_by, 'admin_name', (select p.first_name from public.profiles p where p.id = t.claimed_by), 'organizer', (select jsonb_build_object('id', o.id, 'name', o.name, 'reference', o.reference) from public.organizers o where o.id = t.organizer_id),
      'context', t.context),
    'participants', coalesce((select jsonb_agg(jsonb_build_object('name', o.name)) from public.support_participants sp join public.organizers o on o.id = sp.organizer_id where sp.thread_id = t.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.author_kind, 'internal', m.internal, 'body', m.body, 'attachments', m.attachments, 'created_at', m.created_at,
        'author', case when m.author_kind = 'admin' then (select p.first_name from public.profiles p where p.id = m.author_id) else (select p.first_name from public.profiles p where p.id = m.author_id) end) order by m.id)
        from public.support_messages m where m.thread_id = t.id and m.id > coalesce(p_after, 0) and (r = 'admin' or not m.internal)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at, 'meta', e.meta) order by e.id) from public.support_events e where e.thread_id = t.id and (r = 'admin' or e.kind <> 'priority')), '[]'::jsonb));
end $$;

create function public.support_post(p_actor uuid, p_id uuid, p_body text, p_attachments jsonb default '[]', p_internal boolean default false) returns bigint
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r text := public._support_role(p_actor, p_id); t public.support_threads; mid bigint;
begin
  if r is null then raise exception 'THREAD_NOT_FOUND'; end if;
  select * into t from public.support_threads where id = p_id for update;
  if t.status = 'closed' then raise exception 'CLOSED'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'EMPTY_MESSAGE'; end if;
  if p_internal and r <> 'admin' then raise exception 'FORBIDDEN'; end if;
  insert into public.support_messages (thread_id, author_id, author_kind, body, internal, attachments) values (p_id, p_actor, case when r = 'admin' then 'admin' else 'organizer' end, btrim(p_body), coalesce(p_internal, false), coalesce(p_attachments, '[]')) returning id into mid;
  update public.support_threads set updated_at = now() where id = p_id;
  insert into public.support_reads (thread_id, user_id, last_id) values (p_id, p_actor, mid) on conflict (thread_id, user_id) do update set last_id = excluded.last_id;
  return mid;
end $$;

-- Ajout d'une organisation PAR RÉFÉRENCE. Organisateur : ORG. seulement. Admin : ORG. ou ADM. (un admin est toujours autorisé à voir : rien à ajouter). On ne révèle que le nom de la structure, après l'ajout.
create function public.support_add_participant(p_actor uuid, p_id uuid, p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r text := public._support_role(p_actor, p_id); ref text := upper(btrim(coalesce(p_ref, ''))); o public.organizers;
begin
  if r is null then raise exception 'THREAD_NOT_FOUND'; end if;
  if ref !~ '^ORG\.[0-9]{8}$' then raise exception 'BAD_REFERENCE'; end if;
  if (select status from public.support_threads where id = p_id) = 'closed' then raise exception 'CLOSED'; end if;
  select * into o from public.organizers where reference = ref and account_status = 'approved';
  if not found then raise exception 'BAD_REFERENCE'; end if;   -- même réponse : on ne révèle pas si la référence existe
  if o.id = (select organizer_id from public.support_threads where id = p_id) or exists (select 1 from public.support_participants where thread_id = p_id and organizer_id = o.id) then raise exception 'ALREADY_ADDED'; end if;
  insert into public.support_participants (thread_id, organizer_id, added_by) values (p_id, o.id, p_actor);
  insert into public.support_events (thread_id, actor_id, kind, meta) values (p_id, p_actor, 'participant_added', jsonb_build_object('organization', o.name));
  update public.support_threads set updated_at = now() where id = p_id;
  return jsonb_build_object('name', o.name);
end $$;

-- ---------------------------------------------------------------------
-- Côté admin
-- ---------------------------------------------------------------------
create function public._assert_active_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  if not exists (select 1 from public.admin_accounts where user_id = p_actor and active) then raise exception 'FORBIDDEN'; end if;
end $$;

create function public.admin_support_list(p_actor uuid, p_category text default null, p_scope text default 'all') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_active_admin(p_actor);
  if p_category is not null and p_category not in ('technical', 'account', 'money', 'feature', 'other') then raise exception 'BAD_FILTER'; end if;
  if p_scope not in ('all', 'mine', 'closed') then raise exception 'BAD_FILTER'; end if;
  return jsonb_build_object(
    'counts', jsonb_build_object('all', (select count(*) from public.support_threads where status = 'open'),
      'technical', (select count(*) from public.support_threads where status = 'open' and category = 'technical'), 'account', (select count(*) from public.support_threads where status = 'open' and category = 'account'),
      'money', (select count(*) from public.support_threads where status = 'open' and category = 'money'), 'feature', (select count(*) from public.support_threads where status = 'open' and category = 'feature'),
      'other', (select count(*) from public.support_threads where status = 'open' and category = 'other'), 'mine', (select count(*) from public.support_threads where status = 'claimed' and claimed_by = p_actor)),
    'rows', coalesce((select jsonb_agg(x) from (
      select t.id, t.reference, t.subject, t.category, t.priority, t.status, t.updated_at, o.name as organizer, o.reference as organizer_reference, (select p.first_name from public.profiles p where p.id = t.claimed_by) as admin_name
        from public.support_threads t join public.organizers o on o.id = t.organizer_id
       where (p_category is null or t.category = p_category)
         and case p_scope when 'closed' then t.status = 'closed' when 'mine' then t.claimed_by = p_actor and t.status <> 'closed' else t.status <> 'closed' end
       order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, t.updated_at desc limit 200) x), '[]'::jsonb));
end $$;

-- Prise en charge ATOMIQUE : un seul admin l'obtient ; l'autre reçoit ALREADY_CLAIMED.
create function public.support_claim(p_actor uuid, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  perform public._assert_active_admin(p_actor);
  update public.support_threads set status = 'claimed', claimed_by = p_actor, updated_at = now() where id = p_id and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then
    if not exists (select 1 from public.support_threads where id = p_id) then raise exception 'THREAD_NOT_FOUND'; end if;
    raise exception 'ALREADY_CLAIMED';
  end if;
  insert into public.support_events (thread_id, actor_id, kind) values (p_id, p_actor, 'claimed');
end $$;

create function public.support_transfer(p_actor uuid, p_id uuid, p_to_admin uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_active_admin(p_actor);
  if not exists (select 1 from public.admin_accounts where user_id = p_to_admin and active) then raise exception 'USER_NOT_FOUND'; end if;
  update public.support_threads set claimed_by = p_to_admin, status = 'claimed', updated_at = now() where id = p_id and status <> 'closed';
  if not found then raise exception 'THREAD_NOT_FOUND'; end if;
  insert into public.support_events (thread_id, actor_id, kind, meta) values (p_id, p_actor, 'transferred', jsonb_build_object('to', (select first_name from public.profiles where id = p_to_admin)));
end $$;

create function public.support_close(p_actor uuid, p_id uuid, p_note text default '') returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_active_admin(p_actor);
  update public.support_threads set status = 'closed', closed_note = left(coalesce(p_note, ''), 500), updated_at = now() where id = p_id and status <> 'closed';
  if not found then raise exception 'THREAD_NOT_FOUND'; end if;
  insert into public.support_events (thread_id, actor_id, kind, meta) values (p_id, p_actor, 'closed', jsonb_build_object('note', left(coalesce(p_note, ''), 500)));
end $$;

create function public.support_reopen(p_actor uuid, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_active_admin(p_actor);
  update public.support_threads set status = case when claimed_by is not null then 'claimed' else 'open' end, updated_at = now() where id = p_id and status = 'closed';
  if not found then raise exception 'THREAD_NOT_FOUND'; end if;
  insert into public.support_events (thread_id, actor_id, kind) values (p_id, p_actor, 'reopened');
end $$;

create function public.admin_support_search(p_actor uuid, p_q text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); digits text;
begin
  perform public._assert_active_admin(p_actor);
  if q is null or char_length(q) < 2 then return '[]'::jsonb; end if;
  q := replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_'); digits := regexp_replace(q, '\D', '', 'g');
  return coalesce((select jsonb_agg(x) from (select id, reference, subject, status from public.support_threads
    where reference ilike '%' || q || '%' or (char_length(digits) >= 3 and reference like 'TK.%' || digits || '%') or subject ilike '%' || q || '%' order by updated_at desc limit 8) x), '[]'::jsonb);
end $$;

create function public.support_quick_replies(p_actor uuid, p_save jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_active_admin(p_actor);
  if p_save is not null then insert into public.support_quick_replies (title, body, created_by) values (left(btrim(p_save ->> 'title'), 60), left(btrim(p_save ->> 'body'), 2000), p_actor); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body) order by title) from public.support_quick_replies), '[]'::jsonb);
end $$;

-- Pièce jointe : le serveur demande si l'acteur peut lire le fil avant de servir un fichier privé
create function public.support_can_read(p_actor uuid, p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$ select public._support_role(p_actor, p_id) is not null $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_support_role', '_new_ticket_ref', 'support_create', 'support_list', 'support_get', 'support_post', 'support_add_participant', '_assert_active_admin', 'admin_support_list', 'support_claim',
        'support_transfer', 'support_close', 'support_reopen', 'admin_support_search', 'support_quick_replies', 'support_can_read')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
