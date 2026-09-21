-- 027_verify.sql — contrôle en LECTURE SEULE après la migration 027 (à coller dans le SQL Editor).
select 'colonnes profiles ajoutées' as controle, count(*) = 7 as ok, count(*) as valeur from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('email', 'phone2', 'birth_date', 'account_status', 'status_reason', 'anonymized_at', 'search_text')
union all select 'admin_accounts.permissions', count(*) = 1, count(*) from information_schema.columns where table_schema = 'public' and table_name = 'admin_accounts' and column_name = 'permissions'
union all select 'aucun admin délégué par défaut', count(*) = 0, count(*) from public.admin_accounts where level <> 'super' and cardinality(permissions) > 0
union all select 'e-mail profil = e-mail auth (hors anonymisés)', count(*) = 0, count(*) from public.profiles p join auth.users u on u.id = p.id where p.account_status <> 'anonymized' and p.email <> left(coalesce(u.email, ''), 254)
union all select 'search_text renseigné', count(*) = 0, count(*) from public.profiles where search_text = ''
union all select 'index de recherche trigramme', count(*) = 1, count(*) from pg_indexes where schemaname = 'public' and indexname = 'profiles_search_trgm'
union all select 'colonnes sensibles non lisibles par authenticated', not bool_or(has_column_privilege('authenticated', 'public.profiles', c, 'select')), count(*) from unnest(array['email', 'phone2', 'birth_date', 'status_reason', 'search_text']) c
union all select 'fonctions 027 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'admin\_customer%' or p.proname in ('admin_list_customers', 'admin_customers_export', 'admin_clients_access', 'admin_account_set_permissions', '_assert_clients', '_customers_where', '_customer_diff'))
union all select 'aucun profil sans ligne auth (intégrité)', count(*) = 0, count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)
order by ok, controle;
