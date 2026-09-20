-- =====================================================================
-- Tests migration 009 — organisateurs : isolation, rôles, RLS, audit, messages, référence de billet. ROLLBACK.
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
  ('01000000-0000-0000-0000-000000000001', 'owner-a@test.local'),
  ('01000000-0000-0000-0000-000000000002', 'viewer-a@test.local'),
  ('0b000000-0000-0000-0000-000000000003', 'owner-b@test.local'),
  ('c1000000-0000-0000-0000-000000000001', 'cust@test.local'),
  ('50000000-0000-0000-0000-000000000005', 'stranger@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';

-- Organisateur A = THE MOUV (seed de la migration) ; B = un autre organisateur, sans adresse de réponse
insert into public.organizers (id, name, contact_email) values ('0b0b0b0b-0000-0000-0000-00000000000b', 'Autre Orga', '');
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000002', 'viewer'),
  ('0b0b0b0b-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000003', 'owner');

insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e9000000-0000-0000-0000-00000000000a', 'evt-a', now() + interval '3 days', 20, true, 'published', 'Salle A');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e9000000-0000-0000-0000-00000000000b', 'evt-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '3 days', 20, true, 'published', 'Salle B');
-- brouillons (non publics) : seuls les membres de l'organisateur les voient
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, status) values
  ('e9000000-0000-0000-0000-0000000000da', 'draft-a', (select id from public.organizers where is_default), now() + interval '9 days', 5, 'draft'),
  ('e9000000-0000-0000-0000-0000000000db', 'draft-b', '0b0b0b0b-0000-0000-0000-00000000000b', now() + interval '9 days', 5, 'draft');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values
  ('a9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6),
  ('a9000000-0000-0000-0000-00000000001a', 'e9000000-0000-0000-0000-00000000000a', 'VIP', 2500, 5, 6),
  ('b9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000b', 'Autre', 1000, 10, 6);

insert into public.orders (id, user_id, ticketed_event_id, event_slug, status, buyer_email, buyer_phone, subtotal_cents, fee_cents, total_cents, paid_at) values
  ('09000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'Cust@Test.Local', '0690111111', 4000, 0, 4000, now()),
  ('09000000-0000-0000-0000-00000000000b', null, 'e9000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'autre@test.local', '', 1500, 0, 1500, now()),
  ('09000000-0000-0000-0000-00000000000c', null, 'e9000000-0000-0000-0000-00000000000b', 'evt-b', 'paid', 'b-client@test.local', '', 1000, 0, 1000, now());
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('19000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 1, 1500, '[{"first_name":"Camille","last_name":"Client"}]', 'A', now() + interval '3 days', 'Standard'),
  ('19000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000001a', 1, 2500, '[{"first_name":"Dan","last_name":"Vip"}]', 'A', now() + interval '3 days', 'VIP'),
  ('19000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b', 'a9000000-0000-0000-0000-00000000000a', 1, 1500, '[{"first_name":"Eve","last_name":"Autre"}]', 'A', now() + interval '3 days', 'Standard'),
  ('19000000-0000-0000-0000-00000000000c', '09000000-0000-0000-0000-00000000000c', 'b9000000-0000-0000-0000-00000000000b', 1, 1000, '[{"first_name":"Bob","last_name":"Beta"}]', 'B', now() + interval '3 days', 'Autre');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, user_id, code, holder_first_name, holder_last_name) values
  ('79000000-0000-0000-0000-00000000000a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', 'c1000000-0000-0000-0000-000000000001', 'CODE-A1', 'Camille', 'Client'),
  ('79000000-0000-0000-0000-00000000001a', '09000000-0000-0000-0000-00000000000a', '19000000-0000-0000-0000-00000000001a', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000001a', 'c1000000-0000-0000-0000-000000000001', 'CODE-A2', 'Dan', 'Vip'),
  ('79000000-0000-0000-0000-00000000000b', '09000000-0000-0000-0000-00000000000b', '19000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a', null, 'CODE-A3', 'Eve', 'Autre'),
  ('79000000-0000-0000-0000-00000000000c', '09000000-0000-0000-0000-00000000000c', '19000000-0000-0000-0000-00000000000c', 'e9000000-0000-0000-0000-00000000000b', 'b9000000-0000-0000-0000-00000000000b', null, 'CODE-B1', 'Bob', 'Beta');
update public.tickets set status = 'used', used_at = now() where code = 'CODE-A2';

do $$
declare
  ow_a constant uuid := '01000000-0000-0000-0000-000000000001'; vw_a constant uuid := '01000000-0000-0000-0000-000000000002';
  ow_b constant uuid := '0b000000-0000-0000-0000-000000000003'; adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad';
  cust constant uuid := 'c1000000-0000-0000-0000-000000000001'; stranger constant uuid := '50000000-0000-0000-0000-000000000005';
  org_a uuid; n int; j jsonb; got text; msg uuid;
begin
  select id into org_a from public.organizers where is_default;

  -- 1 : référence lisible unique, sans rapport avec le code du QR
  if exists (select 1 from public.tickets where reference !~ '^LS-[2-9A-HJKMNP-Z]{6}$') then raise exception 'FAIL 1a : format de référence'; end if;
  if (select count(distinct reference) from public.tickets) <> 4 then raise exception 'FAIL 1b : références non uniques'; end if;
  if exists (select 1 from public.tickets where code like '%' || substr(reference, 4) || '%') then raise exception 'FAIL 1c : la référence est un morceau du code'; end if;
  raise notice 'OK 1 : référence LS-XXXXXX unique, distincte du code du QR';

  -- 2 : organisateur par défaut + THE MOUV seedé
  if (select organizer_id from public.ticketed_events where event_slug = 'evt-a') <> org_a then raise exception 'FAIL 2a : événement sans organisateur non rattaché'; end if;
  if (select siret from public.organizers where id = org_a) <> '10425394300013' then raise exception 'FAIL 2b : SIRET THE MOUV'; end if;
  raise notice 'OK 2 : organisateur par défaut (THE MOUV) appliqué aux événements sans organisateur';

  -- 3 : RLS — chaque membre ne voit QUE l'organisateur / les événements / commandes / billets des siens
  perform pg_temp.as_user(ow_a); set local role authenticated;
  select count(*) into n from public.ticketed_events where event_slug = 'draft-b';             if n <> 0 then raise exception 'FAIL 3a : owner A voit le brouillon de B'; end if;
  select count(*) into n from public.ticketed_events where event_slug = 'draft-a';             if n <> 1 then raise exception 'FAIL 3a2 : owner A ne voit pas son brouillon'; end if;
  select count(*) into n from public.tickets;                                                  if n <> 3 then raise exception 'FAIL 3b : owner A voit % billets (attendu 3)', n; end if;
  select count(*) into n from public.orders;                                                   if n <> 2 then raise exception 'FAIL 3c : owner A voit % commandes (attendu 2)', n; end if;
  select count(*) into n from public.order_items;                                              if n <> 3 then raise exception 'FAIL 3d : lignes'; end if;
  select count(*) into n from public.organizers;                                               if n <> 1 then raise exception 'FAIL 3e : owner A voit % organisateurs', n; end if;
  select count(*) into n from public.organizer_members;                                        if n <> 1 then raise exception 'FAIL 3f : owner A voit les membres des autres'; end if;
  reset role;
  perform pg_temp.as_user(ow_b); set local role authenticated;
  select count(*) into n from public.tickets;                                                  if n <> 1 then raise exception 'FAIL 3g : owner B voit % billets (attendu 1)', n; end if;
  select count(*) into n from public.ticketed_events where event_slug = 'draft-a';             if n <> 0 then raise exception 'FAIL 3h : owner B voit le brouillon de A'; end if;
  reset role;
  perform pg_temp.as_user(stranger); set local role authenticated;
  select count(*) into n from public.ticketed_events where event_slug like 'draft-%';          if n <> 0 then raise exception 'FAIL 3i0 : un inconnu voit des brouillons'; end if;
  select count(*) into n from public.tickets;                                                  if n <> 0 then raise exception 'FAIL 3i : un inconnu voit des billets'; end if;
  select count(*) into n from public.orders;                                                   if n <> 0 then raise exception 'FAIL 3j : un inconnu voit des commandes'; end if;
  select count(*) into n from public.organizers;                                               if n <> 0 then raise exception 'FAIL 3k : un inconnu voit des organisateurs'; end if;
  reset role;
  perform pg_temp.as_user(cust); set local role authenticated;
  select count(*) into n from public.tickets;                                                  if n <> 2 then raise exception 'FAIL 3l : le client voit % billets (attendu 2, les siens)', n; end if;
  reset role;
  set local role anon;
  begin perform 1 from public.organizers; got := 'lu'; exception when insufficient_privilege then got := null; end;
  if got is not null then raise exception 'FAIL 3m : anon lit organizers'; end if;
  reset role;
  raise notice 'OK 3 : RLS — chaque organisateur ne voit que ses événements, commandes et billets ; inconnu / anon : rien';

  -- 4 : fonctions org_* — accès, isolation, messages d'erreur qui ne révèlent rien
  j := public.org_events(ow_a);   if jsonb_array_length(j) <> 2 or exists (select 1 from jsonb_array_elements(j) e where e ->> 'slug' in ('evt-b', 'draft-b')) then raise exception 'FAIL 4a : org_events(A) = %', j; end if;
  j := public.org_events(ow_b);   if jsonb_array_length(j) <> 2 or exists (select 1 from jsonb_array_elements(j) e where e ->> 'slug' in ('evt-a', 'draft-a')) then raise exception 'FAIL 4b : org_events(B)'; end if;
  j := public.org_events(adm);    if jsonb_array_length(j) <> 4 then raise exception 'FAIL 4c : l''admin doit voir les 4 événements'; end if;
  j := public.org_events(stranger); if jsonb_array_length(j) <> 0 then raise exception 'FAIL 4d : un inconnu voit des événements'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_stats(%L, ''evt-a'')', ow_b));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_participants(%L, ''evt-a'')', ow_b));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_participants(%L, ''evt-a'')', stranger));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_event_stats(%L, ''evt-inexistant'')', ow_a));   -- n'indique pas si l'événement existe
  perform pg_temp.expect('EVENT_NOT_FOUND', format('select public.org_event_stats(%L, ''evt-inexistant'')', adm));
  perform pg_temp.expect('BAD_FILTER', format('select public.org_participants(%L, ''evt-a'', null, null, ''nimporte'')', ow_a));
  raise notice 'OK 4 : un organisateur ne peut lire ni les stats ni les participants d''un autre ; erreurs sans fuite';

  -- 5 : statistiques
  j := public.org_event_stats(ow_a, 'evt-a');
  if (j ->> 'sold')::int <> 3 or (j ->> 'entered')::int <> 1 or (j ->> 'capacity')::int <> 20 or (j ->> 'remaining')::int <> 17 then raise exception 'FAIL 5a : chiffres %', j; end if;
  if (j ->> 'revenue_cents')::int <> 5500 then raise exception 'FAIL 5b : chiffre d''affaires % (attendu 5500)', j ->> 'revenue_cents'; end if;
  if jsonb_array_length(j -> 'tiers') <> 2 or jsonb_array_length(j -> 'series') <> 1 or (j -> 'series' -> 0 ->> 'sold')::int <> 3 then raise exception 'FAIL 5c : tarifs / série %', j; end if;
  if j ->> 'my_role' <> 'owner' then raise exception 'FAIL 5d : rôle'; end if;
  raise notice 'OK 5 : statistiques (vendus, entrés, restants, CA, tarifs, série de ventes)';

  -- 6 : participants (recherche, filtres, tri) + audit (dédoublonné sur 5 min)
  j := public.org_participants(ow_a, 'evt-a');                          if (j ->> 'total')::int <> 3 or jsonb_array_length(j -> 'rows') <> 3 then raise exception 'FAIL 6a : %', j; end if;
  j := public.org_participants(ow_a, 'evt-a', 'camille');                if (j ->> 'total')::int <> 1 then raise exception 'FAIL 6b : recherche nom'; end if;
  j := public.org_participants(ow_a, 'evt-a', 'cust@test');              if (j ->> 'total')::int <> 2 then raise exception 'FAIL 6c : recherche email'; end if;
  j := public.org_participants(ow_a, 'evt-a', null, 'a9000000-0000-0000-0000-00000000001a');  if (j ->> 'total')::int <> 1 or j -> 'rows' -> 0 ->> 'tier_name' <> 'VIP' then raise exception 'FAIL 6d : filtre tarif'; end if;
  j := public.org_participants(ow_a, 'evt-a', null, null, 'used');        if (j ->> 'total')::int <> 1 or j -> 'rows' -> 0 ->> 'holder_last_name' <> 'Vip' then raise exception 'FAIL 6e : filtre entré'; end if;
  j := public.org_participants(ow_a, 'evt-a', null, null, null, 'name', 'asc'); if j -> 'rows' -> 0 ->> 'holder_last_name' <> 'Autre' then raise exception 'FAIL 6f : tri par nom (%)', j -> 'rows' -> 0 ->> 'holder_last_name'; end if;
  j := public.org_participants(ow_a, 'evt-a', null, null, null, 'name', 'asc', 2, 2); if jsonb_array_length(j -> 'rows') <> 1 or (j ->> 'total')::int <> 3 then raise exception 'FAIL 6g : pagination'; end if;
  if j -> 'rows' -> 0 ->> 'reference' !~ '^LS-' then raise exception 'FAIL 6h : référence absente'; end if;
  select count(*) into n from public.audit_log where actor_id = ow_a and action = 'organizer.participants_view';
  if n <> 1 then raise exception 'FAIL 6i : % lignes d''audit de consultation (attendu 1 : dédoublonnage 5 min)', n; end if;
  raise notice 'OK 6 : participants (recherche, filtres tarif / statut, tri, pagination) et consultation journalisée';

  -- 7 : export CSV — owner / manager / admin seulement, TOUJOURS journalisé
  perform pg_temp.expect('FORBIDDEN', format('select public.org_export_participants(%L, ''evt-a'')', vw_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_export_participants(%L, ''evt-a'')', ow_b));
  j := public.org_export_participants(ow_a, 'evt-a');  if jsonb_array_length(j) <> 3 then raise exception 'FAIL 7a : export'; end if;
  j := public.org_export_participants(ow_a, 'evt-a');
  select count(*) into n from public.audit_log where actor_id = ow_a and action = 'organizer.export_csv' and (meta ->> 'rows')::int = 3;
  if n <> 2 then raise exception 'FAIL 7b : % exports journalisés (attendu 2)', n; end if;
  j := public.org_participants(vw_a, 'evt-a');  if (j ->> 'total')::int <> 3 then raise exception 'FAIL 7c : le lecteur doit pouvoir consulter'; end if;
  raise notice 'OK 7 : export réservé aux owner / manager / admin et journalisé à chaque fois ; lecteur = lecture seule';

  -- 8 : messages — droits, aperçu, limites, journalisation, résultats
  perform pg_temp.expect('FORBIDDEN', format('select public.org_message_preview(%L, ''evt-a'', ''all'')', vw_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_message_create(%L, ''evt-a'', ''Sujet'', ''Corps'', ''all'')', vw_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_message_create(%L, ''evt-a'', ''Sujet'', ''Corps'', ''all'')', ow_b));
  perform pg_temp.expect('REPLY_TO_MISSING', format('select public.org_message_create(%L, ''evt-b'', ''Sujet'', ''Corps'', ''all'')', ow_b));
  j := public.org_message_preview(ow_a, 'evt-a', 'all');
  if (j ->> 'count')::int <> 2 or j ->> 'reply_to' <> 'themouv2.0971@gmail.com' then raise exception 'FAIL 8a : aperçu % (2 acheteurs distincts attendus, emails en minuscules)', j; end if;
  if (j -> 'sample' ->> 0) !~ '\*\*\*' then raise exception 'FAIL 8b : aperçu non masqué'; end if;
  j := public.org_message_preview(ow_a, 'evt-a', 'tier', 'a9000000-0000-0000-0000-00000000001a');
  if (j ->> 'count')::int <> 1 then raise exception 'FAIL 8c : périmètre tarif'; end if;
  j := public.org_message_preview(ow_a, 'evt-a', 'selection', null, array['79000000-0000-0000-0000-00000000000b'::uuid]);
  if (j ->> 'count')::int <> 1 then raise exception 'FAIL 8d : périmètre sélection'; end if;
  perform pg_temp.expect('NO_RECIPIENTS', format('select public.org_message_create(%L, ''evt-a'', ''Sujet'', ''Corps'', ''selection'', null, array[]::uuid[])', ow_a));
  perform pg_temp.expect('EMPTY_MESSAGE', format('select public.org_message_create(%L, ''evt-a'', ''  '', ''Corps'', ''all'')', ow_a));
  perform pg_temp.expect('BAD_SCOPE', format('select public.org_message_create(%L, ''evt-a'', ''S'', ''C'', ''tous'')', ow_a));

  j := public.org_message_create(ow_a, 'evt-a', 'Horaires', 'Ouverture des portes à 19 h.', 'all');
  msg := (j ->> 'message_id')::uuid;
  if jsonb_array_length(j -> 'recipients') <> 2 then raise exception 'FAIL 8e : destinataires %', j; end if;
  if (select count(*) from public.organizer_message_recipients where message_id = msg and status = 'pending') <> 2 then raise exception 'FAIL 8f : destinataires non créés'; end if;
  if not exists (select 1 from public.audit_log where action = 'organizer.message_send' and actor_id = ow_a and meta ->> 'message_id' = msg::text) then raise exception 'FAIL 8g : envoi non journalisé'; end if;
  perform public.org_message_result(msg, 'cust@test.local', true, null);
  if (select status from public.organizer_messages where id = msg) <> 'sending' then raise exception 'FAIL 8h : message clos trop tôt'; end if;
  perform public.org_message_result(msg, 'autre@test.local', false, 'boîte pleine');
  if (select status || sent_count || failed_count from public.organizer_messages where id = msg) <> 'partial11' then raise exception 'FAIL 8i : statut final (%)', (select status from public.organizer_messages where id = msg); end if;
  perform public.org_message_create(ow_a, 'evt-a', 'Parking', 'Le parking ouvre à 18 h.', 'tier', 'a9000000-0000-0000-0000-00000000001a');
  perform public.org_message_create(ow_a, 'evt-a', 'Vestiaire', 'Un vestiaire est disponible.', 'all');
  perform pg_temp.expect('RATE_LIMIT', format('select public.org_message_create(%L, ''evt-a'', ''Quatrième'', ''Corps'', ''all'')', ow_a));
  j := public.org_messages_list(vw_a, 'evt-a');  if jsonb_array_length(j) <> 3 then raise exception 'FAIL 8j : historique'; end if;
  raise notice 'OK 8 : messages — droits, aperçu masqué, périmètres, limite 3 / 24 h, statuts d''envoi, journalisation';

  -- 9 : org_log et renvoi de billet
  perform pg_temp.expect('BAD_ACTION', format('select public.org_log(%L, ''evt-a'', ''admin.supprimer'', ''{}'')', ow_a));
  perform public.org_log(ow_a, 'evt-a', 'organizer.ticket_resend', '{"ticket":"x"}');
  if not exists (select 1 from public.audit_log where action = 'organizer.ticket_resend' and actor_id = ow_a) then raise exception 'FAIL 9a'; end if;
  j := public.org_ticket_for_resend(ow_a, 'evt-a', '79000000-0000-0000-0000-00000000000a');
  if j ->> 'buyer_email' <> 'Cust@Test.Local' then raise exception 'FAIL 9b'; end if;
  perform pg_temp.expect('TICKET_NOT_FOUND', format('select public.org_ticket_for_resend(%L, ''evt-a'', ''79000000-0000-0000-0000-00000000000c'')', ow_a));
  perform pg_temp.expect('FORBIDDEN', format('select public.org_ticket_for_resend(%L, ''evt-b'', ''79000000-0000-0000-0000-00000000000c'')', ow_a));
  raise notice 'OK 9 : journal d''actions et renvoi de billet limités à l''événement de l''organisateur';

  -- 10 : ni anon ni authenticated ne peuvent appeler les fonctions org_* (service_role seul)
  foreach got in array array['org_events(uuid)', 'org_event_stats(uuid, text)', 'org_export_participants(uuid, text, uuid, text)', 'org_message_create(uuid, text, text, text, text, uuid, uuid[])', 'new_ticket_reference()'] loop
    if has_function_privilege('authenticated', 'public.' || got, 'execute') or has_function_privilege('anon', 'public.' || got, 'execute') then
      raise exception 'FAIL 10 : % exécutable par un client', got; end if;
  end loop;
  raise notice 'OK 10 : fonctions org_* réservées au service_role';
end $$;

do $$ begin raise notice 'ALL OK — organisateurs validés'; end $$;
rollback;
