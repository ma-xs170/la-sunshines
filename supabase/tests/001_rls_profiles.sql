-- =====================================================================
-- Tests RLS — phase 1 (profiles, rôles, app_settings)
--
-- À coller dans le SQL Editor Supabase APRÈS la migration 001.
-- Tout se passe dans une transaction annulée à la fin (ROLLBACK) : aucune
-- donnée ne reste. Un test qui échoue lève « FAIL n : … » et stoppe le script ;
-- si tu vois « ALL OK » en dernier NOTICE, tout est bon.
--
-- On simule une session Supabase : `set local role authenticated` + le JWT
-- (claims) que lit auth.uid().
-- =====================================================================

begin;

-- ---------- Jeu de données (rôle postgres = contourne la RLS) ----------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@test.local'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin@test.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'porte@test.local');

update public.profiles set role = 'admin' where id = 'cccccccc-0000-0000-0000-000000000003';
update public.profiles set role = 'staff' where id = 'dddddddd-0000-0000-0000-000000000004';

insert into public.app_settings (key, value, is_public) values ('secret_setting', '"x"', false);

-- ---------- T1 : le trigger ignore un rôle passé dans les métadonnées ----------
insert into auth.users (id, email, raw_user_meta_data)
values ('eeeeeeee-0000-0000-0000-000000000005', 'mallory@test.local',
        '{"role":"admin","first_name":"Mallory"}');
do $$ begin
  if (select role from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000005') <> 'customer'
  then raise exception 'FAIL 1 : un rôle admin a été accepté depuis les métadonnées'; end if;
  if (select first_name from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000005') <> 'Mallory'
  then raise exception 'FAIL 1b : le prénom des métadonnées n''a pas été copié'; end if;
  raise notice 'OK 1 : inscription = toujours customer';
end $$;

-- ---------- T2 : valeurs de réglages invalides refusées ----------
do $$ begin
  begin
    update public.app_settings set value = '"nimportequoi"' where key = 'ticketing_mode';
    raise exception 'FAIL 2 : ticketing_mode invalide accepté';
  exception when check_violation then null; end;
  begin
    update public.app_settings set value = '150' where key = 'fee_percent';
    raise exception 'FAIL 2b : fee_percent > 100 accepté';
  exception when check_violation then null; end;
  raise notice 'OK 2 : contraintes de app_settings';
end $$;

-- ---------- Alice (customer) ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$ declare n int; begin
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL 3 : alice voit % profils (attendu 1)', n; end if;
  if (select id from public.profiles) <> 'aaaaaaaa-0000-0000-0000-000000000001'
  then raise exception 'FAIL 3b : alice ne voit pas son propre profil'; end if;
  raise notice 'OK 3 : alice ne voit que son profil';

  select count(*) into n from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL 4 : alice lit le profil de bob'; end if;
  raise notice 'OK 4 : alice ne peut pas lire le profil de bob';

  update public.profiles set first_name = 'Hack' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 5 : alice a modifié le profil de bob'; end if;
  raise notice 'OK 5 : alice ne peut pas modifier le profil de bob';

  update public.profiles set first_name = 'Alice', phone = '0690000000'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL 6 : alice ne peut pas modifier son propre profil'; end if;
  raise notice 'OK 6 : alice modifie son prénom / téléphone';

  begin
    update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL 7 : alice s''est promue admin';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 7 : impossible de modifier son propre rôle';

  begin
    insert into public.profiles (id) values ('ffffffff-0000-0000-0000-000000000009');
    raise exception 'FAIL 8 : insertion directe dans profiles acceptée';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL 8b : suppression directe de profil acceptée';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 8 : pas d''insert / delete client sur profiles';

  select count(*) into n from public.app_settings;
  if n <> 4 then raise exception 'FAIL 9 : alice voit % réglages (attendu 4 publics)', n; end if;
  if exists (select 1 from public.app_settings where key = 'secret_setting')
  then raise exception 'FAIL 9b : réglage non public visible'; end if;
  raise notice 'OK 9 : seuls les réglages publics sont lisibles';

  begin
    update public.app_settings set value = '"native"' where key = 'ticketing_mode';
    raise exception 'FAIL 10 : alice a écrit dans app_settings';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 10 : pas d''écriture client sur app_settings';

  if public.is_admin() or public.is_staff()
  then raise exception 'FAIL 11 : alice est vue admin/staff'; end if;
  raise notice 'OK 11 : is_admin()/is_staff() faux pour un client';
end $$;
reset role;

-- ---------- Anonyme (non connecté) ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare n int; begin
  begin
    perform count(*) from public.profiles;
    raise exception 'FAIL 12 : anon peut lire profiles';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.app_settings;
  if n <> 4 then raise exception 'FAIL 13 : anon voit % réglages (attendu 4 publics)', n; end if;
  begin
    insert into public.app_settings (key, value) values ('x_evil', '1');
    raise exception 'FAIL 14 : anon a écrit dans app_settings';
  exception when insufficient_privilege then null; end;
  raise notice 'OK 12-14 : anon = aucun accès aux profils, lecture seule des réglages publics';
end $$;
reset role;

-- ---------- Admin ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.profiles) <> 5
  then raise exception 'FAIL 15 : l''admin ne voit pas tous les profils'; end if;
  if not public.is_admin() or not public.is_staff()
  then raise exception 'FAIL 16 : is_admin()/is_staff() faux pour un admin'; end if;
  raise notice 'OK 15-16 : l''admin lit tous les profils';
end $$;
reset role;

-- ---------- Staff ----------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$ begin
  if public.is_admin() or not public.is_staff()
  then raise exception 'FAIL 17 : le staff doit être staff mais pas admin'; end if;
  if (select count(*) from public.profiles) <> 1
  then raise exception 'FAIL 18 : le staff voit d''autres profils que le sien'; end if;
  raise notice 'OK 17-18 : staff = is_staff() vrai, is_admin() faux, ne lit que son profil';
end $$;
reset role;

do $$ begin raise notice 'ALL OK — RLS phase 1 validée'; end $$;

rollback;
