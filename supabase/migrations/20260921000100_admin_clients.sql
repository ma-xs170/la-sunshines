-- =====================================================================
-- Migration 027 — page super-admin « Clients » : consulter et modifier tous les comptes clients
--
--  * profiles : e-mail (copie synchronisée depuis auth.users), 2e téléphone, date de naissance, statut du compte
--    (active / suspended / anonymized) + motif, date d'anonymisation, colonne de recherche normalisée.
--  * admin_accounts.permissions : « clients.lire » / « clients.modifier », accordées par le super-admin (vides par défaut).
--  * Recherche : norm_text (sans accents ni casse) + phone_key (0690…, +590 690… se retrouvent) + index trigramme.
--  * Fonctions SECURITY DEFINER (service_role seul) qui revérifient le rôle À CHAQUE appel :
--      admin_list_customers, admin_customer_detail, admin_customer_update (+ contrôle préalable), admin_customer_set_status,
--      admin_customer_revoke_sessions, admin_customer_anonymize, admin_customer_export, admin_customers_export, admin_customer_log,
--      admin_account_set_permissions (+ admin_accounts_list enrichie).
--  * Chaque consultation de fiche (1 entrée / admin / compte / 10 min), modification, export est écrit dans audit_log (entity « customer »).
--  * Colonnes sensibles de profiles retirées du SELECT direct de « authenticated » : un admin délégué ne peut pas les lire en contournant l'application.
-- ADDITIVE : aucune colonne ni donnée existante n'est modifiée ou supprimée.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitaires de recherche (purs, IMMUTABLE : utilisables dans un index)
-- ---------------------------------------------------------------------
create or replace function public.norm_text(t text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select btrim(regexp_replace(lower(translate(replace(replace(replace(replace(coalesce(t, ''), 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE'),
    'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝýÿ',
    'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyy')), '\s+', ' ', 'g'))
$$;

-- Clé de téléphone : 9 derniers chiffres (0690 12 34 56 et +590 690 12 34 56 donnent la même clé) ; numéro partiel : zéros de tête retirés.
create or replace function public.phone_key(t text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select case when char_length(d) >= 9 then right(d, 9) else ltrim(d, '0') end
    from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

-- ---------------------------------------------------------------------
-- Colonnes
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists email          text not null default '',
  add column if not exists phone2         text not null default '' check (char_length(phone2) <= 25),
  add column if not exists birth_date     date,
  add column if not exists account_status text not null default 'active' check (account_status in ('active', 'suspended', 'anonymized')),
  add column if not exists status_reason  text not null default '' check (char_length(status_reason) <= 300),
  add column if not exists anonymized_at  timestamptz,
  add column if not exists search_text    text not null default '';

alter table public.admin_accounts add column if not exists permissions text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_accounts_permissions_valid') then
    alter table public.admin_accounts add constraint admin_accounts_permissions_valid check (permissions <@ array['clients.lire', 'clients.modifier']::text[]);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Colonne de recherche + synchronisation de l'e-mail
-- ---------------------------------------------------------------------
create or replace function public._profile_search_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.search_text := public.norm_text(new.first_name || ' ' || new.last_name || ' ' || new.email)
    || ' cli.' || left(replace(new.id::text, '-', ''), 10)
    || case when public.phone_key(new.phone)  <> '' then ' p:' || public.phone_key(new.phone)  else '' end
    || case when public.phone_key(new.phone2) <> '' then ' p:' || public.phone_key(new.phone2) else '' end;
  return new;
end $$;
drop trigger if exists profiles_search_guard on public.profiles;
create trigger profiles_search_guard before insert or update on public.profiles
  for each row execute function public._profile_search_guard();

-- Inscription : l'e-mail est copié dans le profil
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, email)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), new.raw_user_meta_data ->> 'given_name',  ''), 60),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'last_name',  ''), new.raw_user_meta_data ->> 'family_name', ''), 60),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 25),
    left(coalesce(new.email, ''), 254)
  );
  return new;
end $$;

-- Changement d'e-mail côté Auth → profil (jamais pour un compte anonymisé)
create or replace function public._sync_profile_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.profiles set email = left(coalesce(new.email, ''), 254) where id = new.id and account_status <> 'anonymized' and email is distinct from left(coalesce(new.email, ''), 254);
  return new;
