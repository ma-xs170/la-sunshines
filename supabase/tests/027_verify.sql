-- 027_verify.sql — contrôle en LECTURE SEULE après la migration 027.
select 'RLS activée sur cancellation_templates' as controle, relrowsecurity as ok, 1 as valeur from pg_class where oid = 'public.cancellation_templates'::regclass
union all select 'RLS activée sur event_cancellations', relrowsecurity, 1 from pg_class where oid = 'public.event_cancellations'::regclass
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('cancellation_templates', 'event_cancellations')
union all select 'fonctions 027 non exécutables par anon / authenticated', not bool_or(has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')), count(*)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('_effective_templates', '_cancellation_refundable', 'org_cancel_context', 'org_cancel_event',
       'org_cancellation_state', 'org_cancellation_requeue', 'org_save_cancellation_template', 'org_reset_cancellation_template', 'admin_cancellation_templates', 'admin_save_cancellation_template')
union all select 'un modèle par défaut par raison (4)', count(*) = 4, count(*) from public.cancellation_templates where organizer_id is null
union all select 'refunds.source accepte event_cancelled', exists (
    select 1 from pg_constraint where conrelid = 'public.refunds'::regclass and conname = 'refunds_source_check' and pg_get_constraintdef(oid) like '%event_cancelled%'), 1
order by ok, controle;
