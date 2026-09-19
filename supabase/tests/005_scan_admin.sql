-- Tests phase 5 — scan atomique, annulation, invitations, statistiques. Transaction annulée.
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % »', p_msg, got; end if;
end $$;

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
  ('57000000-0000-0000-0000-000000000057', 'staff@test.local'),
  ('c1000000-0000-0000-0000-000000000001', 'cust@test.local'),
  ('c2000000-0000-0000-0000-000000000002', 'guest@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
update public.profiles set role = 'staff' where id = '57000000-0000-0000-0000-000000000057';

insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e5000000-0000-0000-0000-000000000001', 'evt-scan', now() + interval '3 days', 10, true, 'published', 'Salle'),
  ('e5000000-0000-0000-0000-000000000002', 'evt-autre', now() + interval '3 days', 10, true, 'published', 'Autre');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a5000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000001', 'Standard', 1500, 6, 6),
  ('b5000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-000000000002', 'Autre', 1000, 6, 6);

-- 1 commande payée (3 × 15 €) + 3 billets ; 1 billet sur l'autre événement
insert into public.orders (id, user_id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('05000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'evt-scan', 'paid', 'cust@test.local', 4500, 200, 4700, now()),
  ('05000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'evt-autre', 'paid', 'cust@test.local', 1000, 0, 1000, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('15000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 3, 1500, '[{"first_name":"A","last_name":"1"},{"first_name":"B","last_name":"2"},{"first_name":"C","last_name":"3"}]', 'Soirée', now() + interval '3 days', 'Standard'),
  ('15000000-0000-0000-0000-000000000002', '05000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-00000000000b', 1, 1000, '[{"first_name":"X","last_name":"Y"}]', 'Autre', now() + interval '3 days', 'Autre');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code, holder_first_name, holder_last_name) values
  ('75000000-0000-0000-0000-000000000001', '05000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'CODE-1', 'Alice', 'Un'),
  ('75000000-0000-0000-0000-000000000002', '05000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'CODE-2', 'Bob', 'Deux'),
  ('75000000-0000-0000-0000-000000000003', '05000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'CODE-3', 'Cléo', 'Trois'),
  ('75000000-0000-0000-0000-000000000009', '05000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000001', 'CODE-OTHER', 'Xavier', 'Autre');

do $$
declare ev constant uuid := 'e5000000-0000-0000-0000-000000000001'; staff constant uuid := '57000000-0000-0000-0000-000000000057';
        adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; r record; first_scan timestamptz; s record;
begin
  -- ---------- SCAN ----------
  select * into r from public.scan_ticket('CODE-1', ev, staff);
  if r.result <> 'valid' or r.holder <> 'Alice Un' or r.tier_name <> 'Standard' or r.used_at is null then raise exception 'FAIL 1 : 1er scan → %', r.result; end if;
  first_scan := r.used_at;
  if (select status || used_by::text from public.tickets where code = 'CODE-1') <> 'used' || staff::text then raise exception 'FAIL 1b : billet non marqué utilisé par le scanner'; end if;

  select * into r from public.scan_ticket('CODE-1', ev, staff);
  if r.result <> 'already_used' or r.used_at <> first_scan or r.holder <> 'Alice Un' then raise exception 'FAIL 2 : 2e scan → % (heure du 1er scan attendue)', r.result; end if;
  select * into r from public.scan_ticket('CODE-1', ev, adm);
  if r.result <> 'already_used' or r.used_at <> first_scan then raise exception 'FAIL 2b : la 3e fois, par un admin'; end if;

  select * into r from public.scan_ticket('CODE-INCONNU', ev, staff);
  if r.result <> 'invalid' then raise exception 'FAIL 3 : code inconnu → %', r.result; end if;
  select * into r from public.scan_ticket('CODE-OTHER', ev, staff);
  if r.result <> 'wrong_event' then raise exception 'FAIL 4 : billet d''un autre événement → %', r.result; end if;
  if (select status from public.tickets where code = 'CODE-OTHER') <> 'valid' then raise exception 'FAIL 4b : le billet d''un autre événement a été consommé'; end if;

  update public.tickets set status = 'cancelled', cancelled_at = now() where code = 'CODE-2';
  select * into r from public.scan_ticket('CODE-2', ev, staff);
  if r.result <> 'cancelled' then raise exception 'FAIL 5 : billet annulé → %', r.result; end if;
  update public.tickets set status = 'refunded', cancelled_at = now() where code = 'CODE-3';
  select * into r from public.scan_ticket('CODE-3', ev, staff);
  if r.result <> 'cancelled' then raise exception 'FAIL 5b : billet remboursé → %', r.result; end if;
  update public.tickets set status = 'valid', cancelled_at = null where code in ('CODE-2', 'CODE-3');

  -- seuls staff et admin peuvent scanner
  perform pg_temp.expect('FORBIDDEN', format('select * from public.scan_ticket(''CODE-2'', %L, %L)', ev, 'c1000000-0000-0000-0000-000000000001'));
  perform pg_temp.expect('FORBIDDEN', format('select * from public.scan_ticket(''CODE-2'', %L, null)', ev));
  if (select status from public.tickets where code = 'CODE-2') <> 'valid' then raise exception 'FAIL 6 : un client a consommé un billet'; end if;

  select * into s from public.scan_stats(ev);
  if s.entered <> 1 or s.sold <> 3 then raise exception 'FAIL 7 : compteur % / % (attendu 1 / 3)', s.entered, s.sold; end if;
  perform public.scan_ticket('CODE-2', ev, staff);
  select * into s from public.scan_stats(ev);
  if s.entered <> 2 or s.sold <> 3 then raise exception 'FAIL 7b : compteur % / %', s.entered, s.sold; end if;
  raise notice 'OK 1-7 : scan valide / déjà scanné (heure du 1er) / invalide / autre événement / annulé, rôles, compteur';

  -- ---------- ANNULATION DE BILLET ----------
  perform pg_temp.expect('TICKET_USED', format('select public.admin_cancel_ticket(%L, %L)', adm, '75000000-0000-0000-0000-000000000001'));
  if public.tier_consumed('a5000000-0000-0000-0000-00000000000a') <> 3 then raise exception 'FAIL 8 : consommé attendu 3'; end if;
  if public.admin_cancel_ticket(adm, '75000000-0000-0000-0000-000000000003') <> 'cancelled' then raise exception 'FAIL 8b'; end if;
  if public.tier_consumed('a5000000-0000-0000-0000-00000000000a') <> 2 then raise exception 'FAIL 8c : la place n''est pas libérée'; end if;
  if public.admin_cancel_ticket(adm, '75000000-0000-0000-0000-000000000003') <> 'cancelled' then raise exception 'FAIL 8d : annulation non idempotente'; end if;
  if (select count(*) from public.audit_log where action = 'ticket.cancel') <> 1 then raise exception 'FAIL 8e : audit (une seule ligne attendue)'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_cancel_ticket(%L, %L)', staff, '75000000-0000-0000-0000-000000000002'));
  perform pg_temp.expect('TICKET_NOT_FOUND', format('select public.admin_cancel_ticket(%L, gen_random_uuid())', adm));
  raise notice 'OK 8 : annulation (place libérée, idempotente, audit) ; billet scanné et non-admin refusés';

  -- ---------- INVITATIONS ----------
  declare oid uuid; o public.orders; n int;
  begin
    oid := public.admin_create_invitation(adm, 'evt-scan', 'a5000000-0000-0000-0000-00000000000a', 'Soirée', 'Guest@Test.local', 'Gaëlle', 'Invitée',
      '[{"id":"75000000-0000-0000-0000-0000000000a1","code":"INV-1","first_name":"Gaëlle","last_name":"Invitée"},{"id":"75000000-0000-0000-0000-0000000000a2","code":"INV-2","first_name":"Ami","last_name":"Invité"}]');
    select * into o from public.orders where id = oid;
    if o.status <> 'paid' or o.source <> 'manual' or o.total_cents <> 0 or o.buyer_email <> 'guest@test.local' or o.email_status <> 'pending'
    then raise exception 'FAIL 9 : commande d''invitation incorrecte (% / % / %)', o.status, o.source, o.total_cents; end if;
    if o.user_id <> 'c2000000-0000-0000-0000-000000000002' then raise exception 'FAIL 9b : compte existant non rattaché'; end if;
    select count(*) into n from public.tickets where order_id = oid and status = 'valid' and user_id = o.user_id;
    if n <> 2 then raise exception 'FAIL 9c : % billets d''invitation', n; end if;
    if public.tier_consumed('a5000000-0000-0000-0000-00000000000a') <> 4 then raise exception 'FAIL 9d : les invitations doivent consommer le stock'; end if;
    if (select count(*) from public.audit_log where action = 'invitation.create') <> 1 then raise exception 'FAIL 9e : audit'; end if;
    -- l'invité peut être scanné comme un autre
    if (select result from public.scan_ticket('INV-1', ev, staff)) <> 'valid' then raise exception 'FAIL 9f : billet d''invitation non scannable'; end if;
    -- stock : 6 places, 4 consommées → 3 de plus refusées
    perform pg_temp.expect('SOLD_OUT_TIER', format($f$select public.admin_create_invitation(%L, 'evt-scan', 'a5000000-0000-0000-0000-00000000000a', 'S', 'x@y.fr', 'A', 'B',
      '[{"id":"75000000-0000-0000-0000-0000000000b1","code":"Z1"},{"id":"75000000-0000-0000-0000-0000000000b2","code":"Z2"},{"id":"75000000-0000-0000-0000-0000000000b3","code":"Z3"}]')$f$, adm));
    perform pg_temp.expect('FORBIDDEN', format($f$select public.admin_create_invitation(%L, 'evt-scan', 'a5000000-0000-0000-0000-00000000000a', 'S', 'x@y.fr', 'A', 'B', '[{"id":"75000000-0000-0000-0000-0000000000c1","code":"Q1"}]')$f$, staff));
    perform pg_temp.expect('INVALID_ITEMS', format($f$select public.admin_create_invitation(%L, 'evt-scan', 'a5000000-0000-0000-0000-00000000000a', 'S', 'x@y.fr', 'A', 'B', '[]')$f$, adm));
    perform pg_temp.expect('TIER_UNAVAILABLE', format($f$select public.admin_create_invitation(%L, 'evt-scan', 'b5000000-0000-0000-0000-00000000000b', 'S', 'x@y.fr', 'A', 'B', '[{"id":"75000000-0000-0000-0000-0000000000d1","code":"W1"}]')$f$, adm));
  end;
  raise notice 'OK 9 : invitations (commande manuelle payée 0 €, rattachée au compte, stock consommé, audit, refus sans stock / non-admin)';

  -- ---------- STATISTIQUES ----------
  declare st jsonb;
  begin
    st := public.admin_event_stats(adm, 'evt-scan');
    -- billets : CODE-1 used, CODE-2 used, CODE-3 cancelled, INV-1 used, INV-2 valid → vendus 4, entrés 3
    if (st ->> 'sold')::int <> 4 or (st ->> 'entered')::int <> 3 or (st ->> 'invitations')::int <> 2 or (st ->> 'capacity')::int <> 10
    then raise exception 'FAIL 10 : stats %', st; end if;
    if (st ->> 'fill_rate')::numeric <> 40.0 then raise exception 'FAIL 10b : remplissage % (attendu 40)', st ->> 'fill_rate'; end if;
    if (st ->> 'revenue_cents')::int <> 4700 or (st ->> 'orders_paid')::int <> 1 then raise exception 'FAIL 10c : CA % (attendu 4700 = 3×15 € + 2 € de frais)', st ->> 'revenue_cents'; end if;
    if (st -> 'tiers' -> 0 ->> 'sold')::int <> 4 or (st -> 'tiers' -> 0 ->> 'revenue_cents')::int <> 3000 then raise exception 'FAIL 10d : détail du tarif %', st -> 'tiers' -> 0; end if;
    perform pg_temp.expect('FORBIDDEN', format('select public.admin_event_stats(%L, ''evt-scan'')', staff));
  end;
  raise notice 'OK 10 : statistiques (vendus par tarif, CA net, remplissage, entrées)';
end $$;

do $$ begin raise notice 'ALL OK — phase 5 (scan, annulation, invitations, stats) validée'; end $$;
rollback;
