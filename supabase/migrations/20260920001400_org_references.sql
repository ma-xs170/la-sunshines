-- =====================================================================
-- Migration 014 — références ORG.XXXXXXXX / ADM.XXXXXXXX et cycle de vie d'un compte organisateur
--
--  * organizers.reference « ORG.» + 8 chiffres : aléatoire (uuid v4 = CSPRNG, non séquentiel), index unique,
--    relance en cas de collision, IMMUABLE (trigger). Créée à l'approbation ; rétro-remplie pour les organisations existantes.
--  * profiles.admin_reference « ADM.» + 8 chiffres : même principe, attribuée quand un compte devient admin.
--  * organizers.account_status : pending (en attente) → approved (approuvé) → suspended (suspendu).
--    Les organisations existantes (THE MOUV…) passent en « approved ». Toute nouvelle organisation démarre « pending ».
--  * admin_find_organizers : recherche instantanée par référence / nom / e-mail (admins uniquement).
--  * admin_set_organizer_status : approuver / suspendre / réactiver, écrit dans audit_log.
--  * org_list renvoie aussi reference et account_status.
-- Additive et idempotente : aucune donnée supprimée.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Génération : « PREFIX.NNNNNNNN »
-- ---------------------------------------------------------------------
create or replace function public._new_reference(p_prefix text, p_table text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r text; n bigint; taken boolean; i int := 0;
begin
  if p_prefix not in ('ORG', 'ADM') then raise exception 'BAD_PREFIX'; end if;
  loop
    -- 15 hexadécimaux (60 bits) issus d'un uuid v4, réduits à 8 chiffres
    n := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::bit(60)::bigint % 100000000;
    r := p_prefix || '.' || lpad(n::text, 8, '0');
    if p_table = 'organizers' then taken := exists (select 1 from public.organizers where reference = r);
    else taken := exists (select 1 from public.profiles where admin_reference = r); end if;
    exit when not taken;
    i := i + 1;
    if i > 50 then raise exception 'REFERENCE_EXHAUSTED'; end if;
  end loop;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------
alter table public.organizers
  add column if not exists reference       text,
  add column if not exists account_status  text,
  add column if not exists approved_at     timestamptz,
  add column if not exists approved_by     uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists admin_reference text;

-- Organisations existantes : approuvées (THE MOUV et toute autre créée avant la migration).
update public.organizers set account_status = 'approved', approved_at = coalesce(approved_at, created_at) where account_status is null;
alter table public.organizers alter column account_status set default 'pending';
alter table public.organizers alter column account_status set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizers_account_status_check') then
    alter table public.organizers add constraint organizers_account_status_check check (account_status in ('pending', 'approved', 'suspended'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizers_reference_format') then
    alter table public.organizers add constraint organizers_reference_format check (reference is null or reference ~ '^ORG\.[0-9]{8}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_admin_reference_format') then
    alter table public.profiles add constraint profiles_admin_reference_format check (admin_reference is null or admin_reference ~ '^ADM\.[0-9]{8}$');
  end if;
end $$;

-- Rétro-remplissage (une par une : chaque tirage voit les précédents)
do $$
declare x record;
begin
  for x in select id from public.organizers where account_status = 'approved' and reference is null loop
    update public.organizers set reference = public._new_reference('ORG', 'organizers') where id = x.id;
  end loop;
  for x in select id from public.profiles where role = 'admin' and admin_reference is null loop
    update public.profiles set admin_reference = public._new_reference('ADM', 'profiles') where id = x.id;
  end loop;
end $$;

create unique index if not exists organizers_reference_uniq on public.organizers (reference) where reference is not null;
create unique index if not exists profiles_admin_reference_uniq on public.profiles (admin_reference) where admin_reference is not null;

-- ---------------------------------------------------------------------
-- Triggers : attribution à l'approbation / au passage admin, immuabilité
-- ---------------------------------------------------------------------
create or replace function public._organizer_ref_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.reference is not null and new.reference is distinct from old.reference then
    raise exception 'REFERENCE_IMMUTABLE';
  end if;
  if new.account_status = 'approved' and new.reference is null then
    new.reference := public._new_reference('ORG', 'organizers');
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end $$;
drop trigger if exists organizers_ref_guard on public.organizers;
create trigger organizers_ref_guard before insert or update on public.organizers
  for each row execute function public._organizer_ref_guard();

create or replace function public._profile_ref_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.admin_reference is not null and new.admin_reference is distinct from old.admin_reference then
    raise exception 'REFERENCE_IMMUTABLE';
  end if;
  if new.role = 'admin' and new.admin_reference is null then
    new.admin_reference := public._new_reference('ADM', 'profiles');
  end if;
  return new;
end $$;
drop trigger if exists profiles_ref_guard on public.profiles;
create trigger profiles_ref_guard before insert or update on public.profiles
  for each row execute function public._profile_ref_guard();

-- admin_reference suit la RLS de profiles : chacun ne lit que sa propre ligne (un admin voit donc la sienne).

-- ---------------------------------------------------------------------
-- Recherche et cycle de vie (admins)
-- ---------------------------------------------------------------------
create or replace function public.admin_find_organizers(p_actor uuid, p_q text default null, p_status text default null, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform public._assert_admin(p_actor);
  if p_status is not null and p_status not in ('pending', 'approved', 'suspended') then raise exception 'BAD_FILTER'; end if;
  if q is not null then q := replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'name', o.name, 'contact_email', o.contact_email,
      'account_status', o.account_status, 'created_at', o.created_at) order by o.created_at desc)
    from (
      select * from public.organizers o
      where (p_status is null or o.account_status = p_status)
        and (q is null or o.reference ilike q || '%' or o.name ilike '%' || q || '%' or o.contact_email ilike '%' || q || '%')
      order by o.created_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)
    ) o
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_organizer_status(p_actor uuid, p_org uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old public.organizers; cur public.organizers;
begin
  perform public._assert_admin(p_actor);
  if p_status not in ('approved', 'suspended') then raise exception 'BAD_STATUS'; end if;
  select * into old from public.organizers where id = p_org for update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if old.account_status = p_status then return jsonb_build_object('reference', old.reference, 'account_status', old.account_status, 'changed', false); end if;
  if p_status = 'suspended' and old.account_status <> 'approved' then raise exception 'BAD_TRANSITION'; end if;
  update public.organizers
     set account_status = p_status,
         approved_by = case when p_status = 'approved' then p_actor else approved_by end
   where id = p_org returning * into cur;
  perform public._audit(p_actor, 'organizer.' || case when p_status = 'approved' then 'approve' else 'suspend' end, 'organizer', p_org::text,
    jsonb_build_object('account_status', old.account_status), jsonb_build_object('account_status', cur.account_status, 'reference', cur.reference));
  return jsonb_build_object('reference', cur.reference, 'account_status', cur.account_status, 'changed', true);
end $$;

-- ---------------------------------------------------------------------
-- org_list : + référence et statut du compte
-- ---------------------------------------------------------------------
create or replace function public.org_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare is_adm boolean;
begin
  is_adm := exists (select 1 from public.profiles where id = p_actor and role = 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'my_role', case when is_adm then 'admin' else m.role end,
      'reference',        o.reference,
      'account_status',   o.account_status,
      'legal_form',       case when is_adm or m.role in ('owner', 'manager') then o.legal_form end,
      'siret',            case when is_adm or m.role in ('owner', 'manager') then o.siret end,
      'responsible_name', case when is_adm or m.role in ('owner', 'manager') then o.responsible_name end,
      'address',          case when is_adm or m.role in ('owner', 'manager') then o.address end,
      'contact_email',    case when is_adm or m.role in ('owner', 'manager') then o.contact_email end,
      'stripe_connected', case when is_adm or m.role in ('owner', 'manager') then o.stripe_account_id <> '' end,
      'stripe_ready',     case when is_adm or m.role in ('owner', 'manager') then o.stripe_ready end
    ) order by o.is_default desc, o.name)
    from public.organizers o
    left join public.organizer_members m on m.organizer_id = o.id and m.user_id = p_actor
    where is_adm or m.user_id is not null
  ), '[]'::jsonb);
end $$;

-- Droits : fonctions serveur uniquement
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_new_reference', '_organizer_ref_guard', '_profile_ref_guard', 'admin_find_organizers', 'admin_set_organizer_status', 'org_list')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
