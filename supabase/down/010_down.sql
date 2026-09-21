-- 010_down.sql — retour arrière de 20260920001000_organizer_ui.
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.org_archive_event(uuid, text, boolean), public.org_update_organizer(uuid, uuid, text, text, text, text, text, text), public.org_list(uuid);
alter table public.ticketed_events drop column if exists organizer_archived_at;
alter table public.organizers drop column if exists stripe_ready, drop column if exists stripe_account_id;
alter table public.organizer_members drop constraint organizer_members_role_check;
update public.organizer_members set role = 'viewer' where role = 'staff';
alter table public.organizer_members add constraint organizer_members_role_check check (role in ('owner', 'manager', 'viewer')), alter column role set default 'viewer';
-- Les fonctions _org_access, is_org_member_of_event, org_events et la policy organizers_member_read
-- reprennent leur définition de 20260920000900_organizers.sql (rejouer ces blocs).
