-- 014_down.sql — retour arrière de 20260920001400_org_references (supprime les références ORG / ADM et le statut de compte).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop trigger if exists organizers_ref_guard on public.organizers;
drop trigger if exists profiles_ref_guard on public.profiles;
drop function if exists public.admin_set_organizer_status(uuid, uuid, text), public.admin_find_organizers(uuid, text, text, int),
  public._organizer_ref_guard(), public._profile_ref_guard(), public._new_reference(text, text);
drop index if exists public.organizers_reference_uniq, public.profiles_admin_reference_uniq;
alter table public.organizers drop constraint if exists organizers_account_status_check, drop constraint if exists organizers_reference_format,
  drop column if exists reference, drop column if exists account_status, drop column if exists approved_at, drop column if exists approved_by;
alter table public.profiles drop constraint if exists profiles_admin_reference_format, drop column if exists admin_reference;
-- org_list : recharger la version de la migration 010 (sans reference / account_status).