end $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public._sync_profile_email();

-- Reprise de l'existant (sans toucher à updated_at : ce n'est pas une modification du client)
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles p set email = left(coalesce(u.email, ''), 254) from auth.users u where u.id = p.id and p.email = '';
update public.profiles set search_text = '' where search_text = '';   -- déclenche profiles_search_guard sur toutes les lignes
alter table public.profiles enable trigger profiles_set_updated_at;

create unique index if not exists profiles_email_uniq on public.profiles (lower(email)) where email <> '';
create index if not exists profiles_created_idx on public.profiles (created_at desc, id);
create index if not exists profiles_lastname_idx on public.profiles (public.norm_text(last_name), public.norm_text(first_name), id);
create index if not exists orders_user_status_idx on public.orders (user_id, status);
do $$ begin
  create extension if not exists pg_trgm;
  create index if not exists profiles_search_trgm on public.profiles using gin (search_text gin_trgm_ops);
exception when others then raise notice 'pg_trgm indisponible : recherche par balayage (à surveiller au-delà de quelques milliers de comptes)';
end $$;

-- Colonnes lisibles en direct par « authenticated » (chacun sa ligne, l'admin toutes) : seules les colonnes non sensibles.
-- E-mail, 2e téléphone, date de naissance, motifs et texte de recherche ne passent QUE par les fonctions ci-dessous.
revoke select on public.profiles from authenticated;
grant select (id, first_name, last_name, phone, role, created_at, updated_at, admin_reference, account_status) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Contrôles d'accès (refaits à chaque appel)
-- ---------------------------------------------------------------------
-- p_perm : 'lire' (clients.lire ou clients.modifier) | 'modifier' (clients.modifier). Le super-admin actif a tout.
create or replace function public._assert_clients(p_actor uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  if not exists (
    select 1 from public.admin_accounts a
     where a.user_id = p_actor and a.active
       and (a.level = 'super'
            or (p_perm = 'lire'     and a.permissions && array['clients.lire', 'clients.modifier']::text[])
            or (p_perm = 'modifier' and 'clients.modifier' = any(a.permissions)))
  ) then raise exception 'FORBIDDEN'; end if;
end $$;

-- Un admin délégué ne touche pas aux comptes administrateurs : réservé au super-admin.
create or replace function public._assert_customer_target(p_actor uuid, p_role text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_role = 'admin' and not exists (select 1 from public.admin_accounts where user_id = p_actor and level = 'super' and active) then raise exception 'FORBIDDEN'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Permissions déléguées (super-admin uniquement) + liste des admins enrichie
-- ---------------------------------------------------------------------
create or replace function public.admin_account_set_permissions(p_actor uuid, p_user uuid, p_permissions text[]) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old text[];
begin
  perform public._assert_super(p_actor);
  p_permissions := coalesce(p_permissions, '{}');
  if not (p_permissions <@ array['clients.lire', 'clients.modifier']::text[]) then raise exception 'BAD_PERMISSION'; end if;
  select permissions into old from public.admin_accounts where user_id = p_user for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  p_permissions := (select coalesce(array_agg(distinct x order by x), '{}') from unnest(p_permissions) x);
  update public.admin_accounts set permissions = p_permissions where user_id = p_user;
  perform public._audit(p_actor, 'admin.permissions', 'profile', p_user::text, jsonb_build_object('permissions', old), jsonb_build_object('permissions', p_permissions));
end $$;

create or replace function public.admin_accounts_list(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_super(p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'reference', p.admin_reference, 'level', a.level, 'active', a.active, 'first_name', p.first_name, 'last_name', p.last_name,
            'email', u.email, 'phone', p.phone, 'invitation_status', a.invitation_status, 'invitation_error', a.invitation_error, 'must_change_password', a.must_change_password,
            'locked', a.locked_until is not null and a.locked_until > now(), 'created_at', a.created_at, 'permissions', to_jsonb(a.permissions)) order by a.created_at)
          from public.admin_accounts a join public.profiles p on p.id = a.user_id join auth.users u on u.id = a.user_id), '[]'::jsonb);
end $$;

-- Droits de l'admin connecté (pour le menu et les pages) : aucun droit direct sur admin_accounts côté navigateur.
create or replace function public.admin_clients_access(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object('super', a.level = 'super', 'lire', a.level = 'super' or a.permissions && array['clients.lire', 'clients.modifier']::text[],
            'modifier', a.level = 'super' or 'clients.modifier' = any(a.permissions))
       from public.admin_accounts a join public.profiles p on p.id = a.user_id where a.user_id = p_user and a.active and p.role = 'admin'),
     jsonb_build_object('super', false, 'lire', false, 'modifier', false))
