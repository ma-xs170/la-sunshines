-- =====================================================================
-- Tests migration 022 — rattachement des évènements, idempotence, promotion du seul compte visé. ROLLBACK.
-- =====================================================================
begin;
do $$ begin
  if (select count(*) from public.event_links where event_slug in ('la-nuit-des-ombres', 'welcome-to-dominica', 'candy-land', 'edition-picasso', 'la-xploz-tropical-island', 'before-christmas', 'test-billetterie')) <> 7 then raise exception 'FAIL : 7 évènements attendus'; end if;
end $$;
do $$ begin
  if not (select is_test from public.event_links where event_slug = 'test-billetterie') then raise exception 'FAIL : test-billetterie doit être marqué test'; end if;
  if exists (select 1 from public.event_links where event_slug <> 'test-billetterie' and is_test) then raise exception 'FAIL : seul l''évènement de test est marqué test'; end if;
  if (select count(distinct organizer_id) from public.event_links) <> 1 then raise exception 'FAIL : tout doit être rattaché à THE MOUV'; end if;
  if not exists (select 1 from public.event_links l join public.organizers o on o.id = l.organizer_id and o.is_default) then raise exception 'FAIL : organisation par défaut attendue'; end if;
end $$;
-- droits : ni anon ni authenticated
do $$ begin
  if has_table_privilege('anon', 'public.event_links', 'select') or has_table_privilege('authenticated', 'public.event_links', 'select') then raise exception 'FAIL : event_links ne doit pas être lisible directement'; end if;
end $$;
-- promotion : seul le compte visé change ; rejouer ne duplique rien (même bloc que la migration, exécuté deux fois)
insert into auth.users (id, email) values ('11000000-0000-0000-0000-000000000011', 'mathxs.170@gmail.com'), ('11000000-0000-0000-0000-000000000012', 'autre@test.local');
create function pg_temp.promote() returns void language plpgsql as $f$
declare uid uuid; org uuid;
begin
  select id into uid from auth.users where lower(email) = 'mathxs.170@gmail.com';
  select id into org from public.organizers where is_default order by created_at limit 1;
  if uid is null or org is null then return; end if;
  update public.profiles set role = 'admin' where id = uid and role <> 'admin';
  insert into public.admin_accounts (user_id, level, must_change_password, invitation_status) values (uid, 'super', false, 'sent') on conflict (user_id) do update set level = 'super', active = true;
  insert into public.organizer_members (organizer_id, user_id, role) values (org, uid, 'owner') on conflict (organizer_id, user_id) do update set role = 'owner';
end $f$;
select pg_temp.promote();
select pg_temp.promote();
do $$ begin
  if (select role from public.profiles where id = '11000000-0000-0000-0000-000000000011') <> 'admin' then raise exception 'FAIL : compte visé non promu'; end if;
  if (select role from public.profiles where id = '11000000-0000-0000-0000-000000000012') = 'admin' then raise exception 'FAIL : un autre compte a été promu'; end if;
  if (select count(*) from public.organizer_members where user_id = '11000000-0000-0000-0000-000000000011' and role = 'owner') <> 1 then raise exception 'FAIL : membre OWNER attendu, une seule fois'; end if;
  if exists (select 1 from public.organizer_members where user_id = '11000000-0000-0000-0000-000000000012') then raise exception 'FAIL : autre compte rattaché'; end if;
  if (select count(*) from public.admin_accounts where user_id = '11000000-0000-0000-0000-000000000011' and level = 'super') <> 1 then raise exception 'FAIL : super-admin attendu'; end if;
  if (select admin_reference from public.profiles where id = '11000000-0000-0000-0000-000000000011') is null then raise exception 'FAIL : référence ADM attendue'; end if;
end $$;
rollback;
