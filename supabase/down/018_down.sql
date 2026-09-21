-- 018_down.sql — retour arrière de 20260920001800_admin_management (supprime les comptes admin secondaires, PAS les comptes Supabase Auth ni les évènements déjà transférés).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.admin_global_search(uuid, text, int), public.admin_transfer_event(uuid, text, text, text), public.admin_transfer_preview(uuid, text, text), public.admin_all_events(uuid, text),
  public.admin_update_organizer_contact(uuid, uuid, text, text, text, text, text, text), public.admin_organizer_detail(uuid, uuid), public.admin_login_result(text, boolean),
  public.admin_login_locked(text), public.admin_account_state(uuid), public.admin_password_changed(uuid), public.admin_mark_invitation(uuid, text, text),
  public.admin_account_activity(uuid, uuid, int), public.admin_account_reset(uuid, uuid), public.admin_account_set(uuid, uuid, boolean),
  public.admin_account_register(uuid, uuid, text, text, text, text), public.admin_accounts_list(uuid), public._assert_super(uuid);
drop table if exists public.admin_accounts;
