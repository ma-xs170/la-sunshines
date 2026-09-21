-- 019_down.sql — retour arrière de 20260920001900_support_threads (supprime tous les tickets de support organisateurs ↔ admins).
-- select set_config('app.confirm_drop', 'yes', false);
do $$ begin
  if coalesce(current_setting('app.confirm_drop', true), '') <> 'yes' then
    raise exception 'Retour arrière refusé : décommente d''abord la ligne set_config(''app.confirm_drop'', ''yes'', false).';
  end if;
end $$;
drop function if exists public.support_can_read(uuid, uuid), public.support_quick_replies(uuid, jsonb), public.admin_support_search(uuid, text), public.support_reopen(uuid, uuid), public.support_close(uuid, uuid, text),
  public.support_transfer(uuid, uuid, uuid), public.support_claim(uuid, uuid), public.admin_support_list(uuid, text, text), public._assert_active_admin(uuid), public.support_add_participant(uuid, uuid, text),
  public.support_post(uuid, uuid, text, jsonb, boolean), public.support_get(uuid, uuid, bigint), public.support_list(uuid, uuid, text, text), public.support_create(uuid, uuid, text, text, text, text, jsonb, jsonb),
  public._new_ticket_ref(), public._support_role(uuid, uuid);
drop table if exists public.support_quick_replies, public.support_reads, public.support_events, public.support_messages, public.support_participants, public.support_threads;
