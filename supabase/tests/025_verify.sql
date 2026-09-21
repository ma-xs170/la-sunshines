-- 025_verify.sql — contrôle en LECTURE SEULE après la migration 025.
select 'colonnes ajoutées à orders' as controle, count(*) = 2 as ok, count(*) as valeur from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('promo_code_id', 'discount_cents')
union all select 'apply_promo non exécutable par anon / authenticated', not (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'apply_promo'
union all select 'commandes existantes sans remise', count(*) = 0, count(*) from public.orders where discount_cents <> 0 or promo_code_id is not null
order by ok, controle;
