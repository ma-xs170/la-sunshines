-- Tests 027 — page super-admin « Clients » : accès (super / délégué / autre), liste paginée 20 par page + total, recherche (accents, casse, nom complet, e-mail, téléphones, références),
-- fiche + journal dédupliqué, modification (conflit, motif, e-mail pris), suspension, anonymisation, exports, droits directs. ROLLBACK.
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;

-- Comptes : super-admin, admin délégué, admin sans droit, client de référence, client à numéro international, mineur, membre d'organisation, 45 clients « remplissage »
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('c7000000-0000-0000-0000-000000000001', 'super@test.local', now(), '{"first_name":"Sam","last_name":"Super"}'),
  ('c7000000-0000-0000-0000-000000000002', 'deleg@test.local', now(), '{"first_name":"Dora","last_name":"Deleg"}'),
  ('c7000000-0000-0000-0000-000000000003', 'plain@test.local', now(), '{"first_name":"Paul","last_name":"Plain"}'),
  ('c7000000-0000-0000-0000-000000000011', 'elodie.dupont@test.local', now(), '{"first_name":"Élodie","last_name":"Dupont","phone":"0690123456"}'),
  ('c7000000-0000-0000-0000-000000000012', 'jean.martin@test.local', now(), '{"first_name":"Jean","last_name":"Martin","phone":"+590 690 11 22 33"}'),
  ('c7000000-0000-0000-0000-000000000013', 'leo.petit@test.local', now(), '{"first_name":"Léo","last_name":"Petit"}'),
  ('c7000000-0000-0000-0000-000000000014', 'orga.membre@test.local', now(), '{"first_name":"Olga","last_name":"Membre"}');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('c7100000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'fill' || g || '@test.local', now(), jsonb_build_object('first_name', 'Rempli' || g, 'last_name', 'Zed')
  from generate_series(1, 45) g;
update public.profiles set role = 'admin' where id in ('c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000003');
insert into public.admin_accounts (user_id, level, must_change_password, invitation_status) values
  ('c7000000-0000-0000-0000-000000000001', 'super', false, 'sent'), ('c7000000-0000-0000-0000-000000000002', 'admin', false, 'sent'), ('c7000000-0000-0000-0000-000000000003', 'admin', false, 'sent');
update public.profiles set birth_date = date '1990-05-04' where id = 'c7000000-0000-0000-0000-000000000011';
update public.profiles set birth_date = (current_date - interval '14 years')::date where id = 'c7000000-0000-0000-0000-000000000013';
insert into public.organizer_members (organizer_id, user_id, role) select id, 'c7000000-0000-0000-0000-000000000014', 'staff' from public.organizers where is_default;

-- Commandes : un évènement à venir (billet valide) et un passé (billet utilisé) pour Élodie
insert into public.ticketed_events (id, event_slug, starts_at, capacity, status) values
  ('e7000000-0000-0000-0000-000000000001', 'evt-futur', now() + interval '20 days', 100, 'published'),
  ('e7000000-0000-0000-0000-000000000002', 'evt-passe', now() - interval '20 days', 100, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a7000000-0000-0000-0000-00000000000a', 'e7000000-0000-0000-0000-000000000001', 'Standard', 1500, 50, 6),
  ('b7000000-0000-0000-0000-00000000000b', 'e7000000-0000-0000-0000-000000000002', 'Early', 1000, 50, 6);
insert into public.orders (id, order_number, user_id, ticketed_event_id, event_slug, status, buyer_email, buyer_first_name, buyer_last_name, buyer_phone, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('d7000000-0000-0000-0000-000000000001', 'SUN-777001', 'c7000000-0000-0000-0000-000000000011', 'e7000000-0000-0000-0000-000000000001', 'evt-futur', 'paid', 'elodie.dupont@test.local', 'Élodie', 'Dupont', '0690123456', 1500, 0, 1500, now()),
  ('d7000000-0000-0000-0000-000000000002', 'SUN-777002', 'c7000000-0000-0000-0000-000000000011', 'e7000000-0000-0000-0000-000000000002', 'evt-passe', 'paid', 'elodie.dupont@test.local', 'Élodie', 'Dupont', '0690123456', 1000, 0, 1000, now() - interval '30 days');
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('f7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-00000000000a', 1, 1500, '[{"first_name":"Élodie","last_name":"Dupont"}]', 'Soirée futur', now() + interval '20 days', 'Standard'),
  ('f7000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-00000000000b', 1, 1000, '[{"first_name":"Élodie","last_name":"Dupont"}]', 'Soirée passée', now() - interval '20 days', 'Early');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code, holder_first_name, holder_last_name, status, used_at, reference) values
  ('17000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-00000000000a', 'c7000000-0000-0000-0000-000000000011', 'code-777-1', 'Élodie', 'Dupont', 'valid', null, 'LS-ABC234'),
  ('17000000-0000-0000-0000-000000000002', 'd7000000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000002', 'b7000000-0000-0000-0000-00000000000b', 'c7000000-0000-0000-0000-000000000011', 'code-777-2', 'Élodie', 'Dupont', 'used', now() - interval '20 days', 'LS-ZZZ999');
insert into auth.sessions (user_id) values ('c7000000-0000-0000-0000-000000000012');

do $$
declare sup constant uuid := 'c7000000-0000-0000-0000-000000000001'; del constant uuid := 'c7000000-0000-0000-0000-000000000002'; pla constant uuid := 'c7000000-0000-0000-0000-000000000003';
  elo constant uuid := 'c7000000-0000-0000-0000-000000000011'; jea constant uuid := 'c7000000-0000-0000-0000-000000000012'; leo constant uuid := 'c7000000-0000-0000-0000-000000000013'; mem constant uuid := 'c7000000-0000-0000-0000-000000000014';
  r jsonb; d jsonb; n int; upd timestamptz; ids uuid[];
begin
  -- ===== 1. Accès =====
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_list_customers(%L)', 'c7000000-0000-0000-0000-000000000011'));          -- simple client
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_list_customers(%L)', pla));                                              -- admin sans permission
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_list_customers(%L)', del));                                              -- admin délégué sans permission (par défaut)
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_account_set_permissions(%L, %L, %L)', del, del, '{clients.lire}'));      -- un admin ne s'accorde rien
  perform pg_temp.expect('BAD_PERMISSION', format('select public.admin_account_set_permissions(%L, %L, %L)', sup, del, '{clients.tout}'));
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customer_detail(%L, %L)', del, elo));
  r := public.admin_clients_access(del); if (r ->> 'lire')::boolean or (r ->> 'super')::boolean then raise exception 'FAIL 1a : accès délégué par défaut'; end if;
  if not (public.admin_clients_access(sup) ->> 'modifier')::boolean then raise exception 'FAIL 1b : le super-admin doit tout pouvoir'; end if;
  perform public.admin_account_set_permissions(sup, del, array['clients.lire']);
  if (public.admin_accounts_list(sup) -> 0) is null then raise exception 'FAIL 1c : liste des admins'; end if;
  if not exists (select 1 from jsonb_array_elements(public.admin_accounts_list(sup)) x where x ->> 'user_id' = del::text and x -> 'permissions' = '["clients.lire"]'::jsonb) then raise exception 'FAIL 1d : permissions non listées'; end if;
  r := public.admin_list_customers(del); if (r ->> 'total')::int < 1 then raise exception 'FAIL 1e : lecture avec clients.lire'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, null, %L, now())', del, elo, 'Élodie', 'Dupont', '', '', 'elodie.dupont@test.local', 'x'));   -- lire ≠ modifier
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customer_set_status(%L, %L, %L, %L)', del, elo, 'suspended', 'motif valable'));
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customers_export(%L)', del));
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customer_export(%L, %L)', del, elo));
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customer_anonymize(%L, %L, %L)', del, elo, 'x@x.fr'));
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_customer_detail(%L, %L)', del, sup));                                    -- un délégué n'ouvre pas la fiche d'un admin
  raise notice 'OK 1 : accès réservé (super-admin, ou permission explicite)';

  -- ===== 2. Liste : 20 par page, total, filtres de rôle =====
  r := public.admin_list_customers(sup);   -- clients par défaut : 45 remplissage + Élodie + Jean + Léo = 48 (Olga est organisatrice, les 3 admins sont exclus)
  if (r ->> 'total')::int <> 48 or jsonb_array_length(r -> 'rows') <> 20 or (r ->> 'page_size')::int <> 20 then raise exception 'FAIL 2a : total % / lignes %', r ->> 'total', jsonb_array_length(r -> 'rows'); end if;
  r := public.admin_list_customers(sup, null, 'customers', null, false, false, 'inscription', 'desc', 3);
  if jsonb_array_length(r -> 'rows') <> 8 then raise exception 'FAIL 2b : dernière page = % lignes', jsonb_array_length(r -> 'rows'); end if;
  r := public.admin_list_customers(sup, null, 'customers', null, false, false, 'inscription', 'desc', 99);
  if jsonb_array_length(r -> 'rows') <> 0 or (r ->> 'total')::int <> 48 then raise exception 'FAIL 2c : page hors limites'; end if;
  if (public.admin_list_customers(sup, null, 'organizers') ->> 'total')::int <> 1 then raise exception 'FAIL 2d : organisateurs'; end if;
  if (public.admin_list_customers(sup, null, 'admins') ->> 'total')::int <> 3 then raise exception 'FAIL 2e : admins'; end if;
  if (public.admin_list_customers(sup, null, 'all') ->> 'total')::int <> 52 then raise exception 'FAIL 2f : tous (%)', public.admin_list_customers(sup, null, 'all') ->> 'total'; end if;
  if (public.admin_list_customers(del, null, 'all') ->> 'total')::int <> 49 then raise exception 'FAIL 2g : un délégué ne doit pas voir les admins'; end if;
  if (public.admin_list_customers(del, null, 'admins') ->> 'total')::int <> 0 then raise exception 'FAIL 2h : filtre admins pour un délégué'; end if;
  if (public.admin_list_customers(sup, null, 'customers', null, true) ->> 'total')::int <> 1 then raise exception 'FAIL 2i : a des évènements à venir'; end if;
  if (public.admin_list_customers(sup, null, 'customers', null, false, true) ->> 'total')::int <> 1 then raise exception 'FAIL 2j : mineurs'; end if;
  perform pg_temp.expect('BAD_FILTER', format('select public.admin_list_customers(%L, null, %L)', sup, 'tous-les-comptes'));
  perform pg_temp.expect('BAD_FILTER', format('select public.admin_list_customers(%L, null, %L, null, false, false, %L)', sup, 'customers', 'email; drop table profiles'));
  -- tri par nom : Dupont avant Martin avant Petit avant Zed…
  r := public.admin_list_customers(sup, null, 'customers', null, false, false, 'nom', 'asc');
  if r -> 'rows' -> 0 ->> 'last_name' <> 'Dupont' or r -> 'rows' -> 1 ->> 'last_name' <> 'Martin' then raise exception 'FAIL 2k : tri par nom'; end if;
  -- compteurs d'évènements de la ligne d'Élodie
  r := public.admin_list_customers(sup, 'dupont');
  if (r -> 'rows' -> 0 ->> 'upcoming')::int <> 1 or (r -> 'rows' -> 0 ->> 'past')::int <> 1 or (r -> 'rows' -> 0 ->> 'age')::int < 30 or r -> 'rows' -> 0 ->> 'reference' !~ '^CLI\.[0-9A-F]{10}$' then raise exception 'FAIL 2l : ligne %', r -> 'rows' -> 0; end if;
  r := public.admin_list_customers(sup, 'petit'); if not (r -> 'rows' -> 0 ->> 'is_minor')::boolean or (r -> 'rows' -> 0 ->> 'age')::int <> 14 then raise exception 'FAIL 2m : mineur'; end if;
  raise notice 'OK 2 : liste 20 par page, total, filtres et tris';

  -- ===== 3. Recherche =====
  for d in select to_jsonb(x) from unnest(array['elodie', 'ÉLODIE', 'dupont', 'Elodie Dupont', 'dupont élodie', 'elodie.dup', 'dupont test.local', '0690123456', '+590690123456', '0690 12 34 56', '+590 690 12 34 56', '06901234', 'SUN-777001', 'sun-777001', 'SUN-777', 'LS-ABC234', 'ls-abc', '  Dupont  ']) x loop
    r := public.admin_list_customers(sup, d #>> '{}');
    if (r ->> 'total')::int <> 1 or r -> 'rows' -> 0 ->> 'last_name' <> 'Dupont' then raise exception 'FAIL 3a : recherche « % » → total %', d #>> '{}', r ->> 'total'; end if;
  end loop;
  for d in select to_jsonb(x) from unnest(array['0690112233', '+590 690 11 22 33', '590690112233', 'martin', 'JEAN MARTIN', 'MÄRTIN']) x loop
    r := public.admin_list_customers(sup, d #>> '{}');
    if (r ->> 'total')::int <> 1 or r -> 'rows' -> 0 ->> 'last_name' <> 'Martin' then raise exception 'FAIL 3b : recherche « % » → total %', d #>> '{}', r ->> 'total'; end if;
  end loop;
  if (public.admin_list_customers(sup, 'zzzzintrouvable') ->> 'total')::int <> 0 then raise exception 'FAIL 3c : aucun résultat'; end if;
  if (public.admin_list_customers(sup, 'z') ->> 'total')::int <> 48 then raise exception 'FAIL 3d : moins de 2 caractères = pas de filtre'; end if;
  if (public.admin_list_customers(sup, 'rempli1') ->> 'total')::int <> 11 then raise exception 'FAIL 3e : préfixe (rempli1, rempli10-19) = 11, reçu %', public.admin_list_customers(sup, 'rempli1') ->> 'total'; end if;
  if (public.admin_list_customers(sup, '%%') ->> 'total')::int <> 0 then raise exception 'FAIL 3f : le joker %% ne doit pas tout renvoyer'; end if;
  if (public.admin_list_customers(sup, $q$'; drop table public.profiles; --$q$ ) ->> 'total')::int <> 0 then raise exception 'FAIL 3g : injection'; end if;
  if to_regclass('public.profiles') is null then raise exception 'FAIL 3h : table supprimée !'; end if;
  if exists (select 1 from public.audit_log where meta::text ilike '%dupont%' and action like 'customer%') then raise exception 'FAIL 3i : la recherche ne doit pas être journalisée'; end if;
  raise notice 'OK 3 : recherche (accents, casse, nom complet, e-mail, téléphones, références)';

  -- ===== 4. Fiche et journal dédupliqué =====
  select count(*) into n from public.audit_log where action = 'customer.view';
  d := public.admin_customer_detail(sup, elo); d := public.admin_customer_detail(sup, elo); d := public.admin_customer_detail(sup, elo);
  if (select count(*) from public.audit_log where action = 'customer.view' and actor_id = sup and entity_id = elo::text) <> 1 then raise exception 'FAIL 4a : consultation non dédupliquée'; end if;
  perform public.admin_customer_detail(del, elo);
  if (select count(*) from public.audit_log where action = 'customer.view' and entity_id = elo::text) <> 2 then raise exception 'FAIL 4b : un autre admin = une autre entrée'; end if;
  update public.audit_log set created_at = now() - interval '11 minutes' where action = 'customer.view' and actor_id = sup;
  perform public.admin_customer_detail(sup, elo);
  if (select count(*) from public.audit_log where action = 'customer.view' and actor_id = sup and entity_id = elo::text) <> 2 then raise exception 'FAIL 4c : 10 minutes écoulées = nouvelle entrée'; end if;
  perform public.admin_customer_detail(sup, elo, false);
  if (select count(*) from public.audit_log where action = 'customer.view' and actor_id = sup and entity_id = elo::text) <> 2 then raise exception 'FAIL 4d : p_log = false'; end if;
  if jsonb_array_length(d -> 'orders') <> 2 or d -> 'profile' ->> 'email' <> 'elodie.dupont@test.local' or d -> 'orders' -> 0 -> 'tickets' -> 0 ->> 'reference' is null then raise exception 'FAIL 4e : contenu de la fiche %', d; end if;
  perform pg_temp.expect('USER_NOT_FOUND', format('select public.admin_customer_detail(%L, %L)', sup, '00000000-0000-0000-0000-000000000000'));
  raise notice 'OK 4 : fiche, journal de consultation (1 / admin / compte / 10 min)';

  -- ===== 5. Modification =====
  upd := (d -> 'profile' ->> 'updated_at')::timestamptz;
  perform pg_temp.expect('CONFLICT', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, null, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'elodie.dupont@test.local', 'x', upd - interval '1 second'));
  perform pg_temp.expect('NO_CHANGE', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'elodie.dupont@test.local', date '1990-05-04', '', upd));
  perform pg_temp.expect('CLIENT_REASON_REQUIRED', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'nouveau@test.local', date '1990-05-04', '', upd));
  perform pg_temp.expect('CLIENT_REASON_REQUIRED', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'elodie.dupont@test.local', date '1991-05-04', 'ok', upd));
  perform pg_temp.expect('EMAIL_TAKEN', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'JEAN.MARTIN@test.local', date '1990-05-04', 'correction demandée', upd));
  perform pg_temp.expect('BAD_EMAIL', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'pas-un-mail', date '1990-05-04', 'correction demandée', upd));
  perform pg_temp.expect('BAD_BIRTH_DATE', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupont', '0690123456', '', 'elodie.dupont@test.local', current_date + 1, 'correction demandée', upd));
  perform pg_temp.expect('BAD_NAME', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, '  ', 'Dupont', '0690123456', '', 'elodie.dupont@test.local', date '1990-05-04', '', upd));
  d := public.admin_customer_check_update(sup, elo, 'Élodie', 'Durand', '0690123456', '0691000000', 'elodie.dupont@test.local', date '1990-05-04', '', upd);
  if d -> 'before' <> '{"last_name":"Dupont","phone2":""}'::jsonb or d -> 'after' <> '{"last_name":"Durand","phone2":"0691000000"}'::jsonb or (d ->> 'email_changed')::boolean then raise exception 'FAIL 5a : avant/après %', d; end if;
  if (select last_name from public.profiles where id = elo) <> 'Dupont' then raise exception 'FAIL 5b : le contrôle ne doit rien écrire'; end if;
  d := public.admin_customer_update(sup, elo, 'Élodie', 'Durand', '0690123456', '0691000000', 'elodie.dupont@test.local', date '1990-05-04', '', upd);
  if (select last_name || phone2 from public.profiles where id = elo) <> 'Durand0691000000' then raise exception 'FAIL 5c : écriture'; end if;
  if not exists (select 1 from public.audit_log where action = 'customer.update' and actor_id = sup and entity_id = elo::text and before ->> 'last_name' = 'Dupont' and after ->> 'last_name' = 'Durand') then raise exception 'FAIL 5d : audit avant/après'; end if;
  -- modification simultanée simulée (dans une transaction, now() ne bouge pas : on avance updated_at à la main)
  alter table public.profiles disable trigger profiles_set_updated_at; update public.profiles set updated_at = updated_at + interval '1 second' where id = elo; alter table public.profiles enable trigger profiles_set_updated_at;
  perform pg_temp.expect('CONFLICT', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, %L, %L, %L)', sup, elo, 'Élodie', 'Dupond', '0690123456', '', 'elodie.dupont@test.local', date '1990-05-04', '', upd));   -- ancien updated_at : modification simultanée
  upd := (select updated_at from public.profiles where id = elo);
  d := public.admin_customer_update(sup, elo, 'Élodie', 'Durand', '0690123456', '0691000000', 'elodie.nouvelle@test.local', date '1992-01-02', 'Demande écrite de la cliente (ticket 42)', upd);
  if not (d ->> 'email_changed')::boolean or d ->> 'old_email' <> 'elodie.dupont@test.local' then raise exception 'FAIL 5e : e-mail'; end if;
  if not exists (select 1 from public.audit_log where action = 'customer.update' and meta ->> 'reason' = 'Demande écrite de la cliente (ticket 42)' and after ->> 'email' = 'elodie.nouvelle@test.local') then raise exception 'FAIL 5f : motif journalisé'; end if;
  if (public.admin_list_customers(sup, 'nouvelle') ->> 'total')::int <> 1 or (public.admin_list_customers(sup, 'durand') ->> 'total')::int <> 1 or (public.admin_list_customers(sup, 'dupont') ->> 'total')::int <> 0 then raise exception 'FAIL 5g : recherche à jour après modification'; end if;
  perform public.admin_account_set_permissions(sup, del, array['clients.modifier']);
  raise notice 'OK 5 : modification (avant/après, motif, conflit, e-mail pris, droits)';
