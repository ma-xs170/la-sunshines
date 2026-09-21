-- =====================================================================
-- 014_verify.sql — contrôle en LECTURE SEULE après application de la migration 014 (SQL Editor Supabase).
-- Toute ligne avec ok = false est un problème.
-- =====================================================================
select 'organisations sans référence alors qu''approuvées' as controle,
       count(*) = 0 as ok, count(*) as valeur from public.organizers where account_status = 'approved' and reference is null
union all
select 'références ORG en double', count(*) = 0, count(*) from (select reference from public.organizers where reference is not null group by 1 having count(*) > 1) d
union all
select 'admins sans référence ADM', count(*) = 0, count(*) from public.profiles where role = 'admin' and admin_reference is null
union all
select 'triggers d''immuabilité présents', count(*) = 2, count(*) from pg_trigger where tgname in ('organizers_ref_guard', 'profiles_ref_guard')
union all
select 'RLS activée sur organizers et profiles', bool_and(c.relrowsecurity), count(*) from pg_class c where c.oid in ('public.organizers'::regclass, 'public.profiles'::regclass)
union all
select 'fonctions 014 non exécutables par anon / authenticated',
       not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('_new_reference', 'admin_find_organizers', 'admin_set_organizer_status', 'org_list')
order by ok, controle;
