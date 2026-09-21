-- 026_verify.sql — contrôle en LECTURE SEULE après la migration 026.
select 'RLS activée sur publication_requests' as controle, relrowsecurity as ok, 1 as valeur from pg_class where oid = 'public.publication_requests'::regclass
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name = 'publication_requests'
union all select 'fonctions 026 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_set_flyer', '_publication_checklist', 'org_publication_state', 'org_request_publication', 'org_cancel_publication', 'admin_publications', 'admin_review_publication', 'public_db_event')
union all select 'colonne flyer_url', count(*) = 1, count(*) from information_schema.columns where table_schema = 'public' and table_name = 'event_details' and column_name = 'flyer_url'
order by ok, controle;
