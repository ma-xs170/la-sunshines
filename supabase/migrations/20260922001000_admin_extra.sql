-- =====================================================================
-- Migration 031 — fonctions admin en plus (bloc 6, sous-ensemble retenu — voir ORGA-DECISIONS D46)
--
--  * admin_set_event_status : fermer/rouvrir les ventes d'un évènement en un clic (arrêt d'urgence global) ou le repasser
--    en brouillon (dépublier), motif obligatoire, journalisé. Les valeurs de statut existent déjà (draft/published/closed) :
--    aucun changement de schéma, aucune migration de données.
--  * admin_global_search : + recherche par code de billet (QR/scan), + prénom acheteur (déjà : référence, e-mail, nom).
--  * admin_rename_participant : corrige le nom d'un participant sur son billet (motif obligatoire, avant/après journalisés).
--  * admin_cancel_order : annule une commande complète (ses billets non utilisés), motif obligatoire. Distinct du remboursement
--    (déjà existant, begin_refund) : n'engage jamais Stripe, sert aux cas où aucun remboursement n'est dû (doublon, erreur,
--    commande manuelle annulée avant l'évènement) ou en complément d'un remboursement déjà fait manuellement.
-- Additive. Aucune donnée existante modifiée.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Statut d'un évènement, par un admin, pour n'importe quelle organisation. La toute PREMIÈRE publication d'un brouillon
-- passe par la file dédiée (org_request_publication / admin_review_publication, checklist vérifiée) : cette fonction ne
-- permet PAS ce cas précis, pour ne jamais publier un évènement incomplet en contournant la checklist. Elle sert à
-- l'arrêt d'urgence (published → closed), la réouverture (closed → published) et la dépublication (→ draft).
-- ---------------------------------------------------------------------
create function public.admin_set_event_status(p_actor uuid, p_slug text, p_status text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; r text := btrim(coalesce(p_reason, ''));
begin
  perform public._assert_admin(p_actor);
  if p_status not in ('draft', 'published', 'closed') then raise exception 'BAD_STATUS'; end if;
  if char_length(r) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into ev from public.ticketed_events where event_slug = p_slug for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if ev.status = 'cancelled' then raise exception 'BAD_TRANSITION'; end if;
  if ev.status = 'draft' and p_status = 'published' then raise exception 'USE_PUBLICATION_QUEUE'; end if;
  if ev.status = p_status then return jsonb_build_object('slug', p_slug, 'status', ev.status, 'changed', false); end if;
  update public.ticketed_events set status = p_status where id = ev.id;
  perform public._audit(p_actor, 'admin.event_status', 'ticketed_event', ev.id::text,
    jsonb_build_object('status', ev.status), jsonb_build_object('status', p_status, 'reason', left(r, 300)));
  return jsonb_build_object('slug', p_slug, 'status', p_status, 'changed', true);
end $$;

-- ---------------------------------------------------------------------
-- Recherche globale : + code de billet, + prénom acheteur (le reste inchangé).
-- ---------------------------------------------------------------------
create or replace function public.admin_global_search(p_actor uuid, p_q text, p_limit int default 8) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare q text := nullif(btrim(coalesce(p_q, '')), ''); like_q text; digits text; lim int := least(greatest(coalesce(p_limit, 8), 1), 20); contacts boolean; res jsonb;
begin
  perform public._assert_admin(p_actor);
  if not exists (select 1 from public.admin_accounts where user_id = p_actor and active) then raise exception 'FORBIDDEN'; end if;
  if q is null or char_length(q) < 2 then return jsonb_build_object('organizers', '[]'::jsonb, 'admins', '[]'::jsonb, 'orders', '[]'::jsonb, 'events', '[]'::jsonb, 'billets', '[]'::jsonb); end if;
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
          from public.orders o where o.order_number ilike like_q or o.buyer_email ilike like_q or o.buyer_last_name ilike like_q or o.buyer_first_name ilike like_q
         order by o.created_at desc limit lim) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(x) from (
        select e.event_slug as slug, e.status, e.starts_at, o.name as organizer, o.id as organizer_id
          from public.ticketed_events e join public.organizers o on o.id = e.organizer_id where e.event_slug ilike like_q order by e.starts_at desc limit lim) x), '[]'::jsonb),
    -- code de billet : recherche exacte (le code n'est jamais tronqué/partiel dans un scan ou une saisie) pour ne pas balayer toute la table par ilike.
    'billets', coalesce((select jsonb_agg(x) from (
        select t.id, t.code, t.status, t.holder_first_name, t.holder_last_name, t.ticketed_event_id as event_id, e.event_slug, o.id as order_id, o.order_number
          from public.tickets t join public.ticketed_events e on e.id = t.ticketed_event_id join public.orders o on o.id = t.order_id
         where t.code = q order by t.created_at desc limit lim) x), '[]'::jsonb))
  into res;
  if contacts then
    insert into public.audit_log (actor_id, action, entity, entity_id, meta) values (p_actor, 'admin.search_contact', 'search', null, jsonb_build_object('kind', case when q like '%@%' then 'email' else 'phone' end));
  end if;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- Renommer un participant (nom sur le billet). Motif obligatoire, avant/après journalisés. Un billet déjà scanné (« used »)
