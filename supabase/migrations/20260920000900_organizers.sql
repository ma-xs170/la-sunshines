-- =====================================================================
-- Migration 009 — organisateurs, référence de billet, messages aux participants
--
--  * organizers / organizer_members : chaque événement (ticketed_events.organizer_id) est rattaché à un organisateur ;
--    un membre ne voit QUE les événements de son organisateur (fonctions org_* + policies RLS). Un seul organisateur
--    aujourd'hui (THE MOUV, repris des mentions légales du site) ; aucune inscription publique d'organisateurs.
--  * tickets.reference : référence lisible « LS-XXXXXX » (jamais un morceau du code du QR).
--  * organizer_messages / organizer_message_recipients : messages d'information aux participants, avec limites.
--  * Toute consultation de la liste des participants, tout export et tout envoi sont écrits dans audit_log.
--
-- Rôles d'un membre : owner / manager (lire + exporter + écrire aux participants), viewer (lecture seule).
-- Un admin (profiles.role = 'admin') a accès à tous les organisateurs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- organizers : structure organisatrice (ces valeurs alimentent le bloc « organisateur » du billet PDF)
-- ---------------------------------------------------------------------
create table public.organizers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 120),
  legal_form       text not null default '' check (char_length(legal_form) <= 120),
  siret            text not null default '' check (siret = '' or siret ~ '^[0-9]{14}$'),
  responsible_name text not null default '' check (char_length(responsible_name) <= 120),   -- nom + prénom, si pas de SIRET
  address          text not null default '' check (char_length(address) <= 250),
  contact_email    text not null default '' check (contact_email = '' or char_length(contact_email) between 3 and 254),
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index organizers_one_default on public.organizers (is_default) where is_default;
create trigger organizers_set_updated_at before update on public.organizers
  for each row execute function public.set_updated_at();

create table public.organizer_members (
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'viewer' check (role in ('owner', 'manager', 'viewer')),
  created_at   timestamptz not null default now(),
  primary key (organizer_id, user_id)
);
create index organizer_members_user_idx on public.organizer_members (user_id);

-- THE MOUV : mêmes informations que les mentions légales publiques du site (/mentions-legales).
insert into public.organizers (name, legal_form, siret, address, contact_email, is_default)
values ('THE MOUV', 'Association loi 1901', '10665995600010',
        '1 Morne Caruel, Cité Deboisvieux, 97139 Les Abymes', 'themouv2.0971@gmail.com', true);

-- Rattachement des événements : existants → THE MOUV ; nouveaux sans organisateur → THE MOUV (organisateur par défaut).
update public.ticketed_events set organizer_id = (select id from public.organizers where is_default) where organizer_id is null;
alter table public.ticketed_events
  add constraint ticketed_events_organizer_fk foreign key (organizer_id) references public.organizers(id) on delete restrict;
create function public._set_default_organizer() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.organizer_id is null then
    select id into new.organizer_id from public.organizers where is_default;
  end if;
  return new;
end $$;
create trigger ticketed_events_default_organizer before insert on public.ticketed_events
  for each row execute function public._set_default_organizer();
alter table public.ticketed_events alter column organizer_id set not null;
create index ticketed_events_organizer_idx on public.ticketed_events (organizer_id);

-- ---------------------------------------------------------------------
-- tickets.reference : « LS-XXXXXX » (alphabet sans caractères ambigus 0/O/1/I/L)
-- ---------------------------------------------------------------------
create function public.new_ticket_reference() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  r text;
begin
  loop
    r := 'LS-';
    for i in 1..6 loop r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.tickets where reference = r);
  end loop;
  return r;
end $$;

alter table public.tickets add column reference text;
do $$
declare t record;
begin
  for t in select id from public.tickets where reference is null loop
    update public.tickets set reference = public.new_ticket_reference() where id = t.id;
  end loop;
end $$;
alter table public.tickets alter column reference set default public.new_ticket_reference();
alter table public.tickets alter column reference set not null;
create unique index tickets_reference_uniq on public.tickets (reference);

