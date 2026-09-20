-- =====================================================================
-- Test migration 008 — données privées artistes / abonnés : fermées au public, contraintes. ROLLBACK.
-- =====================================================================
begin;

do $$
declare
  t text; got text; n int;
  tables text[] := array['artist_emails','artist_subscriptions','artist_notifications','artist_login_tokens','artist_verifications'];
begin
  -- 1 : RLS activée, aucune policy, aucun droit pour anon / authenticated
  foreach t in array tables loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then raise exception 'FAIL 1a : RLS désactivée sur %', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then raise exception 'FAIL 1b : policy inattendue sur %', t; end if;
    if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = t and grantee in ('anon','authenticated','PUBLIC')) then
      raise exception 'FAIL 1c : droits anon/authenticated sur %', t; end if;
  end loop;
  raise notice 'OK 1 : 5 tables, RLS activée, aucune policy, aucun droit public';

  insert into public.artist_emails (artist_slug, email) values ('dj-test', 'dj@test.local');
  insert into public.artist_subscriptions (artist_slug, email, token) values ('dj-test', 'fan@test.local', 'tok_0123456789abcdef');
  insert into public.artist_login_tokens (token_hash, artist_slug, expires_at) values (repeat('a', 64), 'dj-test', now() - interval '3 days');
  insert into public.artist_login_tokens (token_hash, artist_slug, expires_at) values (repeat('b', 64), 'dj-test', now() + interval '20 minutes');

  -- 2 : anon / authenticated ne lisent ni n'écrivent rien
  foreach t in array tables loop
    set local role anon;
    begin execute format('select 1 from public.%I', t); got := 'lu'; exception when insufficient_privilege then got := null; end;
    if got is not null then raise exception 'FAIL 2a : anon lit %', t; end if;
    set local role authenticated;
    begin execute format('select 1 from public.%I', t); got := 'lu'; exception when insufficient_privilege then got := null; end;
    if got is not null then raise exception 'FAIL 2b : authenticated lit %', t; end if;
    reset role;
  end loop;
  set local role authenticated;
  begin perform public.purge_artist_login_tokens(); got := 'purgé'; exception when insufficient_privilege then got := null; end;
  reset role;
  if got is not null then raise exception 'FAIL 2c : authenticated exécute la purge'; end if;
  raise notice 'OK 2 : anon et authenticated ne peuvent rien lire ni écrire';

  -- 3 : contraintes
  begin insert into public.artist_subscriptions (artist_slug, email, token) values ('dj-test', 'Fan@Test.Local', 'tok_zzzzzzzzzzzzzzzz'); got := null; exception when check_violation then got := 'refusé'; end;
  if got is null then raise exception 'FAIL 3a : email non normalisé accepté'; end if;
  begin insert into public.artist_subscriptions (artist_slug, email, token) values ('dj-test', 'fan@test.local', 'tok_autre_0123456789'); got := null; exception when unique_violation then got := 'refusé'; end;
  if got is null then raise exception 'FAIL 3b : double abonnement accepté'; end if;
  begin insert into public.artist_login_tokens (token_hash, artist_slug, expires_at) values ('court', 'dj-test', now()); got := null; exception when check_violation then got := 'refusé'; end;
  if got is null then raise exception 'FAIL 3c : hash court accepté'; end if;
  insert into public.artist_verifications (artist_slug, name, email) values ('dj-test', 'Nom', 'v@test.local');
  begin insert into public.artist_verifications (artist_slug, name, email) values ('dj-test', 'Autre', 'w@test.local'); got := null; exception when unique_violation then got := 'refusé'; end;
  if got is null then raise exception 'FAIL 3d : deux demandes pour un même artiste'; end if;
  raise notice 'OK 3 : contraintes (email en minuscules, abonnement unique, hash 64 car., une demande par artiste)';

  -- 4 : la purge supprime les jetons périmés depuis plus d'un jour, pas les autres
  select public.purge_artist_login_tokens() into n;
  if n <> 1 then raise exception 'FAIL 4a : % supprimés (attendu 1)', n; end if;
  select count(*) into n from public.artist_login_tokens;
  if n <> 1 then raise exception 'FAIL 4b : % restants (attendu 1)', n; end if;
  raise notice 'OK 4 : purge des jetons périmés';
end $$;

do $$ begin raise notice 'ALL OK — données privées artistes validées'; end $$;
rollback;
