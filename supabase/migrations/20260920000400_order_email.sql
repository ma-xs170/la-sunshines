-- =====================================================================
-- Phase 4 — Suivi de l'email de commande (pending / sent / failed).
--
-- Les colonnes existent depuis la migration 002 (orders.email_status,
-- email_attempts, email_last_error, email_last_attempt_at, email_sent_at).
-- Ces deux fonctions les pilotent :
--  * claim_email_send  : « je m'occupe d'envoyer » — atomique, évite les doubles envois
--                        (rejeux du webhook, clics multiples de l'admin) ;
--  * mark_email_result : appelée APRÈS la réponse de Resend (jamais avant).
-- Un échec d'envoi ne fait JAMAIS échouer le webhook ; l'admin peut renvoyer l'email ;
-- le billet reste téléchargeable dans « Mes billets » quoi qu'il arrive.
-- =====================================================================

-- p_force = renvoi demandé par un admin (ignore le statut « sent » et le délai anti-doublon).
create function public.claim_email_send(p_order uuid, p_force boolean default false) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update public.orders
     set email_attempts = email_attempts + 1,
         email_last_attempt_at = now()
   where id = p_order
     and status in ('paid', 'partially_refunded', 'refunded', 'cancelled')
     and (
       p_force
       or (email_status <> 'sent'
           and (email_last_attempt_at is null or email_last_attempt_at < now() - interval '2 minutes'))
     );
  return found;
end $$;

create function public.mark_email_result(p_order uuid, p_ok boolean, p_error text default null) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.orders
     set email_status     = case when p_ok then 'sent' else 'failed' end,
         email_sent_at    = case when p_ok then now() else email_sent_at end,
         email_last_error = case when p_ok then null else left(coalesce(p_error, 'erreur inconnue'), 300) end
   where id = p_order
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('claim_email_send', 'mark_email_result')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