-- ---------------------------------------------------------------------
-- messages aux participants
-- ---------------------------------------------------------------------
create table public.organizer_messages (
  id                uuid primary key default gen_random_uuid(),
  organizer_id      uuid not null references public.organizers(id) on delete restrict,
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  author_id         uuid references auth.users(id) on delete set null,
  subject           text not null check (char_length(subject) between 1 and 120),
  body              text not null check (char_length(body) between 1 and 2000),
  reply_to          text not null check (char_length(reply_to) between 3 and 254),
  scope             text not null check (scope in ('all', 'tier', 'selection')),
  recipient_count   int  not null check (recipient_count >= 0),
  sent_count        int  not null default 0,
  failed_count      int  not null default 0,
  status            text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create index organizer_messages_event_idx on public.organizer_messages (ticketed_event_id, created_at desc);

create table public.organizer_message_recipients (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.organizer_messages(id) on delete cascade,
  email      text not null check (email = lower(email)),
  status     text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error      text,
  sent_at    timestamptz,
  unique (message_id, email)
);

-- ---------------------------------------------------------------------
-- Contrôle d'accès
-- ---------------------------------------------------------------------
-- Rôle d'un utilisateur dans un organisateur ('admin' si administrateur du site, sinon owner/manager/viewer, sinon null).
create function public._org_role(p_user uuid, p_organizer uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (select 1 from public.profiles where id = p_user and role = 'admin') then 'admin'
    else (select role from public.organizer_members where user_id = p_user and organizer_id = p_organizer)
  end
$$;

-- Vrai si l'utilisateur COURANT (auth.uid(), via JWT) peut lire les données de cet événement (RLS).
create function public.is_org_member_of_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.ticketed_events e
    join public.organizer_members m on m.organizer_id = e.organizer_id
    where e.id = p_event and m.user_id = (select auth.uid())
  )
$$;

-- Accès à un événement par slug. p_need = 'read' (tous les rôles) ou 'manage' (owner / manager / admin).
-- Les erreurs ne révèlent pas l'existence d'un événement d'un autre organisateur (FORBIDDEN dans tous les cas).
create function public._org_access(p_actor uuid, p_slug text, p_need text) returns public.ticketed_events
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; r text;
begin
  select * into ev from public.ticketed_events where event_slug = p_slug;
  if not found then
    if exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'EVENT_NOT_FOUND'; end if;
    raise exception 'FORBIDDEN';
  end if;
  r := public._org_role(p_actor, ev.organizer_id);
  if r is null or (p_need = 'manage' and r not in ('admin', 'owner', 'manager')) then raise exception 'FORBIDDEN'; end if;
  return ev;
end $$;

-- Écrit dans audit_log ; p_throttle_min > 0 : pas de doublon (même acteur, action, événement) dans cet intervalle.
create function public._org_audit(p_actor uuid, p_event uuid, p_action text, p_meta jsonb, p_throttle_min int default 0) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_throttle_min > 0 and exists (
    select 1 from public.audit_log
    where actor_id = p_actor and action = p_action and entity = 'ticketed_event' and entity_id = p_event::text
      and created_at > now() - make_interval(mins => p_throttle_min)
  ) then return; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, meta)
  values (p_actor, p_action, 'ticketed_event', p_event::text, coalesce(p_meta, '{}'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Lecture : liste des événements, statistiques, participants
-- ---------------------------------------------------------------------
create function public.org_events(p_actor uuid) returns jsonb
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
      'organizer_id', o.id, 'organizer_name', o.name
    ) order by e.starts_at desc)
    from public.ticketed_events e
    join public.organizers o on o.id = e.organizer_id
    where is_adm or exists (select 1 from public.organizer_members m where m.organizer_id = e.organizer_id and m.user_id = p_actor)
  ), '[]'::jsonb);
end $$;

