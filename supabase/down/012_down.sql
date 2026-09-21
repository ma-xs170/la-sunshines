-- 012_down.sql — retour arrière de 20260920001200_news (supprime les actualités et l'état lu / non lu).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop table if exists public.news_reads, public.news_posts cascade;
drop function if exists public.news_admin_delete(uuid, uuid), public.news_admin_save(uuid, uuid, text, text, text, text, text, boolean),
  public.news_admin_list(uuid), public.news_mark_read(uuid, uuid), public.news_unread_count(uuid), public.news_list(uuid),
  public._news_reader(uuid), public.is_org_member();