end $$;

do $$
declare sup constant uuid := 'c7000000-0000-0000-0000-000000000001'; del constant uuid := 'c7000000-0000-0000-0000-000000000002';
  elo constant uuid := 'c7000000-0000-0000-0000-000000000011'; jea constant uuid := 'c7000000-0000-0000-0000-000000000012'; leo constant uuid := 'c7000000-0000-0000-0000-000000000013';
  r jsonb; n int; upd timestamptz;
begin
  -- le délégué « modifier » peut modifier (et lire, sans clients.lire)
  if not (public.admin_clients_access(del) ->> 'lire')::boolean then raise exception 'FAIL 5h : modifier implique lire'; end if;
  perform public.admin_customer_update(del, jea, 'Jean', 'Martin-Leblanc', '+590 690 11 22 33', '', 'jean.martin@test.local', null, '', (select updated_at from public.profiles where id = jea));
  if (select last_name from public.profiles where id = jea) <> 'Martin-Leblanc' then raise exception 'FAIL 5i : modification par admin délégué'; end if;

  -- ===== 6. Suspension / sessions =====
  perform pg_temp.expect('CLIENT_REASON_REQUIRED', format('select public.admin_customer_set_status(%L, %L, %L, %L)', sup, jea, 'suspended', ''));
  perform pg_temp.expect('BAD_STATUS', format('select public.admin_customer_set_status(%L, %L, %L, %L)', sup, jea, 'anonymized', 'motif valable'));
  perform pg_temp.expect('ADMIN_TARGET', format('select public.admin_customer_set_status(%L, %L, %L, %L)', sup, del, 'suspended', 'motif valable'));
  perform public.admin_customer_set_status(sup, jea, 'suspended', 'Fraude suspectée');
  if (select account_status from public.profiles where id = jea) <> 'suspended' or (select banned_until from auth.users where id = jea) < now() + interval '50 years' then raise exception 'FAIL 6a : suspension'; end if;
  if exists (select 1 from auth.sessions where user_id = jea) then raise exception 'FAIL 6b : sessions non coupées'; end if;
  perform pg_temp.expect('NO_CHANGE', format('select public.admin_customer_set_status(%L, %L, %L, %L)', sup, jea, 'suspended', 'motif valable'));
  perform public.admin_customer_set_status(sup, jea, 'active', 'Vérifié, fausse alerte');
  if (select account_status from public.profiles where id = jea) <> 'active' or (select banned_until from auth.users where id = jea) is not null then raise exception 'FAIL 6c : réactivation'; end if;
  if (select count(*) from public.audit_log where action in ('customer.suspend', 'customer.reactivate') and entity_id = jea::text) <> 2 then raise exception 'FAIL 6d : audit statut'; end if;
  insert into auth.sessions (user_id) values (jea);
  perform public.admin_customer_revoke_sessions(sup, jea);
  if exists (select 1 from auth.sessions where user_id = jea) or not exists (select 1 from public.audit_log where action = 'customer.sessions_revoked' and entity_id = jea::text) then raise exception 'FAIL 6e : déconnexion des sessions'; end if;
  perform pg_temp.expect('BAD_ACTION', format('select public.admin_customer_log(%L, %L, %L)', sup, jea, 'customer.delete_all'));
  perform public.admin_customer_log(sup, jea, 'customer.password_reset', '{"password":"secret123","via":"email"}');
  if exists (select 1 from public.audit_log where meta::text like '%secret123%') then raise exception 'FAIL 6f : un mot de passe a été journalisé'; end if;
  perform public.admin_customer_log(sup, jea, 'customer.email_sync_failed', '{"error":"boom"}');
  if not exists (select 1 from public.audit_log where action = 'customer.email_sync_failed' and entity_id = jea::text) then raise exception 'FAIL 6g : échec de synchronisation e-mail non journalisé'; end if;
  raise notice 'OK 6 : suspension, réactivation, déconnexion, journal sans mot de passe';

  -- ===== 7. Anonymisation =====
  perform pg_temp.expect('CONFIRMATION_MISMATCH', format('select public.admin_customer_anonymize(%L, %L, %L)', sup, elo, 'autre@test.local'));
  perform pg_temp.expect('UPCOMING_TICKETS', format('select public.admin_customer_anonymize(%L, %L, %L)', sup, elo, 'elodie.nouvelle@test.local'));
  perform pg_temp.expect('ADMIN_TARGET', format('select public.admin_customer_anonymize(%L, %L, %L)', sup, del, 'deleg@test.local'));
  perform pg_temp.expect('ADMIN_TARGET', format('select public.admin_customer_anonymize(%L, %L, %L)', sup, 'c7000000-0000-0000-0000-000000000014', 'orga.membre@test.local'));
  update public.tickets set status = 'cancelled', cancelled_at = now() where id = '17000000-0000-0000-0000-000000000001';
  r := public.admin_customer_anonymize(sup, elo, ' Elodie.Nouvelle@test.local ');
  if (r ->> 'orders_kept')::int <> 2 then raise exception 'FAIL 7a : commandes conservées'; end if;
  if (select first_name || '|' || last_name || '|' || phone || '|' || phone2 || '|' || email || '|' || account_status from public.profiles where id = elo) <> 'Compte|anonymisé||||anonymized' or (select birth_date from public.profiles where id = elo) is not null then raise exception 'FAIL 7b : profil non anonymisé'; end if;
  if exists (select 1 from public.orders where user_id = elo and (buyer_email not like 'anonyme-%@anonymise.invalid' or buyer_first_name <> '' or buyer_last_name <> '' or buyer_phone <> '')) then raise exception 'FAIL 7c : identité restée dans les commandes'; end if;
  if (select count(*) from public.orders where user_id = elo) <> 2 or (select sum(total_cents) from public.orders where user_id = elo) <> 2500 then raise exception 'FAIL 7d : les commandes (comptabilité) doivent rester intactes'; end if;
  if exists (select 1 from public.tickets where user_id = elo and (holder_first_name <> '' or holder_last_name <> '')) or exists (select 1 from public.order_items oi join public.orders o on o.id = oi.order_id where o.user_id = elo and oi.participants::text like '%lodie%') then raise exception 'FAIL 7e : titulaires / participants'; end if;
  if (select banned_until from auth.users where id = elo) is null then raise exception 'FAIL 7f : compte auth non bloqué'; end if;
  if (public.admin_list_customers(sup, 'dupont') ->> 'total')::int <> 0 or (public.admin_list_customers(sup, 'durand') ->> 'total')::int <> 0 then raise exception 'FAIL 7g : retrouvable après anonymisation'; end if;
  perform pg_temp.expect('ANONYMIZED', format('select public.admin_customer_anonymize(%L, %L, %L)', sup, elo, 'x@x.fr'));
  perform pg_temp.expect('ANONYMIZED', format('select public.admin_customer_update(%L, %L, %L, %L, %L, %L, %L, null, %L, now())', sup, elo, 'A', 'B', '', '', 'a@b.fr', 'motif valable'));
  update auth.users set email = 'reveil@test.local' where id = elo;    -- la synchronisation ne doit pas ré-écrire l'e-mail d'un compte anonymisé
  if (select email from public.profiles where id = elo) <> '' then raise exception 'FAIL 7h : e-mail ré-écrit sur un compte anonymisé'; end if;
  if not exists (select 1 from public.audit_log where action = 'customer.anonymize' and entity_id = elo::text) then raise exception 'FAIL 7i : audit anonymisation'; end if;
  raise notice 'OK 7 : anonymisation (identité effacée, commandes conservées, refus billets à venir)';

  -- ===== 8. Exports =====
  r := public.admin_customers_export(sup, null, 'customers');
  if exists (select 1 from jsonb_array_elements(r) x where x ->> 'last_name' = 'Petit') then raise exception 'FAIL 8a : un mineur est exporté sans case cochée'; end if;
  if jsonb_array_length(r) <> 47 then raise exception 'FAIL 8b : export %', jsonb_array_length(r); end if;       -- 48 clients − Léo (mineur)
  r := public.admin_customers_export(sup, 'petit', 'customers', null, false, false, true);
  if jsonb_array_length(r) <> 1 then raise exception 'FAIL 8c : mineur exporté seulement avec la case'; end if;
  if not exists (select 1 from public.audit_log where action = 'customers.export' and (meta ->> 'has_query')::boolean and meta::text not ilike '%petit%') then raise exception 'FAIL 8d : export journalisé sans le texte recherché'; end if;
  r := public.admin_customer_export(sup, jea);
  if r -> 'profile' ->> 'email' <> 'jean.martin@test.local' or r ? 'history' or r ->> 'exported_at' is null or not exists (select 1 from public.audit_log where action = 'customer.export' and entity_id = jea::text) then raise exception 'FAIL 8e : export du compte'; end if;
  raise notice 'OK 8 : exports (mineurs exclus par défaut, journalisés sans le texte de recherche)';
