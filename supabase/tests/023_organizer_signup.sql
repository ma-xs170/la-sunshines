-- Tests migration 023 — inscription organisation : en attente, OWNER, pièces obligatoires, limites, consultation admin journalisée. ROLLBACK.
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
insert into auth.users (id, email) values ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'), ('01000000-0000-0000-0000-000000000001', 'new@test.local'), ('01000000-0000-0000-0000-000000000002', 'other@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
create function pg_temp.data(p_name text) returns jsonb language sql as $$
  select jsonb_build_object('name', p_name, 'legal_form', 'association', 'siret', '10665995600010', 'contact_email', 'a@b.fr', 'responsible_first', 'Ada', 'responsible_last', 'Lovelace', 'address', '1 rue X', 'postal_code', '97100', 'city', 'Basse-Terre') $$;
create function pg_temp.docs() returns jsonb language sql as $$
  select '[{"kind":"identity","path":"orgdocs/abc.pdf","name":"cni.pdf","size":1200,"mime":"application/pdf"},{"kind":"legal","path":"orgdocs/def.png","name":"kbis.png","size":900,"mime":"image/png"}]'::jsonb $$;
do $$ declare r jsonb; oid uuid; begin
  r := public.org_register('01000000-0000-0000-0000-000000000001', pg_temp.data('Asso Test'), pg_temp.docs());
  oid := (r->>'id')::uuid;
  if r->>'status' <> 'pending' then raise exception 'FAIL : statut pending attendu'; end if;
  if (select account_status from public.organizers where id = oid) <> 'pending' then raise exception 'FAIL : organisation non pending'; end if;
  if (select reference from public.organizers where id = oid) is not null then raise exception 'FAIL : pas de référence avant approbation'; end if;
  if (select role from public.organizer_members where organizer_id = oid and user_id = '01000000-0000-0000-0000-000000000001') <> 'owner' then raise exception 'FAIL : OWNER attendu'; end if;
  if (select count(*) from public.organizer_documents where organizer_id = oid) <> 2 then raise exception 'FAIL : 2 pièces attendues'; end if;
  -- l'autre compte ne voit pas cette organisation
  if exists (select 1 from jsonb_array_elements(public.org_list('01000000-0000-0000-0000-000000000002')) x where x->>'id' = oid::text) then raise exception 'FAIL : fuite vers un autre compte'; end if;
  -- admin : dossier + consultation journalisée
  if jsonb_array_length(public.admin_org_dossier('ad000000-0000-0000-0000-0000000000ad', oid)->'documents') <> 2 then raise exception 'FAIL : dossier admin'; end if;
  perform public.admin_org_document('ad000000-0000-0000-0000-0000000000ad', (select id from public.organizer_documents where organizer_id = oid and kind = 'identity'));
  if not exists (select 1 from public.audit_log where action = 'organizer.document_view' and entity_id = oid::text) then raise exception 'FAIL : consultation non journalisée'; end if;
end $$;
select pg_temp.expect('FORBIDDEN', $q$ select public.admin_org_dossier('01000000-0000-0000-0000-000000000001', (select id from public.organizers limit 1)) $q$);
select pg_temp.expect('FORBIDDEN', $q$ select public.admin_org_document('01000000-0000-0000-0000-000000000001', gen_random_uuid()) $q$);
select pg_temp.expect('IDENTITY_REQUIRED', $q$ select public.org_register('01000000-0000-0000-0000-000000000002', pg_temp.data('X'), '[{"kind":"legal","path":"orgdocs/a.pdf","name":"a.pdf","size":10,"mime":"application/pdf"}]') $q$);
select pg_temp.expect('BAD_SIRET', $q$ select public.org_register('01000000-0000-0000-0000-000000000002', pg_temp.data('X') || '{"siret":"123"}', pg_temp.docs()) $q$);
select pg_temp.expect('BAD_EMAIL', $q$ select public.org_register('01000000-0000-0000-0000-000000000002', pg_temp.data('X') || '{"contact_email":"nope"}', pg_temp.docs()) $q$);
select pg_temp.expect('BAD_LEGAL_FORM', $q$ select public.org_register('01000000-0000-0000-0000-000000000002', pg_temp.data('X') || '{"legal_form":"zzz"}', pg_temp.docs()) $q$);
select pg_temp.expect('NAME_REQUIRED', $q$ select public.org_register('01000000-0000-0000-0000-000000000002', pg_temp.data('  '), pg_temp.docs()) $q$);
select pg_temp.expect('FORBIDDEN', $q$ select public.org_register(gen_random_uuid(), pg_temp.data('X'), pg_temp.docs()) $q$);
select public.org_register('01000000-0000-0000-0000-000000000001', pg_temp.data('Deux'), pg_temp.docs());
select public.org_register('01000000-0000-0000-0000-000000000001', pg_temp.data('Trois'), pg_temp.docs());
select pg_temp.expect('TOO_MANY_PENDING', $q$ select public.org_register('01000000-0000-0000-0000-000000000001', pg_temp.data('Quatre'), pg_temp.docs()) $q$);
do $$ begin
  if has_function_privilege('authenticated', 'public.org_register(uuid,jsonb,jsonb)', 'execute') then raise exception 'FAIL : org_register exécutable par authenticated'; end if;
end $$;
rollback;