create function public.org_event_stats(p_actor uuid, p_slug text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; org public.organizers; sold int; consumed int; res jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'read');
  select * into org from public.organizers where id = ev.organizer_id;
  select count(*) into sold from public.tickets where ticketed_event_id = ev.id and status in ('valid', 'used');
  consumed := public.event_consumed(ev.id);
  select jsonb_build_object(
    'slug', ev.event_slug, 'status', ev.status, 'ticketing_enabled', ev.ticketing_enabled, 'starts_at', ev.starts_at,
    'venue_name', ev.venue_name, 'venue_address', ev.venue_address, 'capacity', ev.capacity,
    'organizer', jsonb_build_object('id', org.id, 'name', org.name, 'contact_email', org.contact_email),
    'my_role', public._org_role(p_actor, ev.organizer_id),
    'sold', sold, 'reserved', consumed - sold, 'remaining', greatest(ev.capacity - consumed, 0),
    'entered', (select count(*) from public.tickets where ticketed_event_id = ev.id and status = 'used'),
    'revenue_cents', coalesce((select sum(total_cents - refunded_cents) from public.orders
                                where ticketed_event_id = ev.id and source = 'web'
                                  and status in ('paid', 'partially_refunded', 'refunded')), 0),
    'refunded_cents', coalesce((select sum(refunded_cents) from public.orders where ticketed_event_id = ev.id), 0),
    'fill_rate', round(100.0 * sold / ev.capacity, 1),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier_id', t.id, 'name', t.name, 'price_cents', t.price_cents, 'quantity_total', t.quantity_total, 'archived', t.archived_at is not null,
        'sold', (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')),
        'reserved', public.tier_consumed(t.id) - (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')),
        'revenue_cents', coalesce((select sum(oi.unit_price_cents) from public.tickets tk join public.order_items oi on oi.id = tk.order_item_id
                                    where tk.tier_id = t.id and tk.status in ('valid', 'used')), 0)
      ) order by t.sort_order, t.created_at)
      from public.ticket_tiers t where t.ticketed_event_id = ev.id), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('day', s.d, 'sold', s.n, 'revenue_cents', s.r) order by s.d)
      from (
        select (o.paid_at at time zone 'America/Guadeloupe')::date as d, count(*)::int as n, coalesce(sum(oi.unit_price_cents), 0)::int as r
        from public.tickets t
        join public.orders o on o.id = t.order_id
        join public.order_items oi on oi.id = t.order_item_id
        where t.ticketed_event_id = ev.id and t.status in ('valid', 'used') and o.paid_at is not null
        group by 1
      ) s), '[]'::jsonb)
  ) into res;
  perform public._org_audit(p_actor, ev.id, 'organizer.event_view', '{}'::jsonb, 30);
  return res;
end $$;

