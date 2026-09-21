-- Tests 026 — publication : checklist, demande, doublon, annulation, file admin, approbation / refus avec motif, lecture publique, droits. ROLLBACK.
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'), ('01000000-0000-0000-0000-000000000001', 'owner@test.local'), ('02000000-0000-0000-0000-000000000002', 'other@test.local'), ('03000000-0000-0000-0000-000000000003', 'staff@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizers (id, name, account_status, stripe_ready) values ('a0a0a0a0-0000-0000-0000-00000000000a', 'Orga A', 'approved', false), ('b0b0b0b0-0000-0000-0000-00000000000b', 'Orga B', 'approved', false);
insert into public.organizer_members (organizer_id, user_id, role) values ('a0a0a0a0-0000-0000-0000-00000000000a', '01000000-0000-0000-0000-000000000001', 'owner'), ('b0b0b0b0-0000-0000-0000-00000000000b', '02000000-0000-0000-0000-000000000002', 'owner'), ('a0a0a0a0-0000-0000-0000-00000000000a', '03000000-0000-0000-0000-000000000003', 'staff');
create function pg_temp.mk(p_slug text, p_mode text) returns void language plpgsql as $$
begin
  perform public.org_create_event('01000000-0000-0000-0000-000000000001', 'a0a0a0a0-0000-0000-0000-00000000000a',
    jsonb_build_object('slug', p_slug, 'title', 'Soirée ' || p_slug, 'ticketing_mode', p_mode, 'bizouk_event_id', case when p_mode = 'bizouk' then '128267' end, 'starts_at', (now() + interval '30 days')::text, 'venue_name', 'Salle X', 'city', 'Le Gosier', 'region', 'guadeloupe', 'visibility', 'public', 'event_type', 'Soirée'));
end $$;
select pg_temp.mk('evt-bz', 'bizouk');
select pg_temp.mk('evt-int', 'internal');
select pg_temp.expect('CHECKLIST_INCOMPLETE', $q$ select public.org_request_publication('01000000-0000-0000-0000-000000000001', 'evt-bz') $q$);
do $$ declare s jsonb; r jsonb; rid uuid; p jsonb; begin
  s := public.org_publication_state('01000000-0000-0000-0000-000000000001', 'evt-bz');
  if (s->'checklist'->>'description')::boolean or (s->'checklist'->>'visual')::boolean or not (s->'checklist'->>'tickets')::boolean or not (s->'checklist'->>'venue')::boolean or not (s->'checklist'->>'date')::boolean or (s->>'ready')::boolean then raise exception 'FAIL : checklist initiale %', s; end if;
  update public.event_details set description = 'Une belle soirée pour toute la team, avec DJ et ambiance.' where ticketed_event_id = (select id from public.ticketed_events where event_slug = 'evt-bz');
  perform public.org_set_flyer('01000000-0000-0000-0000-000000000001', 'evt-bz', 'https://abc123.public.blob.vercel-storage.com/evenements/evt-bz/flyer.jpg');
  s := public.org_publication_state('01000000-0000-0000-0000-000000000001', 'evt-bz');
  if not (s->>'ready')::boolean then raise exception 'FAIL : checklist complète attendue %', s; end if;
  r := public.org_request_publication('01000000-0000-0000-0000-000000000001', 'evt-bz');
  rid := (r->>'id')::uuid;
  if (public.org_publication_state('01000000-0000-0000-0000-000000000001', 'evt-bz')->'request'->>'status') <> 'pending' then raise exception 'FAIL : demande en attente'; end if;
  -- file admin
  p := public.admin_publications('ad000000-0000-0000-0000-0000000000ad', 'pending');
  if (p->'counts'->>'pending')::int <> 1 or jsonb_array_length(p->'rows') <> 1 or (p->'rows'->0->>'slug') <> 'evt-bz' then raise exception 'FAIL : file admin %', p; end if;
  -- annulation puis nouvelle demande
  perform public.org_cancel_publication('01000000-0000-0000-0000-000000000001', 'evt-bz');
  r := public.org_request_publication('01000000-0000-0000-0000-000000000001', 'evt-bz');
  rid := (r->>'id')::uuid;
  -- refus : motif obligatoire, l'évènement reste brouillon
  begin perform public.admin_review_publication('ad000000-0000-0000-0000-0000000000ad', rid, false, ' '); raise exception 'FAIL : refus sans motif'; exception when others then if sqlerrm <> 'REASON_REQUIRED' then raise; end if; end;
  r := public.admin_review_publication('ad000000-0000-0000-0000-0000000000ad', rid, false, 'Le visuel est illisible, merci de le remplacer.');
  if (select status from public.ticketed_events where event_slug = 'evt-bz') <> 'draft' then raise exception 'FAIL : reste brouillon'; end if;
  if (public.org_publication_state('01000000-0000-0000-0000-000000000001', 'evt-bz')->'request'->>'reason') not like 'Le visuel%' then raise exception 'FAIL : motif visible'; end if;
  if public.public_db_event('evt-bz') is not null then raise exception 'FAIL : brouillon public'; end if;
  -- nouvelle demande, approbation
  r := public.org_request_publication('01000000-0000-0000-0000-000000000001', 'evt-bz');
  rid := (r->>'id')::uuid;
  begin perform public.org_request_publication('01000000-0000-0000-0000-000000000001', 'evt-bz'); raise exception 'FAIL : doublon'; exception when others then if sqlerrm <> 'ALREADY_PENDING' then raise; end if; end;
  r := public.admin_review_publication('ad000000-0000-0000-0000-0000000000ad', rid, true);
  if (select status from public.ticketed_events where event_slug = 'evt-bz') <> 'published' then raise exception 'FAIL : publié'; end if;
  if (select ticketing_enabled from public.ticketed_events where event_slug = 'evt-bz') then raise exception 'FAIL : billetterie interne non activée en mode Bizouk'; end if;
  if (public.public_db_event('evt-bz')->>'bizouk_event_id') <> '128267' or (public.public_db_event('evt-bz')->>'title') <> 'Soirée evt-bz' then raise exception 'FAIL : lecture publique'; end if;
  begin perform public.admin_review_publication('ad000000-0000-0000-0000-0000000000ad', rid, true); raise exception 'FAIL : déjà traitée'; exception when others then if sqlerrm <> 'NOT_PENDING' then raise; end if; end;
  if not exists (select 1 from public.audit_log where action = 'publication.approve') or not exists (select 1 from public.audit_log where action = 'publication.reject') then raise exception 'FAIL : audit'; end if;
