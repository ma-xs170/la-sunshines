-- 023_verify.sql — contrôle en LECTURE SEULE après la migration 023.
select 'RLS activée' as controle, bool_and(relrowsecurity) as ok, count(*) as valeur from pg_class where oid in ('public.organizer_applications'::regclass, 'public.organizer_documents'::regclass)
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('organizer_applications', 'organizer_documents')
union all select 'fonctions 023 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_register', 'admin_org_dossier', 'admin_org_document')
order by ok, controle;