-- Liste des participants (un billet = une ligne). Filtres : recherche, tarif, statut. Tri et pagination whitelistés.
create function public.org_participants(
  p_actor uuid, p_slug text, p_q text default null, p_tier uuid default null, p_status text default null,
  p_sort text default 'date', p_dir text default 'desc', p_limit int default 50, p_offset int default 0
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; total int; rows jsonb; q text; lim int; off int; dir text;
begin
  ev := public._org_access(p_actor, p_slug, 'read');
  q := nullif(btrim(coalesce(p_q, '')), '');
  lim := least(greatest(coalesce(p_limit, 50), 1), 200);
  off := greatest(coalesce(p_offset, 0), 0);
  dir := case when lower(coalesce(p_dir, '')) = 'asc' then 'asc' else 'desc' end;
  if p_status is not null and p_status not in ('valid', 'used', 'cancelled', 'refunded') then raise exception 'BAD_FILTER'; end if;

  -- $1 = événement, $2 = tarif, $3 = statut, $4 = recherche. La colonne de tri vient d'une liste blanche (CASE), jamais du texte libre.
  execute format($f$
    select coalesce(jsonb_agg(to_jsonb(x) - '_total'), '[]'::jsonb), coalesce(max(x._total), 0)::int
    from (
      select f.*, count(*) over () as _total
      from (
        select t.id, t.reference, t.holder_first_name, t.holder_last_name, t.status, t.used_at, t.created_at,
               o.order_number, o.id as order_id, o.buyer_email, o.buyer_phone, o.source,
               oi.tier_name, oi.unit_price_cents, t.tier_id
        from public.tickets t
        join public.orders o on o.id = t.order_id
        join public.order_items oi on oi.id = t.order_item_id
        where t.ticketed_event_id = $1
          and ($2::uuid is null or t.tier_id = $2)
          and ($3::text is null or t.status = $3)
          and ($4::text is null or t.holder_first_name ilike '%%' || $4 || '%%' or t.holder_last_name ilike '%%' || $4 || '%%'
               or (t.holder_first_name || ' ' || t.holder_last_name) ilike '%%' || $4 || '%%'
               or o.buyer_email ilike '%%' || $4 || '%%' or o.order_number ilike '%%' || $4 || '%%' or t.reference ilike '%%' || $4 || '%%')
      ) f
      order by
        case when %L = 'name'   then lower(f.holder_last_name || ' ' || f.holder_first_name) end %s,
        case when %L = 'tier'   then lower(f.tier_name) end %s,
        case when %L = 'status' then f.status end %s,
        case when %L = 'ref'    then f.reference end %s,
        f.created_at %s, f.id
      limit %s offset %s
    ) x$f$,
    p_sort, dir, p_sort, dir, p_sort, dir, p_sort, dir, dir, lim, off)
  into rows, total using ev.id, p_tier, p_status, q;
  perform public._org_audit(p_actor, ev.id, 'organizer.participants_view',
    jsonb_build_object('total', total, 'filtered', (q is not null or p_tier is not null or p_status is not null)), 5);
  return jsonb_build_object('total', total, 'rows', rows);
end $$;

-- Export CSV : rôles owner / manager / admin. TOUJOURS journalisé (nombre de lignes, filtres).
create function public.org_export_participants(p_actor uuid, p_slug text, p_tier uuid default null, p_status text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; rows jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  if p_status is not null and p_status not in ('valid', 'used', 'cancelled', 'refunded') then raise exception 'BAD_FILTER'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'reference', t.reference, 'first_name', t.holder_first_name, 'last_name', t.holder_last_name,
      'email', o.buyer_email, 'phone', o.buyer_phone, 'tier', oi.tier_name, 'price_cents', oi.unit_price_cents,
      'status', t.status, 'entered_at', t.used_at, 'order_number', o.order_number, 'source', o.source)
    order by lower(t.holder_last_name), lower(t.holder_first_name)), '[]'::jsonb)
  into rows
  from public.tickets t
  join public.orders o on o.id = t.order_id
  join public.order_items oi on oi.id = t.order_item_id
  where t.ticketed_event_id = ev.id and (p_tier is null or t.tier_id = p_tier) and (p_status is null or t.status = p_status);
  perform public._org_audit(p_actor, ev.id, 'organizer.export_csv',
    jsonb_build_object('rows', jsonb_array_length(rows), 'tier', p_tier, 'status', p_status), 0);
  return rows;
end $$;

-- Journal d'une action faite côté serveur (renvoi d'un billet, etc.). Actions « organizer.* » uniquement.
create function public.org_log(p_actor uuid, p_slug text, p_action text, p_meta jsonb default '{}') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  if p_action not like 'organizer.%' then raise exception 'BAD_ACTION'; end if;
  ev := public._org_access(p_actor, p_slug, 'manage');
  perform public._org_audit(p_actor, ev.id, p_action, p_meta, 0);
end $$;

