-- =====================================================================
-- Phase 2 — Cœur de billetterie : événements, tarifs, commandes, billets,
-- réservation atomique du stock, fonctions d'administration.
--
-- Prérequis : migration 20260920000100 (profiles, is_admin(), app_settings).
-- Ne touche à AUCUNE table existante.
--
-- Conventions
--  * Montants en CENTIMES (integer), devise EUR uniquement.
--  * Fermé par défaut : RLS activée + droits retirés à anon/authenticated.
--    Aucune écriture directe côté client sur aucune de ces tables.
--  * Fonctions sensibles : SECURITY DEFINER + search_path fixé + EXECUTE
--    retiré à public/anon/authenticated → seul service_role peut les appeler
--    (depuis des routes serveur qui ont déjà contrôlé l'identité / le rôle).
--  * Stock disponible = capacité − billets valides/utilisés − réservations
--    `pending` dont expires_at > now(). AUCUN cron n'est nécessaire à la
--    correction : une réservation périmée cesse de compter d'elle-même.
--  * Les billets (tickets) ne sont créés qu'au « fulfill » (phase 3), une fois
--    la commande payée ; leur code est un token HMAC calculé côté application
--    (le secret n'est jamais en base).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ticketed_events : configuration billetterie d'un événement éditorial.
-- Clé stable = Edition.slug (getAllEditions : éditions JSON ET statiques).
-- ---------------------------------------------------------------------
create table public.ticketed_events (
  id                uuid primary key default gen_random_uuid(),
  event_slug        text not null unique check (event_slug ~ '^[a-z0-9][a-z0-9-]{0,98}$'),
  organizer_id      uuid,                                   -- futur : multi-organisateurs / Connect
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  doors_open_at     timestamptz,
  venue_name        text not null default '' check (char_length(venue_name) <= 120),
  venue_address     text not null default '' check (char_length(venue_address) <= 250),
  capacity          int  not null check (capacity between 1 and 100000),
  sales_open_at     timestamptz,
  sales_close_at    timestamptz,
  ticketing_enabled boolean not null default false,
  status            text not null default 'draft'
                    check (status in ('draft', 'published', 'closed', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (doors_open_at is null or doors_open_at <= starts_at),
  check (sales_open_at is null or sales_close_at is null or sales_close_at > sales_open_at)
);
create trigger ticketed_events_set_updated_at
  before update on public.ticketed_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ticket_tiers : tarifs d'un événement (capacité propre + fenêtre de vente)
-- ---------------------------------------------------------------------
create table public.ticket_tiers (
  id                uuid primary key default gen_random_uuid(),
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  name              text not null check (char_length(name) between 1 and 80),
  description       text not null default '' check (char_length(description) <= 300),
  -- Stripe refuse tout paiement < 0,50 € : on refuse le tarif dès la base.
  price_cents       int  not null check (price_cents >= 50 and price_cents <= 1000000),
  quantity_total    int  not null check (quantity_total >= 0 and quantity_total <= 100000),
  max_per_order     int  not null default 6 check (max_per_order between 1 and 20),
  sales_start       timestamptz,
  sales_end         timestamptz,
  is_active         boolean not null default true,
  archived_at       timestamptz,                            -- tarif vendu = archivé, jamais supprimé
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  check (sales_start is null or sales_end is null or sales_end > sales_start)
);
create unique index ticket_tiers_event_name_uniq
  on public.ticket_tiers (ticketed_event_id, lower(name)) where archived_at is null;
create index ticket_tiers_event_idx on public.ticket_tiers (ticketed_event_id, sort_order);

-- ---------------------------------------------------------------------
-- orders : commandes
-- ---------------------------------------------------------------------
create sequence public.order_number_seq start 1000;

create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  order_number               text not null unique
                             default ('SUN-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  user_id                    uuid references auth.users(id) on delete set null,
  ticketed_event_id          uuid not null references public.ticketed_events(id) on delete restrict,
  event_slug                 text not null,                  -- snapshot
  status                     text not null default 'pending'
                             check (status in ('pending', 'paid', 'expired', 'cancelled',
                                               'partially_refunded', 'refunded')),
  source                     text not null default 'web' check (source in ('web', 'manual')),
  buyer_email                text not null check (char_length(buyer_email) between 3 and 254),
  buyer_first_name           text not null default '',
  buyer_last_name            text not null default '',
  buyer_phone                text not null default '',
  subtotal_cents             int  not null default 0 check (subtotal_cents >= 0),
  fee_cents                  int  not null default 0 check (fee_cents >= 0),
  total_cents                int  not null default 0,
  refunded_cents             int  not null default 0 check (refunded_cents >= 0),
  currency                   text not null default 'eur' check (currency = 'eur'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  stripe_account_id          text,                           -- futur Stripe Connect (null aujourd'hui)
  expires_at                 timestamptz,
  paid_at                    timestamptz,
  cancelled_at               timestamptz,
  terms_accepted_at          timestamptz,
  terms_version              text,
  guardian_consent_at        timestamptz,
  -- Email de confirmation : statut mis à jour APRÈS la réponse de Resend.
  email_status               text not null default 'pending'
                             check (email_status in ('pending', 'sent', 'failed')),
  email_attempts             int  not null default 0 check (email_attempts >= 0),
  email_last_error           text,
  email_last_attempt_at      timestamptz,
  email_sent_at              timestamptz,
  created_at                 timestamptz not null default now(),
  check (total_cents = subtotal_cents + fee_cents),
  check (refunded_cents <= total_cents),
  check (status <> 'pending' or expires_at is not null)
);
create index orders_user_idx      on public.orders (user_id, created_at desc);
create index orders_event_idx     on public.orders (ticketed_event_id, status);
create index orders_pending_idx   on public.orders (ticketed_event_id) where status = 'pending';
create index orders_email_idx     on public.orders (lower(buyer_email));

-- ---------------------------------------------------------------------
-- order_items : lignes + SNAPSHOT (modifier l'événement ou le tarif plus tard
-- ne change jamais une commande passée)
-- ---------------------------------------------------------------------
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  tier_id          uuid not null references public.ticket_tiers(id) on delete restrict,
  quantity         int  not null check (quantity between 1 and 20),
  unit_price_cents int  not null check (unit_price_cents >= 0),
  line_total_cents int  generated always as (quantity * unit_price_cents) stored,
  participants     jsonb not null default '[]',              -- [{first_name,last_name}] × quantity
  event_title      text not null,
  event_starts_at  timestamptz not null,
  venue_name       text not null default '',
  venue_address    text not null default '',
  tier_name        text not null,
  unique (order_id, tier_id),
  check (jsonb_typeof(participants) = 'array' and jsonb_array_length(participants) = quantity)
);
create index order_items_tier_idx on public.order_items (tier_id);

-- ---------------------------------------------------------------------
-- tickets : créés au fulfill uniquement (commande payée)
-- ---------------------------------------------------------------------
create table public.tickets (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  order_item_id     uuid not null references public.order_items(id) on delete cascade,
  ticketed_event_id uuid not null references public.ticketed_events(id) on delete restrict,
  tier_id           uuid not null references public.ticket_tiers(id) on delete restrict,
  user_id           uuid references auth.users(id) on delete set null,
  code              text not null unique,                    -- token signé HMAC, jamais séquentiel
  holder_first_name text not null default '',
  holder_last_name  text not null default '',
  status            text not null default 'valid'
                    check (status in ('valid', 'used', 'cancelled', 'refunded')),
  used_at           timestamptz,
  used_by           uuid references auth.users(id) on delete set null,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  check ((status = 'used') = (used_at is not null))
);
create index tickets_event_status_idx on public.tickets (ticketed_event_id, status);
create index tickets_tier_idx         on public.tickets (tier_id, status);
create index tickets_order_idx        on public.tickets (order_id);
create index tickets_user_idx         on public.tickets (user_id);

-- ---------------------------------------------------------------------
-- stripe_events : idempotence des webhooks (id d'événement Stripe = clé unique)
-- ---------------------------------------------------------------------
create table public.stripe_events (
  id           text primary key,                             -- evt_...
  type         text not null,
  status       text not null default 'processing' check (status in ('processing', 'done', 'failed')),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------
-- refunds / audit_log
-- ---------------------------------------------------------------------
create table public.refunds (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  stripe_refund_id text unique,
  amount_cents     int  not null check (amount_cents > 0),
  reason           text,
  status           text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);

-- Actions de BILLETTERIE uniquement (événements, tarifs, réglages, remboursements…).
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

-- =====================================================================
-- RLS + droits
-- =====================================================================
alter table public.ticketed_events enable row level security;
alter table public.ticket_tiers    enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.tickets         enable row level security;
alter table public.stripe_events   enable row level security;
alter table public.refunds         enable row level security;
alter table public.audit_log       enable row level security;

revoke all on public.ticketed_events, public.ticket_tiers, public.orders, public.order_items,
              public.tickets, public.stripe_events, public.refunds, public.audit_log
  from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

-- Public : seulement les tarifs ACTIFS d'événements dont la billetterie est ACTIVÉE.
create policy events_public_read on public.ticketed_events
  for select to anon, authenticated
  using ((ticketing_enabled and status in ('published', 'closed')) or public.is_admin());

create policy tiers_public_read on public.ticket_tiers
  for select to anon, authenticated
  using (
    public.is_admin()
    or (
      is_active and archived_at is null
      and exists (
        select 1 from public.ticketed_events e
        where e.id = ticketed_event_id and e.ticketing_enabled and e.status in ('published', 'closed')
      )
    )
  );

-- Client : uniquement SES commandes, lignes et billets. Admin : tout, en lecture.
create policy orders_own_read on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy order_items_own_read on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_admin())
  ));

create policy tickets_own_read on public.tickets
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- stripe_events, refunds, audit_log : admins (lecture) ; écriture = service_role seul.
create policy stripe_events_admin_read on public.stripe_events
  for select to authenticated using (public.is_admin());
create policy refunds_admin_read on public.refunds
  for select to authenticated using (public.is_admin());
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

grant select on public.ticketed_events, public.ticket_tiers to anon, authenticated;
grant select on public.orders, public.order_items, public.tickets,
                public.stripe_events, public.refunds, public.audit_log to authenticated;
-- Aucun INSERT / UPDATE / DELETE accordé à anon ni authenticated, sur aucune table.

-- =====================================================================
-- Calcul du stock (sans cron)
-- =====================================================================
-- Consommé = billets valides/utilisés + réservations pending NON expirées.
-- Un billet remboursé/annulé et une réservation périmée libèrent le stock.
create function public.tier_consumed(p_tier uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select (
    (select count(*) from public.tickets where tier_id = p_tier and status in ('valid', 'used'))
    + coalesce((
        select sum(oi.quantity)
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.tier_id = p_tier and o.status = 'pending' and o.expires_at > now()
      ), 0)
  )::int
$$;

create function public.event_consumed(p_event uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select (
    (select count(*) from public.tickets where ticketed_event_id = p_event and status in ('valid', 'used'))
    + coalesce((
        select sum(oi.quantity)
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.ticketed_event_id = p_event and o.status = 'pending' and o.expires_at > now()
      ), 0)
  )::int
$$;

-- Disponibilité publique : compteurs par tarif, jamais de données de commande.
-- state : on_sale | upcoming (« Bientôt disponible ») | sold_out (« Épuisé ») | closed
create function public.get_availability(p_slug text)
returns table (tier_id uuid, remaining int, state text)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    t.id,
    greatest(0, least(t.quantity_total - public.tier_consumed(t.id),
                      e.capacity - public.event_consumed(e.id)))::int,
    case
      when e.status <> 'published'                                          then 'closed'
      when now() < greatest(e.sales_open_at, t.sales_start)                 then 'upcoming'
      when now() >= least(e.sales_close_at, t.sales_end, e.starts_at)       then 'closed'
      when least(t.quantity_total - public.tier_consumed(t.id),
                 e.capacity - public.event_consumed(e.id)) <= 0             then 'sold_out'
      else 'on_sale'
    end
  from public.ticketed_events e
  join public.ticket_tiers t on t.ticketed_event_id = e.id
  where e.event_slug = p_slug and e.ticketing_enabled
    and t.is_active and t.archived_at is null
  order by t.sort_order, t.created_at
$$;

-- =====================================================================
-- RÉSERVATION ATOMIQUE
-- Le prix est TOUJOURS relu ici depuis ticket_tiers (jamais fourni par le client).
-- Ordre des verrous : événement → tarifs (triés par id) → commandes.
-- Verrouiller la ligne de l'événement sérialise les achats d'un même événement
-- (capacité globale ET capacités par tarif sont donc vérifiées sans course).
-- Codes d'erreur (message de l'exception) : AUTH_REQUIRED, CONSENT_REQUIRED,
-- INVALID_ITEMS, INVALID_PARTICIPANTS, EVENT_NOT_ON_SALE, SALES_NOT_OPEN,
-- SALES_CLOSED, TIER_UNAVAILABLE, QUANTITY_LIMIT, SOLD_OUT_TIER, SOLD_OUT_EVENT.
-- =====================================================================
create function public.reserve_tickets(
  p_slug              text,
  p_user              uuid,
  p_event_title       text,     -- titre éditorial, résolu CÔTÉ SERVEUR (getAllEditions)
  p_items             jsonb,    -- [{tier_id, quantity, participants:[{first_name,last_name}]}]
  p_buyer             jsonb,    -- {email, first_name, last_name, phone}
  p_fee_percent       numeric,
  p_fee_fixed_cents   int,
  p_terms_version     text,
  p_guardian_consent  boolean,
  p_ttl               interval default interval '15 minutes'
)
returns table (
  order_id uuid, order_number text, subtotal_cents int, fee_cents int,
  total_cents int, expires_at timestamptz, superseded_sessions text[]
)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  ev   public.ticketed_events;
  t    public.ticket_tiers;
  it   jsonb;
  oid  uuid;
  qty  int;
  nb   int := 0;
  sub  int := 0;
  fee  int;
  sup  text[];
  seen uuid[] := '{}';
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(p_guardian_consent, false) or coalesce(p_terms_version, '') = '' then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 10
     or coalesce(p_buyer ->> 'email', '') = ''
     or p_fee_percent < 0 or p_fee_percent > 100
     or p_fee_fixed_cents < 0 or p_fee_fixed_cents > 5000 then
    raise exception 'INVALID_ITEMS';
  end if;

  -- 1) verrou de l'événement (sérialise les achats de cet événement)
  select * into ev from public.ticketed_events where event_slug = p_slug for update;
  if not found or not ev.ticketing_enabled or ev.status <> 'published' then
    raise exception 'EVENT_NOT_ON_SALE';
  end if;
  if now() < ev.sales_open_at then raise exception 'SALES_NOT_OPEN'; end if;
  if now() >= least(ev.sales_close_at, ev.starts_at) then raise exception 'SALES_CLOSED'; end if;

  -- 2) verrou des lignes de tarif demandées, dans un ordre stable
  perform 1 from public.ticket_tiers
   where ticketed_event_id = ev.id
     and id in (select (x ->> 'tier_id')::uuid from jsonb_array_elements(p_items) x)
   order by id for update;

  -- 3) réservations périmées → 'expired' (cosmétique : le calcul du stock les ignore déjà)
  update public.orders set status = 'expired'
   where ticketed_event_id = ev.id and status = 'pending' and expires_at <= now();
  -- une seule réservation active par client et par événement (anti-accaparement)
  with s as (
    update public.orders set status = 'expired'
     where user_id = p_user and ticketed_event_id = ev.id and status = 'pending'
    returning stripe_checkout_session_id
  )
  select coalesce(array_agg(stripe_checkout_session_id) filter (where stripe_checkout_session_id is not null),
                  array[]::text[])
    into sup from s;

  insert into public.orders (
    user_id, ticketed_event_id, event_slug, buyer_email, buyer_first_name, buyer_last_name,
    buyer_phone, expires_at, terms_accepted_at, terms_version, guardian_consent_at
  ) values (
    p_user, ev.id, p_slug, lower(p_buyer ->> 'email'),
    coalesce(p_buyer ->> 'first_name', ''), coalesce(p_buyer ->> 'last_name', ''),
    coalesce(p_buyer ->> 'phone', ''), now() + p_ttl, now(), p_terms_version, now()
  ) returning id into oid;

  for it in select value from jsonb_array_elements(p_items) loop
    qty := (it ->> 'quantity')::int;
    if (it ->> 'tier_id')::uuid = any (seen) then raise exception 'INVALID_ITEMS'; end if;
    seen := seen || (it ->> 'tier_id')::uuid;

    select * into t from public.ticket_tiers
     where id = (it ->> 'tier_id')::uuid and ticketed_event_id = ev.id;
    if not found or not t.is_active or t.archived_at is not null then
      raise exception 'TIER_UNAVAILABLE';
    end if;
    if now() < t.sales_start then raise exception 'SALES_NOT_OPEN'; end if;
    if now() >= t.sales_end   then raise exception 'SALES_CLOSED'; end if;
    if qty is null or qty < 1 or qty > t.max_per_order then raise exception 'QUANTITY_LIMIT'; end if;
    if jsonb_typeof(it -> 'participants') is distinct from 'array'
       or jsonb_array_length(it -> 'participants') <> qty then
      raise exception 'INVALID_PARTICIPANTS';
    end if;
    if qty > t.quantity_total - public.tier_consumed(t.id) then raise exception 'SOLD_OUT_TIER'; end if;

    insert into public.order_items (
      order_id, tier_id, quantity, unit_price_cents, participants,
      event_title, event_starts_at, venue_name, venue_address, tier_name
    ) values (
      oid, t.id, qty, t.price_cents, it -> 'participants',
      p_event_title, ev.starts_at, ev.venue_name, ev.venue_address, t.name
    );
    sub := sub + qty * t.price_cents;
    nb  := nb + qty;
  end loop;

  if nb > 20 then raise exception 'QUANTITY_LIMIT'; end if;
  -- event_consumed inclut déjà cette commande (pending, non expirée) :
  -- dépassement de la capacité de l'événement = échec de toute la transaction.
  if public.event_consumed(ev.id) > ev.capacity then raise exception 'SOLD_OUT_EVENT'; end if;

  fee := round(sub * p_fee_percent / 100.0)::int + p_fee_fixed_cents;
  update public.orders
     set subtotal_cents = sub, fee_cents = fee, total_cents = sub + fee
   where id = oid;

  return query
    select o.id, o.order_number, o.subtotal_cents, o.fee_cents, o.total_cents, o.expires_at, sup
      from public.orders o where o.id = oid;
end $$;

-- Nettoyage OPTIONNEL des réservations périmées (le stock n'en dépend pas).
-- Renvoie les sessions Stripe à expirer côté API (au mieux).
create function public.expire_stale_orders() returns text[]
language sql volatile security definer set search_path = public, pg_temp as $$
  with s as (
    update public.orders set status = 'expired'
     where status = 'pending' and expires_at <= now()
    returning stripe_checkout_session_id
  )
  select coalesce(array_agg(stripe_checkout_session_id) filter (where stripe_checkout_session_id is not null),
                  array[]::text[])
  from s
$$;

-- =====================================================================
-- ADMINISTRATION (billetterie uniquement) — chaque fonction :
--  * exige que p_actor soit un compte Supabase de rôle 'admin' (défense en
--    profondeur : la route l'a déjà vérifié) ;
--  * verrouille l'événement avant toute vérification de stock ;
--  * écrit dans audit_log dans la MÊME transaction (avant / après).
-- =====================================================================
create function public._audit(
  p_actor uuid, p_action text, p_entity text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_meta jsonb default '{}'
) returns void language sql volatile security definer set search_path = public, pg_temp as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, before, after, meta)
  values (p_actor, p_action, p_entity, p_entity_id, p_before, p_after, coalesce(p_meta, '{}'))
$$;

create function public._assert_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_actor is null or not exists (
    select 1 from public.profiles where id = p_actor and role = 'admin'
  ) then
    raise exception 'FORBIDDEN';
  end if;
end $$;

-- Crée ou met à jour la configuration billetterie d'un événement.
create function public.admin_save_event(
  p_actor uuid, p_slug text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_doors_open_at timestamptz, p_venue_name text, p_venue_address text, p_capacity int,
  p_sales_open_at timestamptz, p_sales_close_at timestamptz,
  p_ticketing_enabled boolean, p_status text
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old public.ticketed_events; cur public.ticketed_events;
begin
  perform public._assert_admin(p_actor);
  select * into old from public.ticketed_events where event_slug = p_slug for update;
  if found then
    if p_capacity < public.event_consumed(old.id) then
      raise exception 'CAPACITY_BELOW_SOLD' using detail = public.event_consumed(old.id)::text;
    end if;
    update public.ticketed_events set
      starts_at = p_starts_at, ends_at = p_ends_at, doors_open_at = p_doors_open_at,
      venue_name = p_venue_name, venue_address = p_venue_address, capacity = p_capacity,
      sales_open_at = p_sales_open_at, sales_close_at = p_sales_close_at,
      ticketing_enabled = p_ticketing_enabled, status = p_status
     where id = old.id returning * into cur;
    perform public._audit(p_actor, 'event.update', 'ticketed_event', cur.id::text, to_jsonb(old), to_jsonb(cur));
  else
    insert into public.ticketed_events (
      event_slug, starts_at, ends_at, doors_open_at, venue_name, venue_address, capacity,
      sales_open_at, sales_close_at, ticketing_enabled, status
    ) values (
      p_slug, p_starts_at, p_ends_at, p_doors_open_at, p_venue_name, p_venue_address, p_capacity,
      p_sales_open_at, p_sales_close_at, p_ticketing_enabled, p_status
    ) returning * into cur;
    perform public._audit(p_actor, 'event.create', 'ticketed_event', cur.id::text, null, to_jsonb(cur));
  end if;
  return cur.id;
end $$;

-- Crée (p_tier_id null) ou met à jour un tarif.
-- Impossible de descendre quantity_total sous (vendus + réservés en cours).
create function public.admin_save_tier(
  p_actor uuid, p_event_slug text, p_tier_id uuid, p_name text, p_description text,
  p_price_cents int, p_quantity_total int, p_max_per_order int,
  p_sales_start timestamptz, p_sales_end timestamptz, p_is_active boolean, p_sort_order int
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; old public.ticket_tiers; cur public.ticket_tiers;
begin
  perform public._assert_admin(p_actor);
  select * into ev from public.ticketed_events where event_slug = p_event_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if p_tier_id is null then
    insert into public.ticket_tiers (
      ticketed_event_id, name, description, price_cents, quantity_total, max_per_order,
      sales_start, sales_end, is_active, sort_order
    ) values (
      ev.id, p_name, p_description, p_price_cents, p_quantity_total, p_max_per_order,
      p_sales_start, p_sales_end, p_is_active, p_sort_order
    ) returning * into cur;
    perform public._audit(p_actor, 'tier.create', 'ticket_tier', cur.id::text, null, to_jsonb(cur),
                          jsonb_build_object('event_slug', p_event_slug));
  else
    select * into old from public.ticket_tiers
     where id = p_tier_id and ticketed_event_id = ev.id for update;
    if not found then raise exception 'TIER_NOT_FOUND'; end if;
    if old.archived_at is not null then raise exception 'TIER_ARCHIVED'; end if;
    if p_quantity_total < public.tier_consumed(old.id) then
      raise exception 'QUANTITY_BELOW_SOLD' using detail = public.tier_consumed(old.id)::text;
    end if;
    update public.ticket_tiers set
      name = p_name, description = p_description, price_cents = p_price_cents,
      quantity_total = p_quantity_total, max_per_order = p_max_per_order,
      sales_start = p_sales_start, sales_end = p_sales_end,
      is_active = p_is_active, sort_order = p_sort_order
     where id = old.id returning * into cur;
    perform public._audit(p_actor, 'tier.update', 'ticket_tier', cur.id::text, to_jsonb(old), to_jsonb(cur),
                          jsonb_build_object('event_slug', p_event_slug));
  end if;
  return cur.id;
end $$;

-- Supprime un tarif jamais vendu ; sinon l'ARCHIVE (les commandes le référencent).
-- Renvoie 'deleted' ou 'archived'.
create function public.admin_remove_tier(p_actor uuid, p_tier_id uuid) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev_id uuid; old public.ticket_tiers; cur public.ticket_tiers;
begin
  perform public._assert_admin(p_actor);
  select ticketed_event_id into ev_id from public.ticket_tiers where id = p_tier_id;
  if not found then raise exception 'TIER_NOT_FOUND'; end if;
  perform 1 from public.ticketed_events where id = ev_id for update;
  select * into old from public.ticket_tiers where id = p_tier_id for update;
  if not found then raise exception 'TIER_NOT_FOUND'; end if;

  if exists (select 1 from public.order_items where tier_id = p_tier_id) then
    if old.archived_at is null then
      update public.ticket_tiers set archived_at = now(), is_active = false
       where id = old.id returning * into cur;
      perform public._audit(p_actor, 'tier.archive', 'ticket_tier', old.id::text, to_jsonb(old), to_jsonb(cur));
    end if;
    return 'archived';
  end if;
  delete from public.ticket_tiers where id = old.id;
  perform public._audit(p_actor, 'tier.delete', 'ticket_tier', old.id::text, to_jsonb(old), null);
  return 'deleted';
end $$;

-- Réglages modifiables sans redéployer (flag Bizouk/natif, frais…).
create function public.admin_set_setting(p_actor uuid, p_key text, p_value jsonb) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old public.app_settings; cur public.app_settings;
begin
  perform public._assert_admin(p_actor);
  select * into old from public.app_settings where key = p_key for update;
  if not found then raise exception 'UNKNOWN_SETTING'; end if;
  update public.app_settings set value = p_value, updated_by = p_actor
   where key = p_key returning * into cur;
  perform public._audit(p_actor, 'setting.update', 'app_setting', p_key,
                        jsonb_build_object('value', old.value), jsonb_build_object('value', cur.value));
end $$;

-- =====================================================================
-- Garde-fous de dernier recours (même un UPDATE direct en service_role ne peut
-- pas descendre un stock sous le consommé). Les fonctions admin_* passent
-- déjà par le verrou d'événement ; ceci protège contre un contournement.
-- =====================================================================
create function public._guard_tier_quantity() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.quantity_total < old.quantity_total
     and new.quantity_total < public.tier_consumed(old.id) then
    raise exception 'QUANTITY_BELOW_SOLD' using detail = public.tier_consumed(old.id)::text;
  end if;
  return new;
end $$;
create trigger ticket_tiers_guard_quantity
  before update of quantity_total on public.ticket_tiers
  for each row execute function public._guard_tier_quantity();

create function public._guard_event_capacity() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.capacity < old.capacity and new.capacity < public.event_consumed(old.id) then
    raise exception 'CAPACITY_BELOW_SOLD' using detail = public.event_consumed(old.id)::text;
  end if;
  return new;
end $$;
create trigger ticketed_events_guard_capacity
  before update of capacity on public.ticketed_events
  for each row execute function public._guard_event_capacity();

-- =====================================================================
-- EXECUTE : retiré à public / anon / authenticated, accordé à service_role,
-- sauf get_availability (lecture publique de compteurs).
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('tier_consumed', 'event_consumed', 'reserve_tickets', 'expire_stale_orders',
                        '_audit', '_assert_admin', 'admin_save_event', 'admin_save_tier',
                        'admin_remove_tier', 'admin_set_setting',
                        '_guard_tier_quantity', '_guard_event_capacity')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

revoke execute on function public.get_availability(text) from public;
grant execute on function public.get_availability(text) to anon, authenticated, service_role;