$$;

-- ---------------------------------------------------------------------
-- Filtre de la liste (texte du WHERE, valeurs toujours échappées par %L)
-- ---------------------------------------------------------------------
create or replace function public._customers_where(p_q text, p_role text, p_status text, p_upcoming boolean, p_minors boolean) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare w text[] := array['true']; nq text; tok text; n int := 0; esc text; d text; whole_d text; conds text[] := '{}'; textcond text; refcond text := ''; digits text;
begin
  case coalesce(nullif(p_role, ''), 'customers')
    when 'customers'  then w := array_append(w, 'p.role <> ''admin'' and not exists (select 1 from public.organizer_members m where m.user_id = p.id)');
    when 'organizers' then w := array_append(w, 'exists (select 1 from public.organizer_members m where m.user_id = p.id)');
    when 'admins'     then w := array_append(w, 'p.role = ''admin''');
    when 'all'        then null;
    else raise exception 'BAD_FILTER';
  end case;
  if nullif(p_status, '') is not null then
    if p_status not in ('active', 'suspended', 'anonymized') then raise exception 'BAD_FILTER'; end if;
    w := array_append(w, format('p.account_status = %L', p_status));
  end if;
  if coalesce(p_upcoming, false) then
    w := array_append(w, 'exists (select 1 from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id where o.user_id = p.id and o.status in (''paid'', ''partially_refunded'') and e.starts_at >= now())');
  end if;
  if coalesce(p_minors, false) then w := array_append(w, 'p.birth_date is not null and p.birth_date > (current_date - interval ''18 years'')::date'); end if;

  nq := public.norm_text(left(coalesce(p_q, ''), 80));
  if char_length(nq) >= 2 then
    whole_d := regexp_replace(nq, '\D', '', 'g');
    if nq ~ '^[+0-9 ().-]+$' and char_length(whole_d) >= 4 then
      -- numéro de téléphone (éventuellement partiel) : indicatif retiré s'il est saisi avec + ou 00
      digits := whole_d;
      if nq ~ '^(\+|00)' then
        digits := regexp_replace(regexp_replace(digits, '^00', ''), '^(590|596|594|262|33|681|687|689|508)', '');
      end if;
      esc := replace(replace(replace(nq, '\', '\\'), '%', '\%'), '_', '\_');
      textcond := format('(p.search_text like %L or p.search_text like %L)', '% p:' || public.phone_key(digits) || '%', '%' || esc || '%');
    else
      foreach tok in array string_to_array(nq, ' ') loop
        continue when tok = '';
        n := n + 1; exit when n > 5;
        esc := replace(replace(replace(tok, '\', '\\'), '%', '\%'), '_', '\_');
        d := regexp_replace(tok, '\D', '', 'g');
        if tok ~ '^[+0-9().-]+$' and char_length(d) >= 3 then
          conds := conds || format('(p.search_text like %L or p.search_text like %L)', '%' || esc || '%', '% p:' || public.phone_key(d) || '%');
        else
          conds := conds || format('p.search_text like %L', '%' || esc || '%');
        end if;
      end loop;
      textcond := '(' || array_to_string(conds, ' and ') || ')';
    end if;
    -- références de commande (SUN-001042) et de billet (LS-ABC234)
    if nq ~ '^(sun|ls)-?[a-z0-9]{2,}$' then
      esc := replace(replace(replace(upper(nq), '\', '\\'), '%', '\%'), '_', '\_');
      d := regexp_replace(nq, '\D', '', 'g');
      refcond := format(' or exists (select 1 from public.orders o where o.user_id = p.id and (upper(o.order_number) like %L%s))'
                        || ' or exists (select 1 from public.tickets t where t.user_id = p.id and upper(t.reference) like %L)',
                        esc || '%', case when nq ~ '^sun-?[0-9]+$' and d <> '' and char_length(d) <= 6 then format(' or o.order_number = %L', 'SUN-' || lpad(d, 6, '0')) else '' end,
                        esc || '%');
    end if;
    w := array_append(w, '(' || textcond || refcond || ')');
  end if;
  return array_to_string(w, ' and ');
end $$;

-- ---------------------------------------------------------------------
-- Liste paginée (recherche, filtres, tri et total faits ICI, jamais dans le navigateur)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_customers(p_actor uuid, p_q text default null, p_role text default 'customers', p_status text default null,
  p_upcoming boolean default false, p_minors boolean default false, p_sort text default 'inscription', p_dir text default 'desc', p_page int default 1, p_page_size int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare w text; ord text; dir text; lim int := least(greatest(coalesce(p_page_size, 20), 1), 100); pg int := greatest(coalesce(p_page, 1), 1); total bigint; rows_json jsonb;
begin
  perform public._assert_clients(p_actor, 'lire');
  if coalesce(p_sort, 'inscription') not in ('nom', 'inscription', 'age') or coalesce(p_dir, 'desc') not in ('asc', 'desc') then raise exception 'BAD_FILTER'; end if;
  dir := coalesce(p_dir, 'desc');
  ord := case coalesce(p_sort, 'inscription')
    when 'nom' then format('public.norm_text(p.last_name) %1$s, public.norm_text(p.first_name) %1$s, p.id', dir)
    when 'age' then format('p.birth_date %s nulls last, p.id', case when dir = 'asc' then 'desc' else 'asc' end)   -- âge croissant = naissance récente d'abord
    else format('p.created_at %s, p.id', dir) end;
  w := public._customers_where(p_q, p_role, p_status, p_upcoming, p_minors);
  if not exists (select 1 from public.admin_accounts where user_id = p_actor and level = 'super' and active) then w := w || ' and p.role <> ''admin'''; end if;   -- un admin délégué ne voit pas les comptes administrateurs
  execute format('select count(*) from public.profiles p where %s', w) into total;
  execute format($f$
    with page as (select p.id, p.first_name, p.last_name, p.email, p.phone, p.phone2, p.birth_date, p.account_status, p.role, p.created_at, row_number() over (order by %s) as rn
                    from public.profiles p where %s order by %s limit %s offset %s)
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'reference', 'CLI.' || upper(left(replace(g.id::text, '-', ''), 10)), 'first_name', g.first_name, 'last_name', g.last_name, 'email', g.email, 'phone', g.phone, 'phone2', g.phone2,
        'birth_date', g.birth_date, 'age', case when g.birth_date is null then null else date_part('year', age(current_date, g.birth_date))::int end,
        'is_minor', g.birth_date is not null and g.birth_date > (current_date - interval '18 years')::date,
        'status', g.account_status, 'role', g.role, 'created_at', g.created_at,
        'upcoming', (select count(distinct o.ticketed_event_id) from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id where o.user_id = g.id and o.status in ('paid', 'partially_refunded') and e.starts_at >= now()),
        'past',     (select count(distinct o.ticketed_event_id) from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id where o.user_id = g.id and o.status in ('paid', 'partially_refunded') and e.starts_at <  now())
      ) order by g.rn), '[]'::jsonb) from page g$f$, ord, w, ord, lim, (pg - 1) * lim) into rows_json;
  return jsonb_build_object('total', total, 'page', pg, 'page_size', lim, 'rows', rows_json);
end $$;

-- ---------------------------------------------------------------------
-- Fiche : tout ce qu'on sait du compte. La consultation est journalisée (1 entrée / admin / compte / 10 min).
-- ---------------------------------------------------------------------
create or replace function public.admin_customer_detail(p_actor uuid, p_id uuid, p_log boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.profiles; u record; can_mod boolean; is_sup boolean;
begin
  perform public._assert_clients(p_actor, 'lire');
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public._assert_customer_target(p_actor, p.role);
  select au.email, au.created_at, au.last_sign_in_at, au.banned_until into u from auth.users au where au.id = p_id;
  is_sup := exists (select 1 from public.admin_accounts where user_id = p_actor and level = 'super' and active);
  can_mod := is_sup or exists (select 1 from public.admin_accounts where user_id = p_actor and active and 'clients.modifier' = any(permissions));
  if coalesce(p_log, true) and not exists (select 1 from public.audit_log where actor_id = p_actor and action = 'customer.view' and entity_id = p_id::text and created_at > now() - interval '10 minutes') then
    perform public._audit(p_actor, 'customer.view', 'customer', p_id::text, null, null, jsonb_build_object('minor', p.birth_date is not null and p.birth_date > (current_date - interval '18 years')::date));
  end if;
  return jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'reference', 'CLI.' || upper(left(replace(p.id::text, '-', ''), 10)), 'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'phone', p.phone, 'phone2', p.phone2,
      'birth_date', p.birth_date, 'age', case when p.birth_date is null then null else date_part('year', age(current_date, p.birth_date))::int end,
      'is_minor', p.birth_date is not null and p.birth_date > (current_date - interval '18 years')::date, 'role', p.role, 'status', p.account_status, 'status_reason', p.status_reason,
      'created_at', coalesce(u.created_at, p.created_at), 'updated_at', p.updated_at, 'last_sign_in_at', u.last_sign_in_at, 'anonymized_at', p.anonymized_at),
    'access', jsonb_build_object('super', is_sup, 'modifier', can_mod),
    'organizations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'reference', o.reference, 'role', m.role)) from public.organizer_members m join public.organizers o on o.id = m.organizer_id where m.user_id = p_id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(x order by (x ->> 'created_at') desc) from (
        select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'source', o.source, 'event_slug', o.event_slug,
          'event_title', coalesce((select oi.event_title from public.order_items oi where oi.order_id = o.id order by oi.tier_name limit 1), o.event_slug),
          'starts_at', e.starts_at, 'total_cents', o.total_cents, 'refunded_cents', o.refunded_cents, 'paid_at', o.paid_at, 'created_at', o.created_at,
          'guardian_consent_at', o.guardian_consent_at, 'terms_accepted_at', o.terms_accepted_at, 'terms_version', o.terms_version,
          'items', coalesce((select jsonb_agg(jsonb_build_object('tier_name', oi.tier_name, 'quantity', oi.quantity, 'unit_price_cents', oi.unit_price_cents) order by oi.tier_name) from public.order_items oi where oi.order_id = o.id), '[]'::jsonb),
          'tickets', coalesce((select jsonb_agg(jsonb_build_object('reference', t.reference, 'status', t.status, 'tier_name', ti.name, 'holder', btrim(t.holder_first_name || ' ' || t.holder_last_name)) order by t.created_at) from public.tickets t join public.ticket_tiers ti on ti.id = t.tier_id where t.order_id = o.id), '[]'::jsonb),
          'consents', coalesce((select jsonb_agg(jsonb_build_object('key', c.consent_key, 'label', c.label, 'accepted', c.accepted, 'at', c.created_at) order by c.id) from public.order_consents c where c.order_id = o.id), '[]'::jsonb)) as x
          from public.orders o join public.ticketed_events e on e.id = o.ticketed_event_id where o.user_id = p_id order by o.created_at desc limit 200) s), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(x) from (
        select a.id, a.created_at, a.action, a.actor_id, nullif(btrim(pa.first_name || ' ' || pa.last_name), '') as actor_name, a.meta ->> 'reason' as reason, a.before, a.after, a.meta
          from public.audit_log a left join public.profiles pa on pa.id = a.actor_id where a.entity = 'customer' and a.entity_id = p_id::text order by a.id desc limit 200) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Modification : contrôle (avant / après) puis application. Concurrence : p_expected = updated_at lu avec la fiche.
-- ---------------------------------------------------------------------
create or replace function public._customer_diff(p_actor uuid, p_id uuid, p_first text, p_last text, p_phone text, p_phone2 text, p_email text, p_birth date, p_reason text, p_expected timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.profiles; b jsonb := '{}'::jsonb; a jsonb := '{}'::jsonb; em text := lower(btrim(coalesce(p_email, ''))); sensitive boolean := false;
begin
  perform public._assert_clients(p_actor, 'modifier');
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public._assert_customer_target(p_actor, p.role);
  if p.account_status = 'anonymized' then raise exception 'ANONYMIZED'; end if;
  if p_expected is null or p.updated_at is distinct from p_expected then raise exception 'CONFLICT'; end if;
  if btrim(coalesce(p_first, '')) = '' or btrim(coalesce(p_last, '')) = '' or char_length(p_first) > 60 or char_length(p_last) > 60 then raise exception 'BAD_NAME'; end if;
  if char_length(coalesce(p_phone, '')) > 25 or char_length(coalesce(p_phone2, '')) > 25 then raise exception 'BAD_PHONE'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then raise exception 'BAD_EMAIL'; end if;
  if p_birth is not null and (p_birth > current_date or p_birth < date '1900-01-01') then raise exception 'BAD_BIRTH_DATE'; end if;
  if em <> lower(p.email) and (exists (select 1 from public.profiles x where lower(x.email) = em and x.id <> p_id) or exists (select 1 from auth.users x where lower(x.email) = em and x.id <> p_id)) then raise exception 'EMAIL_TAKEN'; end if;

  if btrim(p_first) is distinct from p.first_name then b := b || jsonb_build_object('first_name', p.first_name); a := a || jsonb_build_object('first_name', btrim(p_first)); end if;
  if btrim(p_last)  is distinct from p.last_name  then b := b || jsonb_build_object('last_name',  p.last_name);  a := a || jsonb_build_object('last_name',  btrim(p_last));  end if;
  if btrim(coalesce(p_phone, ''))  is distinct from p.phone  then b := b || jsonb_build_object('phone',  p.phone);  a := a || jsonb_build_object('phone',  btrim(coalesce(p_phone, '')));  end if;
  if btrim(coalesce(p_phone2, '')) is distinct from p.phone2 then b := b || jsonb_build_object('phone2', p.phone2); a := a || jsonb_build_object('phone2', btrim(coalesce(p_phone2, ''))); end if;
  if em is distinct from lower(p.email) then b := b || jsonb_build_object('email', p.email); a := a || jsonb_build_object('email', em); sensitive := true; end if;
  if p_birth is distinct from p.birth_date then b := b || jsonb_build_object('birth_date', p.birth_date); a := a || jsonb_build_object('birth_date', p_birth); sensitive := true; end if;
  if a = '{}'::jsonb then raise exception 'NO_CHANGE'; end if;
  if sensitive and char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'CLIENT_REASON_REQUIRED'; end if;
  return jsonb_build_object('before', b, 'after', a, 'email_changed', a ? 'email', 'old_email', p.email);
end $$;

create or replace function public.admin_customer_check_update(p_actor uuid, p_id uuid, p_first text, p_last text, p_phone text, p_phone2 text, p_email text, p_birth date, p_reason text, p_expected timestamptz) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public._customer_diff(p_actor, p_id, p_first, p_last, p_phone, p_phone2, p_email, p_birth, p_reason, p_expected)
$$;

create or replace function public.admin_customer_update(p_actor uuid, p_id uuid, p_first text, p_last text, p_phone text, p_phone2 text, p_email text, p_birth date, p_reason text, p_expected timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare d jsonb; new_updated timestamptz;
begin
  d := public._customer_diff(p_actor, p_id, p_first, p_last, p_phone, p_phone2, p_email, p_birth, p_reason, p_expected);
  select updated_at into new_updated from public.profiles where id = p_id for update;
  if new_updated is distinct from p_expected then raise exception 'CONFLICT'; end if;
  update public.profiles set first_name = btrim(p_first), last_name = btrim(p_last), phone = btrim(coalesce(p_phone, '')), phone2 = btrim(coalesce(p_phone2, '')),
    email = lower(btrim(p_email)), birth_date = p_birth where id = p_id returning updated_at into new_updated;
  perform public._audit(p_actor, 'customer.update', 'customer', p_id::text, d -> 'before', d -> 'after', jsonb_build_object('reason', btrim(coalesce(p_reason, ''))));
  return d || jsonb_build_object('updated_at', new_updated);
end $$;

-- ---------------------------------------------------------------------
-- Sécurité du compte : suspendre / réactiver, déconnecter, anonymiser
-- ---------------------------------------------------------------------
create or replace function public._revoke_sessions(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using p_id; end if;
end $$;

create or replace function public.admin_customer_set_status(p_actor uuid, p_id uuid, p_status text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.profiles; r text := btrim(coalesce(p_reason, ''));
begin
  perform public._assert_clients(p_actor, 'modifier');
  if p_status not in ('active', 'suspended') then raise exception 'BAD_STATUS'; end if;
  select * into p from public.profiles where id = p_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p.role = 'admin' then raise exception 'ADMIN_TARGET'; end if;
  if p.account_status = 'anonymized' then raise exception 'ANONYMIZED'; end if;
  if char_length(r) < 5 then raise exception 'CLIENT_REASON_REQUIRED'; end if;
  if p.account_status = p_status then raise exception 'NO_CHANGE'; end if;
  update public.profiles set account_status = p_status, status_reason = case when p_status = 'suspended' then left(r, 300) else '' end where id = p_id;
  update auth.users set banned_until = case when p_status = 'suspended' then now() + interval '100 years' else null end where id = p_id;
  if p_status = 'suspended' then perform public._revoke_sessions(p_id); end if;
  perform public._audit(p_actor, case when p_status = 'suspended' then 'customer.suspend' else 'customer.reactivate' end, 'customer', p_id::text,
    jsonb_build_object('status', p.account_status), jsonb_build_object('status', p_status), jsonb_build_object('reason', r));
  return jsonb_build_object('status', p_status);
end $$;

create or replace function public.admin_customer_revoke_sessions(p_actor uuid, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r text;
begin
  perform public._assert_clients(p_actor, 'modifier');
  select role into r from public.profiles where id = p_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform public._assert_customer_target(p_actor, r);
  perform public._revoke_sessions(p_id);
  perform public._audit(p_actor, 'customer.sessions_revoked', 'customer', p_id::text, null, null, '{}'::jsonb);
end $$;

-- Journal d'une action faite côté serveur (réinitialisation du mot de passe, notification d'e-mail) : liste blanche, jamais de mot de passe.
create or replace function public.admin_customer_log(p_actor uuid, p_id uuid, p_action text, p_meta jsonb default '{}') returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_clients(p_actor, 'modifier');
  if p_action not in ('customer.password_reset', 'customer.email_notice', 'customer.anonymize_auth') then raise exception 'BAD_ACTION'; end if;
  if not exists (select 1 from public.profiles where id = p_id) then raise exception 'USER_NOT_FOUND'; end if;
  perform public._audit(p_actor, p_action, 'customer', p_id::text, null, null, coalesce(p_meta, '{}'::jsonb) - 'password');
end $$;

-- Anonymisation (super-admin) : l'identité disparaît, les commandes restent pour la comptabilité. Refusée s'il reste des billets valides à venir.
create or replace function public.admin_customer_anonymize(p_actor uuid, p_id uuid, p_confirm_email text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p public.profiles; tag text; n_orders int;
begin
  perform public._assert_super(p_actor);
  select * into p from public.profiles where id = p_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if p.role = 'admin' or exists (select 1 from public.organizer_members where user_id = p_id) then raise exception 'ADMIN_TARGET'; end if;
  if p.account_status = 'anonymized' then raise exception 'ANONYMIZED'; end if;
  if p.id = p_actor then raise exception 'SELF_FORBIDDEN'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> lower(p.email) or p.email = '' then raise exception 'CONFIRMATION_MISMATCH'; end if;
  if exists (select 1 from public.tickets t join public.ticketed_events e on e.id = t.ticketed_event_id where t.user_id = p_id and t.status = 'valid' and coalesce(e.ends_at, e.starts_at) >= now()) then raise exception 'UPCOMING_TICKETS'; end if;
  tag := left(replace(p_id::text, '-', ''), 10);
  update public.orders set buyer_email = 'anonyme-' || tag || '@anonymise.invalid', buyer_first_name = '', buyer_last_name = '', buyer_phone = '' where user_id = p_id;
  get diagnostics n_orders = row_count;
  update public.order_items oi set participants = (select coalesce(jsonb_agg(jsonb_build_object('first_name', '', 'last_name', '')), '[]'::jsonb) from jsonb_array_elements(oi.participants))
    from public.orders o where o.id = oi.order_id and o.user_id = p_id;
  update public.tickets set holder_first_name = '', holder_last_name = '' where user_id = p_id;
  delete from public.organizer_follows where user_id = p_id;
  update public.profiles set first_name = 'Compte', last_name = 'anonymisé', phone = '', phone2 = '', email = '', birth_date = null, account_status = 'anonymized', status_reason = '', anonymized_at = now() where id = p_id;
  update auth.users set banned_until = now() + interval '100 years', raw_user_meta_data = '{}'::jsonb where id = p_id;
  perform public._revoke_sessions(p_id);
  perform public._audit(p_actor, 'customer.anonymize', 'customer', p_id::text, jsonb_build_object('status', p.account_status), jsonb_build_object('status', 'anonymized'), jsonb_build_object('orders_kept', n_orders));
  return jsonb_build_object('orders_kept', n_orders);
end $$;

-- ---------------------------------------------------------------------
-- Exports (super-admin) : données d'un compte (JSON) et liste filtrée (CSV construit par le serveur). Journalisés.
-- ---------------------------------------------------------------------
create or replace function public.admin_customer_export(p_actor uuid, p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare d jsonb;
begin
  perform public._assert_super(p_actor);
  d := public.admin_customer_detail(p_actor, p_id, false);
  d := (d - 'history' - 'access') || jsonb_build_object('exported_at', now());
  perform public._audit(p_actor, 'customer.export', 'customer', p_id::text, null, null, jsonb_build_object('format', 'json', 'minor', (d -> 'profile' ->> 'is_minor')::boolean));
  return d;
end $$;

-- Liste filtrée complète (plafonnée). Les mineurs n'en font partie que si p_include_minors = true (case cochée après l'avertissement RGPD).
-- Le texte de recherche n'est JAMAIS journalisé : seulement s'il y en avait un.
create or replace function public.admin_customers_export(p_actor uuid, p_q text default null, p_role text default 'customers', p_status text default null,
  p_upcoming boolean default false, p_minors boolean default false, p_include_minors boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare w text; rows_json jsonb; n int;
begin
  perform public._assert_super(p_actor);
  w := public._customers_where(p_q, p_role, p_status, p_upcoming, p_minors);
  if not coalesce(p_include_minors, false) then w := w || ' and not (p.birth_date is not null and p.birth_date > (current_date - interval ''18 years'')::date)'; end if;
  execute format($f$
    select coalesce(jsonb_agg(jsonb_build_object('reference', 'CLI.' || upper(left(replace(g.id::text, '-', ''), 10)), 'first_name', g.first_name, 'last_name', g.last_name, 'email', g.email,
        'phone', g.phone, 'phone2', g.phone2, 'birth_date', g.birth_date, 'role', g.role, 'status', g.account_status, 'created_at', g.created_at) order by g.created_at desc, g.id), '[]'::jsonb)
    from (select p.* from public.profiles p where %s order by p.created_at desc, p.id limit 50000) g$f$, w) into rows_json;
  n := jsonb_array_length(rows_json);
  perform public._audit(p_actor, 'customers.export', 'customer', null, null, null,
    jsonb_build_object('format', 'csv', 'count', n, 'role', coalesce(nullif(p_role, ''), 'customers'), 'status', p_status, 'upcoming', coalesce(p_upcoming, false), 'minors_only', coalesce(p_minors, false),
      'has_query', nullif(btrim(coalesce(p_q, '')), '') is not null, 'include_minors', coalesce(p_include_minors, false)));
  return rows_json;
end $$;

-- ---------------------------------------------------------------------
-- Droits d'exécution : service_role seul (le navigateur ne peut rien appeler directement)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('_assert_clients', '_assert_customer_target', '_customers_where', '_customer_diff', '_revoke_sessions', '_sync_profile_email', '_profile_search_guard',
        'admin_account_set_permissions', 'admin_accounts_list', 'admin_clients_access', 'admin_list_customers', 'admin_customer_detail', 'admin_customer_check_update', 'admin_customer_update',
        'admin_customer_set_status', 'admin_customer_revoke_sessions', 'admin_customer_log', 'admin_customer_anonymize', 'admin_customer_export', 'admin_customers_export')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
