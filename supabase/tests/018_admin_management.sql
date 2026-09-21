-- =====================================================================
-- Tests migration 018 — administrateurs (super seulement), verrouillage, désactivation, organisateurs, transfert d'évènement atomique. ROLLBACK.
-- =====================================================================
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'super@test.local'), ('ad000000-0000-0000-0000-0000000000a2', 'admin2@test.local'),
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'), ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.admin_accounts (user_id, level, must_change_password) values ('ad000000-0000-0000-0000-0000000000ad', 'super', false);
insert into public.organizers (id, name, contact_email, account_status) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', 'b@test.local', 'approved'), ('0c0c0c0c-0000-0000-0000-00000000000c', 'En attente', 'c@test.local', 'pending');
insert into public.organizer_members (organizer_id, user_id, role) values ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'), ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 50, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6);
insert into public.orders (id, ticketed_event_id, event_slug, status, source, buyer_email, subtotal_cents, fee_cents, total_cents, paid_at) values ('09000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'web', 'a@test.local', 1500, 50, 1550, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values ('19000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 1, 1500, '[{"first_name":"A","last_name":"A"}]', 'A', now(), 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name) values ('79000000-0000-0000-0000-000000000001', '09000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'K1', 'A', 'A');

do $$
declare sup constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; a2 constant uuid := 'ad000000-0000-0000-0000-0000000000a2'; ow constant uuid := '01000000-0000-0000-0000-000000000001';
  orga uuid := (select id from public.organizers where is_default); orgb constant uuid := '0b0b0b0b-0000-0000-0000-00000000000b'; refb text; ref text; j jsonb; v uuid;
begin
  -- 1 : création d'admin : super seulement ; référence ADM ; changement de mot de passe imposé ; l'admin simple n'administre pas les admins
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_account_register(%L, %L, ''admin'', ''A'', ''B'', ''0690'')', ow, a2));
  ref := public.admin_account_register(sup, a2, 'admin', 'Ada', 'Admin', '0690000000');
  if ref !~ '^ADM\.[0-9]{8}$' then raise exception 'FAIL 1a : %', ref; end if;
  j := public.admin_account_state(a2); if (j ->> 'must_change_password') <> 'true' or (j ->> 'active') <> 'true' or (select role from public.profiles where id = a2) <> 'admin' then raise exception 'FAIL 1b : %', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_accounts_list(%L)', a2));
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_account_set(%L, %L, false)', a2, sup));
  perform pg_temp.expect('BAD_LEVEL', format('select public.admin_account_register(%L, %L, ''root'', ''a'', ''b'', '''')', sup, a2));
  if jsonb_array_length(public.admin_accounts_list(sup)) <> 2 or public.admin_accounts_list(sup)::text like '%"password"%' then raise exception 'FAIL 1c'; end if;
  raise notice 'OK 1 : création (super seulement)';
  -- 2 : mot de passe changé, désactivation / réactivation, dernier super protégé, pas d'auto-désactivation
  perform public.admin_password_changed(a2); if public.admin_account_state(a2) ->> 'must_change_password' <> 'false' then raise exception 'FAIL 2a'; end if;
  perform public.admin_account_set(sup, a2, false);
  if (select role from public.profiles where id = a2) <> 'customer' or exists (select 1 from public.admin_accounts where user_id = a2 and active) then raise exception 'FAIL 2b : accès non retiré'; end if;
  if (select admin_reference from public.profiles where id = a2) <> ref then raise exception 'FAIL 2c : référence perdue'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_organizer_detail(%L, %L)', a2, orgb));   -- admin désactivé : plus aucun accès
  perform public.admin_account_set(sup, a2, true); if (select role from public.profiles where id = a2) <> 'admin' then raise exception 'FAIL 2d'; end if;
  perform pg_temp.expect('SELF_FORBIDDEN', format('select public.admin_account_set(%L, %L, false)', sup, sup));
  perform public.admin_account_reset(sup, a2); if public.admin_account_state(a2) ->> 'must_change_password' <> 'true' then raise exception 'FAIL 2e'; end if;
  if jsonb_array_length(public.admin_account_activity(sup, sup)) < 0 then raise exception 'FAIL 2f'; end if;
  raise notice 'OK 2 : désactivation, réactivation, réinitialisation';
  -- 3 : verrouillage après 5 échecs ; un succès remet à zéro ; comptes inconnus ignorés
  perform public.admin_login_result('ADMIN2@test.local', false); perform public.admin_login_result('admin2@test.local', false); perform public.admin_login_result('admin2@test.local', false); perform public.admin_login_result('admin2@test.local', false);
  if public.admin_login_locked('admin2@test.local') then raise exception 'FAIL 3a : verrouillé trop tôt'; end if;
  perform public.admin_login_result('admin2@test.local', false); if not public.admin_login_locked('ADMIN2@test.local') then raise exception 'FAIL 3b : pas verrouillé'; end if;
  perform public.admin_login_result('admin2@test.local', true); if public.admin_login_locked('admin2@test.local') then raise exception 'FAIL 3c'; end if;
  if public.admin_login_locked('inconnu@test.local') then raise exception 'FAIL 3d'; end if; perform public.admin_login_result('inconnu@test.local', false);
  raise notice 'OK 3 : verrouillage temporaire';
  -- 4 : organisateurs
  j := public.admin_organizer_detail(a2, orgb); if j -> 'organizer' ->> 'name' <> 'Autre Orga' or jsonb_array_length(j -> 'members') <> 1 then raise exception 'FAIL 4a : %', j; end if;
  j := public.admin_organizer_detail(a2, orga); if jsonb_array_length(j -> 'events') <> 1 or (j -> 'events' -> 0 ->> 'revenue_cents')::int <> 1500 then raise exception 'FAIL 4b : %', j; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_organizer_detail(%L, %L)', ow, orga));
  perform pg_temp.expect('BAD_SIRET', format('select public.admin_update_organizer_contact(%L, %L, ''X'', '''', ''123'', '''', '''', '''')', sup, orgb));
  perform public.admin_update_organizer_contact(sup, orgb, 'Autre Orga 2', 'SAS', '12345678901234', 'R. Ponsable', 'Adresse', 'z@test.local');
  if (select name from public.organizers where id = orgb) <> 'Autre Orga 2' then raise exception 'FAIL 4c'; end if;
  if jsonb_array_length(public.admin_all_events(sup)) <> 1 then raise exception 'FAIL 4d'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_all_events(%L)', ow));
  raise notice 'OK 4 : organisateurs';
  -- 5 : transfert : confirmation exacte, destination approuvée, atomique, données conservées, lieux recopiés
  refb := (select reference from public.organizers where id = orgb);
  v := public.org_venue_save(sup, orga, null, '{"name":"W CLUB","region":"guadeloupe"}');
  perform public.org_session_save(sup, 'evt-a', null, v, 'Soirée', now() + interval '3 days', null, null, true);
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_transfer_event(%L, ''evt-a'', %L, %L)', ow, refb, refb));
  perform pg_temp.expect('DEST_NOT_FOUND', format('select public.admin_transfer_preview(%L, ''evt-a'', ''ORG.00000000'')', sup));
  update public.organizers set reference = 'ORG.12121212' where id = '0c0c0c0c-0000-0000-0000-00000000000c';
  perform pg_temp.expect('DEST_NOT_APPROVED', format('select public.admin_transfer_preview(%L, ''evt-a'', ''ORG.12121212'')', sup));
  perform pg_temp.expect('SAME_ORGANIZER', format('select public.admin_transfer_preview(%L, ''evt-a'', %L)', sup, (select reference from public.organizers where id = orga)));
  j := public.admin_transfer_preview(sup, 'evt-a', lower(refb)); if (j ->> 'orders')::int <> 1 or (j ->> 'tickets')::int <> 1 or (j ->> 'tiers')::int <> 1 then raise exception 'FAIL 5a : %', j; end if;
  perform pg_temp.expect('CONFIRMATION_MISMATCH', format('select public.admin_transfer_event(%L, ''evt-a'', %L, ''ORG.99999999'')', sup, refb));
  if (select organizer_id from public.ticketed_events where event_slug = 'evt-a') <> orga then raise exception 'FAIL 5b : transfert sans confirmation'; end if;
  perform public.admin_transfer_event(sup, 'evt-a', refb, refb);
  if (select organizer_id from public.ticketed_events where event_slug = 'evt-a') <> orgb then raise exception 'FAIL 5c'; end if;
  if (select count(*) from public.orders where ticketed_event_id = 'e9000000-0000-0000-0000-00000000000a') <> 1 or (select code from public.tickets where id = '79000000-0000-0000-0000-000000000001') <> 'K1' then raise exception 'FAIL 5d : données altérées'; end if;
  if (select ve.organizer_id from public.event_sessions s join public.event_venues ve on ve.id = s.venue_id where s.ticketed_event_id = 'e9000000-0000-0000-0000-00000000000a') <> orgb then raise exception 'FAIL 5e : lieu non recopié'; end if;
  if not exists (select 1 from public.event_venues where id = v and organizer_id = orga) then raise exception 'FAIL 5f : lieu d''origine perdu'; end if;
  if (select count(*) from public.audit_log where action = 'event.transfer') <> 1 then raise exception 'FAIL 5g : audit'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_details(%L, ''evt-a'')', ow));                               -- l'ancien propriétaire perd l'accès
  if public.org_event_details('0b000000-0000-0000-0000-000000000003', 'evt-a') is null then raise exception 'FAIL 5h'; end if;   -- le nouveau l'obtient
  perform pg_temp.expect('SAME_ORGANIZER', format('select public.admin_transfer_event(%L, ''evt-a'', %L, %L)', sup, refb, refb));   -- pas d'annulation directe
  raise notice 'OK 5 : transfert atomique';
  -- 6 : recherche globale : admins seulement ; référence complète / partielle / chiffres, nom, SIRET, e-mail (organisation ou membre), commande, admin, évènement
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_global_search(%L, ''orga'')', ow));
  if jsonb_array_length(public.admin_global_search(sup, 'a') -> 'organizers') <> 0 then raise exception 'FAIL 6a : requête trop courte'; end if;
  if jsonb_array_length(public.admin_global_search(sup, 'autre orga') -> 'organizers') <> 1 then raise exception 'FAIL 6b : nom %', public.admin_global_search(sup, 'autre orga') -> 'organizers'; end if;
  if jsonb_array_length(public.admin_global_search(sup, refb) -> 'organizers') <> 1 then raise exception 'FAIL 6c : référence complète'; end if;
  if jsonb_array_length(public.admin_global_search(sup, substr(refb, 5, 5)) -> 'organizers') < 1 then raise exception 'FAIL 6d : chiffres seuls'; end if;
  if jsonb_array_length(public.admin_global_search(sup, '12345678901234') -> 'organizers') <> 1 then raise exception 'FAIL 6e : SIRET'; end if;
  if jsonb_array_length(public.admin_global_search(sup, 'owner-b@test') -> 'organizers') <> 1 then raise exception 'FAIL 6f : e-mail d''un membre'; end if;
  if jsonb_array_length(public.admin_global_search(sup, 'R. Ponsable') -> 'organizers') <> 1 then raise exception 'FAIL 6g : responsable'; end if;
  if jsonb_array_length(public.admin_global_search(sup, '%%') -> 'organizers') <> 0 then raise exception 'FAIL 6h : joker'; end if;
  if jsonb_array_length(public.admin_global_search(sup, 'SUN-') -> 'orders') <> 1 then raise exception 'FAIL 6i : commande'; end if;
  if jsonb_array_length(public.admin_global_search(sup, (select admin_reference from public.profiles where id = a2)) -> 'admins') <> 1 then raise exception 'FAIL 6j : ADM'; end if;
  if jsonb_array_length(public.admin_global_search(sup, 'evt-a') -> 'events') <> 1 then raise exception 'FAIL 6k : évènement'; end if;
  if (select count(*) from public.audit_log where action = 'admin.search_contact') <> 2 or exists (select 1 from public.audit_log where action = 'admin.search_contact' and meta::text like '%owner-b%') then raise exception 'FAIL 6l : audit des coordonnées'; end if;
  perform public.admin_account_set(sup, a2, false);
  perform pg_temp.expect('FORBIDDEN', format('select public.admin_global_search(%L, ''autre'')', a2));
  raise notice 'OK 6 : recherche';
end $$;
rollback;
