-- 019_verify.sql — contrôle en LECTURE SEULE après la migration 019.
select 'RLS activée sur les tables de support' as controle, bool_and(relrowsecurity) as ok, count(*) as valeur from pg_class where oid in ('public.support_threads'::regclass, 'public.support_participants'::regclass, 'public.support_messages'::regclass, 'public.support_events'::regclass, 'public.support_reads'::regclass, 'public.support_quick_replies'::regclass)
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name like 'support\_%' and table_name <> 'support_tickets'
union all select 'fonctions 019 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'support\_%' or p.proname in ('_support_role', '_new_ticket_ref', '_assert_active_admin', 'admin_support_list', 'admin_support_search'))
union all select 'notes internes jamais écrites par un organisateur', count(*) = 0, count(*) from public.support_messages where internal and author_kind <> 'admin'
order by ok, controle;