end $$;
-- droits
select pg_temp.expect('FORBIDDEN', $q$ select public.org_request_publication('02000000-0000-0000-0000-000000000002', 'evt-int') $q$);
select pg_temp.expect('FORBIDDEN', $q$ select public.org_request_publication('03000000-0000-0000-0000-000000000003', 'evt-int') $q$);
select pg_temp.expect('FORBIDDEN', $q$ select public.admin_publications('01000000-0000-0000-0000-000000000001', 'pending') $q$);
select pg_temp.expect('FORBIDDEN', $q$ select public.admin_review_publication('01000000-0000-0000-0000-000000000001', gen_random_uuid(), true) $q$);
select pg_temp.expect('FORBIDDEN', $q$ select public.org_set_flyer('02000000-0000-0000-0000-000000000002', 'evt-int', null) $q$);
select pg_temp.expect('BAD_URL', $q$ select public.org_set_flyer('01000000-0000-0000-0000-000000000001', 'evt-int', 'https://evil.example/x.jpg') $q$);
select pg_temp.expect('REQUEST_NOT_FOUND', $q$ select public.admin_review_publication('ad000000-0000-0000-0000-0000000000ad', gen_random_uuid(), true) $q$);
-- mode interne : il faut un tarif actif ; approbation avec Stripe prêt = billetterie activée
do $$ declare rid uuid; begin
  update public.event_details set description = 'Une soirée avec billetterie interne, tarifs et QR codes.' where ticketed_event_id = (select id from public.ticketed_events where event_slug = 'evt-int');
  perform public.org_set_flyer('01000000-0000-0000-0000-000000000001', 'evt-int', 'https://abc123.public.blob.vercel-storage.com/evenements/evt-int/flyer.png');
  if (public.org_publication_state('01000000-0000-0000-0000-000000000001', 'evt-int')->'checklist'->>'tickets')::boolean then raise exception 'FAIL : sans tarif la checklist doit être incomplète'; end if;
  insert into public.ticket_tiers (ticketed_event_id, name, price_cents, quantity_total, max_per_order) values ((select id from public.ticketed_events where event_slug = 'evt-int'), 'Standard', 1500, 50, 4);
  rid := (public.org_request_publication('01000000-0000-0000-0000-000000000001', 'evt-int')->>'id')::uuid;
  update public.organizers set stripe_ready = true where id = 'a0a0a0a0-0000-0000-0000-00000000000a';
  perform public.admin_review_publication('ad000000-0000-0000-0000-0000000000ad', rid, true);
  if not (select ticketing_enabled from public.ticketed_events where event_slug = 'evt-int') then raise exception 'FAIL : billetterie interne activée (Stripe prêt + tarif)'; end if;
end $$;
-- organisation suspendue : demande refusée
do $$ begin
  update public.organizers set account_status = 'suspended' where id = 'b0b0b0b0-0000-0000-0000-00000000000b';
end $$;
do $$ begin if has_function_privilege('authenticated', 'public.org_request_publication(uuid,text)', 'execute') then raise exception 'FAIL : exécutable par authenticated'; end if; end $$;
rollback;
