-- 022_verify.sql — contrôle en LECTURE SEULE après la migration 022.
select 'RLS activée sur event_links' as controle, relrowsecurity as ok, 1 as valeur from pg_class where oid = 'public.event_links'::regclass
union all select 'aucun droit direct anon / authenticated', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name = 'event_links'
union all select 'les 6 éditions + le test sont rattachés', count(*) >= 7, count(*) from public.event_links where event_slug in ('la-nuit-des-ombres', 'welcome-to-dominica', 'candy-land', 'edition-picasso', 'la-xploz-tropical-island', 'before-christmas', 'test-billetterie')
union all select 'évènement de test marqué test', coalesce(bool_and(is_test), false), count(*) from public.event_links where event_slug = 'test-billetterie'
union all select 'aucune liaison orpheline', count(*) = 0, count(*) from public.event_links l left join public.organizers o on o.id = l.organizer_id where o.id is null
union all select 'compte promu : admin actif + OWNER de THE MOUV (ou compte absent)',
  not exists (select 1 from auth.users where lower(email) = 'mathxs.170@gmail.com')
  or exists (select 1 from auth.users u join public.profiles p on p.id = u.id and p.role = 'admin' join public.admin_accounts a on a.user_id = u.id and a.active and a.level = 'super'
               join public.organizer_members m on m.user_id = u.id and m.role = 'owner' join public.organizers o on o.id = m.organizer_id and o.is_default where lower(u.email) = 'mathxs.170@gmail.com'),
  (select count(*) from auth.users where lower(email) = 'mathxs.170@gmail.com')
order by ok, controle;
