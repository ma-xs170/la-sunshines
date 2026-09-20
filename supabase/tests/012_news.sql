-- =====================================================================
-- Tests migration 012 — actualités : RLS, lu / non lu par utilisateur, écriture réservée aux admins, contenu sans HTML. ROLLBACK.
-- =====================================================================
begin;

create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true); end $$;

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin@test.local'),
  ('01000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('01000000-0000-0000-0000-000000000003', 'staff@test.local'),
  ('c1000000-0000-0000-0000-000000000001', 'cust@test.local');
update public.profiles set role = 'admin' where id = 'ad000000-0000-0000-0000-0000000000ad';
insert into public.organizer_members (organizer_id, user_id, role) values
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.organizers where is_default), '01000000-0000-0000-0000-000000000003', 'staff');

do $$
declare
  adm constant uuid := 'ad000000-0000-0000-0000-0000000000ad'; ow constant uuid := '01000000-0000-0000-0000-000000000001';
  st constant uuid := '01000000-0000-0000-0000-000000000003'; cust constant uuid := 'c1000000-0000-0000-0000-000000000001';
  p1 uuid; p2 uuid; p3 uuid; j jsonb; n int;
begin
  -- 1 : seuls les admins écrivent ; le contenu est nettoyé
  perform pg_temp.expect('FORBIDDEN', format('select public.news_admin_save(%L, null, ''T'', ''nouveaute'', ''C'', null, ''published'', false)', ow));
  perform pg_temp.expect('FORBIDDEN', format('select public.news_admin_save(%L, null, ''T'', ''nouveaute'', ''C'', null, ''published'', false)', st));
  perform pg_temp.expect('FORBIDDEN', format('select public.news_admin_list(%L)', ow));
  p1 := public.news_admin_save(adm, null, 'Nouvelle <b>page</b> Analyse', 'nouveaute', E'Ligne 1\nLigne 2 <script>alert(1)</script>', null, 'published', false);
  if (select title || '|' || body from public.news_posts where id = p1) <> E'Nouvelle b page /b Analyse|Ligne 1\nLigne 2 scriptalert(1)/script' then
    raise exception 'FAIL 1a : contenu non nettoyé (%)', (select title || '|' || body from public.news_posts where id = p1); end if;
  perform pg_temp.expect('BAD_STATUS', format('select public.news_admin_save(%L, null, ''T'', ''nouveaute'', ''C'', null, ''archive'', false)', adm));
  perform pg_temp.expect('EMPTY_POST', format('select public.news_admin_save(%L, null, ''  '', ''nouveaute'', ''C'', null, ''draft'', false)', adm));
  perform pg_temp.expect('new row for relation "news_posts" violates check constraint "news_posts_category_check"', format('select public.news_admin_save(%L, null, ''T'', ''promo'', ''C'', null, ''draft'', false)', adm));
  perform pg_temp.expect('new row for relation "news_posts" violates check constraint "news_posts_image_url_check"', format('select public.news_admin_save(%L, null, ''T'', ''nouveaute'', ''C'', ''javascript:alert(1)'', ''draft'', false)', adm));
  perform pg_temp.expect('new row for relation "news_posts" violates check constraint "news_posts_image_url_check"', format('select public.news_admin_save(%L, null, ''T'', ''nouveaute'', ''C'', ''http://x.io/a.png'', ''draft'', false)', adm));
  raise notice 'OK 1 : écriture réservée aux admins, contenu nettoyé, catégorie / statut / image validés';

  -- 2 : brouillons invisibles aux organisateurs ; publications lisibles par tout membre (staff compris), pas par un client
  p2 := public.news_admin_save(adm, null, 'Brouillon', 'important', 'Pas encore', 'https://cdn.example/x.png', 'draft', true);
  p3 := public.news_admin_save(adm, null, 'Maintenance samedi', 'maintenance', 'Le site sera coupé 10 minutes.', null, 'published', true);
  j := public.news_list(ow);  if jsonb_array_length(j) <> 2 then raise exception 'FAIL 2a : % publications', jsonb_array_length(j); end if;
  j := public.news_list(st);  if jsonb_array_length(j) <> 2 then raise exception 'FAIL 2b : le staff doit lire'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.news_list(%L)', cust));
  perform pg_temp.expect('FORBIDDEN', format('select public.news_list(null)'));
  raise notice 'OK 2 : brouillons masqués, lecture par les membres seulement';

  -- 3 : RLS navigateur
  perform pg_temp.as_user(ow); set local role authenticated;
  select count(*) into n from public.news_posts;   if n <> 2 then raise exception 'FAIL 3a : owner voit % publications', n; end if;
  begin insert into public.news_posts (title, body) values ('Piraté', 'x'); n := -1; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then raise exception 'FAIL 3b : un organisateur écrit une actualité'; end if;
  update public.news_posts set title = 'Piraté' where id = p1;
  get diagnostics n = row_count;  if n <> 0 then raise exception 'FAIL 3c : un organisateur modifie une actualité'; end if;
  delete from public.news_posts where id = p1;
  get diagnostics n = row_count;  if n <> 0 then raise exception 'FAIL 3d : un organisateur supprime une actualité'; end if;
  reset role;
  perform pg_temp.as_user(cust); set local role authenticated;
  select count(*) into n from public.news_posts;   if n <> 0 then raise exception 'FAIL 3e : un client lit les actualités'; end if;
  reset role;
  perform pg_temp.as_user(adm); set local role authenticated;
  select count(*) into n from public.news_posts;   if n <> 3 then raise exception 'FAIL 3f : l''admin voit % (attendu 3, brouillon compris)', n; end if;
  reset role;
  set local role anon;
  begin perform 1 from public.news_posts; n := -1; exception when insufficient_privilege then n := 0; end;
  if n <> 0 then raise exception 'FAIL 3g : anon lit les actualités'; end if;
  reset role;
  raise notice 'OK 3 : RLS (lecture membres + admins, écriture admins seuls)';

  -- 4 : lu / non lu PAR utilisateur
  if public.news_unread_count(ow) <> 2 or public.news_unread_count(st) <> 2 or public.news_unread_count(cust) <> 0 then raise exception 'FAIL 4a : compteurs initiaux'; end if;
  if public.news_mark_read(ow, p1) <> 1 then raise exception 'FAIL 4b'; end if;
  if public.news_mark_read(ow, p1) <> 0 then raise exception 'FAIL 4c : marquer deux fois ne doit rien changer'; end if;
  if public.news_unread_count(ow) <> 1 or public.news_unread_count(st) <> 2 then raise exception 'FAIL 4d : l''état lu doit être propre à chaque utilisateur'; end if;
  perform pg_temp.expect('FORBIDDEN', format('select public.news_mark_read(%L, %L)', cust, p1));
  if public.news_mark_read(ow, p2) <> 0 then raise exception 'FAIL 4e : un brouillon ne se marque pas comme lu'; end if;
  n := public.news_mark_read(st);
  if n <> 2 or public.news_unread_count(st) <> 0 then raise exception 'FAIL 4f : tout marquer comme lu (%)', n; end if;
  j := public.news_list(ow);  if (select count(*) from jsonb_array_elements(j) e where (e ->> 'read')::boolean) <> 1 then raise exception 'FAIL 4g : drapeau lu'; end if;
  raise notice 'OK 4 : lu / non lu par utilisateur, tout marquer comme lu';

  -- 5 : publication d'un brouillon, dépublication, suppression ; audit
  perform public.news_admin_save(adm, p2, 'Brouillon devenu public', 'important', 'Maintenant public', null, 'published', true);
  if public.news_unread_count(ow) <> 2 then raise exception 'FAIL 5a : la nouvelle publication doit compter comme non lue'; end if;
  if (select published_at is null from public.news_posts where id = p2) then raise exception 'FAIL 5b : date de publication'; end if;
  perform public.news_admin_save(adm, p2, 'Brouillon devenu public', 'important', 'Maintenant public', null, 'draft', true);
  if public.news_unread_count(ow) <> 1 then raise exception 'FAIL 5c : dépublication'; end if;
  perform public.news_admin_delete(adm, p3);
  perform pg_temp.expect('POST_NOT_FOUND', format('select public.news_admin_delete(%L, %L)', adm, p3));
  perform pg_temp.expect('FORBIDDEN', format('select public.news_admin_delete(%L, %L)', ow, p1));
  select count(*) into n from public.audit_log where entity = 'news_post';  if n <> 6 then raise exception 'FAIL 5d : audit (%)', n; end if;
  raise notice 'OK 5 : publication, dépublication, suppression journalisées';
end $$;
rollback;
