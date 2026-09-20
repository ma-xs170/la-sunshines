-- 008_down.sql — retour arrière de 20260920000800_artist_private_data (SUPPRIME emails d'artistes, abonnés, jetons, demandes).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobname) from cron.job where jobname = 'purge-artist-login-tokens';
  end if;
end $$;
drop function if exists public.purge_artist_login_tokens();
drop table if exists public.artist_verifications, public.artist_login_tokens, public.artist_notifications, public.artist_subscriptions, public.artist_emails;
