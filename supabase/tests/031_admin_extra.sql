-- =====================================================================
-- Tests migration 031 — arrêt d'urgence (statut d'évènement), recherche (code de billet, prénom), renommer un participant,
-- annuler une commande complète. ROLLBACK.
-- =====================================================================
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'), ('01000000-0000-0000-0000-000000000001', 'owner@test.local');
update public.profiles set role = 'admin', first_name = 'Ada', last_name = 'Min' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.admin_accounts (user_id, level, active, must_change_password) values ('ad000000-0000-0000-0000-0000000000ad', 'super', true, false);
insert into public.organizers (id, name) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Orga Test 031');
insert into public.organizer_members (organizer_id, user_id, role) values ('0b0b0b0b-0000-0000-0000-00000000000b', '01000000-0000-0000-0000-000000000001', 'owner');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status) values
  ('e3100000-0000-0000-0000-000000000001', 'evt-031', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '10 days', 50, true, 'published'),
  ('e3100000-0000-0000-0000-000000000002', 'evt-031-cancelled', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '10 days', 50, true, 'cancelled');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ('a3100000-0000-0000-0000-00000000000a', 'e3100000-0000-0000-0000-000000000001', 'Standard', 1500, 10, 6);
insert into public.orders (id, ticketed_event_id, event_slug, status, source, buyer_email, buyer_first_name, buyer_last_name, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('03100000-0000-0000-0000-000000000001', 'e3100000-0000-0000-0000-000000000001', 'evt-031', 'paid', 'web', 'zed@test.local', 'Zed', 'Zorro', 3000, 0, 3000, now()),
  ('03100000-0000-0000-0000-000000000002', 'e3100000-0000-0000-0000-000000000001', 'evt-031', 'paid', 'web', 'zed2@test.local', 'Zoe', 'Zorro', 1500, 0, 1500, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('13100000-0000-0000-0000-000000000001', '03100000-0000-0000-0000-000000000001', 'a3100000-0000-0000-0000-00000000000a', 2, 1500, '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"}]', 'E', now(), 'Standard'),
  ('13100000-0000-0000-0000-000000000002', '03100000-0000-0000-0000-000000000002', 'a3100000-0000-0000-0000-00000000000a', 1, 1500, '[{"first_name":"C","last_name":"C"}]', 'E', now(), 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name, status, used_at) values
  ('73100000-0000-0000-0000-000000000001', '03100000-0000-0000-0000-000000000001', '13100000-0000-0000-0000-000000000001', 'e3100000-0000-0000-0000-000000000001', 'a3100000-0000-0000-0000-00000000000a', 'CODE-Z1', 'A', 'A', 'valid', null),
  ('73100000-0000-0000-0000-000000000002', '03100000-0000-0000-0000-000000000001', '13100000-0000-0000-0000-000000000001', 'e3100000-0000-0000-0000-000000000001', 'a3100000-0000-0000-0000-00000000000a', 'CODE-Z2', 'B', 'B', 'used', now()),
  ('73100000-0000-0000-0000-000000000003', '03100000-0000-0000-0000-000000000002', '13100000-0000-0000-0000-000000000002', 'e3100000-0000-0000-0000-000000000001', 'a3100000-0000-0000-0000-00000000000a', 'CODE-Z3', 'C', 'C', 'valid', null);

do $$
declare adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; owner constant uuid := '01000000-0000-0000-0000-000000000001'; j jsonb;
begin
  -- 1 : arrêt d'urgence / dépublication
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_set_event_status(%L, %L, %L, %L)', owner, 'evt-031', 'closed', 'motif'));
  perform pg_temp.expect('BAD_STATUS', format('select public.admin_set_event_status(%L, %L, %L, %L)', adm, 'evt-031', 'archived', 'motif'));
  perform pg_temp.expect('REASON_REQUIRED', format('select public.admin_set_event_status(%L, %L, %L, %L)', adm, 'evt-031', 'closed', 'ok'));
  perform pg_temp.expect('REASON_REQUIRED', format('select public.admin_set_event_status(%L, %L, %L, %L)', adm, 'evt-031', 'closed', ''));
  j := public.admin_set_event_status(adm, 'evt-031', 'closed', 'Incident sécurité : arrêt des ventes');
  if (j ->> 'status') <> 'closed' or (j ->> 'changed')::boolean <> true then raise exception 'FAIL 1a : fermeture (%)', j; end if;
  if (select status from public.ticketed_events where event_slug = 'evt-031') <> 'closed' then raise exception 'FAIL 1b : statut en base'; end if;
  j := public.admin_set_event_status(adm, 'evt-031', 'closed', 'Incident sécurité : arrêt des ventes');
  if (j ->> 'changed')::boolean <> false then raise exception 'FAIL 1c : idempotent (%)', j; end if;
  j := public.admin_set_event_status(adm, 'evt-031', 'published', 'Incident résolu : réouverture');
  if (j ->> 'status') <> 'published' then raise exception 'FAIL 1d : réouverture (%)', j; end if;
  j := public.admin_set_event_status(adm, 'evt-031', 'draft', 'Dépublication : erreur de prix à corriger');
  if (j ->> 'status') <> 'draft' then raise exception 'FAIL 1e : dépublication (%)', j; end if;
  perform pg_temp.expect('USE_PUBLICATION_QUEUE', format('select public.admin_set_event_status(%L, %L, %L, %L)', adm, 'evt-031', 'published', 'motif'));   -- brouillon → publié : passe par la file dédiée (checklist)
  perform pg_temp.expect('BAD_TRANSITION', format('select public.admin_set_event_status(%L, %L, %L, %L)', adm, 'evt-031-cancelled', 'published', 'motif'));
  perform pg_temp.expect('EVENT_NOT_FOUND', format('select public.admin_set_event_status(%L, %L, %L, %L)', adm, 'inconnu-xyz', 'closed', 'motif'));
  if (select count(*) from public.audit_log where action = 'admin.event_status') <> 3 then raise exception 'FAIL 1f : journalisation (3 vrais changements)'; end if;

  -- 2 : recherche globale (code de billet, prénom acheteur)
  j := public.admin_global_search(adm, 'CODE-Z1');
  if jsonb_array_length(j -> 'billets') <> 1 or (j -> 'billets' -> 0 ->> 'order_id') <> '03100000-0000-0000-0000-000000000001' then raise exception 'FAIL 2a : recherche par code (%)', j; end if;
  j := public.admin_global_search(adm, 'CODE-Z');   -- pas de correspondance exacte → rien (évite un balayage large)
  if jsonb_array_length(j -> 'billets') <> 0 then raise exception 'FAIL 2b : pas de correspondance partielle sur le code (%)', j; end if;
  j := public.admin_global_search(adm, 'Zoe');
  if jsonb_array_length(j -> 'orders') <> 1 or (j -> 'orders' -> 0 ->> 'id') <> '03100000-0000-0000-0000-000000000002' then raise exception 'FAIL 2c : recherche par prénom acheteur (%)', j; end if;

  -- 3 : renommer un participant
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_rename_participant(%L, %L, %L, %L, %L)', owner, '73100000-0000-0000-0000-000000000001', 'X', 'Y', 'motif'));
  perform pg_temp.expect('REASON_REQUIRED', format('select public.admin_rename_participant(%L, %L, %L, %L, %L)', adm, '73100000-0000-0000-0000-000000000001', 'X', 'Y', ''));
  perform pg_temp.expect('BAD_NAME', format('select public.admin_rename_participant(%L, %L, %L, %L, %L)', adm, '73100000-0000-0000-0000-000000000001', '', 'Y', 'motif ok'));
  j := public.admin_rename_participant(adm, '73100000-0000-0000-0000-000000000002', 'X', 'Y', 'un billet déjà scanné peut aussi être corrigé');
  if (j ->> 'first_name') <> 'X' then raise exception 'FAIL 3z : un billet « used » peut être renommé (%)', j; end if;
  j := public.admin_rename_participant(adm, '73100000-0000-0000-0000-000000000001', 'Alexandre', 'Aristide', 'Faute de frappe signalée par le client');
  if (j ->> 'first_name') <> 'Alexandre' or (j ->> 'last_name') <> 'Aristide' then raise exception 'FAIL 3a : renommage (%)', j; end if;
  if (select holder_first_name from public.tickets where id = '73100000-0000-0000-0000-000000000001') <> 'Alexandre' then raise exception 'FAIL 3b : en base'; end if;
  if not exists (select 1 from public.audit_log where action = 'admin.rename_participant' and (before ->> 'first_name') = 'A' and (after ->> 'first_name') = 'Alexandre') then raise exception 'FAIL 3c : audit avant/après'; end if;

  -- 4 : annuler une commande complète
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_cancel_order(%L, %L, %L)', owner, '03100000-0000-0000-0000-000000000001', 'motif'));
  perform pg_temp.expect('HAS_USED_TICKETS', format('select public.admin_cancel_order(%L, %L, %L)', adm, '03100000-0000-0000-0000-000000000001', 'doublon signalé'));   -- contient le billet « used »
  perform pg_temp.expect('REASON_REQUIRED', format('select public.admin_cancel_order(%L, %L, %L)', adm, '03100000-0000-0000-0000-000000000002', ''));
  j := public.admin_cancel_order(adm, '03100000-0000-0000-0000-000000000002', 'Commande en double avec la 03100000…001');
  if (j ->> 'status') <> 'cancelled' or (j ->> 'tickets_cancelled')::int <> 1 then raise exception 'FAIL 4a : annulation (%)', j; end if;
  if (select status from public.orders where id = '03100000-0000-0000-0000-000000000002') <> 'cancelled' then raise exception 'FAIL 4b : statut de la commande'; end if;
  if (select status from public.tickets where id = '73100000-0000-0000-0000-000000000003') <> 'cancelled' then raise exception 'FAIL 4c : billet annulé'; end if;
  j := public.admin_cancel_order(adm, '03100000-0000-0000-0000-000000000002', 'nouvel essai');   -- idempotent
  if (j ->> 'tickets_cancelled')::int <> 0 then raise exception 'FAIL 4d : idempotent (%)', j; end if;
  perform pg_temp.expect('ORDER_NOT_FOUND', format('select public.admin_cancel_order(%L, %L, %L)', adm, gen_random_uuid(), 'motif'));
  perform pg_temp.expect('TICKET_INACTIVE', format('select public.admin_rename_participant(%L, %L, %L, %L, %L)', adm, '73100000-0000-0000-0000-000000000003', 'X', 'Y', 'billet désormais annulé'));

  -- 5 : droits : rien n'est exécutable par le navigateur
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_set_event_status', 'admin_rename_participant', 'admin_cancel_order')
             and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then raise exception 'FAIL 5 : fonction exécutable par anon / authenticated'; end if;
  raise notice 'ALL OK — 031';
end $$;
rollback;
