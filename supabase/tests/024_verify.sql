-- 024_verify.sql — contrôle en LECTURE SEULE après la migration 024.
select 'colonnes ajoutées' as controle, count(*) = 3 as ok, count(*) as valeur from information_schema.columns where table_schema = 'public' and ((table_name = 'ticketed_events' and column_name in ('ticketing_mode', 'bizouk_event_id')) or (table_name = 'event_details' and column_name = 'title'))
union all select 'évènements existants inchangés (mode internal)', count(*) = 0, count(*) from public.ticketed_events where ticketing_mode <> 'internal'
union all select 'fonctions 024 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_create_event', 'org_set_ticketing')
order by ok, controle;
