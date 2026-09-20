-- 009_down.sql — retour arrière de 20260920000900_organizers (supprime organisateurs, messages, références de billets).
-- Décommente la ligne suivante pour confirmer :
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop policy if exists tickets_organizer_read on public.tickets;
drop policy if exists order_items_organizer_read on public.order_items;
drop policy if exists orders_organizer_read on public.orders;
drop policy if exists tiers_organizer_read on public.ticket_tiers;
drop policy if exists events_organizer_read on public.ticketed_events;
drop trigger if exists ticketed_events_default_organizer on public.ticketed_events;
drop function if exists public._set_default_organizer();
alter table public.ticketed_events drop constraint if exists ticketed_events_organizer_fk;
alter table public.ticketed_events alter column organizer_id drop not null;
drop table if exists public.organizer_message_recipients, public.organizer_messages, public.organizer_members, public.organizers cascade;
drop function if exists public.org_messages_list(uuid, text), public.org_message_result(uuid, text, boolean, text),
  public.org_message_create(uuid, text, text, text, text, uuid, uuid[]), public.org_message_preview(uuid, text, text, uuid, uuid[]),
  public.org_ticket_for_resend(uuid, text, uuid), public.org_log(uuid, text, text, jsonb), public.org_export_participants(uuid, text, uuid, text),
  public.org_participants(uuid, text, text, uuid, text, text, text, int, int), public.org_event_stats(uuid, text), public.org_events(uuid),
  public._org_recipients(uuid, text, uuid, uuid[]), public._org_audit(uuid, uuid, text, jsonb, int), public._org_access(uuid, text, text),
  public.is_org_member_of_event(uuid), public._org_role(uuid, uuid);
drop index if exists public.tickets_reference_uniq;
alter table public.tickets drop column if exists reference;
drop function if exists public.new_ticket_reference();
