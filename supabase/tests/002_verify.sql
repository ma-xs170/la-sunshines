-- =====================================================================
-- 002_verify.sql — contrôle de sécurité de la base (LECTURE SEULE)
--
-- À exécuter dans le SQL Editor Supabase APRÈS l'application des migrations
-- (et à relancer après chaque nouvelle migration). Aucune donnée n'est
-- modifiée. Le résultat est un tableau : toute ligne avec ok = false est un
-- problème ; les lignes en échec s'affichent EN PREMIER.
--
-- Contrôles :
--  1. RLS activée sur TOUTES les tables du schéma public
--  2. reserve_tickets / fulfill_order / scan_ticket existent et ne sont exécutables ni
--     par PUBLIC, ni par anon, ni par authenticated ; idem pour TOUTE fonction du schéma
--     public hors liste blanche (get_availability, is_admin, is_staff)
--  3. un client ne peut pas passer son propre rôle à admin (droit de colonne + aucun
--     droit d'écriture direct sur les tables de billetterie)
--  4. toutes les vues sont en security_invoker
--  5. toutes les fonctions SECURITY DEFINER ont un search_path fixé
-- =====================================================================
with
-- fonctions "publiques" volontairement exécutables par anon/authenticated
allowlist(fname) as (values ('get_availability'), ('is_admin'), ('is_staff')),

funcs as (
  select p.oid, p.proname, p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig,
         p.prorettype = 'trigger'::regtype as is_trigger,
         coalesce(p.proacl, acldefault('f', p.proowner)) as acl
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')  -- hors extensions
),
tables as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
),

checks as (
  -- 1. RLS -----------------------------------------------------------
  select '1. RLS activée : ' || relname as name, relrowsecurity as ok,
         case when relrowsecurity then '' else 'ROW LEVEL SECURITY désactivée' end as detail
  from tables

  union all
  -- 2. fonctions sensibles présentes ---------------------------------
  select '2. fonction présente : ' || n, exists (select 1 from funcs where proname = n),
         'absente : applique toutes les migrations avant de lancer ce contrôle'
  from (values ('reserve_tickets'), ('fulfill_order'), ('scan_ticket')) v(n)

  union all
  -- 2. aucune fonction hors liste blanche n'est exécutable par PUBLIC / anon / authenticated
  select '2. EXECUTE refusé à PUBLIC/anon/authenticated : ' || f.sig,
         not (
           has_function_privilege('anon', f.oid, 'EXECUTE')
           or has_function_privilege('authenticated', f.oid, 'EXECUTE')
           or exists (select 1 from aclexplode(f.acl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         ),
         'EXECUTE encore accordé (REVOKE manquant)'
  from funcs f
  where not f.is_trigger and f.proname not in (select fname from allowlist)

  union all
  -- 2. les 3 fonctions sensibles sont bien exécutables par service_role
  select '2. service_role peut exécuter : ' || f.sig, has_function_privilege('service_role', f.oid, 'EXECUTE'), ''
  from funcs f where f.proname in ('reserve_tickets', 'fulfill_order', 'scan_ticket')

  union all
  -- 3. un client ne peut pas se promouvoir -----------------------------
  select '3. authenticated ne peut PAS modifier profiles.role',
         not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
           and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
         'droit UPDATE sur la colonne role accordé'
  union all
  select '3. anon ne peut PAS modifier profiles.role',
         not has_any_column_privilege('anon', 'public.profiles', 'UPDATE'), ''
  union all
  select '3. authenticated ne peut modifier que prénom / nom / téléphone',
         (select coalesce(array_agg(a.attname order by a.attname), '{}') from pg_attribute a
           where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
             and has_column_privilege('authenticated', 'public.profiles', a.attname, 'UPDATE'))
         = array['first_name', 'last_name', 'phone']::name[],
         'colonnes modifiables inattendues'
  union all
  select '3. aucune écriture directe (insert/update/delete/truncate) : ' || t.relname || ' → ' || r.role,
         not (has_table_privilege(r.role, t.oid, 'INSERT') or has_table_privilege(r.role, t.oid, 'UPDATE')
              or has_table_privilege(r.role, t.oid, 'DELETE') or has_table_privilege(r.role, t.oid, 'TRUNCATE')),
         'droit d''écriture accordé'
  from tables t cross join (values ('anon'), ('authenticated')) r(role)

  union all
  -- 4. vues security_invoker -----------------------------------------
  select '4. vue en security_invoker : ' || c.relname,
         coalesce(c.reloptions @> array['security_invoker=true'], false),
         'vue sans security_invoker : elle contourne la RLS du propriétaire'
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')

  union all
  -- 5. SECURITY DEFINER => search_path fixé ----------------------------
  select '5. search_path fixé : ' || f.sig,
         f.proconfig is not null and exists (select 1 from unnest(f.proconfig) c where c like 'search_path=%'),
         'SECURITY DEFINER sans search_path (risque de détournement)'
  from funcs f where f.prosecdef

  union all
  -- garde-fou : le résumé ne doit jamais être vide
  select '0. le contrôle a bien analysé des tables et des fonctions',
         (select count(*) from tables) > 0 and (select count(*) from funcs) > 0, ''
)
select case when ok then 'OK' else 'ÉCHEC' end as resultat, name, detail
from checks
order by ok, name;
