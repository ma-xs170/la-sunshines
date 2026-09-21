-- 020_verify.sql — contrôle en LECTURE SEULE après la migration 020.
select 'RLS activée sur organizer_pages et organizer_follows' as controle, bool_and(relrowsecurity) as ok, count(*) as valeur from pg_class where oid in ('public.organizer_pages'::regclass, 'public.organizer_follows'::regclass)
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('organizer_pages', 'organizer_follows')
union all select 'chaque organisation approuvée a sa page', count(*) = 0, count(*) from public.organizers o where o.account_status = 'approved' and not exists (select 1 from public.organizer_pages p where p.organizer_id = o.id)
union all select 'fonctions 020 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_page_get', 'org_page_save', 'public_organizer_page', 'public_event_organizer', 'follow_organizer', 'unfollow_organizer', 'follow_state', 'unsubscribe_by_token', 'calendar_events', '_event_is_public', '_ensure_organizer_page')
order by ok, controle;