-- Retrouve un billet d'un événement auquel l'acteur a accès (renvoi de PDF) : renvoie ce qu'il faut pour l'email.
create function public.org_ticket_for_resend(p_actor uuid, p_slug text, p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; res jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select jsonb_build_object('ticket_id', t.id, 'order_id', t.order_id, 'status', t.status, 'buyer_email', o.buyer_email)
  into res
  from public.tickets t join public.orders o on o.id = t.order_id
  where t.id = p_ticket and t.ticketed_event_id = ev.id;
  if res is null then raise exception 'TICKET_NOT_FOUND'; end if;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Messages d'information aux participants
-- ---------------------------------------------------------------------
-- Destinataires = acheteurs (emails dédoublonnés, minuscules) ayant au moins un billet valide/utilisé dans le périmètre.
create function public._org_recipients(p_event uuid, p_scope text, p_tier uuid, p_tickets uuid[]) returns table (email text)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct lower(o.buyer_email)
  from public.tickets t join public.orders o on o.id = t.order_id
  where t.ticketed_event_id = p_event and t.status in ('valid', 'used') and o.buyer_email <> ''
    and case p_scope
          when 'all' then true
          when 'tier' then t.tier_id = p_tier
          when 'selection' then t.id = any (coalesce(p_tickets, '{}'::uuid[]))
          else false end
$$;

create function public.org_message_preview(p_actor uuid, p_slug text, p_scope text, p_tier uuid default null, p_tickets uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; org public.organizers; n int; sample jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select * into org from public.organizers where id = ev.organizer_id;
  select count(*) into n from public._org_recipients(ev.id, p_scope, p_tier, p_tickets);
  select coalesce(jsonb_agg(m), '[]'::jsonb) into sample from (
    select regexp_replace(email, '^(.{2}).*(@.*)$', '\1***\2') m from public._org_recipients(ev.id, p_scope, p_tier, p_tickets) order by 1 limit 5) s;
  return jsonb_build_object('count', n, 'sample', sample, 'reply_to', org.contact_email, 'organizer_name', org.name,
    'sent_last_24h', (select count(*) from public.organizer_messages where ticketed_event_id = ev.id and created_at > now() - interval '24 hours'));
end $$;

-- Crée le message et ses destinataires (statut « pending ») de façon atomique, avec les limites d'envoi :
--  * 3 messages maximum par événement et par 24 h ; * 500 destinataires maximum par message ;
--  * adresse de réponse de l'organisateur obligatoire. Journalise l'envoi dans audit_log.
create function public.org_message_create(p_actor uuid, p_slug text, p_subject text, p_body text, p_scope text,
                                          p_tier uuid default null, p_tickets uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; org public.organizers; msg uuid; n int; recips jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  select * into org from public.organizers where id = ev.organizer_id;
  if org.contact_email = '' then raise exception 'REPLY_TO_MISSING'; end if;
  if p_scope not in ('all', 'tier', 'selection') then raise exception 'BAD_SCOPE'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) = 0 or char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'EMPTY_MESSAGE'; end if;
  if (select count(*) from public.organizer_messages where ticketed_event_id = ev.id and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'RATE_LIMIT';
  end if;
  select count(*) into n from public._org_recipients(ev.id, p_scope, p_tier, p_tickets);
  if n = 0 then raise exception 'NO_RECIPIENTS'; end if;
  if n > 500 then raise exception 'TOO_MANY_RECIPIENTS'; end if;

  insert into public.organizer_messages (organizer_id, ticketed_event_id, author_id, subject, body, reply_to, scope, recipient_count)
  values (org.id, ev.id, p_actor, btrim(p_subject), btrim(p_body), org.contact_email, p_scope, n) returning id into msg;
  insert into public.organizer_message_recipients (message_id, email)
  select msg, r.email from public._org_recipients(ev.id, p_scope, p_tier, p_tickets) r;
  perform public._org_audit(p_actor, ev.id, 'organizer.message_send',
    jsonb_build_object('message_id', msg, 'scope', p_scope, 'recipients', n, 'subject', left(btrim(p_subject), 120)), 0);
  select jsonb_agg(email order by email) into recips from public.organizer_message_recipients where message_id = msg;
  return jsonb_build_object('message_id', msg, 'reply_to', org.contact_email, 'organizer_name', org.name, 'recipients', recips);
end $$;

-- Résultat d'un envoi (mis à jour APRÈS la réponse de Resend) ; clôt le message quand plus rien n'est en attente.
create function public.org_message_result(p_message uuid, p_email text, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pending int; sent int; failed int;
begin
  -- Les envois se font en parallèle : on verrouille le message pour que chaque mise à jour voie les statuts déjà validés
  -- (sinon deux résultats simultanés pourraient laisser un statut global périmé).
  perform 1 from public.organizer_messages where id = p_message for update;
  update public.organizer_message_recipients
     set status = case when p_ok then 'sent' else 'failed' end, error = case when p_ok then null else left(p_error, 300) end,
         sent_at = case when p_ok then now() else null end
   where message_id = p_message and email = lower(p_email) and status = 'pending';
  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'sent'), count(*) filter (where status = 'failed')
    into pending, sent, failed from public.organizer_message_recipients where message_id = p_message;
  update public.organizer_messages
     set sent_count = sent, failed_count = failed,
         status = case when pending > 0 then 'sending' when failed = 0 then 'sent' when sent = 0 then 'failed' else 'partial' end,
         finished_at = case when pending = 0 then now() else null end
   where id = p_message;
end $$;

create function public.org_messages_list(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'read');
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'subject', m.subject, 'scope', m.scope, 'recipient_count', m.recipient_count,
      'sent_count', m.sent_count, 'failed_count', m.failed_count, 'status', m.status, 'created_at', m.created_at) order by m.created_at desc)
    from (select * from public.organizer_messages where ticketed_event_id = ev.id order by created_at desc limit 20) m), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- RLS (défense en profondeur : les lectures « côté navigateur » ne voient que les événements de l'organisateur du membre)
-- ---------------------------------------------------------------------
alter table public.organizers                   enable row level security;
alter table public.organizer_members            enable row level security;
alter table public.organizer_messages            enable row level security;
alter table public.organizer_message_recipients  enable row level security;
revoke all on public.organizers, public.organizer_members, public.organizer_messages, public.organizer_message_recipients from anon, authenticated;

create policy organizers_member_read on public.organizers for select to authenticated
  using (public.is_admin() or exists (select 1 from public.organizer_members m where m.organizer_id = id and m.user_id = (select auth.uid())));
create policy organizer_members_own_read on public.organizer_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy organizer_messages_member_read on public.organizer_messages for select to authenticated
  using (public.is_admin() or public.is_org_member_of_event(ticketed_event_id));
create policy organizer_recipients_member_read on public.organizer_message_recipients for select to authenticated
  using (exists (select 1 from public.organizer_messages m where m.id = message_id
                 and (public.is_admin() or public.is_org_member_of_event(m.ticketed_event_id))));

-- Les membres lisent aussi les événements de leur organisateur (brouillons compris), leurs tarifs, commandes, lignes et billets.
create policy events_organizer_read on public.ticketed_events for select to authenticated
  using (exists (select 1 from public.organizer_members m where m.organizer_id = ticketed_events.organizer_id and m.user_id = (select auth.uid())));
create policy tiers_organizer_read on public.ticket_tiers for select to authenticated
  using (public.is_org_member_of_event(ticketed_event_id));
create policy orders_organizer_read on public.orders for select to authenticated
  using (public.is_org_member_of_event(ticketed_event_id));
create policy order_items_organizer_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_org_member_of_event(o.ticketed_event_id)));
create policy tickets_organizer_read on public.tickets for select to authenticated
  using (public.is_org_member_of_event(ticketed_event_id));

grant select on public.organizers, public.organizer_members, public.organizer_messages, public.organizer_message_recipients to authenticated;

-- ---------------------------------------------------------------------
-- Privilèges des fonctions : EXECUTE pour le service_role seul, sauf is_org_member_of_event (utilisée par la RLS)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('new_ticket_reference', '_org_role', '_org_access', '_org_audit', '_org_recipients', '_set_default_organizer',
                        'org_events', 'org_event_stats', 'org_participants', 'org_export_participants', 'org_log', 'org_ticket_for_resend',
                        'org_message_preview', 'org_message_create', 'org_message_result', 'org_messages_list')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
revoke execute on function public.is_org_member_of_event(uuid) from public, anon;
grant  execute on function public.is_org_member_of_event(uuid) to authenticated, service_role;
