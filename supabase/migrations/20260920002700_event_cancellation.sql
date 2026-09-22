-- =====================================================================
-- Migration 027 — annulation d'un évènement publié, avec raison obligatoire et message d'excuse aux participants
--
--  * cancellation_templates : modèles d'e-mail d'excuse ÉDITABLES en base (un par raison). organizer_id null = modèle par défaut du site
--    (édité par un admin) ; organizer_id renseigné = version propre à une organisation (prioritaire). Variables : {evenement} {date} {lieu} {organisateur}.
--  * event_cancellations : une annulation par évènement (mode « annuler » ou « remplacer », raison, message, avancement).
--  * org_cancel_context : ce que l'écran affiche avant d'annuler (impact, évènements de remplacement, modèles effectifs).
--  * org_cancel_event : annulation ATOMIQUE — évènement « cancelled », ventes coupées, billets annulés, commandes en attente annulées,
--    raison écrite dans audit_log (visible par l'admin), message + destinataires figés. Le remboursement Stripe et l'envoi se font ensuite côté serveur.
--  * org_cancellation_state / org_cancellation_requeue : suivi et reprise (remboursements restants, e-mails en échec).
--  * admin_cancellation_templates / admin_save_cancellation_template, org_save_cancellation_template / org_reset_cancellation_template.
--  * refunds.source accepte « event_cancelled ».
-- Additive. La raison n'est jamais envoyée telle quelle aux participants : seul le texte du message, choisi par l'organisateur, l'est.
-- =====================================================================

alter table public.refunds drop constraint if exists refunds_source_check;
alter table public.refunds add constraint refunds_source_check check (source in ('admin', 'stock_lost', 'stripe_dashboard', 'event_cancelled'));

create table public.cancellation_templates (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid references public.organizers(id) on delete cascade,      -- null = modèle par défaut du site
  reason       text not null check (reason in ('weather', 'permit', 'low_sales', 'other')),
  subject      text not null check (char_length(btrim(subject)) between 1 and 120),
  body         text not null check (char_length(btrim(body)) between 1 and 1800),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);
create unique index cancellation_templates_default_uq on public.cancellation_templates (reason) where organizer_id is null;
create unique index cancellation_templates_org_uq on public.cancellation_templates (organizer_id, reason) where organizer_id is not null;
alter table public.cancellation_templates enable row level security;
revoke all on public.cancellation_templates from anon, authenticated;

insert into public.cancellation_templates (reason, subject, body) values
('weather', 'Annulation de {evenement}',
$t$Bonjour,

Nous sommes profondément désolés de vous annoncer l'annulation de « {evenement} », prévu le {date} à {lieu}.

Les conditions météorologiques annoncées ne nous permettent pas de vous accueillir dans de bonnes conditions de sécurité et de confort, et nous ne pouvons pas prendre ce risque pour vous. Cette décision a été très difficile à prendre : nous savons combien vous l'attendiez, tout comme nous.

Nous vous présentons nos excuses sincères pour la gêne occasionnée et vous remercions de votre compréhension.

L'équipe {organisateur}$t$),
('permit', 'Annulation de {evenement}',
$t$Bonjour,

C'est avec beaucoup de regret que nous devons vous annoncer l'annulation de « {evenement} », prévu le {date} à {lieu}.

Malgré tous nos efforts, l'autorisation nécessaire à la tenue de l'évènement n'a pas pu être obtenue (ou nous a été retirée), et nous ne pouvons pas le maintenir dans le respect de la réglementation. Nous en sommes réellement désolés.

Nous vous présentons nos excuses sincères pour ce contretemps, et vous remercions de la confiance que vous nous avez accordée.

L'équipe {organisateur}$t$),
('low_sales', 'Annulation de {evenement}',
$t$Bonjour,

Nous sommes sincèrement désolés de devoir vous annoncer l'annulation de « {evenement} », prévu le {date} à {lieu}.

Le nombre de billets vendus ne nous permet malheureusement pas d'organiser l'évènement dans des conditions à la hauteur de vos attentes. Nous avons longtemps espéré pouvoir le maintenir, et nous regrettons de vous décevoir.

Merci d'avoir cru en cet évènement : votre soutien compte beaucoup pour nous. Nous vous présentons nos excuses pour cette annulation.

L'équipe {organisateur}$t$),
('other', 'Annulation de {evenement}',
$t$Bonjour,

Nous sommes au regret de vous annoncer l'annulation de « {evenement} », prévu le {date} à {lieu}.

Cette décision, indépendante de notre volonté, n'a pas été prise à la légère : nous savons que vous comptiez sur cet évènement, et nous en sommes sincèrement désolés.

Nous vous présentons nos excuses pour la gêne occasionnée et vous remercions de votre compréhension.

L'équipe {organisateur}$t$);

create table public.event_cancellations (
  id                   uuid primary key default gen_random_uuid(),
  ticketed_event_id    uuid not null unique references public.ticketed_events(id) on delete cascade,
  requested_by         uuid references auth.users(id) on delete set null,
  mode                 text not null check (mode in ('cancel', 'replace')),
  replacement_event_id uuid references public.ticketed_events(id) on delete set null,
  reason_code          text not null check (reason_code in ('weather', 'permit', 'low_sales', 'other')),
  reason_detail        text not null default '' check (char_length(reason_detail) <= 500),
  message_id           uuid references public.organizer_messages(id) on delete set null,
  refund_cents_planned int  not null default 0 check (refund_cents_planned >= 0),
  tickets_cancelled    int  not null default 0 check (tickets_cancelled >= 0),
  created_at           timestamptz not null default now(),
  check (reason_code <> 'other' or char_length(btrim(reason_detail)) >= 5)
);
alter table public.event_cancellations enable row level security;
revoke all on public.event_cancellations from anon, authenticated;

-- Modèle effectif d'une raison pour une organisation : version de l'organisation si elle existe, sinon modèle du site.
create function public._effective_templates(p_org uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(r.reason, jsonb_build_object('subject', t.subject, 'body', t.body, 'source', case when t.organizer_id is null then 'default' else 'organization' end)), '{}'::jsonb)
    from (values ('weather'), ('permit'), ('low_sales'), ('other')) r(reason)
    cross join lateral (select * from public.cancellation_templates c where c.reason = r.reason and (c.organizer_id is null or c.organizer_id = p_org)
                        order by (c.organizer_id is null) limit 1) t
$$;

-- Commandes à rembourser : payées (chiffre > 0, paiement Stripe connu) avec un reste à rembourser, ou dont un remboursement d'annulation est resté sans identifiant Stripe.
create function public._cancellation_refundable(p_event uuid) returns table (order_id uuid, order_number text, remaining_cents int)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id, o.order_number, o.total_cents - o.refunded_cents
    from public.orders o
   where o.ticketed_event_id = p_event and o.total_cents > 0 and o.paid_at is not null and o.stripe_payment_intent_id is not null
     and (o.refunded_cents < o.total_cents
          or exists (select 1 from public.refunds r where r.order_id = o.id and r.source = 'event_cancelled' and r.status in ('pending', 'failed') and r.stripe_refund_id is null))
$$;

create function public.org_cancel_context(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; org public.organizers; c public.event_cancellations;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select * into org from public.organizers where id = ev.organizer_id;
  select * into c from public.event_cancellations where ticketed_event_id = ev.id;
  return jsonb_build_object(
    'event', jsonb_build_object('slug', ev.event_slug, 'status', ev.status, 'starts_at', ev.starts_at, 'venue', ev.venue_name,
              'title', coalesce((select d.title from public.event_details d where d.ticketed_event_id = ev.id and d.title <> ''), ev.event_slug),
              'organizer_name', org.name, 'reply_to', org.contact_email),
    'cancellable', ev.status in ('published', 'closed') and coalesce(ev.ends_at, ev.starts_at) > now() and c.id is null,
    'cancelled', c.id is not null,
    'impact', jsonb_build_object(
      'paid_orders', (select count(*) from public._cancellation_refundable(ev.id)),
      'refund_cents', coalesce((select sum(remaining_cents) from public._cancellation_refundable(ev.id)), 0),
      'valid_tickets', (select count(*) from public.tickets where ticketed_event_id = ev.id and status = 'valid'),
      'recipients', (select count(*) from public._org_recipients(ev.id, 'all', null, null)),
      'pending_orders', (select count(*) from public.orders where ticketed_event_id = ev.id and status = 'pending')),
    'replacements', coalesce((select jsonb_agg(jsonb_build_object('slug', e2.event_slug, 'starts_at', e2.starts_at, 'venue', e2.venue_name,
                        'title', coalesce((select d.title from public.event_details d where d.ticketed_event_id = e2.id and d.title <> ''), e2.event_slug)) order by e2.starts_at)
                      from public.ticketed_events e2 where e2.organizer_id = ev.organizer_id and e2.id <> ev.id and e2.status = 'published' and coalesce(e2.ends_at, e2.starts_at) > now()), '[]'::jsonb),
    'templates', public._effective_templates(ev.organizer_id));
end $$;

-- Annulation atomique. p_mode : 'cancel' | 'replace' (p_replacement = adresse d'un autre évènement PUBLIÉ de la même organisation).
create function public.org_cancel_event(p_actor uuid, p_slug text, p_mode text, p_replacement text, p_reason text, p_detail text, p_subject text, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  ev public.ticketed_events; org public.organizers; rep public.ticketed_events; cid uuid; mid uuid; n int; tk int; planned int;
  v_detail text := left(btrim(coalesce(p_detail, '')), 500); v_subject text := btrim(coalesce(p_subject, '')); v_body text := btrim(coalesce(p_body, ''));
  v_reply text; recips jsonb; orders jsonb; sessions jsonb; v_title text; recip_emails text[];
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select * into ev from public.ticketed_events where id = ev.id for update;
  if exists (select 1 from public.event_cancellations where ticketed_event_id = ev.id) or ev.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  if ev.status not in ('published', 'closed') or coalesce(ev.ends_at, ev.starts_at) <= now() then raise exception 'NOT_CANCELLABLE'; end if;
  if p_mode not in ('cancel', 'replace') then raise exception 'BAD_CANCEL_MODE'; end if;
  if p_reason is null or p_reason not in ('weather', 'permit', 'low_sales', 'other') then raise exception 'BAD_REASON'; end if;
  if p_reason = 'other' and char_length(v_detail) < 5 then raise exception 'DETAIL_REQUIRED'; end if;
  if v_subject = '' or v_body = '' then raise exception 'EMPTY_MESSAGE'; end if;
  if char_length(v_subject) > 120 or char_length(v_body) > 2000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if p_mode = 'replace' then
    select * into rep from public.ticketed_events where event_slug = p_replacement and organizer_id = ev.organizer_id and id <> ev.id and status = 'published' and coalesce(ends_at, starts_at) > now();
    if not found then raise exception 'BAD_REPLACEMENT'; end if;
  end if;
  select * into org from public.organizers where id = ev.organizer_id;
  v_reply := coalesce(nullif(org.contact_email, ''), (select email from auth.users where id = p_actor), '');
  v_title := coalesce((select d.title from public.event_details d where d.ticketed_event_id = ev.id and d.title <> ''), ev.event_slug);

  -- 1) figer ce qui existe AVANT de toucher aux billets : destinataires (la LISTE, pas seulement le compte : le billet annulé
  --    à l'étape 2 sort du périmètre de _org_recipients, qui ne verrait donc plus personne si on la rappelait après), commandes à rembourser
  select array_agg(email) into recip_emails from public._org_recipients(ev.id, 'all', null, null);
  n := coalesce(array_length(recip_emails, 1), 0);
  select coalesce(jsonb_agg(jsonb_build_object('id', r.order_id, 'number', r.order_number)), '[]'::jsonb), coalesce(sum(r.remaining_cents), 0)
    into orders, planned from public._cancellation_refundable(ev.id) r;

  -- 2) évènement annulé, ventes coupées, billets et commandes en attente annulés
  update public.ticketed_events set status = 'cancelled', ticketing_enabled = false where id = ev.id;
  update public.tickets set status = 'cancelled', cancelled_at = now() where ticketed_event_id = ev.id and status = 'valid';
  get diagnostics tk = row_count;
  with c as (update public.orders set status = 'cancelled', cancelled_at = now() where ticketed_event_id = ev.id and status = 'pending' returning stripe_checkout_session_id)
  select coalesce(jsonb_agg(stripe_checkout_session_id) filter (where stripe_checkout_session_id is not null), '[]'::jsonb) into sessions from c;
  update public.publication_requests set status = 'cancelled', reviewed_at = now() where ticketed_event_id = ev.id and status = 'pending';

  -- 3) message aux participants (destinataires figés)
  if n > 0 then
    insert into public.organizer_messages (organizer_id, ticketed_event_id, author_id, subject, body, reply_to, scope, recipient_count)
    values (org.id, ev.id, p_actor, v_subject, v_body, case when char_length(v_reply) >= 3 then v_reply else 'contact@la-sunshines.fr' end, 'all', n) returning id into mid;
    insert into public.organizer_message_recipients (message_id, email) select mid, e from unnest(recip_emails) e;
    select jsonb_agg(email order by email) into recips from public.organizer_message_recipients where message_id = mid;
  end if;

  insert into public.event_cancellations (ticketed_event_id, requested_by, mode, replacement_event_id, reason_code, reason_detail, message_id, refund_cents_planned, tickets_cancelled)
  values (ev.id, p_actor, p_mode, rep.id, p_reason, v_detail, mid, planned, tk) returning id into cid;

  -- la raison reste ICI (journal d'audit, visible par l'admin) : elle n'est jamais envoyée telle quelle aux participants
  perform public._audit(p_actor, 'event.cancel', 'ticketed_event', ev.id::text, jsonb_build_object('status', ev.status), jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('cancellation_id', cid, 'reason', p_reason, 'reason_detail', v_detail, 'mode', p_mode, 'replacement', p_replacement,
                       'recipients', n, 'tickets_cancelled', tk, 'refund_cents_planned', planned, 'subject', left(v_subject, 120)));

  return jsonb_build_object('cancellation_id', cid, 'message_id', mid, 'title', v_title, 'organizer_name', org.name, 'reply_to', v_reply,
    'starts_at', ev.starts_at, 'venue', ev.venue_name,
    'recipients', coalesce(recips, '[]'::jsonb), 'orders', orders, 'refund_cents_planned', planned, 'pending_sessions', sessions, 'tickets_cancelled', tk);
end $$;

-- Suivi d'une annulation : raison, remboursements restants, avancement des e-mails.
create function public.org_cancellation_state(p_actor uuid, p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; c public.event_cancellations; m public.organizer_messages; rep public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select * into c from public.event_cancellations where ticketed_event_id = ev.id;
  if not found then return null; end if;
  select * into m from public.organizer_messages where id = c.message_id;
  select * into rep from public.ticketed_events where id = c.replacement_event_id;
  return jsonb_build_object('id', c.id, 'mode', c.mode, 'reason', c.reason_code, 'reason_detail', c.reason_detail, 'created_at', c.created_at,
    'replacement', case when rep.id is null then null else jsonb_build_object('slug', rep.event_slug, 'title', coalesce((select d.title from public.event_details d where d.ticketed_event_id = rep.id and d.title <> ''), rep.event_slug), 'starts_at', rep.starts_at, 'venue', rep.venue_name) end,
    'tickets_cancelled', c.tickets_cancelled, 'refund_cents_planned', c.refund_cents_planned,
    'refund_remaining', (select coalesce(jsonb_agg(jsonb_build_object('id', r.order_id, 'number', r.order_number, 'remaining_cents', r.remaining_cents)), '[]'::jsonb) from public._cancellation_refundable(ev.id) r),
    'refunded_cents', coalesce((select sum(r.amount_cents) from public.refunds r join public.orders o on o.id = r.order_id where o.ticketed_event_id = ev.id and r.source = 'event_cancelled' and r.status <> 'failed'), 0),
    'message', case when m.id is null then null else jsonb_build_object('id', m.id, 'subject', m.subject, 'body', m.body, 'status', m.status, 'recipient_count', m.recipient_count, 'sent_count', m.sent_count, 'failed_count', m.failed_count,
      'last_error', (select rc.error from public.organizer_message_recipients rc where rc.message_id = m.id and rc.status = 'failed' limit 1)) end);
end $$;

-- Reprise des e-mails : les échecs repassent « en attente » ; renvoie le message et les adresses à (re)traiter.
create function public.org_cancellation_requeue(p_actor uuid, p_slug text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events; c public.event_cancellations; m public.organizer_messages; recips jsonb;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  select * into c from public.event_cancellations where ticketed_event_id = ev.id;
  if not found then raise exception 'NOT_CANCELLED'; end if;
  select * into m from public.organizer_messages where id = c.message_id for update;
  if not found then return jsonb_build_object('message_id', null, 'recipients', '[]'::jsonb); end if;
  update public.organizer_message_recipients set status = 'pending', error = null where message_id = m.id and status = 'failed';
  update public.organizer_messages set status = 'sending', finished_at = null where id = m.id;
  select coalesce(jsonb_agg(email order by email), '[]'::jsonb) into recips from public.organizer_message_recipients where message_id = m.id and status = 'pending';
  return jsonb_build_object('message_id', m.id, 'subject', m.subject, 'body', m.body, 'reply_to', m.reply_to, 'recipients', recips);
end $$;

-- Modèles : organisation (propriétaire) …
create function public.org_save_cancellation_template(p_actor uuid, p_slug text, p_reason text, p_subject text, p_body text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  if p_reason not in ('weather', 'permit', 'low_sales', 'other') then raise exception 'BAD_REASON'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_body, ''))) not between 1 and 1800 then raise exception 'BAD_TEMPLATE'; end if;
  insert into public.cancellation_templates (organizer_id, reason, subject, body, updated_by) values (ev.organizer_id, p_reason, btrim(p_subject), btrim(p_body), p_actor)
  on conflict (organizer_id, reason) where organizer_id is not null do update set subject = excluded.subject, body = excluded.body, updated_by = p_actor, updated_at = now();
  perform public._audit(p_actor, 'cancellation_template.org_save', 'organizer', ev.organizer_id::text, null, jsonb_build_object('reason', p_reason));
end $$;

create function public.org_reset_cancellation_template(p_actor uuid, p_slug text, p_reason text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ev public.ticketed_events;
begin
  ev := public._org_access(p_actor, p_slug, 'owner');
  if p_reason not in ('weather', 'permit', 'low_sales', 'other') then raise exception 'BAD_REASON'; end if;
  delete from public.cancellation_templates where organizer_id = ev.organizer_id and reason = p_reason;
  perform public._audit(p_actor, 'cancellation_template.org_reset', 'organizer', ev.organizer_id::text, null, jsonb_build_object('reason', p_reason));
end $$;

-- … et admin (modèles par défaut du site).
create function public.admin_cancellation_templates(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  return coalesce((select jsonb_agg(jsonb_build_object('reason', t.reason, 'subject', t.subject, 'body', t.body, 'updated_at', t.updated_at,
      'org_overrides', (select count(*) from public.cancellation_templates o where o.reason = t.reason and o.organizer_id is not null))
      order by array_position(array['weather', 'permit', 'low_sales', 'other'], t.reason)) from public.cancellation_templates t where t.organizer_id is null), '[]'::jsonb);
end $$;

create function public.admin_save_cancellation_template(p_actor uuid, p_reason text, p_subject text, p_body text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public._assert_admin(p_actor);
  if p_reason not in ('weather', 'permit', 'low_sales', 'other') then raise exception 'BAD_REASON'; end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_body, ''))) not between 1 and 1800 then raise exception 'BAD_TEMPLATE'; end if;
  update public.cancellation_templates set subject = btrim(p_subject), body = btrim(p_body), updated_by = p_actor, updated_at = now() where reason = p_reason and organizer_id is null;
  perform public._audit(p_actor, 'cancellation_template.save', 'cancellation_template', p_reason, null, jsonb_build_object('subject', left(btrim(p_subject), 120)));
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_effective_templates', '_cancellation_refundable', 'org_cancel_context', 'org_cancel_event', 'org_cancellation_state', 'org_cancellation_requeue',
                       'org_save_cancellation_template', 'org_reset_cancellation_template', 'admin_cancellation_templates', 'admin_save_cancellation_template')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