-- reste modifiable (faute de frappe repérée après l'entrée) ; seuls les billets annulés ou remboursés sont bloqués.
-- ---------------------------------------------------------------------
create function public.admin_rename_participant(p_actor uuid, p_ticket uuid, p_first text, p_last text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare old public.tickets; first text := btrim(coalesce(p_first, '')); last text := btrim(coalesce(p_last, '')); r text := btrim(coalesce(p_reason, ''));
begin
  perform public._assert_admin(p_actor);
  if char_length(first) < 1 or char_length(first) > 60 or char_length(last) < 1 or char_length(last) > 60 then raise exception 'BAD_NAME'; end if;
  if char_length(r) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into old from public.tickets where id = p_ticket for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  if old.status in ('cancelled', 'refunded') then raise exception 'TICKET_INACTIVE'; end if;
  update public.tickets set holder_first_name = first, holder_last_name = last where id = p_ticket;
  perform public._audit(p_actor, 'admin.rename_participant', 'ticket', p_ticket::text,
    jsonb_build_object('first_name', old.holder_first_name, 'last_name', old.holder_last_name),
    jsonb_build_object('first_name', first, 'last_name', last, 'reason', left(r, 300)));
  return jsonb_build_object('id', p_ticket, 'first_name', first, 'last_name', last);
end $$;

-- ---------------------------------------------------------------------
-- Annuler une commande complète (ses billets non utilisés/déjà annulés). N'engage JAMAIS Stripe : distinct du remboursement
-- (begin_refund, inchangé). Un billet déjà scanné (« used ») bloque l'annulation automatique : à traiter billet par billet.
-- ---------------------------------------------------------------------
create function public.admin_cancel_order(p_actor uuid, p_order uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ord public.orders; r text := btrim(coalesce(p_reason, '')); n int;
begin
  perform public._assert_admin(p_actor);
  if char_length(r) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into ord from public.orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status in ('cancelled', 'refunded') then return jsonb_build_object('id', p_order, 'status', ord.status, 'tickets_cancelled', 0); end if;
  if exists (select 1 from public.tickets where order_id = p_order and status = 'used') then raise exception 'HAS_USED_TICKETS'; end if;
  update public.tickets set status = 'cancelled', cancelled_at = now() where order_id = p_order and status = 'valid';
  get diagnostics n = row_count;
  update public.orders set status = 'cancelled' where id = p_order;
  perform public._audit(p_actor, 'admin.cancel_order', 'order', p_order::text,
    jsonb_build_object('status', ord.status), jsonb_build_object('status', 'cancelled', 'tickets_cancelled', n, 'reason', left(r, 300)));
  return jsonb_build_object('id', p_order, 'status', 'cancelled', 'tickets_cancelled', n);
end $$;

-- Droits : service_role uniquement (jamais appelées directement par le navigateur).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('admin_set_event_status', 'admin_rename_participant', 'admin_cancel_order')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
