-- 022_down.sql — retour arrière de 20260920002200_event_links : supprime la table de liaison (les évènements et leur contenu ne sont pas touchés).
-- Le statut admin et l'appartenance à THE MOUV du compte promu ne sont PAS retirés ici (à faire à la main : /admin/gestion/administrateurs).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop table if exists public.event_links;
