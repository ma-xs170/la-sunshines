-- =====================================================================
-- Migration 012 — Actualités : nouveautés du site publiées par les admins, lues par les organisateurs.
--
--  * news_posts : titre, catégorie (nouveauté / important / maintenance), contenu TEXTE SIMPLE, image optionnelle (URL https),
--    brouillon ou publié, épinglé. Aucun HTML : les caractères < et > sont refusés par la base ET retirés à l'enregistrement.
--  * news_reads : lu / non lu PAR UTILISATEUR.
--  * RLS : lecture (publications publiées) pour les membres d'une organisation et les admins ; écriture pour les admins seulement.
--    Les fonctions news_* (service_role) revérifient le rôle de l'acteur.
-- =====================================================================

create table public.news_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 120 and title !~ '[<>]'),
  category     text not null default 'nouveaute' check (category in ('nouveaute', 'important', 'maintenance')),
  body         text not null check (char_length(btrim(body)) between 1 and 5000 and body !~ '[<>]'),
  image_url    text check (image_url is null or (char_length(image_url) <= 500 and image_url ~ '^https://[^[:space:]<>"'']+$')),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  pinned       boolean not null default false,
  published_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status = 'draft' or published_at is not null)
);
create index news_posts_published_idx on public.news_posts (published_at desc) where status = 'published';
create trigger news_posts_set_updated_at before update on public.news_posts for each row execute function public.set_updated_at();

create table public.news_reads (
  post_id uuid not null references public.news_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index news_reads_user_idx on public.news_reads (user_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.news_posts enable row level security;
alter table public.news_reads enable row level security;
revoke all on public.news_posts, public.news_reads from anon, authenticated;
grant select, insert, update, delete on public.news_posts to authenticated;
grant select, insert, delete on public.news_reads to authenticated;

create function public.is_org_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.organizer_members where user_id = (select auth.uid()))
$$;
revoke execute on function public.is_org_member() from public, anon;
grant execute on function public.is_org_member() to authenticated, service_role;

create policy news_posts_read on public.news_posts for select to authenticated
  using (public.is_admin() or (status = 'published' and public.is_org_member()));
create policy news_posts_admin_insert on public.news_posts for insert to authenticated with check (public.is_admin());
create policy news_posts_admin_update on public.news_posts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy news_posts_admin_delete on public.news_posts for delete to authenticated using (public.is_admin());

create policy news_reads_own_read on public.news_reads for select to authenticated using (user_id = (select auth.uid()));
create policy news_reads_own_insert on public.news_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.news_posts p where p.id = post_id and p.status = 'published'));
create policy news_reads_own_delete on public.news_reads for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Fonctions (service_role). Accès en lecture : admin ou membre d'une organisation (tout rôle, staff compris).
-- ---------------------------------------------------------------------
create function public._news_reader(p_actor uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_actor is not null and (
    exists (select 1 from public.profiles where id = p_actor and role = 'admin')
    or exists (select 1 from public.organizer_members where user_id = p_actor))
$$;

create function public.news_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public._news_reader(p_actor) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'category', p.category, 'body', p.body, 'image_url', p.image_url,
      'pinned', p.pinned, 'published_at', p.published_at, 'read', r.user_id is not null) order by p.published_at desc, p.id)
    from public.news_posts p left join public.news_reads r on r.post_id = p.id and r.user_id = p_actor
    where p.status = 'published'), '[]'::jsonb);
end $$;

create function public.news_unread_count(p_actor uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public._news_reader(p_actor) then
    (select count(*)::int from public.news_posts p where p.status = 'published'
       and not exists (select 1 from public.news_reads r where r.post_id = p.id and r.user_id = p_actor))
    else 0 end
$$;

-- Marque une publication (ou toutes, si p_post est nul) comme lue pour l'acteur. Renvoie le nombre de publications nouvellement lues.
create function public.news_mark_read(p_actor uuid, p_post uuid default null) returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not public._news_reader(p_actor) then raise exception 'FORBIDDEN'; end if;
  with ins as (
    insert into public.news_reads (post_id, user_id)
    select p.id, p_actor from public.news_posts p where p.status = 'published' and (p_post is null or p.id = p_post)
    on conflict do nothing returning 1)
  select count(*)::int into n from ins;
  return n;
end $$;

-- ---- administration (admin seulement)
create function public.news_admin_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'category', p.category, 'body', p.body, 'image_url', p.image_url,
      'status', p.status, 'pinned', p.pinned, 'published_at', p.published_at, 'updated_at', p.updated_at,
      'reads', (select count(*) from public.news_reads r where r.post_id = p.id)) order by coalesce(p.published_at, p.updated_at) desc, p.id)
    from public.news_posts p), '[]'::jsonb);
end $$;

-- Crée (p_id nul) ou modifie une publication. Le texte est nettoyé ici aussi : pas de < ni >, pas de caractères de contrôle.
create function public.news_admin_save(p_actor uuid, p_id uuid, p_title text, p_category text, p_body text, p_image_url text,
                                       p_status text, p_pinned boolean) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_title text; v_body text; v_img text; old public.news_posts; cur public.news_posts;
begin
  perform public._assert_admin(p_actor);
  v_title := btrim(regexp_replace(regexp_replace(coalesce(p_title, ''), '[<>\x01-\x1F\x7F]', ' ', 'g'), ' {2,}', ' ', 'g'));
  v_body  := btrim(regexp_replace(coalesce(p_body, ''),  '[<>\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  v_img   := nullif(btrim(coalesce(p_image_url, '')), '');
  if p_status not in ('draft', 'published') then raise exception 'BAD_STATUS'; end if;
  if v_title = '' or v_body = '' then raise exception 'EMPTY_POST'; end if;
  if p_id is null then
    insert into public.news_posts (title, category, body, image_url, status, pinned, published_at, created_by)
    values (v_title, p_category, v_body, v_img, p_status, coalesce(p_pinned, false), case when p_status = 'published' then now() end, p_actor)
    returning * into cur;
    perform public._audit(p_actor, 'news.create', 'news_post', cur.id::text, null, jsonb_build_object('title', cur.title, 'status', cur.status, 'pinned', cur.pinned));
  else
    select * into old from public.news_posts where id = p_id for update;
    if not found then raise exception 'POST_NOT_FOUND'; end if;
    update public.news_posts set title = v_title, category = p_category, body = v_body, image_url = v_img, status = p_status, pinned = coalesce(p_pinned, false),
      published_at = case when p_status = 'published' then coalesce(old.published_at, now()) else null end
     where id = p_id returning * into cur;
    perform public._audit(p_actor, 'news.update', 'news_post', cur.id::text,
      jsonb_build_object('title', old.title, 'status', old.status, 'pinned', old.pinned), jsonb_build_object('title', cur.title, 'status', cur.status, 'pinned', cur.pinned));
  end if;
  return cur.id;
end $$;

create function public.news_admin_delete(p_actor uuid, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old public.news_posts;
begin
  perform public._assert_admin(p_actor);
  delete from public.news_posts where id = p_id returning * into old;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  perform public._audit(p_actor, 'news.delete', 'news_post', p_id::text, jsonb_build_object('title', old.title, 'status', old.status), null);
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_news_reader', 'news_list', 'news_unread_count', 'news_mark_read', 'news_admin_list', 'news_admin_save', 'news_admin_delete')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
