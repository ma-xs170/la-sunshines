-- =====================================================================
-- Phase 5 — Scan à l'entrée, statistiques, annulation de billet, invitations.
--
-- Toutes les fonctions : SECURITY DEFINER, search_path fixé, EXECUTE retiré à
-- public/anon/authenticated → service_role uniquement (les routes serveur ont déjà
-- contrôlé le rôle Supabase staff/admin ; les fonctions le revérifient).
-- =====================================================================

-- ---------------------------------------------------------------------
-- SCAN ATOMIQUE. La signature HMAC du code est vérifiée par l'application AVANT cet
-- appel (un code falsifié ne touche jamais la base). Résultats :
--   valid | already_used (avec l'heure du PREMIER scan) | invalid | wrong_event | cancelled
-- Deux scans simultanés du même billet : le 2e attend le verrou de ligne, relit
-- status = 'used' et ne matche plus l'UPDATE → un seul « valid », toujours.
-- ---------------------------------------------------------------------
create function public.scan_ticket(p_code text, p_event uuid, p_scanner uuid)
returns table (result text, ticket_id uuid, holder text, tier_name text, used_at timestamptz)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t public.tickets; tn text;
begin
  if p_scanner is null or not exists (
    select 1 from public.profiles where id = p_scanner and role in ('staff', 'admin')
  ) then
    raise exception 'FORBIDDEN';
  end if;

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

create function public.scan_stats(p_event uuid) returns table (entered int, sold int)
language sql stable security definer set search_path = public, pg_temp as $$
  select (count(*) filter (where status = 'used'))::int,
         (count(*) filter (where status in ('valid', 'used')))::int
    from public.tickets where ticketed_event_id = p_event
$$;

-- ---------------------------------------------------------------------
-- Annulation d'un billet (sans remboursement) — libère la place. Un billet déjà
-- scanné ne peut pas être annulé. Audité.
-- ---------------------------------------------------------------------
create function public.admin_cancel_ticket(p_actor uuid, p_ticket uuid) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev_id uuid; old public.tickets; cur public.tickets;
begin
  perform public._assert_admin(p_actor);
  select ticketed_event_id into ev_id from public.tickets where id = p_ticket;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  perform 1 from public.ticketed_events where id = ev_id for update;
  select * into old from public.tickets where id = p_ticket for update;
  if old.status = 'used' then raise exception 'TICKET_USED'; end if;
  if old.status in ('cancelled', 'refunded') then return old.status; end if;   -- idempotent
  update public.tickets set status = 'cancelled', cancelled_at = now() where id = p_ticket returning * into cur;
  perform public._audit(p_actor, 'ticket.cancel', 'ticket', p_ticket::text,
                        jsonb_build_object('status', old.status), jsonb_build_object('status', cur.status),
                        jsonb_build_object('order_id', old.order_id));
  return 'cancelled';
end $$;

-- ---------------------------------------------------------------------
-- Invitation (billets manuels, sans paiement) : commande source 'manual', payée, total 0.
-- Consomme le stock comme une vente. Si un compte existe pour l'email, les billets
-- apparaissent dans son « Mes billets ». Les codes HMAC sont fournis par l'application.
-- p_holders : [{id, code, first_name, last_name}] — un par place.
-- ---------------------------------------------------------------------
create function public.admin_create_invitation(
  p_actor uuid, p_slug text, p_tier uuid, p_event_title text,
  p_email text, p_first text, p_last text, p_holders jsonb
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  ev public.ticketed_events; t public.ticket_tiers; qty int; oid uuid; iid uuid; uid uuid;
begin
  perform public._assert_admin(p_actor);
  if jsonb_typeof(p_holders) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  qty := jsonb_array_length(p_holders);
  if qty < 1 or qty > 20 or coalesce(p_email, '') = '' then raise exception 'INVALID_ITEMS'; end if;

  select * into ev from public.ticketed_events where event_slug = p_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  select * into t from public.ticket_tiers where id = p_tier and ticketed_event_id = ev.id for update;
  if not found or t.archived_at is not null then raise exception 'TIER_UNAVAILABLE'; end if;
  if qty > t.quantity_total - public.tier_consumed(t.id) then raise exception 'SOLD_OUT_TIER'; end if;
  if public.event_consumed(ev.id) + qty > ev.capacity then raise exception 'SOLD_OUT_EVENT'; end if;

  select id into uid from auth.users where lower(email) = lower(p_email) limit 1;

  insert into public.orders (user_id, ticketed_event_id, event_slug, status, source, buyer_email,
                             buyer_first_name, buyer_last_name, paid_at)
  values (uid, ev.id, p_slug, 'paid', 'manual', lower(p_email), left(coalesce(p_first, ''), 60),
          left(coalesce(p_last, ''), 60), now())
  returning id into oid;

  insert into public.order_items (order_id, tier_id, quantity, unit_price_cents, participants,
                                  event_title, event_starts_at, venue_name, venue_address, tier_name)
  select oid, t.id, qty, 0,
         (select jsonb_agg(jsonb_build_object('first_name', x ->> 'first_name', 'last_name', x ->> 'last_name'))
            from jsonb_array_elements(p_holders) x),
         p_event_title, ev.starts_at, ev.venue_name, ev.venue_address, t.name
  returning id into iid;

  insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code,
                              holder_first_name, holder_last_name)
  select (x ->> 'id')::uuid, oid, iid, ev.id, t.id, uid, x ->> 'code',
         left(coalesce(x ->> 'first_name', ''), 60), left(coalesce(x ->> 'last_name', ''), 60)
    from jsonb_array_elements(p_holders) x;

  perform public._audit(p_actor, 'invitation.create', 'order', oid::text, null,
                        jsonb_build_object('email', lower(p_email), 'quantity', qty, 'tier', t.name, 'event', p_slug));
  return oid;
end $$;

-- ---------------------------------------------------------------------
-- Statistiques d'un événement : vendus par tarif, chiffre d'affaires, taux de remplissage.
-- Chiffre d'affaires = encaissé NET des remboursements (frais de service compris),
-- commandes web uniquement. Une invitation n'a pas de recette.
-- ---------------------------------------------------------------------
create function public.admin_event_stats(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; res jsonb;
begin
  perform public._assert_admin(p_actor);
  select * into ev from public.ticketed_events where event_slug = p_slug;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select jsonb_build_object(
    'capacity', ev.capacity,
    'sold', (select count(*) from public.tickets where ticketed_event_id = ev.id and status in ('valid', 'used')),
    'entered', (select count(*) from public.tickets where ticketed_event_id = ev.id and status = 'used'),
    'invitations', (select count(*) from public.tickets tk join public.orders o on o.id = tk.order_id
                     where tk.ticketed_event_id = ev.id and o.source = 'manual' and tk.status in ('valid', 'used')),
    'orders_paid', (select count(*) from public.orders where ticketed_event_id = ev.id and source = 'web'
                     and status in ('paid', 'partially_refunded', 'refunded')),
    'revenue_cents', coalesce((select sum(total_cents - refunded_cents) from public.orders
                                where ticketed_event_id = ev.id and source = 'web'
                                  and status in ('paid', 'partially_refunded', 'refunded')), 0),
    'refunded_cents', coalesce((select sum(refunded_cents) from public.orders where ticketed_event_id = ev.id), 0),
    'fill_rate', round(100.0 * (select count(*) from public.tickets where ticketed_event_id = ev.id
                                  and status in ('valid', 'used')) / ev.capacity, 1),
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier_id', t.id, 'name', t.name, 'price_cents', t.price_cents, 'quantity_total', t.quantity_total,
        'archived', t.archived_at is not null,
        'sold', (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')),
        'reserved', public.tier_consumed(t.id)
                    - (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')),
        'revenue_cents', coalesce((select sum(oi.unit_price_cents) from public.tickets tk
                                    join public.order_items oi on oi.id = tk.order_item_id
                                    where tk.tier_id = t.id and tk.status in ('valid', 'used')), 0),
        'fill_rate', case when t.quantity_total > 0 then
            round(100.0 * (select count(*) from public.tickets tk where tk.tier_id = t.id and tk.status in ('valid', 'used')) / t.quantity_total, 1)
          else 0 end
      ) order by t.sort_order, t.created_at)
      from public.ticket_tiers t where t.ticketed_event_id = ev.id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('scan_ticket', 'scan_stats', 'admin_cancel_ticket', 'admin_create_invitation', 'admin_event_stats')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
