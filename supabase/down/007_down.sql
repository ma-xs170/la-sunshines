-- 007_down.sql — retour arrière de 20260920000700_support_tickets (SUPPRIME les demandes de support enregistrées).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobname) from cron.job where jobname = 'purge-support-tickets';
  end if;
end $$;
drop function if exists public.purge_support_tickets(int);
drop table if exists public.support_tickets;
