-- =====================================================================
-- Migration 018 — administrateurs multiples, gestion des organisateurs, transfert d'évènement (Phase 5)
--
--  * admin_accounts : niveau (super / admin), actif, changement de mot de passe obligatoire, invitation (envoyée / non envoyée),
--    verrouillage temporaire après 5 échecs, option A2F prête (mfa_required, non imposée). Les admins existants deviennent « super ».
--    Aucun mot de passe n'est stocké ici : Supabase Auth les gère (hachés).
--  * Désactiver un admin = repasser son profil en « customer » (aucune suppression) ; la référence ADM reste.
--  * admin_organizer_detail / admin_update_organizer_contact / admin_all_events : vue d'ensemble pour les admins.
--  * admin_transfer_preview / admin_transfer_event : transfert atomique d'un évènement vers une autre organisation (commandes, billets, QR, historique intacts).
-- Additive.
-- =====================================================================

create table public.admin_accounts (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  level               text not null default 'admin' check (level in ('super', 'admin')),
  active              boolean not null default true,
  must_change_password boolean not null default true,
  mfa_required        boolean not null default false,
  invitation_status   text not null default 'pending' check (invitation_status in ('pending', 'sent', 'failed')),
  invitation_error    text not null default '' check (char_length(invitation_error) <= 200),
  failed_attempts     int not null default 0,
  locked_until        timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);
alter table public.admin_accounts enable row level security;
revoke all on public.admin_accounts from anon, authenticated;

-- Les admins déjà en place = super-admins, sans changement de mot de passe imposé.
insert into public.admin_accounts (user_id, level, must_change_password, invitation_status)
select id, 'super', false, 'sent' from public.profiles where role = 'admin' on conflict do nothing;

create function public._assert_super(p_actor uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  if not exists (select 1 from public.admin_accounts where user_id = p_actor and level = 'super' and active) then raise exception 'FORBIDDEN'; end if;
end $$;

create function public.admin_accounts_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_super(p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'reference', p.admin_reference, 'level', a.level, 'active', a.active, 'first_name', p.first_name, 'last_name', p.last_name,
            'email', u.email, 'phone', p.phone, 'invitation_status', a.invitation_status, 'invitation_error', a.invitation_error, 'must_change_password', a.must_change_password,
            'locked', a.locked_until is not null and a.locked_until > now(), 'created_at', a.created_at) order by a.created_at)
          from public.admin_accounts a join public.profiles p on p.id = a.user_id join auth.users u on u.id = a.user_id), '[]'::jsonb);
end $$;

