-- =====================================================================
-- Migration 008 — données privées des artistes / abonnés : sorties de data/content.json
-- Ce fichier est versionné dans un dépôt GitHub PUBLIC : aucun email, aucun jeton, aucune demande de
-- vérification ne doit y figurer. Tout passe par ces tables PRIVÉES : RLS activée, aucune policy, aucun droit
-- pour anon / authenticated ; seul le service_role du serveur y accède.
-- =====================================================================
create table public.artist_emails (
  artist_slug text primary key check (char_length(artist_slug) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254),
  updated_at  timestamptz not null default now()
);

create table public.artist_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  artist_slug text not null check (char_length(artist_slug) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  token       text not null unique check (char_length(token) >= 16),   -- lien de désabonnement (1 clic)
  created_at  timestamptz not null default now(),
  unique (artist_slug, email)
);
create index artist_subscriptions_artist_idx on public.artist_subscriptions (artist_slug);

-- anti-doublon : un abonné n'est prévenu qu'une fois par événement
create table public.artist_notifications (
  event_slug text not null,
  email      text not null check (email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (event_slug, email)
);

-- liens de connexion de l'espace artiste : on ne stocke que le HASH du jeton, usage unique, courte durée
create table public.artist_login_tokens (
  token_hash  text primary key check (char_length(token_hash) = 64),
  artist_slug text not null,
  expires_at  timestamptz not null,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index artist_login_tokens_slug_idx on public.artist_login_tokens (artist_slug);

-- demandes de certification (la pièce d'identité reste dans un Blob privé, supprimé dès la décision)
create table public.artist_verifications (
  id            uuid primary key default gen_random_uuid(),
  artist_slug   text not null unique check (char_length(artist_slug) between 1 and 120),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 254),
  blob_url      text not null default '',
  blob_pathname text not null default '',
  file_type     text not null default '',
  created_at    timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['artist_emails','artist_subscriptions','artist_notifications','artist_login_tokens','artist_verifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- Purge des jetons de connexion périmés (le code les purge déjà à l'émission ; ceci couvre les périodes sans activité).
create function public.purge_artist_login_tokens() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.artist_login_tokens where expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_artist_login_tokens() from public, anon, authenticated;
grant  execute on function public.purge_artist_login_tokens() to service_role;

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'purge-artist-login-tokens') then
    perform cron.unschedule('purge-artist-login-tokens');
  end if;
  perform cron.schedule('purge-artist-login-tokens', '29 3 * * *', 'select public.purge_artist_login_tokens()');
exception when others then
  raise notice 'pg_cron indisponible (%) : purge des jetons non planifiée dans la base.', sqlerrm;
end $$;
