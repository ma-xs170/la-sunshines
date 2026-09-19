-- =====================================================================
-- Phase 1 — Comptes clients, rôles, réglages
-- À appliquer via `npx supabase db push` ou dans le SQL Editor Supabase.
-- Ne touche à AUCUNE table existante : tout est nouveau (schéma public).
--
-- Principe de sécurité : tout est FERMÉ par défaut (RLS activée + droits
-- retirés à anon/authenticated), puis on ouvre au cas par cas. Les écritures
-- sensibles passent par des routes serveur avec la service role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitaire : mise à jour automatique de updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- profiles : 1 ligne par compte (auth.users), avec le rôle
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null default '' check (char_length(first_name) <= 60),
  last_name   text not null default '' check (char_length(last_name)  <= 60),
  phone       text not null default '' check (char_length(phone)      <= 25),
  role        text not null default 'customer'
              check (role in ('customer', 'staff', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Création automatique du profil à l'inscription.
-- Le rôle n'est JAMAIS lu dans les métadonnées : toujours 'customer'.
-- Le premier admin est attribué manuellement (voir supabase/README.md).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, phone)
  values (
    new.id,
    -- inscription par formulaire : first_name / last_name ; Google : given_name / family_name
    left(coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), new.raw_user_meta_data ->> 'given_name',  ''), 60),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'last_name',  ''), new.raw_user_meta_data ->> 'family_name', ''), 60),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 25)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Aides de rôle (security definer : lisent profiles en contournant la RLS,
-- ce qui évite toute récursion de policy). Utilisées dans les policies.
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

-- staff OU admin
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('staff', 'admin')
  )
$$;

-- ---------------------------------------------------------------------
-- app_settings : réglages modifiables sans redéployer (flag Bizouk, frais…)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value       jsonb not null,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,

  -- Validation des valeurs connues (CASE : ordre d'évaluation garanti).
  constraint app_settings_value_valid check (
    case key
      when 'ticketing_mode' then value in ('"bizouk"'::jsonb, '"native"'::jsonb)
      when 'fee_percent' then
        jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 100
      when 'fee_fixed_cents' then
        jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 5000
      else true
    end
  )
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- ticketing_mode = 'bizouk' par défaut : AUCUN changement visible tant que
-- tu n'as pas basculé en 'native' depuis l'admin.
insert into public.app_settings (key, value, is_public) values
  ('ticketing_mode',  '"bizouk"',  true),   -- 'bizouk' | 'native'
  ('fee_percent',     '0',         true),   -- frais de service acheteur (%)
  ('fee_fixed_cents', '0',         true),   -- frais de service acheteur (fixe, en centimes)
  ('terms_version',   '"2026-09"', true);   -- version des CGV acceptées à l'achat

-- ---------------------------------------------------------------------
-- RLS + droits
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.profiles, public.app_settings from anon, authenticated;

-- profiles : chacun lit SON profil (l'admin lit tout) ; modification limitée
-- à 3 colonnes → impossible de changer son propre rôle (droit de colonne).
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;

-- app_settings : lecture publique des clés is_public ; aucune écriture client.
create policy settings_public_read on public.app_settings
  for select to anon, authenticated
  using (is_public);

grant select on public.app_settings to anon, authenticated;

-- Les fonctions d'aide sont évaluées par le rôle appelant dans les policies.
revoke execute on function public.is_admin(), public.is_staff() from public;
grant execute on function public.is_admin(), public.is_staff() to anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
