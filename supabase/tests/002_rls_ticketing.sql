-- =====================================================================
-- Tests RLS — phase 2 (billetterie)
-- À exécuter APRÈS les migrations 001 et 002 (SQL Editor Supabase).
-- Transaction annulée à la fin (ROLLBACK) : aucune donnée conservée.
-- Un test qui échoue lève « FAIL n : … » ; « ALL OK » en fin de script = tout est bon.
-- =====================================================================

begin;

-- ---------- Jeu de données (rôle postgres : contourne la RLS) ----------
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('b2000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
  ('57000000-0000-0000-0000-000000000057', 'staff@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
update public.profiles set role = 'staff' where id = '57000000-0000-0000-0000-000000000057';

insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e1000000-0000-0000-0000-000000000001', 'evt-public', now() + interval '30 days', 100, true,  'published'),
  ('e2000000-0000-0000-0000-000000000002', 'evt-brouillon', now() + interval '30 days', 100, false, 'draft');

insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, is_active, archived_at) values
  ('71000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Normal',   1000, 50, true,  null),
  ('72000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Inactif',  1000, 50, false, null),
  ('73000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'Archivé',  1000, 50, false, now()),
  ('74000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-000000000002', 'Brouillon',1000, 50, true,  null);

-- une commande payée + 1 ligne + 1 billet pour A et pour B
insert into public.orders (id, user_id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, total_cents, paid_at) values
  ('0a000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'evt-public', 'paid', 'a@test.local', 1000, 1000, now()),
  ('0b000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000001', 'evt-public', 'paid', 'b@test.local', 1000, 1000, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('1a000000-0000-0000-0000-00000000000a', '0a000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-000000000001', 1, 1000, '[{"first_name":"A","last_name":"A"}]', 'Soirée', now() + interval '30 days', 'Normal'),
  ('1b000000-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-000000000001', 1, 1000, '[{"first_name":"B","last_name":"B"}]', 'Soirée', now() + interval '30 days', 'Normal');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code) values
  ('7a000000-0000-0000-0000-00000000000a', '0a000000-0000-0000-0000-00000000000a', '1a000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'code-a'),
  ('7b000000-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-00000000000b', '1b000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b', 'code-b');
insert into public.refunds (order_id, amount_cents, stripe_refund_id) values ('0b000000-0000-0000-0000-00000000000b', 500, 're_test');
insert into public.audit_log (action, entity) values ('test.action', 'test');
insert into public.stripe_events (id, type) values ('evt_test_1', 'checkout.session.completed');

-- =====================================================================
-- Utilisateur A
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare n int; t text;
begin
  -- lecture : seulement SES données
  select count(*) into n from public.orders;
  if n <> 1 then raise exception 'FAIL 1 : A voit % commandes (attendu 1)', n; end if;
  if (select id from public.orders) <> '0a000000-0000-0000-0000-00000000000a'
  then raise exception 'FAIL 1b : A ne voit pas sa propre commande'; end if;

  select count(*) into n from public.orders where id = '0b000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'FAIL 2 : A lit la commande de B'; end if;

  select count(*) into n from public.order_items;
  if n <> 1 then raise exception 'FAIL 3 : A voit % lignes de commande (attendu 1)', n; end if;
  select count(*) into n from public.order_items where order_id = '0b000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'FAIL 3b : A lit les lignes de la commande de B'; end if;

  select count(*) into n from public.tickets;
  if n <> 1 then raise exception 'FAIL 4 : A voit % billets (attendu 1)', n; end if;
  select count(*) into n from public.tickets where id = '7b000000-0000-0000-0000-00000000000b' or code = 'code-b';
  if n <> 0 then raise exception 'FAIL 4b : A lit le billet de B'; end if;
  raise notice 'OK 1-4 : A ne lit ni les commandes, ni les lignes, ni les billets de B';

  -- tables réservées : refunds / stripe_events / audit_log = 0 ligne pour un client
  select count(*) into n from public.refunds;       if n <> 0 then raise exception 'FAIL 5 : A lit refunds'; end if;
  select count(*) into n from public.stripe_events; if n <> 0 then raise exception 'FAIL 5b : A lit stripe_events'; end if;
  select count(*) into n from public.audit_log;     if n <> 0 then raise exception 'FAIL 5c : A lit audit_log'; end if;
  raise notice 'OK 5 : refunds / stripe_events / audit_log invisibles pour un client';

  -- public : seulement les tarifs ACTIFS d'événements activés
  select count(*) into n from public.ticket_tiers;
  if n <> 1 then raise exception 'FAIL 6 : A voit % tarifs (attendu 1 : actif + événement activé)', n; end if;
  select count(*) into n from public.ticketed_events;
  if n <> 1 then raise exception 'FAIL 6b : A voit % événements (le brouillon doit être caché)', n; end if;
  raise notice 'OK 6 : tarifs inactifs / archivés / événements non activés cachés';

  -- AUCUNE écriture sur aucune table de billetterie (contrôle de droits, avant même la RLS)
  foreach t in array array['ticketed_events','ticket_tiers','orders','order_items','tickets',
                           'stripe_events','refunds','audit_log'] loop
    begin execute format('insert into public.%I default values', t);
      raise exception 'FAIL 7 : A peut insérer dans %', t;
    exception when insufficient_privilege then null; end;
    begin execute format('delete from public.%I', t);
      raise exception 'FAIL 7b : A peut supprimer dans %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  begin update public.orders set buyer_first_name = 'x';
    raise exception 'FAIL 7c : A peut modifier orders';
  exception when insufficient_privilege then null; end;
  begin update public.tickets set status = 'used';
    raise exception 'FAIL 7d : A peut modifier tickets';
  exception when insufficient_privilege then null; end;
  begin update public.ticket_tiers set price_cents = 50;
    raise exception 'FAIL 7e : A peut modifier ticket_tiers';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 7 : aucune écriture directe possible sur les 8 tables';

  -- fonctions sensibles inaccessibles
  begin
    perform public.reserve_tickets('evt-public', 'a1000000-0000-0000-0000-00000000000a', 't', '[]', '{}', 0, 0, 'v', true);
    raise exception 'FAIL 8 : A peut appeler reserve_tickets';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_set_setting('a1000000-0000-0000-0000-00000000000a', 'ticketing_mode', '"native"');
    raise exception 'FAIL 8b : A peut appeler admin_set_setting';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 8 : reserve_tickets / admin_* refusées à un client';
end $$;
reset role;

-- =====================================================================
-- Utilisateur B : symétrique (ne voit rien de A)
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.orders where id = '0a000000-0000-0000-0000-00000000000a';
  if n <> 0 then raise exception 'FAIL 9 : B lit la commande de A'; end if;
  select count(*) into n from public.tickets where code = 'code-a';
  if n <> 0 then raise exception 'FAIL 9b : B lit le billet de A'; end if;
  raise notice 'OK 9 : B ne voit rien de A';
end $$;
reset role;

-- =====================================================================
-- Anonyme
-- =====================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int; t text;
begin
  foreach t in array array['orders','order_items','tickets','stripe_events','refunds','audit_log'] loop
    begin execute format('select count(*) from public.%I', t);
      raise exception 'FAIL 10 : anon peut lire %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  select count(*) into n from public.ticket_tiers;
  if n <> 1 then raise exception 'FAIL 11 : anon voit % tarifs (attendu 1)', n; end if;
  foreach t in array array['ticketed_events','ticket_tiers','orders','order_items','tickets',
                           'stripe_events','refunds','audit_log'] loop
    begin execute format('insert into public.%I default values', t);
      raise exception 'FAIL 12 : anon peut insérer dans %', t;
    exception when insufficient_privilege then null; end;
  end loop;
  -- get_availability reste appelable (compteurs publics)
  perform * from public.get_availability('evt-public');
  begin
    perform public.tier_consumed('71000000-0000-0000-0000-000000000001');
    raise exception 'FAIL 13 : anon peut appeler tier_consumed';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 10-13 : anon = aucune lecture de commandes, aucune écriture, get_availability seule fonction ouverte';
end $$;
reset role;

-- =====================================================================
-- Staff : aucun accès aux commandes (le scan passe par une route serveur)
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"57000000-0000-0000-0000-000000000057","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.orders;
  if n <> 0 then raise exception 'FAIL 14 : le staff lit % commandes', n; end if;
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'FAIL 14b : le staff lit audit_log'; end if;
  raise notice 'OK 14 : staff = aucune lecture de commandes / audit';
end $$;
reset role;

-- =====================================================================
-- Admin : lecture de tout, mais toujours aucune écriture directe
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
do $$ declare n int; begin
  select count(*) into n from public.orders;        if n <> 2 then raise exception 'FAIL 15 : admin voit % commandes (attendu 2)', n; end if;
  select count(*) into n from public.tickets;       if n <> 2 then raise exception 'FAIL 15b : admin voit % billets', n; end if;
  select count(*) into n from public.refunds;       if n <> 1 then raise exception 'FAIL 15c : admin ne lit pas refunds'; end if;
  select count(*) into n from public.stripe_events; if n <> 1 then raise exception 'FAIL 15d : admin ne lit pas stripe_events'; end if;
  select count(*) into n from public.audit_log;     if n <> 1 then raise exception 'FAIL 15e : admin ne lit pas audit_log'; end if;
  select count(*) into n from public.ticket_tiers;  if n <> 4 then raise exception 'FAIL 15f : admin voit % tarifs (attendu 4)', n; end if;
  begin
    update public.ticket_tiers set price_cents = 50;
    raise exception 'FAIL 16 : un admin écrit directement dans ticket_tiers (doit passer par admin_save_tier)';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_save_event('ad000000-0000-0000-0000-0000000000ad', 'x', now(), null, null, '', '', 10, null, null, false, 'draft');
    raise exception 'FAIL 16b : un admin appelle admin_save_event depuis le navigateur';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 15-16 : admin lit tout ; les écritures passent uniquement par le service_role';
end $$;
reset role;

-- =====================================================================
-- Privilèges EXECUTE des fonctions (vérifiés dans le catalogue)
-- =====================================================================
do $$
declare f record; bad text := '';
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig, p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reserve_tickets','expire_stale_orders','admin_save_event','admin_save_tier',
                        'admin_remove_tier','admin_set_setting','tier_consumed','event_consumed',
                        '_audit','_assert_admin')
  loop
    if has_function_privilege('anon', f.oid, 'execute')          then bad := bad || ' anon:' || f.sig; end if;
    if has_function_privilege('authenticated', f.oid, 'execute') then bad := bad || ' authenticated:' || f.sig; end if;
    if not has_function_privilege('service_role', f.oid, 'execute') then bad := bad || ' !service_role:' || f.sig; end if;
    if not f.prosecdef then bad := bad || ' !security_definer:' || f.sig; end if;
    if f.proconfig is null or not exists (select 1 from unnest(f.proconfig) c where c like 'search_path=%')
    then bad := bad || ' !search_path:' || f.sig; end if;
  end loop;
  if bad <> '' then raise exception 'FAIL 17 : privilèges de fonctions incorrects :%', bad; end if;
  raise notice 'OK 17 : fonctions sensibles = SECURITY DEFINER + search_path fixé + EXECUTE service_role seul';
end $$;

do $$ begin raise notice 'ALL OK — RLS phase 2 validée'; end $$;
rollback;
