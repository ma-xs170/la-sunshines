-- 021_verify.sql — contrôle en LECTURE SEULE après la migration 021 (billets gratuits).
select 'colonne max_per_account' as controle, count(*) = 1 as ok, count(*) as valeur from information_schema.columns where table_schema = 'public' and table_name = 'ticket_tiers' and column_name = 'max_per_account'
union all select 'contrainte de prix : 0 ou ≥ 0,50 €', count(*) = 1, count(*) from pg_constraint where conrelid = 'public.ticket_tiers'::regclass and conname = 'ticket_tiers_price_cents_check' and pg_get_constraintdef(oid) ilike '%>= 50%'
union all select 'reserve_free_order existe', count(*) = 1, count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'reserve_free_order'
union all select 'fonctions 021 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('reserve_tickets', 'reserve_free_order', 'admin_save_tier', 'org_save_tier', 'org_tiers', 'org_finance')
union all select 'une seule signature par fonction remplacée', bool_and(n = 1), count(*) from (select count(*) n from pg_proc where pronamespace = 'public'::regnamespace and proname in ('reserve_tickets', 'admin_save_tier', 'org_save_tier', 'org_tiers', 'org_finance') group by proname) x
order by ok, controle;
