-- Retour arrière de la migration 031.
drop function if exists public.admin_cancel_order(uuid, uuid, text);
drop function if exists public.admin_rename_participant(uuid, uuid, text, text, text);
drop function if exists public.admin_set_event_status(uuid, text, text, text);
-- admin_global_search : reprendre la définition de la migration 018 (avant l'ajout du code de billet / prénom acheteur) avant de continuer.
