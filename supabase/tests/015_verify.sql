-- 015_verify.sql — contrôle en LECTURE SEULE après la migration 015. Toute ligne avec ok = false est un problème.
select 'RLS activée sur les 5 nouvelles tables' as controle, bool_and(c.relrowsecurity) as ok, count(*) as valeur
  from pg_class c where c.oid in ('public.event_details'::regclass, 'public.event_venues'::regclass, 'public.event_sessions'::regclass, 'public.event_media'::regclass, 'public.order_consents'::regclass)
union all
select 'aucun droit direct anon / authenticated sur ces tables', count(*) = 0, count(*)
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
   and table_name in ('event_details', 'event_venues', 'event_sessions', 'event_media', 'order_consents')
union all
select 'fonctions 015 non exécutables par anon / authenticated',
       not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('org_event_details', 'org_event_details_save', 'org_venue_save', 'org_session_save', 'org_session_delete', 'org_media_register', 'media_set_status', 'public_event_details')
union all
select 'aucune vidéo « prête » sans lien', count(*) = 0, count(*) from public.event_media where status = 'ready' and hevc_url is null and h264_url is null
order by ok, controle;