end $$;

-- ===== 9. Droits directs (PostgREST) : rien de sensible pour un admin délégué, aucune fonction appelable =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c7000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.profiles;                         -- RLS : l'admin lit tous les profils…
  if n < 50 then raise exception 'FAIL 9a : lecture non sensible (%)', n; end if;
  perform first_name, last_name, phone, role from public.profiles limit 1;
  begin perform email from public.profiles limit 1; raise exception 'FAIL 9b : e-mail lisible en direct'; exception when insufficient_privilege then null; end;
  begin perform birth_date from public.profiles limit 1; raise exception 'FAIL 9c : date de naissance lisible en direct'; exception when insufficient_privilege then null; end;
  begin perform search_text from public.profiles limit 1; raise exception 'FAIL 9d : search_text lisible'; exception when insufficient_privilege then null; end;
  begin perform public.admin_list_customers('c7000000-0000-0000-0000-000000000001'); raise exception 'FAIL 9e : fonction appelable par authenticated'; exception when insufficient_privilege then null; end;
  begin perform public.admin_customer_anonymize('c7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000012', 'x'); raise exception 'FAIL 9f : anonymisation appelable'; exception when insufficient_privilege then null; end;
  begin perform permissions from public.admin_accounts; raise exception 'FAIL 9g : permissions lisibles'; exception when insufficient_privilege then null; end;
  begin update public.profiles set account_status = 'active', email = 'x@x.fr' where id = 'c7000000-0000-0000-0000-000000000002'; raise exception 'FAIL 9h : mise à jour de colonnes sensibles'; exception when insufficient_privilege then null; end;
  raise notice 'OK 9 : droits directs limités aux colonnes non sensibles';
end $$;
reset role;

do $$ begin raise notice 'ALL OK — 027_admin_clients'; end $$;
rollback;
