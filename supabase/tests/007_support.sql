-- =====================================================================
-- Test migration 007 — demandes de support : privées, purge à 12 mois. Transaction annulée (ROLLBACK).
-- =====================================================================
begin;

insert into public.support_tickets (name, email, subject, message, created_at) values
  ('Ancien',  'ancien@test.local',  'Vieux',   'msg', now() - interval '400 days'),
  ('Limite',  'limite@test.local',  'Limite',  'msg', now() - interval '364 days'),
  ('Recent',  'recent@test.local',  'Récent',  'msg', now() - interval '2 days');

do $$
declare n int; got text;
begin
  -- 1 : anon et authenticated ne voient ni n'écrivent rien
  set local role anon;
  begin perform 1 from public.support_tickets; got := 'lu'; exception when insufficient_privilege then got := null; end;
  if got is not null then raise exception 'FAIL 1a : anon lit support_tickets'; end if;
  begin insert into public.support_tickets (name,email,subject,message) values ('x','x@x.xx','x','x'); got := 'écrit'; exception when insufficient_privilege then got := null; end;
  if got is not null then raise exception 'FAIL 1b : anon écrit dans support_tickets'; end if;
  set local role authenticated;
  begin perform 1 from public.support_tickets; got := 'lu'; exception when insufficient_privilege then got := null; end;
  if got is not null then raise exception 'FAIL 1c : authenticated lit support_tickets'; end if;
  begin perform public.purge_support_tickets(365); got := 'purgé'; exception when insufficient_privilege then got := null; end;
  if got is not null then raise exception 'FAIL 1d : authenticated exécute la purge'; end if;
  reset role;
  raise notice 'OK 1 : support_tickets et la purge sont fermées à anon / authenticated';

  -- 2 : la purge refuse une durée trop courte
  begin perform public.purge_support_tickets(5); got := null; exception when others then got := sqlerrm; end;
  if got is distinct from 'PURGE_TOO_SHORT' then raise exception 'FAIL 2 : durée courte acceptée (%)', got; end if;
  raise notice 'OK 2 : purge < 30 jours refusée';

  -- 3 : la purge supprime uniquement ce qui a plus de 365 jours
  select public.purge_support_tickets(365) into n;
  if n <> 1 then raise exception 'FAIL 3a : % supprimées (attendu 1)', n; end if;
  select count(*) into n from public.support_tickets;
  if n <> 2 then raise exception 'FAIL 3b : % restantes (attendu 2)', n; end if;
  if exists (select 1 from public.support_tickets where name = 'Ancien') then raise exception 'FAIL 3c : l''ancienne demande est restée'; end if;
  raise notice 'OK 3 : seule la demande de plus de 12 mois est supprimée';

  -- 4 : contraintes
  begin insert into public.support_tickets (name,email,subject,message,status) values ('x','x@x.xx','x','x','autre'); got := null; exception when check_violation then got := 'refusé'; end;
  if got is null then raise exception 'FAIL 4 : statut invalide accepté'; end if;
  raise notice 'OK 4 : statut contrôlé';
end $$;

do $$ begin raise notice 'ALL OK — support_tickets validée'; end $$;
rollback;
