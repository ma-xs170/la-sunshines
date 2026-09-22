-- Tests 027 — annulation d'évènement : rôles, raison obligatoire, remplacement, atomicité, audit, modèles (défaut / organisation), reprise. ROLLBACK.
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'), ('01000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('02000000-0000-0000-0000-000000000002', 'other@test.local'), ('03000000-0000-0000-0000-000000000003', 'manager@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizers (id, name, account_status, contact_email) values ('a0a0a0a0-0000-0000-0000-00000000000a', 'Orga A', 'approved', 'contact@orga-a.test'), ('b0b0b0b0-0000-0000-0000-00000000000b', 'Orga B', 'approved', 'contact@orga-b.test');
insert into public.organizer_members (organizer_id, user_id, role) values ('a0a0a0a0-0000-0000-0000-00000000000a', '01000000-0000-0000-0000-000000000001', 'owner'),
  ('b0b0b0b0-0000-0000-0000-00000000000b', '02000000-0000-0000-0000-000000000002', 'owner'), ('a0a0a0a0-0000-0000-0000-00000000000a', '03000000-0000-0000-0000-000000000003', 'manager');
insert into public.ticketed_events (id, event_slug, organizer_id, starts_at, capacity, ticketing_enabled, status, venue_name) values
  ('e0000000-0000-0000-0000-00000000000a', 'evt-a', 'a0a0a0a0-0000-0000-0000-00000000000a', now() + interval '10 days', 50, true, 'published', 'Salle A'),
  ('e0000000-0000-0000-0000-00000000000c', 'evt-c', 'a0a0a0a0-0000-0000-0000-00000000000a', now() + interval '20 days', 50, true, 'published', 'Salle C'),
  ('e0000000-0000-0000-0000-00000000000d', 'evt-draft', 'a0a0a0a0-0000-0000-0000-00000000000a', now() + interval '20 days', 50, false, 'draft', 'Salle D'),
  ('e0000000-0000-0000-0000-00000000000b', 'evt-b', 'b0b0b0b0-0000-0000-0000-00000000000b', now() + interval '20 days', 50, true, 'published', 'Salle B');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ('a1000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-00000000000a', 'Standard', 1500, 10, 6);
insert into public.orders (id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, fee_cents, total_cents, paid_at, stripe_payment_intent_id, source) values
  ('0a000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'Payeur@test.local', 3000, 0, 3000, now(), 'pi_1', 'web'),
  ('0a000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000a', 'evt-a', 'paid', 'invite@test.local', 0, 0, 0, now(), null, 'manual');
insert into public.orders (id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, fee_cents, total_cents, expires_at, stripe_checkout_session_id) values
  ('0a000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000a', 'evt-a', 'pending', 'attente@test.local', 1500, 0, 1500, now() + interval '20 minutes', 'cs_test_1');
insert into public.order_items (id, order_id, tier_id, quantity, unit_price_cents, participants, event_title, event_starts_at, tier_name) values
  ('1a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 2, 1500, '[{"first_name":"A","last_name":"A"},{"first_name":"B","last_name":"B"}]', 'A', now() + interval '10 days', 'Standard'),
  ('1a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-00000000000a', 1, 0, '[{"first_name":"I","last_name":"I"}]', 'A', now() + interval '10 days', 'Standard');
insert into public.tickets (id, order_id, order_item_id, ticketed_event_id, tier_id, code, holder_first_name, holder_last_name) values
  ('7a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'C-1', 'A', 'A'),
  ('7a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'C-2', 'B', 'B'),
  ('7a000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'C-3', 'I', 'I');

do $$ declare c jsonb; j jsonb; r jsonb; cid uuid; st jsonb; q jsonb; n int; begin
  if (select count(*) from public.cancellation_templates where organizer_id is null) <> 4 then raise exception 'FAIL 0a : 4 modèles par défaut'; end if;
  if exists (select 1 from public.cancellation_templates where organizer_id is null and (body not like '%{evenement}%' or body not like '%{organisateur}%')) then raise exception 'FAIL 0b : variables'; end if;
  if (select count(distinct body) from public.cancellation_templates where organizer_id is null) <> 4 then raise exception 'FAIL 0c : un texte différent par raison'; end if;

  -- 1 : contexte (propriétaire seulement : ni manager, ni autre organisation)
  perform pg_temp.expect('FORBIDDEN', $x$ select public.org_cancel_context('03000000-0000-0000-0000-000000000003', 'evt-a') $x$);
  perform pg_temp.expect('FORBIDDEN', $x$ select public.org_cancel_context('02000000-0000-0000-0000-000000000002', 'evt-a') $x$);
  c := public.org_cancel_context('01000000-0000-0000-0000-000000000001', 'evt-a');
  if not (c->>'cancellable')::boolean or (c->'impact'->>'paid_orders')::int <> 1 or (c->'impact'->>'refund_cents')::int <> 3000 or (c->'impact'->>'valid_tickets')::int <> 3
     or (c->'impact'->>'recipients')::int <> 2 or (c->'impact'->>'pending_orders')::int <> 1 then raise exception 'FAIL 1a : impact %', c->'impact'; end if;
  -- remplacement possible : uniquement les évènements publiés de la MÊME organisation (ni brouillon, ni autre organisation, ni lui-même)
  if jsonb_array_length(c->'replacements') <> 1 or (c->'replacements'->0->>'slug') <> 'evt-c' then raise exception 'FAIL 1b : remplacements %', c->'replacements'; end if;
  if (c->'templates'->'weather'->>'source') <> 'default' or (c->'templates'->'other'->>'body') not like '%{evenement}%' then raise exception 'FAIL 1c : modèles'; end if;

  -- 2 : validations
  perform pg_temp.expect('FORBIDDEN', $x$ select public.org_cancel_event('03000000-0000-0000-0000-000000000003', 'evt-a', 'cancel', null, 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('FORBIDDEN', $x$ select public.org_cancel_event('02000000-0000-0000-0000-000000000002', 'evt-a', 'cancel', null, 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REASON', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, null, '', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REASON', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'flemme', '', 's', 'b') $x$);
  perform pg_temp.expect('DETAIL_REQUIRED', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'other', '  ', 's', 'b') $x$);
  perform pg_temp.expect('DETAIL_REQUIRED', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'other', 'abc', 's', 'b') $x$);
  perform pg_temp.expect('EMPTY_MESSAGE', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'weather', '', ' ', 'b') $x$);
  perform pg_temp.expect('EMPTY_MESSAGE', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'weather', '', 's', '') $x$);
  perform pg_temp.expect('MESSAGE_TOO_LONG', format($x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'weather', '', 's', %L) $x$, repeat('x', 2001)));
  perform pg_temp.expect('BAD_CANCEL_MODE', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'x', null, 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REPLACEMENT', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'replace', null, 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REPLACEMENT', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'replace', 'evt-b', 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REPLACEMENT', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'replace', 'evt-draft', 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REPLACEMENT', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'replace', 'evt-a', 'weather', '', 's', 'b') $x$);
  perform pg_temp.expect('NOT_CANCELLABLE', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-draft', 'cancel', null, 'weather', '', 's', 'b') $x$);
  -- rien n'a bougé après tous ces refus (atomicité)
  if (select status from public.ticketed_events where event_slug = 'evt-a') <> 'published' or exists (select 1 from public.event_cancellations) or exists (select 1 from public.organizer_messages) then raise exception 'FAIL 2 : effets de bord après refus'; end if;

  -- 3 : annulation en mode remplacement, raison « Autre » avec précision
  r := public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'replace', 'evt-c', 'other', 'Le gérant de la salle a fait faillite.', 'Annulation de Soirée A', 'Bonjour, désolés.');
  cid := (r->>'cancellation_id')::uuid;
  if (select status from public.ticketed_events where event_slug = 'evt-a') <> 'cancelled' or (select ticketing_enabled from public.ticketed_events where event_slug = 'evt-a') then raise exception 'FAIL 3a : évènement annulé, ventes coupées'; end if;
  if exists (select 1 from public.tickets where ticketed_event_id = 'e0000000-0000-0000-0000-00000000000a' and status = 'valid') or (r->>'tickets_cancelled')::int <> 3 then raise exception 'FAIL 3b : billets annulés %', r; end if;
  if (select status from public.orders where id = '0a000000-0000-0000-0000-000000000003') <> 'cancelled' or (r->'pending_sessions'->>0) <> 'cs_test_1' then raise exception 'FAIL 3c : commande en attente annulée %', r; end if;
  if jsonb_array_length(r->'recipients') <> 2 or (r->'recipients') <> '["invite@test.local","payeur@test.local"]'::jsonb then raise exception 'FAIL 3d : destinataires figés, minuscules, dédoublonnés %', r->'recipients'; end if;
  if (r->>'refund_cents_planned')::int <> 3000 or jsonb_array_length(r->'orders') <> 1 or (r->'orders'->0->>'number') is null then raise exception 'FAIL 3e : remboursement prévu %', r; end if;
  if (r->>'venue') <> 'Salle A' or (r->>'starts_at') is null then raise exception 'FAIL 3e2 : lieu et date renvoyés %', r; end if;
  if (select count(*) from public.organizer_message_recipients where message_id = (r->>'message_id')::uuid and status = 'pending') <> 2 then raise exception 'FAIL 3f : destinataires en attente'; end if;
  if (select reply_to from public.organizer_messages where id = (r->>'message_id')::uuid) <> 'contact@orga-a.test' then raise exception 'FAIL 3g : adresse de réponse'; end if;
  -- raison dans audit_log (visible admin), jamais dans le message
  select meta into q from public.audit_log where action = 'event.cancel' and entity_id = 'e0000000-0000-0000-0000-00000000000a';
  if q is null or q->>'reason' <> 'other' or q->>'reason_detail' <> 'Le gérant de la salle a fait faillite.' or q->>'mode' <> 'replace' or q->>'replacement' <> 'evt-c' then raise exception 'FAIL 3h : audit %', q; end if;
  if exists (select 1 from public.organizer_messages where body like '%faillite%' or subject like '%faillite%') then raise exception 'FAIL 3i : la raison ne doit pas fuiter dans le message'; end if;
  perform pg_temp.expect('ALREADY_CANCELLED', $x$ select public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-a', 'cancel', null, 'weather', '', 's', 'b') $x$);

  -- 4 : suivi et reprise
  st := public.org_cancellation_state('01000000-0000-0000-0000-000000000001', 'evt-a');
  if st->>'mode' <> 'replace' or st->>'reason' <> 'other' or (st->'replacement'->>'slug') <> 'evt-c' or jsonb_array_length(st->'refund_remaining') <> 1 or (st->'message'->>'recipient_count')::int <> 2 then raise exception 'FAIL 4a : état %', st; end if;
  perform pg_temp.expect('FORBIDDEN', $x$ select public.org_cancellation_state('03000000-0000-0000-0000-000000000003', 'evt-a') $x$);
  if public.org_cancellation_state('01000000-0000-0000-0000-000000000001', 'evt-c') is not null then raise exception 'FAIL 4b : évènement non annulé'; end if;
  -- remboursement réservé puis réussi : plus rien à rembourser
  perform public.begin_refund('0a000000-0000-0000-0000-000000000001', null, 'Évènement annulé', '01000000-0000-0000-0000-000000000001', 'event_cancelled', 'cancel:x:1');
  if jsonb_array_length((public.org_cancellation_state('01000000-0000-0000-0000-000000000001', 'evt-a'))->'refund_remaining') <> 1 then raise exception 'FAIL 4c : remboursement resté sans identifiant Stripe = à reprendre'; end if;
  perform public.finish_refund((select id from public.refunds where idempotency_key = 'cancel:x:1'), 're_1', true);
  st := public.org_cancellation_state('01000000-0000-0000-0000-000000000001', 'evt-a');
  if jsonb_array_length(st->'refund_remaining') <> 0 or (st->>'refunded_cents')::int <> 3000 then raise exception 'FAIL 4d : plus rien à rembourser %', st; end if;
  -- e-mails : un succès, un échec, reprise = l'échec repasse en attente
  perform public.org_message_result((r->>'message_id')::uuid, 'invite@test.local', true);
  perform public.org_message_result((r->>'message_id')::uuid, 'payeur@test.local', false, 'boom');
  if (public.org_cancellation_state('01000000-0000-0000-0000-000000000001', 'evt-a')->'message'->>'status') <> 'partial' then raise exception 'FAIL 4e : statut partiel'; end if;
  q := public.org_cancellation_requeue('01000000-0000-0000-0000-000000000001', 'evt-a');
  if (q->'recipients') <> '["payeur@test.local"]'::jsonb then raise exception 'FAIL 4f : reprise %', q; end if;
  perform public.org_message_result((r->>'message_id')::uuid, 'payeur@test.local', true);
  if (public.org_cancellation_state('01000000-0000-0000-0000-000000000001', 'evt-a')->'message'->>'status') <> 'sent' then raise exception 'FAIL 4g : envoyé'; end if;
  perform pg_temp.expect('NOT_CANCELLED', $x$ select public.org_cancellation_requeue('01000000-0000-0000-0000-000000000001', 'evt-c') $x$);

  -- 5 : sans participant : pas de message, l'annulation aboutit quand même
  r := public.org_cancel_event('01000000-0000-0000-0000-000000000001', 'evt-c', 'cancel', null, 'low_sales', '', 'Annulation', 'Bonjour.');
  if (r->>'message_id') is not null or jsonb_array_length(r->'recipients') <> 0 or (select status from public.ticketed_events where event_slug = 'evt-c') <> 'cancelled' then raise exception 'FAIL 5 : sans participant %', r; end if;

  -- 6 : modèles — organisation (surcharge), retour au défaut ; admin (défaut du site)
  perform public.org_save_cancellation_template('01000000-0000-0000-0000-000000000001', 'evt-a', 'weather', 'Sujet perso', 'Texte de mon organisation pour {evenement}');
  c := public.org_cancel_context('01000000-0000-0000-0000-000000000001', 'evt-a');
  if (c->'templates'->'weather'->>'source') <> 'organization' or (c->'templates'->'weather'->>'subject') <> 'Sujet perso' or (c->'templates'->'permit'->>'source') <> 'default' then raise exception 'FAIL 6a : surcharge %', c->'templates'; end if;
  perform public.org_save_cancellation_template('01000000-0000-0000-0000-000000000001', 'evt-a', 'weather', 'Sujet perso 2', 'Encore {evenement}');
  if (select count(*) from public.cancellation_templates where organizer_id = 'a0a0a0a0-0000-0000-0000-00000000000a') <> 1 then raise exception 'FAIL 6b : upsert'; end if;
  -- l'autre organisation garde le modèle du site
  if (public._effective_templates('b0b0b0b0-0000-0000-0000-00000000000b')->'weather'->>'source') <> 'default' then raise exception 'FAIL 6c : isolation'; end if;
  perform pg_temp.expect('FORBIDDEN', $x$ select public.org_save_cancellation_template('03000000-0000-0000-0000-000000000003', 'evt-a', 'weather', 's', 'b') $x$);
  perform pg_temp.expect('BAD_REASON', $x$ select public.org_save_cancellation_template('01000000-0000-0000-0000-000000000001', 'evt-a', 'zzz', 's', 'b') $x$);
  perform pg_temp.expect('BAD_TEMPLATE', $x$ select public.org_save_cancellation_template('01000000-0000-0000-0000-000000000001', 'evt-a', 'weather', '', 'b') $x$);
  perform public.org_reset_cancellation_template('01000000-0000-0000-0000-000000000001', 'evt-a', 'weather');
  if (public.org_cancel_context('01000000-0000-0000-0000-000000000001', 'evt-a')->'templates'->'weather'->>'source') <> 'default' then raise exception 'FAIL 6d : retour au défaut'; end if;
  perform pg_temp.expect('FORBIDDEN', $x$ select public.admin_save_cancellation_template('01000000-0000-0000-0000-000000000001', 'weather', 's', 'b') $x$);
  perform pg_temp.expect('FORBIDDEN', $x$ select public.admin_cancellation_templates('01000000-0000-0000-0000-000000000001') $x$);
  perform public.admin_save_cancellation_template('ad000000-0000-0000-0000-0000000000ad', 'weather', 'Nouveau sujet', 'Nouveau texte {evenement}');
  j := public.admin_cancellation_templates('ad000000-0000-0000-0000-0000000000ad');
  if jsonb_array_length(j) <> 4 or (j->0->>'reason') <> 'weather' or (j->0->>'subject') <> 'Nouveau sujet' then raise exception 'FAIL 6e : modèles admin %', j; end if;
  if (select count(*) from public.cancellation_templates where organizer_id is null) <> 4 then raise exception 'FAIL 6f : un seul défaut par raison'; end if;
  if (public._effective_templates('a0a0a0a0-0000-0000-0000-00000000000a')->'weather'->>'subject') <> 'Nouveau sujet' then raise exception 'FAIL 6g : défaut modifié sans redéploiement'; end if;
  if (select count(*) from public.audit_log where action in ('cancellation_template.save', 'cancellation_template.org_save', 'cancellation_template.org_reset')) <> 4 then raise exception 'FAIL 6h : audit modèles'; end if;
end $$;
-- droits : rien n'est exécutable ni lisible par anon / authenticated
do $$ begin
  if has_function_privilege('authenticated', 'public.org_cancel_event(uuid,text,text,text,text,text,text,text)', 'execute') or has_function_privilege('anon', 'public.admin_save_cancellation_template(uuid,text,text,text)', 'execute') then raise exception 'FAIL : fonctions exécutables'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('cancellation_templates', 'event_cancellations')) then raise exception 'FAIL : droits directs'; end if;
end $$;
rollback;
