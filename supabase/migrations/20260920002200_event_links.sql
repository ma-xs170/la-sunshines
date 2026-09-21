-- =====================================================================
-- Migration 022 — rattachement des évènements existants à leur organisation (demande 4bis-A)
--
--  * event_links : slug d'évènement (édition statique, édition de data/content.json ou évènement de test) → organisation. Table de LIAISON :
--    aucune colonne ajoutée à ticketed_events, aucun contenu éditorial copié ni modifié, data/content.json n'est pas touché.
--  * Rattache à THE MOUV (organisation par défaut) les 6 éditions connues + l'évènement de test (is_test). IDEMPOTENT (on conflict do nothing).
--  * Compte mathxs.170@gmail.com : s'il EXISTE, il devient super-admin (profil admin, ligne admin_accounts) et membre OWNER de THE MOUV.
--    S'il n'existe pas, rien n'est créé. Aucun autre compte n'est modifié.
-- Additive. Aucune suppression. Retour arrière : supabase/down/022_down.sql.
-- =====================================================================

create table if not exists public.event_links (
  event_slug   text primary key check (event_slug ~ '^[a-z0-9][a-z0-9-]{0,80}$'),
  organizer_id uuid not null references public.organizers(id) on delete restrict,
  is_test      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists event_links_org_idx on public.event_links (organizer_id);
alter table public.event_links enable row level security;
revoke all on public.event_links from anon, authenticated;

insert into public.event_links (event_slug, organizer_id, is_test)
select s.slug, o.id, s.is_test
  from (values ('la-nuit-des-ombres', false), ('welcome-to-dominica', false), ('candy-land', false), ('edition-picasso', false),
               ('la-xploz-tropical-island', false), ('before-christmas', false), ('test-billetterie', true)) s(slug, is_test)
 cross join (select id from public.organizers where is_default order by created_at limit 1) o
on conflict (event_slug) do nothing;

-- Les évènements billetterie déjà liés à une organisation restent liés à CETTE organisation (jamais écrasés)
insert into public.event_links (event_slug, organizer_id, is_test)
select e.event_slug, e.organizer_id, e.event_slug = 'test-billetterie' from public.ticketed_events e where e.organizer_id is not null
on conflict (event_slug) do nothing;

do $$
declare uid uuid; org uuid;
begin
  select id into uid from auth.users where lower(email) = 'mathxs.170@gmail.com';
  select id into org from public.organizers where is_default order by created_at limit 1;
  if uid is null or org is null then raise notice 'compte ou organisation par défaut absent : aucune promotion'; return; end if;
  update public.profiles set role = 'admin' where id = uid and role <> 'admin';
  insert into public.admin_accounts (user_id, level, must_change_password, invitation_status) values (uid, 'super', false, 'sent')
    on conflict (user_id) do update set level = 'super', active = true;
  insert into public.organizer_members (organizer_id, user_id, role) values (org, uid, 'owner')
    on conflict (organizer_id, user_id) do update set role = 'owner';
end $$;
