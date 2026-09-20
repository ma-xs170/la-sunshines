-- =====================================================================
-- Migration 007 — demandes de support de l'assistant du site
-- Jusqu'ici ces demandes (nom, email, téléphone, message) étaient écrites dans data/content.json, un fichier
-- versionné dans un dépôt GitHub public : impossible à supprimer réellement. Elles vont désormais dans cette table
-- PRIVÉE (RLS activée, aucun droit pour anon / authenticated ; seul le service_role du serveur y accède),
-- avec une purge à 12 mois.
-- =====================================================================
create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name)    between 1 and 120),
  email      text not null check (char_length(email)   between 3 and 254),
  phone      text not null default '' check (char_length(phone) <= 40),
  subject    text not null check (char_length(subject) between 1 and 160),
  message    text not null check (char_length(message) between 1 and 4000),
  status     text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index support_tickets_created_idx on public.support_tickets (created_at);

alter table public.support_tickets enable row level security;
-- aucune policy : ni anon ni authenticated ne lisent ni n'écrivent ; le service_role contourne la RLS.
revoke all on table public.support_tickets from public, anon, authenticated;
grant all on table public.support_tickets to service_role;

-- Supprime les demandes plus anciennes que p_days jours (minimum 30 pour éviter un effacement massif par erreur).
create function public.purge_support_tickets(p_days int default 365) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_days is null or p_days < 30 then raise exception 'PURGE_TOO_SHORT'; end if;
  delete from public.support_tickets where created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_support_tickets(int) from public, anon, authenticated;
grant  execute on function public.purge_support_tickets(int) to service_role;

-- Purge quotidienne (03:17 UTC) avec pg_cron si l'extension est disponible ; sinon simple avis :
-- l'application purge alors à chaque nouvelle demande et à chaque ouverture du panneau « Tickets ».
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'purge-support-tickets') then
    perform cron.unschedule('purge-support-tickets');
  end if;
  perform cron.schedule('purge-support-tickets', '17 3 * * *', 'select public.purge_support_tickets(365)');
exception when others then
  raise notice 'pg_cron indisponible (%) : purge quotidienne non planifiée dans la base.', sqlerrm;
end $$;
