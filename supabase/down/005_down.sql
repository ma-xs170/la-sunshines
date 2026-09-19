-- 005_down.sql — retour arrière de 20260920000500_scan_admin (supprime scan, invitations, stats).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('scan_ticket','scan_stats','admin_cancel_ticket','admin_create_invitation','admin_event_stats')
  loop execute format('drop function if exists %s cascade', f.sig); end loop;
end $$;
