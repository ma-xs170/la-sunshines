-- Tests phase 4 — suivi du statut d'email. Transaction annulée (ROLLBACK).
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'u1@test.local');
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values
  ('e4000000-0000-0000-0000-000000000001', 'evt-mail', now() + interval '30 days', 10, true, 'published');
insert into public.orders (id, user_id, ticketed_event_id, event_slug, status, buyer_email, subtotal_cents, total_cents, paid_at) values
  ('04000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'evt-mail', 'paid', 'u1@test.local', 1000, 1000, now()),
  ('04000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'e4000000-0000-0000-0000-000000000001', 'evt-mail', 'expired', 'u1@test.local', 1000, 1000, null);

do $$
declare o constant uuid := '04000000-0000-0000-0000-000000000001'; ord record; ok boolean;
begin
  select * into ord from public.orders where id = o;
  if ord.email_status <> 'pending' or ord.email_attempts <> 0 then raise exception 'FAIL 1 : état initial (% / %)', ord.email_status, ord.email_attempts; end if;

  -- 1re demande : accordée, compte une tentative ; la 2e (rejeu simultané) est refusée
  if not public.claim_email_send(o) then raise exception 'FAIL 2 : première tentative refusée'; end if;
  if public.claim_email_send(o) then raise exception 'FAIL 2b : 2e tentative immédiate acceptée (double envoi possible)'; end if;
  select * into ord from public.orders where id = o;
  if ord.email_attempts <> 1 then raise exception 'FAIL 2c : tentatives = %', ord.email_attempts; end if;

  -- échec : statut failed + dernière erreur, tentative comptée
  perform public.mark_email_result(o, false, 'The domain is not verified');
  select * into ord from public.orders where id = o;
  if ord.email_status <> 'failed' or ord.email_last_error <> 'The domain is not verified' or ord.email_sent_at is not null
  then raise exception 'FAIL 3 : échec mal enregistré (% / %)', ord.email_status, ord.email_last_error; end if;

  -- le délai anti-doublon (2 min) protège ; l'admin peut forcer le renvoi
  if public.claim_email_send(o) then raise exception 'FAIL 4 : nouvelle tentative avant 2 min sans force'; end if;
  update public.orders set email_last_attempt_at = now() - interval '3 minutes' where id = o;
  if not public.claim_email_send(o) then raise exception 'FAIL 4b : nouvelle tentative après 2 min refusée'; end if;
  if not public.claim_email_send(o, true) then raise exception 'FAIL 4c : renvoi forcé refusé'; end if;

  -- succès : sent, horodaté, erreur effacée
  perform public.mark_email_result(o, true);
  select * into ord from public.orders where id = o;
  if ord.email_status <> 'sent' or ord.email_sent_at is null or ord.email_last_error is not null or ord.email_attempts <> 3
  then raise exception 'FAIL 5 : succès mal enregistré (% / % / % tentatives)', ord.email_status, ord.email_last_error, ord.email_attempts; end if;

  -- déjà envoyé : plus aucune tentative automatique, mais l'admin peut renvoyer
  update public.orders set email_last_attempt_at = now() - interval '1 hour' where id = o;
  if public.claim_email_send(o) then raise exception 'FAIL 6 : renvoi automatique d''un email déjà envoyé'; end if;
  if not public.claim_email_send(o, true) then raise exception 'FAIL 6b : renvoi admin refusé'; end if;

  -- une commande non payée n'envoie rien
  if public.claim_email_send('04000000-0000-0000-0000-000000000002', true) then raise exception 'FAIL 7 : email pour une commande non payée'; end if;
  if public.claim_email_send(gen_random_uuid(), true) then raise exception 'FAIL 7b : commande inconnue'; end if;

  -- la valeur du statut est contrainte
  begin update public.orders set email_status = 'maybe' where id = o; raise exception 'FAIL 8 : statut invalide accepté';
  exception when check_violation then null; end;
  raise notice 'OK 1-8 : statut d''email pending/sent/failed, tentatives, dernière erreur, anti-doublon, renvoi admin';
end $$;

do $$ begin raise notice 'ALL OK — phase 4 (email) validée'; end $$;
rollback;
