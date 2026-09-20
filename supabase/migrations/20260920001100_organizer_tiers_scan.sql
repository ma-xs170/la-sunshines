-- =====================================================================
-- Migration 011 — tableau de bord organisateur : tarifs (création / modification / archivage) et scan pour le staff.
--
--  * org_tiers / org_save_tier / org_remove_tier : mêmes règles que le back-office admin (admin_save_tier / admin_remove_tier) :
--      - prix minimum 0,50 € (contrainte de table) ;  - quantité jamais sous (vendus + réservations en cours) ;
--      - un tarif déjà vendu n'est JAMAIS supprimé : il est archivé.
--    Réservé aux rôles owner / manager / admin. Chaque écriture est journalisée dans audit_log (comme côté admin).
--  * org_event_brief : fiche minimale d'un événement (sans chiffres ni participants) pour le staff, qui ne fait que scanner.
--  * scan_access / scan_ticket : le staff d'une organisation (et ses owner / manager) peut scanner les billets DE SES événements.
-- =====================================================================

-- Fiche minimale : tout membre (staff compris). Ne renvoie ni revenus, ni participants.
create function public.org_event_brief(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; org public.organizers;
begin
  ev := public._org_access(p_actor, p_slug, 'scan');
  select * into org from public.organizers where id = ev.organizer_id;
  return jsonb_build_object('id', ev.id, 'slug', ev.event_slug, 'starts_at', ev.starts_at, 'venue_name', ev.venue_name,
    'organizer_name', org.name, 'my_role', public._org_role(p_actor, ev.organizer_id));
end $$;

-- Tarifs d'un événement (archivés compris), avec ce que l'écran d'édition affiche.
create function public.org_tiers(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  return jsonb_build_object('capacity', ev.capacity, 'consumed', public.event_consumed(ev.id), 'tiers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents, 'quantity_total', t.quantity_total,
      'max_per_order', t.max_per_order, 'sales_start', t.sales_start, 'sales_end', t.sales_end, 'is_active', t.is_active,
      'archived', t.archived_at is not null, 'sort_order', t.sort_order,
      'sold', (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')),
      'consumed', public.tier_consumed(t.id)
    ) order by (t.archived_at is not null), t.sort_order, t.created_at)
    from public.ticket_tiers t where t.ticketed_event_id = ev.id), '[]'::jsonb));
end $$;

create function public.org_save_tier(
  p_actor uuid, p_slug text, p_tier_id uuid, p_name text, p_description text,
  p_price_cents int, p_quantity_total int, p_max_per_order int,
  p_sales_start timestamptz, p_sales_end timestamptz, p_is_active boolean, p_sort_order int
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; old public.ticket_tiers; cur public.ticket_tiers;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  perform 1 from public.ticketed_events where id = ev.id for update;          -- même verrou que côté admin (ventes concurrentes)
  if p_tier_id is null then
    insert into public.ticket_tiers (ticketed_event_id, name, description, price_cents, quantity_total, max_per_order, sales_start, sales_end, is_active, sort_order)
    values (ev.id, p_name, p_description, p_price_cents, p_quantity_total, p_max_per_order, p_sales_start, p_sales_end, p_is_active, p_sort_order)
    returning * into cur;
    perform public._audit(p_actor, 'tier.create', 'ticket_tier', cur.id::text, null, to_jsonb(cur),
                          jsonb_build_object('event_slug', p_slug, 'via', 'organizer'));
  else
    select * into old from public.ticket_tiers where id = p_tier_id and ticketed_event_id = ev.id for update;
    if not found then raise exception 'TIER_NOT_FOUND'; end if;
    if old.archived_at is not null then raise exception 'TIER_ARCHIVED'; end if;
    if p_quantity_total < public.tier_consumed(old.id) then
      raise exception 'QUANTITY_BELOW_SOLD' using detail = public.tier_consumed(old.id)::text;
    end if;
    update public.ticket_tiers set name = p_name, description = p_description, price_cents = p_price_cents, quantity_total = p_quantity_total,
      max_per_order = p_max_per_order, sales_start = p_sales_start, sales_end = p_sales_end, is_active = p_is_active, sort_order = p_sort_order
     where id = old.id returning * into cur;
    perform public._audit(p_actor, 'tier.update', 'ticket_tier', cur.id::text, to_jsonb(old), to_jsonb(cur),
                          jsonb_build_object('event_slug', p_slug, 'via', 'organizer'));
  end if;
  return cur.id;
end $$;

-- Supprime un tarif jamais vendu ; sinon l'ARCHIVE. Renvoie 'deleted' ou 'archived'.
create function public.org_remove_tier(p_actor uuid, p_slug text, p_tier_id uuid) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; old public.ticket_tiers; cur public.ticket_tiers;
begin
  ev := public._org_access(p_actor, p_slug, 'manage');
  perform 1 from public.ticketed_events where id = ev.id for update;
  select * into old from public.ticket_tiers where id = p_tier_id and ticketed_event_id = ev.id for update;
  if not found then raise exception 'TIER_NOT_FOUND'; end if;
  if exists (select 1 from public.order_items where tier_id = p_tier_id) then
    if old.archived_at is null then
      update public.ticket_tiers set archived_at = now(), is_active = false where id = old.id returning * into cur;
      perform public._audit(p_actor, 'tier.archive', 'ticket_tier', old.id::text, to_jsonb(old), to_jsonb(cur), jsonb_build_object('via', 'organizer'));
    end if;
    return 'archived';
  end if;
  delete from public.ticket_tiers where id = old.id;
  perform public._audit(p_actor, 'tier.delete', 'ticket_tier', old.id::text, to_jsonb(old), null, jsonb_build_object('via', 'organizer'));
  return 'deleted';
end $$;

-- Droit de scanner un événement : staff / admin du site, ou membre (tout rôle) de l'organisation de l'événement.
create function public.scan_access(p_actor uuid, p_event uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_actor is not null and (
    exists (select 1 from public.profiles where id = p_actor and role in ('staff', 'admin'))
    or exists (select 1 from public.ticketed_events e join public.organizer_members m on m.organizer_id = e.organizer_id
               where e.id = p_event and m.user_id = p_actor))
$$;

create or replace function public.scan_ticket(p_code text, p_event uuid, p_scanner uuid)
returns table (result text, ticket_id uuid, holder text, tier_name text, used_at timestamptz)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t public.tickets; tn text;
begin
  if not public.scan_access(p_scanner, p_event) then raise exception 'FORBIDDEN'; end if;

  update public.tickets
     set status = 'used', used_at = now(), used_by = p_scanner
   where code = p_code and status = 'valid' and ticketed_event_id = p_event
  returning * into t;
  if found then
    select name into tn from public.ticket_tiers where id = t.tier_id;
    return query select 'valid'::text, t.id, trim(t.holder_first_name || ' ' || t.holder_last_name), tn, t.used_at;
    return;
  end if;

  select * into t from public.tickets where code = p_code;
  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::text, null::timestamptz;
  elsif t.ticketed_event_id <> p_event then
    return query select 'wrong_event'::text, t.id, null::text, null::text, null::timestamptz;
  elsif t.status = 'used' then
    select name into tn from public.ticket_tiers where id = t.tier_id;
    return query select 'already_used'::text, t.id, trim(t.holder_first_name || ' ' || t.holder_last_name), tn, t.used_at;
  else
    return query select 'cancelled'::text, t.id, null::text, null::text, null::timestamptz;
  end if;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('org_event_brief', 'org_tiers', 'org_save_tier', 'org_remove_tier', 'scan_access')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
