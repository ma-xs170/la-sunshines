-- =====================================================================
-- Migration 010 — espace organisateur (interface) : rôles, informations légales, paiement, archivage.
--
--  * Rôles d'un membre : owner (tout), manager (tout SAUF les paramètres légaux et de paiement), staff (scan uniquement).
--    L'ancien rôle « viewer » (lecture seule) est fusionné dans « staff » : il perd la lecture des participants.
--  * organizers : compte de paiement Stripe connecté (rempli par la phase Paiements) ; l'adresse d'envoi des emails reste contact_email.
--  * ticketed_events.organizer_archived_at : archivage côté organisateur (n'affecte ni la vente ni le site public).
--  * org_list / org_update_organizer / org_archive_event ; org_events enrichi (revenus, rôle, archivage).
--  * Chaque modification est écrite dans audit_log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rôles
-- ---------------------------------------------------------------------
alter table public.organizer_members drop constraint organizer_members_role_check;
update public.organizer_members set role = 'staff' where role = 'viewer';
alter table public.organizer_members
  add constraint organizer_members_role_check check (role in ('owner', 'manager', 'staff')),
  alter column role set default 'staff';

-- ---------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------
alter table public.organizers
  add column stripe_account_id text not null default '' check (stripe_account_id = '' or stripe_account_id ~ '^acct_[A-Za-z0-9]{6,64}$'),
  add column stripe_ready      boolean not null default false;   -- vrai quand Stripe a validé le compte (charges + versements actifs)
alter table public.ticketed_events add column organizer_archived_at timestamptz;

-- ---------------------------------------------------------------------
-- Contrôle d'accès
--   'read' / 'manage' : admin, owner, manager    'owner' : admin, owner    'scan' : tout membre (staff compris)
-- ---------------------------------------------------------------------
create or replace function public._org_access(p_actor uuid, p_slug text, p_need text) returns public.ticketed_events
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; r text;
begin
  select * into ev from public.ticketed_events where event_slug = p_slug;
  if not found then
    if exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'EVENT_NOT_FOUND'; end if;
    raise exception 'FORBIDDEN';
  end if;
  r := public._org_role(p_actor, ev.organizer_id);
  if r is null
     or (p_need in ('read', 'manage') and r not in ('admin', 'owner', 'manager'))
     or (p_need = 'owner' and r not in ('admin', 'owner')) then
    raise exception 'FORBIDDEN';
  end if;
  return ev;
end $$;

-- La RLS « navigateur » : le staff ne lit plus les commandes, billets ni messages (il ne fait que scanner).
create or replace function public.is_org_member_of_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.ticketed_events e
    join public.organizer_members m on m.organizer_id = e.organizer_id
    where e.id = p_event and m.user_id = (select auth.uid()) and m.role in ('owner', 'manager')
  )
$$;
drop policy organizers_member_read on public.organizers;
create policy organizers_member_read on public.organizers for select to authenticated
  using (public.is_admin() or exists (select 1 from public.organizer_members m
         where m.organizer_id = id and m.user_id = (select auth.uid()) and m.role in ('owner', 'manager')));

-- ---------------------------------------------------------------------
-- Organisations de l'acteur (sélecteur d'organisation + case « informations légales »)
-- Le staff ne reçoit que le nom : ni informations légales ni compte de paiement.
-- ---------------------------------------------------------------------
create function public.org_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare is_adm boolean;
begin
  is_adm := exists (select 1 from public.profiles where id = p_actor and role = 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'my_role', case when is_adm then 'admin' else m.role end,
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

-- Informations légales et adresse d'envoi : owner / admin uniquement. Ces champs alimentent le bloc « organisateur » du billet PDF.
create function public.org_update_organizer(p_actor uuid, p_org uuid, p_name text, p_legal_form text, p_siret text,
                                            p_responsible text, p_address text, p_contact_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r text; old public.organizers; v_siret text; v_mail text;
begin
  r := public._org_role(p_actor, p_org);
  if r is null or r not in ('admin', 'owner') then raise exception 'FORBIDDEN'; end if;
  select * into old from public.organizers where id = p_org for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  v_siret := regexp_replace(coalesce(p_siret, ''), '\s', '', 'g');
  v_mail := lower(btrim(coalesce(p_contact_email, '')));
  if char_length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'ORG_NAME_REQUIRED'; end if;
  if v_siret <> '' and v_siret !~ '^[0-9]{14}$' then raise exception 'BAD_SIRET'; end if;
  if v_mail <> '' and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'BAD_EMAIL'; end if;
  update public.organizers
     set name = btrim(p_name), legal_form = btrim(coalesce(p_legal_form, '')), siret = v_siret,
         responsible_name = btrim(coalesce(p_responsible, '')), address = btrim(coalesce(p_address, '')), contact_email = v_mail
   where id = p_org;
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after, meta)
  values (p_actor, 'organizer.legal_update', 'organizer', p_org::text,
          jsonb_build_object('name', old.name, 'siret', old.siret, 'responsible_name', old.responsible_name, 'address', old.address, 'contact_email', old.contact_email),
          jsonb_build_object('name', btrim(p_name), 'siret', v_siret, 'responsible_name', btrim(coalesce(p_responsible, '')), 'address', btrim(coalesce(p_address, '')), 'contact_email', v_mail),
          '{}'::jsonb);
end $$;

-- Archivage d'un événement (visible dans l'onglet « Archives » ; réversible). owner / manager / admin.
create function public.org_archive_event(p_actor uuid, p_slug text, p_archived boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  update public.ticketed_events set organizer_archived_at = case when p_archived then now() else null end where id = ev.id;
  perform public._org_audit(p_actor, ev.id, case when p_archived then 'organizer.event_archive' else 'organizer.event_unarchive' end, '{}'::jsonb, 0);
end $$;

-- ---------------------------------------------------------------------
-- org_events enrichi : rôle de l'acteur, événement archivé, revenus (masqués pour le staff), horaires
-- ---------------------------------------------------------------------
create or replace function public.org_events(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare is_adm boolean;
begin
  is_adm := exists (select 1 from public.profiles where id = p_actor and role = 'admin');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', e.event_slug, 'status', e.status, 'ticketing_enabled', e.ticketing_enabled, 'starts_at', e.starts_at,
      'venue_name', e.venue_name, 'capacity', e.capacity,
      'sold', (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status in ('valid', 'used')),
      'reserved', public.event_consumed(e.id) - (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status in ('valid', 'used')),
      'entered', (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status = 'used'),
      'organizer_id', o.id, 'organizer_name', o.name,
      'my_role', case when is_adm then 'admin' else m.role end,
      'archived', e.organizer_archived_at is not null,
      'revenue_cents', case when is_adm or m.role in ('owner', 'manager') then
        coalesce((select sum(od.total_cents - od.refunded_cents) from public.orders od
                   where od.ticketed_event_id = e.id and od.source = 'web' and od.status in ('paid', 'partially_refunded', 'refunded')), 0) end
    ) order by e.starts_at desc)
    from public.ticketed_events e
    join public.organizers o on o.id = e.organizer_id
    left join public.organizer_members m on m.organizer_id = e.organizer_id and m.user_id = p_actor
    where is_adm or m.user_id is not null
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Privilèges : service_role uniquement
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('org_list', 'org_update_organizer', 'org_archive_event')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