-- Enregistre un compte auth déjà créé côté serveur (le mot de passe n'apparaît jamais ici)
create function public.admin_account_register(p_actor uuid, p_user uuid, p_level text, p_first text, p_last text, p_phone text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ref text;
begin
  perform public._assert_super(p_actor);
  if p_level not in ('super', 'admin') then raise exception 'BAD_LEVEL'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  update public.profiles set role = 'admin', first_name = left(coalesce(p_first, ''), 60), last_name = left(coalesce(p_last, ''), 60), phone = left(coalesce(p_phone, ''), 30) where id = p_user returning admin_reference into ref;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.admin_accounts (user_id, level, created_by) values (p_user, p_level, p_actor)
  on conflict (user_id) do update set level = excluded.level, active = true, must_change_password = true, invitation_status = 'pending';
  perform public._audit(p_actor, 'admin.create', 'profile', p_user::text, null, jsonb_build_object('level', p_level, 'reference', ref));
  return ref;
end $$;

create function public.admin_account_set(p_actor uuid, p_user uuid, p_active boolean) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_super(p_actor);
  if p_user = p_actor then raise exception 'SELF_FORBIDDEN'; end if;
  if not exists (select 1 from public.admin_accounts where user_id = p_user) then raise exception 'USER_NOT_FOUND'; end if;
  if not p_active and (select level from public.admin_accounts where user_id = p_user) = 'super'
     and (select count(*) from public.admin_accounts where level = 'super' and active) <= 1 then raise exception 'LAST_SUPER'; end if;
  update public.admin_accounts set active = p_active, failed_attempts = 0, locked_until = null where user_id = p_user;
  update public.profiles set role = case when p_active then 'admin' else 'customer' end where id = p_user;
  perform public._audit(p_actor, case when p_active then 'admin.enable' else 'admin.disable' end, 'profile', p_user::text, null, '{}'::jsonb);
end $$;

create function public.admin_account_reset(p_actor uuid, p_user uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_super(p_actor);
  update public.admin_accounts set must_change_password = true, invitation_status = 'pending', failed_attempts = 0, locked_until = null where user_id = p_user;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public._audit(p_actor, 'admin.reset_password', 'profile', p_user::text, null, '{}'::jsonb);
end $$;

create function public.admin_account_activity(p_actor uuid, p_user uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_super(p_actor);
  return coalesce((select jsonb_agg(x) from (select created_at, action, entity, entity_id from public.audit_log where actor_id = p_user order by id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) x), '[]'::jsonb);
end $$;

-- Appelées par le serveur (jamais par le navigateur) : suivi de l'invitation, mot de passe changé, tentatives de connexion
create function public.admin_mark_invitation(p_user uuid, p_status text, p_error text default '') returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.admin_accounts set invitation_status = p_status, invitation_error = left(coalesce(p_error, ''), 200) where user_id = p_user and p_status in ('sent', 'failed', 'pending')
$$;
create function public.admin_password_changed(p_user uuid) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.admin_accounts set must_change_password = false where user_id = p_user
$$;
create function public.admin_account_state(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('must_change_password', must_change_password, 'active', active, 'level', level, 'mfa_required', mfa_required) from public.admin_accounts where user_id = p_user), 'null'::jsonb)
$$;
-- true = compte admin verrouillé (5 échecs) : le serveur répond alors comme pour un trop grand nombre d'essais
create function public.admin_login_locked(p_email text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select a.locked_until is not null and a.locked_until > now() from public.admin_accounts a join auth.users u on u.id = a.user_id where lower(u.email) = lower(p_email)), false)
$$;
create function public.admin_login_result(p_email text, p_ok boolean) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid;
begin
  select a.user_id into uid from public.admin_accounts a join auth.users u on u.id = a.user_id where lower(u.email) = lower(p_email);
  if uid is null then return; end if;
  if p_ok then update public.admin_accounts set failed_attempts = 0, locked_until = null where user_id = uid;
  else update public.admin_accounts set failed_attempts = failed_attempts + 1, locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end where user_id = uid; end if;
end $$;

-- ---------------------------------------------------------------------
-- Organisateurs : détail, contact, tous les évènements
-- ---------------------------------------------------------------------
create function public.admin_organizer_detail(p_actor uuid, p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare o public.organizers;
begin
  perform public._assert_admin(p_actor);
  select * into o from public.organizers where id = p_org;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  return jsonb_build_object(
    'organizer', jsonb_build_object('id', o.id, 'reference', o.reference, 'name', o.name, 'legal_form', o.legal_form, 'siret', o.siret, 'address', o.address, 'contact_email', o.contact_email,
      'responsible_name', o.responsible_name, 'account_status', o.account_status, 'stripe_connected', o.stripe_account_id <> '', 'stripe_ready', o.stripe_ready, 'created_at', o.created_at),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'email', u.email, 'first_name', p.first_name, 'last_name', p.last_name)) from public.organizer_members m join auth.users u on u.id = m.user_id join public.profiles p on p.id = m.user_id where m.organizer_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('slug', e.event_slug, 'status', e.status, 'starts_at', e.starts_at, 'capacity', e.capacity,
        'sold', (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status in ('valid', 'used')),
        'revenue_cents', coalesce((select sum(greatest(x.subtotal_cents - x.refunded_cents, 0)) from public.orders x where x.ticketed_event_id = e.id and x.source = 'web' and x.status in ('paid', 'partially_refunded', 'refunded')), 0)) order by e.starts_at desc)
        from public.ticketed_events e where e.organizer_id = o.id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(x) from (select created_at, action, entity from public.audit_log where (entity = 'organizer' and entity_id = o.id::text) or (entity = 'ticketed_event' and entity_id in (select id::text from public.ticketed_events where organizer_id = o.id)) order by id desc limit 50) x), '[]'::jsonb));
end $$;

