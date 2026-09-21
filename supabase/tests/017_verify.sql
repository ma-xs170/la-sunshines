-- 017_verify.sql — contrôle en LECTURE SEULE après la migration 017.
select 'RLS activée sur event_payouts et notification_prefs' as controle, bool_and(relrowsecurity) as ok, count(*) as valeur from pg_class where oid in ('public.event_payouts'::regclass, 'public.notification_prefs'::regclass)
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('event_payouts', 'notification_prefs')
union all select 'fonctions 017 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_record_payout', 'org_finance', 'org_dashboard', 'org_sales_matrix', 'org_notif_get', 'org_notif_set')
order by ok, controle;
