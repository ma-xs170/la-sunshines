-- 016_verify.sql — contrôle en LECTURE SEULE après la migration 016.
select 'RLS activée sur promo_codes' as controle, relrowsecurity as ok, 1 as valeur from pg_class where oid = 'public.promo_codes'::regclass
union all select 'aucun droit direct anon / authenticated sur promo_codes', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name = 'promo_codes'
union all select 'fonctions 016 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('org_orders', 'org_order_detail', 'org_refunds', 'org_scan_history', 'org_invitations', 'org_create_invitation', 'org_promos', 'org_promo_save', 'promo_preview')
union all select 'codes promo actifs au pourcentage > 100', count(*) = 0, count(*) from public.promo_codes where kind = 'percent' and value > 100
order by ok, controle;
