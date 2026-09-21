-- 027_down.sql — retour arrière de 20260921000100_admin_clients.
-- ATTENTION : supprime e-mail copié, 2e téléphone, date de naissance, statut de compte, motifs et permissions déléguées (sauvegarde JSON à faire avant : voir docs/ORGA-PROGRESS.md).
-- Les entrées « customer.* » du journal d'audit sont conservées. Les comptes déjà anonymisés le restent (le nom/prénom/téléphone effacés ne reviennent pas).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.admin_customers_export(uuid, text, text, text, boolean, boolean, boolean);
drop function if exists public.admin_customer_export(uuid, uuid);
drop function if exists public.admin_customer_anonymize(uuid, uuid, text);
drop function if exists public.admin_customer_log(uuid, uuid, text, jsonb);
drop function if exists public.admin_customer_revoke_sessions(uuid, uuid);
drop function if exists public.admin_customer_set_status(uuid, uuid, text, text);
drop function if exists public.admin_customer_update(uuid, uuid, text, text, text, text, text, date, text, timestamptz);
drop function if exists public.admin_customer_check_update(uuid, uuid, text, text, text, text, text, date, text, timestamptz);
drop function if exists public._customer_diff(uuid, uuid, text, text, text, text, text, date, text, timestamptz);
drop function if exists public.admin_customer_detail(uuid, uuid, boolean);
drop function if exists public.admin_list_customers(uuid, text, text, text, boolean, boolean, text, text, int, int);
drop function if exists public._customers_where(text, text, text, boolean, boolean);
drop function if exists public.admin_clients_access(uuid);
drop function if exists public.admin_account_set_permissions(uuid, uuid, text[]);
drop function if exists public._revoke_sessions(uuid);
drop function if exists public._assert_customer_target(uuid, text);
drop function if exists public._assert_clients(uuid, text);
drop trigger if exists on_auth_user_email_changed on auth.users;
drop function if exists public._sync_profile_email();
drop trigger if exists profiles_search_guard on public.profiles;
drop function if exists public._profile_search_guard();
-- admin_accounts_list : remettre la version 018 (sans « permissions ») en rejouant sa définition si besoin.
grant select on public.profiles to authenticated;
drop index if exists public.profiles_search_trgm, public.profiles_email_uniq, public.profiles_created_idx, public.profiles_lastname_idx, public.orders_user_status_idx;
alter table public.admin_accounts drop constraint if exists admin_accounts_permissions_valid;
alter table public.admin_accounts drop column if exists permissions;
alter table public.profiles drop column if exists email, drop column if exists phone2, drop column if exists birth_date, drop column if exists account_status,
  drop column if exists status_reason, drop column if exists anonymized_at, drop column if exists search_text;
-- handle_new_user : remettre la version 001 (sans e-mail) en rejouant sa définition.
drop function if exists public.phone_key(text);
drop function if exists public.norm_text(text);
