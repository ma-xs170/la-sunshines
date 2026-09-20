-- 011_down.sql — retour arrière de 20260920001100_organizer_tiers_scan.
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.org_event_brief(uuid, text), public.org_tiers(uuid, text), public.org_remove_tier(uuid, text, uuid),
  public.org_save_tier(uuid, text, uuid, text, text, int, int, int, timestamptz, timestamptz, boolean, int);
-- scan_ticket reprend sa définition de 20260920000500_scan_admin.sql (rôle profil staff/admin uniquement) : rejouer ce bloc, puis :
drop function if exists public.scan_access(uuid, uuid);
