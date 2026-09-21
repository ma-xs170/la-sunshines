-- 018_verify.sql — contrôle en LECTURE SEULE après la migration 018.
select 'RLS activée sur admin_accounts' as controle, relrowsecurity as ok, 1 as valeur from pg_class where oid = 'public.admin_accounts'::regclass
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name = 'admin_accounts'
union all select 'chaque admin a un compte admin_accounts', count(*) = 0, count(*) from public.profiles p where p.role = 'admin' and not exists (select 1 from public.admin_accounts a where a.user_id = p.id)
union all select 'au moins un super-admin actif', count(*) >= 1, count(*) from public.admin_accounts where level = 'super' and active
union all select 'fonctions 018 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'admin\_account%' or p.proname in ('_assert_super', 'admin_login_locked', 'admin_login_result', 'admin_mark_invitation', 'admin_password_changed', 'admin_organizer_detail', 'admin_update_organizer_contact', 'admin_all_events', 'admin_transfer_preview', 'admin_transfer_event'))
order by ok, controle;
