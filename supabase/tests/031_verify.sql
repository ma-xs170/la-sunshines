-- 031_verify.sql — contrôle en LECTURE SEULE après la migration 031.
select 'fonctions 031 présentes' as controle, count(*) = 3 as ok, count(*) as valeur from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_set_event_status', 'admin_rename_participant', 'admin_cancel_order')
union all select 'fonctions 031 non exécutables par anon / authenticated', count(*) = 0, count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_set_event_status', 'admin_rename_participant', 'admin_cancel_order') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'admin_global_search non exécutable par anon / authenticated', count(*) = 0, count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'admin_global_search' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
union all select 'aucun évènement passé à un statut inconnu', count(*) = 0, count(*) from public.ticketed_events where status not in ('draft', 'published', 'closed', 'cancelled')
order by ok, controle;