create function public.admin_update_organizer_contact(p_actor uuid, p_org uuid, p_name text, p_legal_form text, p_siret text, p_responsible text, p_address text, p_email text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old public.organizers;
begin
  perform public._assert_admin(p_actor);
  select * into old from public.organizers where id = p_org for update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'ORG_NAME_REQUIRED'; end if;
  if coalesce(p_siret, '') <> '' and p_siret !~ '^[0-9]{14}$' then raise exception 'BAD_SIRET'; end if;
  update public.organizers set name = btrim(p_name), legal_form = left(coalesce(p_legal_form, ''), 120), siret = coalesce(p_siret, ''), responsible_name = left(coalesce(p_responsible, ''), 120),
    address = left(coalesce(p_address, ''), 250), contact_email = left(coalesce(p_email, ''), 254) where id = p_org;
  perform public._audit(p_actor, 'organizer.admin_update', 'organizer', p_org::text, jsonb_build_object('name', old.name, 'siret', old.siret), jsonb_build_object('name', btrim(p_name), 'siret', coalesce(p_siret, '')));
end $$;

create function public.admin_all_events(p_actor uuid, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  if p_status is not null and p_status not in ('draft', 'published', 'closed', 'cancelled') then raise exception 'BAD_FILTER'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('slug', e.event_slug, 'status', e.status, 'starts_at', e.starts_at, 'organizer', o.name, 'organizer_reference', o.reference, 'organizer_id', o.id,
      'capacity', e.capacity, 'sold', (select count(*) from public.tickets t where t.ticketed_event_id = e.id and t.status in ('valid', 'used'))) order by e.starts_at desc)
    from public.ticketed_events e join public.organizers o on o.id = e.organizer_id where p_status is null or e.status = p_status), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Transfert d'évènement
