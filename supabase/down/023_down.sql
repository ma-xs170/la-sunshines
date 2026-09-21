-- 023_down.sql — retour arrière de 20260920002300_organizer_signup (supprime les dossiers d'inscription et la liste des pièces ; les fichiers du stockage privé restent à purger à la main).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.admin_org_document(uuid, uuid), public.admin_org_dossier(uuid, uuid), public.org_register(uuid, jsonb, jsonb);
drop table if exists public.organizer_documents, public.organizer_applications;
