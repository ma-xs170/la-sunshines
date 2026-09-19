-- 004_down.sql — retour arrière de 20260920000400_order_email (supprime les 2 fonctions d'email).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('claim_email_send', 'mark_email_result')
  loop execute format('drop function if exists %s cascade', f.sig); end loop;
end $$;