-- ---------------------------------------------------------------------
create function public.admin_transfer_preview(p_actor uuid, p_slug text, p_to_ref text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; dest public.organizers; src public.organizers;
begin
  perform public._assert_admin(p_actor);
  select * into ev from public.ticketed_events where event_slug = p_slug;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  select * into dest from public.organizers where reference = upper(btrim(coalesce(p_to_ref, '')));
  if not found then raise exception 'DEST_NOT_FOUND'; end if;
  if dest.account_status <> 'approved' then raise exception 'DEST_NOT_APPROVED'; end if;
  if dest.id = ev.organizer_id then raise exception 'SAME_ORGANIZER'; end if;
  select * into src from public.organizers where id = ev.organizer_id;
  return jsonb_build_object('event', p_slug, 'from', jsonb_build_object('name', src.name, 'reference', src.reference, 'email', src.contact_email), 'to', jsonb_build_object('name', dest.name, 'reference', dest.reference, 'email', dest.contact_email),
    'orders', (select count(*) from public.orders where ticketed_event_id = ev.id), 'tickets', (select count(*) from public.tickets where ticketed_event_id = ev.id),
    'tiers', (select count(*) from public.ticket_tiers where ticketed_event_id = ev.id), 'sold', (select count(*) from public.tickets where ticketed_event_id = ev.id and status in ('valid', 'used')));
end $$;

-- Exécution atomique. p_confirm_ref doit être IDENTIQUE à la référence de destination (saisie explicite). Les lieux utilisés sont recopiés dans l'organisation de destination.
create function public.admin_transfer_event(p_actor uuid, p_slug text, p_to_ref text, p_confirm_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; dest public.organizers; prev uuid; pv jsonb; v record; nv uuid;
begin
  pv := public.admin_transfer_preview(p_actor, p_slug, p_to_ref);
  select * into dest from public.organizers where reference = upper(btrim(p_to_ref));
  if upper(btrim(coalesce(p_confirm_ref, ''))) <> dest.reference then raise exception 'CONFIRMATION_MISMATCH'; end if;
  select * into ev from public.ticketed_events where event_slug = p_slug for update;
  prev := ev.organizer_id;
  for v in select distinct ve.* from public.event_sessions s join public.event_venues ve on ve.id = s.venue_id where s.ticketed_event_id = ev.id and ve.organizer_id = prev loop
    insert into public.event_venues (organizer_id, name, address, postal_code, city, country, region, lat, lng, hide_address)
    values (dest.id, v.name, v.address, v.postal_code, v.city, v.country, v.region, v.lat, v.lng, v.hide_address) returning id into nv;
    update public.event_sessions set venue_id = nv where ticketed_event_id = ev.id and venue_id = v.id;
  end loop;
  update public.ticketed_events set organizer_id = dest.id, organizer_archived_at = null where id = ev.id;
  perform public._audit(p_actor, 'event.transfer', 'ticketed_event', ev.id::text, jsonb_build_object('organizer_id', prev), jsonb_build_object('organizer_id', dest.id, 'reference', dest.reference), pv);
  return pv;
end $$;


-- ---------------------------------------------------------------------
-- Recherche globale admin : référence (complète, partielle ou chiffres seuls), nom, responsable, e-mail, téléphone, SIRET, ADM., commande.
-- Réservée aux admins actifs. Renvoie l'essentiel (jamais de pièce d'identité) ; la consultation de coordonnées est journalisée (sans le texte tapé).
-- ---------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_trgm;
  create index if not exists organizers_name_trgm on public.organizers using gin (lower(name) gin_trgm_ops);
  create index if not exists organizers_email_trgm on public.organizers using gin (lower(contact_email) gin_trgm_ops);
  create index if not exists orders_email_trgm on public.orders using gin (lower(buyer_email) gin_trgm_ops);
exception when others then raise notice 'pg_trgm indisponible : recherche par balayage (volumes actuels très faibles)';
end $$;
create index if not exists organizers_name_lower_idx on public.organizers (lower(name) text_pattern_ops);
create index if not exists orders_number_idx on public.orders (order_number text_pattern_ops);

create function public.admin_global_search(p_actor uuid, p_q text, p_limit int default 8) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); like_q text; digits text; lim int := least(greatest(coalesce(p_limit, 8), 1), 20); contacts boolean; res jsonb;
begin
  perform public._assert_admin(p_actor);
  if not exists (select 1 from public.admin_accounts where user_id = p_actor and active) then raise exception 'FORBIDDEN'; end if;
  if q is null or char_length(q) < 2 then return jsonb_build_object('organizers', '[]'::jsonb, 'admins', '[]'::jsonb, 'orders', '[]'::jsonb, 'events', '[]'::jsonb); end if;
  q := left(q, 80);
  like_q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  digits := regexp_replace(q, '\D', '', 'g');
  contacts := q like '%@%' or (char_length(digits) >= 6 and digits = regexp_replace(q, '[\s.+()-]', '', 'g'));   -- e-mail ou numéro de téléphone

  select jsonb_build_object(
    'organizers', coalesce((select jsonb_agg(x) from (
        select o.id, o.reference, o.name, o.account_status, o.contact_email,
               (select ve.region from public.event_venues ve where ve.organizer_id = o.id group by ve.region order by count(*) desc limit 1) as region
          from public.organizers o
         where o.name ilike like_q or o.contact_email ilike like_q or o.responsible_name ilike like_q or (char_length(digits) >= 9 and o.siret like digits || '%')
            or (char_length(digits) >= 2 and o.reference like 'ORG.%' || digits || '%')
            or o.reference ilike like_q
            or exists (select 1 from public.organizer_members m join public.profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
                        where m.organizer_id = o.id and (p.first_name ilike like_q or p.last_name ilike like_q or (p.first_name || ' ' || p.last_name) ilike like_q or u.email ilike like_q
                              or (char_length(digits) >= 6 and regexp_replace(p.phone, '\D', '', 'g') like '%' || digits || '%')))
         order by o.created_at desc limit lim) x), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(x) from (
        select p.id as user_id, p.admin_reference as reference, p.first_name, p.last_name, a.level, a.active
          from public.admin_accounts a join public.profiles p on p.id = a.user_id join auth.users u on u.id = a.user_id
         where p.admin_reference ilike like_q or (char_length(digits) >= 2 and p.admin_reference like 'ADM.%' || digits || '%') or p.first_name ilike like_q or p.last_name ilike like_q or u.email ilike like_q
         order by a.created_at limit lim) x), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(x) from (
        select o.id, o.order_number, o.event_slug, o.status, o.buyer_last_name, o.buyer_first_name
          from public.orders o where o.order_number ilike like_q or o.buyer_email ilike like_q or o.buyer_last_name ilike like_q order by o.created_at desc limit lim) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x) from (
        select e.event_slug as slug, e.status, e.starts_at, o.name as organizer, o.id as organizer_id
          from public.ticketed_events e join public.organizers o on o.id = e.organizer_id where e.event_slug ilike like_q order by e.starts_at desc limit lim) x), '[]'::jsonb))
  into res;
  if contacts then
    insert into public.audit_log (actor_id, action, entity, entity_id, meta) values (p_actor, 'admin.search_contact', 'search', null, jsonb_build_object('kind', case when q like '%@%' then 'email' else 'phone' end));
  end if;
  return res;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_assert_super', 'admin_accounts_list', 'admin_account_register', 'admin_account_set', 'admin_account_reset', 'admin_account_activity', 'admin_mark_invitation', 'admin_password_changed',
        'admin_account_state', 'admin_login_locked', 'admin_login_result', 'admin_organizer_detail', 'admin_update_organizer_contact', 'admin_all_events', 'admin_transfer_preview', 'admin_transfer_event', 'admin_global_search')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
