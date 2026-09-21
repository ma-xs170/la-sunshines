-- =====================================================================
-- Tests migration 011 — tarifs par l'organisateur (mêmes règles que l'admin), scan par le staff d'organisation. ROLLBACK.
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;

insert into auth.users (id, email) values
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('01000000-0000-0000-0000-000000000002', 'manager@test.local'),
  ('01000000-0000-0000-0000-000000000003', 'staff@test.local'),
  ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local'),
  ('50000000-0000-0000-0000-000000000005', 'stranger@test.local');
insert into public.organizers (id, name, contact_email) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', 'b@test.local');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'manager'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published', 'Salle A');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 50, true, 'published', 'Salle B');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6),
  ('a9000000-0000-0000-0000-00000000001a', 'e9000000-0000-0000-0000-00000000000a', 'Jamais vendu', 1000, 5, 6);
insert into public.orders (id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('09000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'x@test.local', 4500, 0, 4500, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('19000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 3, 1500,
   '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"},{"first_name":"C","last_name":"C"}]', 'A', now() + interval '3 days', 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name) values
  ('79000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'CODE-1', 'A', 'A'),
  ('79000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'CODE-2', 'B', 'B'),
  ('79000000-0000-0000-0000-00000000002a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'CODE-3', 'C', 'C');

do $$
declare
  ow constant uuid := '01000000-0000-0000-0000-000000000001'; mg constant uuid := '01000000-0000-0000-0000-000000000002';
  st constant uuid := '01000000-0000-0000-0000-000000000003'; ow_b constant uuid := '0b000000-0000-0000-0000-000000000003';
  stranger constant uuid := '50000000-0000-0000-0000-000000000005';
  j jsonb; id1 uuid; r record; n int;
begin
  -- 1 : droits — manager / owner écrivent ; staff, autre organisateur, inconnu : FORBIDDEN
  perform pg_temp.expect('FORBIDDEN', format('select public.org_tiers(%L, ''evt-a'')', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_tiers(%L, ''evt-a'')', ow_b));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_save_tier(%L, ''evt-a'', null, ''X'', '''', 1000, 5, 6, null, null, true, 0)', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_save_tier(%L, ''evt-a'', null, ''X'', '''', 1000, 5, 6, null, null, true, 0)', ow_b));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_save_tier(%L, ''evt-a'', null, ''X'', '''', 1000, 5, 6, null, null, true, 0)', stranger));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_remove_tier(%L, ''evt-a'', %L)', st, 'a9000000-0000-0000-0000-00000000001a'));
  raise notice 'OK 1 : seuls owner / manager gèrent les tarifs';

  -- 2 : création, lecture, audit
  id1 := public.org_save_tier(mg, 'evt-a', null, 'VIP', 'Accès prioritaire', 2500, 8, 4, null, null, true, 5);
  j := public.org_tiers(mg, 'evt-a');
  if jsonb_array_length(j -> 'tiers') <> 3 or j ->> 'capacity' <> '50' or j ->> 'consumed' <> '3' then raise exception 'FAIL 2a : %', j; end if;
  if not exists (select 1 from public.audit_log where actor_id = mg and action = 'tier.create' and entity_id = id1::text and meta ->> 'via' = 'organizer') then raise exception 'FAIL 2b : audit création'; end if;
  raise notice 'OK 2 : création de tarif journalisée';

  -- 3 : prix minimum 0,50 € (contrainte de table)
  perform pg_temp.expect('new row for relation "ticket_tiers" violates check constraint "ticket_tiers_price_cents_check"',
    format('select public.org_save_tier(%L, ''evt-a'', null, ''Trop bas'', '''', 49, 5, 6, null, null, true, 0)', mg));
  perform public.org_save_tier(mg, 'evt-a', null, 'Minimum', '', 50, 5, 6, null, null, true, 0);
  raise notice 'OK 3 : prix minimum 0,50 €';

  -- 4 : quantité jamais sous les billets vendus ; réservation en cours comptée
  perform pg_temp.expect('QUANTITY_BELOW_SOLD', format('select public.org_save_tier(%L, ''evt-a'', %L, ''Standard'', '''', 1500, 2, 6, null, null, true, 0)', mg, 'a9000000-0000-0000-0000-00000000000a'));
  perform public.org_save_tier(mg, 'evt-a', 'a9000000-0000-0000-0000-00000000000a', 'Standard', '', 1800, 3, 6, null, null, true, 0);   -- = vendus : accepté, prix modifiable
  if (select price_cents from public.ticket_tiers where id = 'a9000000-0000-0000-0000-00000000000a') <> 1800 then raise exception 'FAIL 4a'; end if;
  if not exists (select 1 from public.audit_log where actor_id = mg and action = 'tier.update' and entity_id = 'a9000000-0000-0000-0000-00000000000a') then raise exception 'FAIL 4b : audit modification'; end if;
  -- un tarif d'un autre événement n'est pas modifiable via ce slug
  perform pg_temp.expect('TIER_NOT_FOUND', format('select public.org_save_tier(%L, ''evt-b'', %L, ''Standard'', '''', 1500, 5, 6, null, null, true, 0)', ow_b, 'a9000000-0000-0000-0000-00000000000a'));
  raise notice 'OK 4 : quantité ≥ vendus, modification journalisée, tarifs cloisonnés par événement';

  -- 5 : suppression seulement si jamais vendu, sinon archivage
  if public.org_remove_tier(mg, 'evt-a', 'a9000000-0000-0000-0000-00000000001a') <> 'deleted' then raise exception 'FAIL 5a'; end if;
  if public.org_remove_tier(mg, 'evt-a', 'a9000000-0000-0000-0000-00000000000a') <> 'archived' then raise exception 'FAIL 5b : un tarif vendu doit être archivé'; end if;
  if not exists (select 1 from public.ticket_tiers where id = 'a9000000-0000-0000-0000-00000000000a' and archived_at is not null) then raise exception 'FAIL 5c : tarif vendu supprimé !'; end if;
  perform pg_temp.expect('TIER_ARCHIVED', format('select public.org_save_tier(%L, ''evt-a'', %L, ''Standard'', '''', 1500, 5, 6, null, null, true, 0)', mg, 'a9000000-0000-0000-0000-00000000000a'));
  select count(*) into n from public.audit_log where action in ('tier.delete', 'tier.archive');  if n <> 2 then raise exception 'FAIL 5d : audit (%)', n; end if;
  raise notice 'OK 5 : suppression uniquement si jamais vendu ; sinon archivage ; audit';

  -- 6 : fiche minimale pour le staff
  j := public.org_event_brief(st, 'evt-a');
  if j ? 'revenue_cents' or j ? 'sold' or j ->> 'my_role' <> 'staff' then raise exception 'FAIL 6a : %', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_brief(%L, ''evt-b'')', st));
  raise notice 'OK 6 : org_event_brief';

  -- 7 : scan — le staff d'une organisation scanne SES événements seulement
  select * into r from public.scan_ticket('CODE-1', 'e9000000-0000-0000-0000-00000000000a', st);
  if r.result <> 'valid' then raise exception 'FAIL 7a : %', r.result; end if;
  select * into r from public.scan_ticket('CODE-1', 'e9000000-0000-0000-0000-00000000000a', st);
  if r.result <> 'already_used' then raise exception 'FAIL 7b'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select * from public.scan_ticket(''CODE-2'', %L, %L)', 'e9000000-0000-0000-0000-00000000000b', st));
  perform pg_temp.expect('FORBIDDEN', format('select * from public.scan_ticket(''CODE-2'', %L, %L)', 'e9000000-0000-0000-0000-00000000000a', stranger));
  perform pg_temp.expect('FORBIDDEN', format('select * from public.scan_ticket(''CODE-2'', %L, %L)', 'e9000000-0000-0000-0000-00000000000a', ow_b));
  if public.scan_access(st, 'e9000000-0000-0000-0000-00000000000b') or public.scan_access(null, 'e9000000-0000-0000-0000-00000000000a') then raise exception 'FAIL 7c'; end if;
  raise notice 'OK 7 : scan réservé aux membres de l''organisation de l''événement';
end $$;
rollback;
