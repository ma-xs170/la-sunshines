-- =====================================================================
-- Migration 023 — inscription d'une organisation en plusieurs pages, pièces consultables par les admins (demande C)
--
--  * organizer_applications : réponses du formulaire (une ligne par organisation) ; organizer_documents : pièces déposées (fichiers en stockage PRIVÉ, seul le chemin est ici).
--  * org_register : crée l'organisation EN ATTENTE (account_status = pending), rattache l'auteur comme OWNER, enregistre le dossier. Aucun évènement possible tant qu'elle n'est pas approuvée.
--  * admin_org_dossier : dossier + pièces (admin actif) ; admin_org_document : chemin d'une pièce, consultation JOURNALISÉE.
-- Additive. Aucune donnée bancaire (pas de RIB) : le versement passe par Stripe Connect.
-- =====================================================================

create table public.organizer_applications (
  organizer_id uuid primary key references public.organizers(id) on delete cascade,
  data         jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 20000),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now()
);
create table public.organizer_documents (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  kind         text not null check (kind in ('identity', 'legal', 'other')),
  path         text not null check (path ~ '^orgdocs/[A-Za-z0-9._-]{1,120}$' and path not like '%..%'),
  name         text not null check (char_length(name) between 1 and 120),
  size         int not null check (size > 0 and size <= 10485760),
  mime         text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index organizer_documents_org_idx on public.organizer_documents (organizer_id);
alter table public.organizer_applications enable row level security;
alter table public.organizer_documents enable row level security;
revoke all on public.organizer_applications, public.organizer_documents from anon, authenticated;

create function public.org_register(p_actor uuid, p_data jsonb, p_docs jsonb default '[]') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare oid uuid; d jsonb; n int; nm text := btrim(coalesce(p_data->>'name', '')); siret text := regexp_replace(coalesce(p_data->>'siret', ''), '\s', '', 'g');
  ref text;
begin
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'FORBIDDEN'; end if;
  if char_length(nm) < 1 or char_length(nm) > 120 then raise exception 'NAME_REQUIRED'; end if;
  if siret <> '' and siret !~ '^[0-9]{14}$' then raise exception 'BAD_SIRET'; end if;
  if coalesce(p_data->>'legal_form', '') not in ('association', 'sas', 'sarl', 'micro', 'autre') then raise exception 'BAD_LEGAL_FORM'; end if;
  if coalesce(p_data->>'contact_email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_data->>'contact_email') > 254 then raise exception 'BAD_EMAIL'; end if;
  if jsonb_typeof(p_docs) <> 'array' or jsonb_array_length(p_docs) > 6 then raise exception 'BAD_DOCS'; end if;
  if not exists (select 1 from jsonb_array_elements(p_docs) x where x->>'kind' = 'identity') then raise exception 'IDENTITY_REQUIRED'; end if;
  -- anti-abus : 3 dossiers en attente au maximum par personne
  select count(*) into n from public.organizers o join public.organizer_members m on m.organizer_id = o.id and m.user_id = p_actor and m.role = 'owner' where o.account_status = 'pending';
  if n >= 3 then raise exception 'TOO_MANY_PENDING'; end if;
  insert into public.organizers (name, legal_form, siret, responsible_name, address, contact_email)
  values (nm, p_data->>'legal_form', siret, left(btrim(coalesce(p_data->>'responsible_first', '') || ' ' || coalesce(p_data->>'responsible_last', '')), 120),
          left(btrim(coalesce(p_data->>'address', '') || ' ' || coalesce(p_data->>'postal_code', '') || ' ' || coalesce(p_data->>'city', '')), 250), p_data->>'contact_email')
  returning id into oid;
  insert into public.organizer_members (organizer_id, user_id, role) values (oid, p_actor, 'owner');
  insert into public.organizer_applications (organizer_id, data, submitted_by) values (oid, p_data - 'password', p_actor);
  for d in select * from jsonb_array_elements(p_docs) loop
    insert into public.organizer_documents (organizer_id, kind, path, name, size, mime, uploaded_by)
    values (oid, d->>'kind', d->>'path', left(d->>'name', 120), (d->>'size')::int, d->>'mime', p_actor);
  end loop;
  perform public._audit(p_actor, 'organizer.register', 'organizer', oid::text, null, jsonb_build_object('name', nm, 'documents', jsonb_array_length(p_docs)));
  select reference into ref from public.organizers where id = oid;
  return jsonb_build_object('id', oid, 'reference', ref, 'status', 'pending');
end $$;

create function public.admin_org_dossier(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  return jsonb_build_object(
    'application', (select jsonb_build_object('data', a.data, 'submitted_at', a.submitted_at) from public.organizer_applications a where a.organizer_id = p_org),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'name', d.name, 'size', d.size, 'mime', d.mime, 'created_at', d.created_at) order by d.created_at) from public.organizer_documents d where d.organizer_id = p_org), '[]'::jsonb));
end $$;

-- Chemin d'une pièce : réservé aux admins ; chaque consultation est écrite dans le journal
create function public.admin_org_document(p_actor uuid, p_doc uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare d public.organizer_documents;
begin
  perform public._assert_admin(p_actor);
  select * into d from public.organizer_documents where id = p_doc;
  if not found then raise exception 'DOC_NOT_FOUND'; end if;
  perform public._audit(p_actor, 'organizer.document_view', 'organizer', d.organizer_id::text, null, jsonb_build_object('document', d.id, 'kind', d.kind));
  return jsonb_build_object('path', d.path, 'name', d.name, 'mime', d.mime);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_register', 'admin_org_dossier', 'admin_org_document')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
