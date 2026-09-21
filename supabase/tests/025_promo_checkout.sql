-- Tests 025 — application des codes promo : pourcentage, montant fixe, tarifs visés, période, épuisement, frais recalculés, minimum 0,50 €, refus d'un code qui rend gratuit. ROLLBACK.
begin;
create function pg_temp.expect(p_msg text, p_sql text) returns void language plpgsql as $$
declare got text;
begin
  begin execute p_sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL : erreur « % » attendue, aucune levée (%)', p_msg, p_sql; end if;
  if got <> p_msg then raise exception 'FAIL : attendu « % », reçu « % » (%)', p_msg, got, p_sql; end if;
end $$;
create function pg_temp.items(p_tier uuid, p_qty int) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('tier_id', p_tier, 'quantity', p_qty,
    'participants', (select jsonb_agg(jsonb_build_object('first_name', 'Part', 'last_name', g::text)) from generate_series(1, p_qty) g))) $$;
insert into auth.users (id, email, email_confirmed_at) values ('f5000000-0000-0000-0000-000000000001', 'a@test.local', now()), ('f5000000-0000-0000-0000-000000000002', 'b@test.local', now());
insert into public.ticketed_events (id, event_slug, starts_at, capacity, ticketing_enabled, status) values ('e5000000-0000-0000-0000-000000000001', 'evt-promo', now() + interval '30 days', 100, true, 'published'), ('e5000000-0000-0000-0000-000000000002', 'evt-autre', now() + interval '30 days', 100, true, 'published');
insert into public.ticket_tiers (id, ticketed_event_id, name, price_cents, quantity_total, max_per_order, max_per_account) values
  ('a5000000-0000-0000-0000-00000000000a', 'e5000000-0000-0000-0000-000000000001', 'Standard', 2000, 50, 6, 2),
  ('b5000000-0000-0000-0000-00000000000b', 'e5000000-0000-0000-0000-000000000001', 'VIP', 5000, 50, 6, 2),
  ('c5000000-0000-0000-0000-00000000000c', 'e5000000-0000-0000-0000-000000000001', 'Petit', 100, 50, 6, 2);
insert into public.promo_codes (id, ticketed_event_id, code, kind, value, max_uses, tier_ids, ends_at) values
  ('d5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'MOINS20', 'percent', 20, 1, null, null),
  ('d5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', 'FIXE5', 'fixed', 500, null, array['b5000000-0000-0000-0000-00000000000b']::uuid[], null),
  ('d5000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001', 'PERIME', 'percent', 10, null, null, now() - interval '1 day'),
  ('d5000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000001', 'TOUT', 'percent', 100, null, null, null),
  ('d5000000-0000-0000-0000-000000000005', 'e5000000-0000-0000-0000-000000000001', 'GROS', 'percent', 90, null, null, null),
  ('d5000000-0000-0000-0000-000000000006', 'e5000000-0000-0000-0000-000000000002', 'AUTRE', 'percent', 50, null, null, null);
update public.promo_codes set active = false where id = 'd5000000-0000-0000-0000-000000000006';
insert into public.promo_codes (id, ticketed_event_id, code, kind, value, active) values ('d5000000-0000-0000-0000-000000000007', 'e5000000-0000-0000-0000-000000000001', 'OFF', 'percent', 50, false);
create function pg_temp.reserve(p_user uuid, p_tier uuid, p_qty int) returns uuid language sql as $$
  select order_id from public.reserve_tickets('evt-promo', p_user, 'Evt', pg_temp.items(p_tier, p_qty), '{"email":"b@test.local","first_name":"B","last_name":"B"}', 10, 50, 'v1', true) $$;
do $$
declare u1 constant uuid := 'f5000000-0000-0000-0000-000000000001'; u2 constant uuid := 'f5000000-0000-0000-0000-000000000002'; o uuid; r record; oi record;
begin
  -- pourcentage : 2 × 2000 = 4000 → −20 % = 3200, frais 10 % + 0,50 € = 370, total 3570
  o := pg_temp.reserve(u1, 'a5000000-0000-0000-0000-00000000000a', 2);
  select * into r from public.apply_promo(u1, o, ' moins20 ', 10, 50);
  if r.subtotal_cents <> 3200 or r.discount_cents <> 800 or r.fee_cents <> 370 or r.total_cents <> 3570 then raise exception 'FAIL : pourcentage % / % / % / %', r.subtotal_cents, r.discount_cents, r.fee_cents, r.total_cents; end if;
  select * into oi from public.order_items where order_id = o;
  if oi.unit_price_cents <> 1600 or oi.line_total_cents <> 3200 then raise exception 'FAIL : ligne de commande'; end if;
  if (select subtotal_cents + fee_cents from public.orders where id = o) <> (select total_cents from public.orders where id = o) then raise exception 'FAIL : total commande'; end if;
  if (select used_count from public.promo_codes where code = 'MOINS20') <> 1 then raise exception 'FAIL : utilisations'; end if;
  -- déjà appliqué
  begin perform public.apply_promo(u1, o, 'FIXE5', 10, 50); raise exception 'FAIL : double code'; exception when others then if sqlerrm <> 'PROMO_ALREADY' then raise; end if; end;
  -- épuisé (max 1, déjà pris par la commande en cours de u1)
  o := pg_temp.reserve(u2, 'a5000000-0000-0000-0000-00000000000a', 1);
  begin perform public.apply_promo(u2, o, 'MOINS20', 10, 50); raise exception 'FAIL : code épuisé accepté'; exception when others then if sqlerrm <> 'PROMO_EXHAUSTED' then raise; end if; end;
  -- montant fixe, tarif visé seulement : VIP 5000 → 4500 ; Standard non concerné
  o := pg_temp.reserve(u2, 'b5000000-0000-0000-0000-00000000000b', 1);
  select * into r from public.apply_promo(u2, o, 'FIXE5', 0, 0);
  if r.subtotal_cents <> 4500 or r.discount_cents <> 500 or r.total_cents <> 4500 then raise exception 'FAIL : montant fixe'; end if;
  o := pg_temp.reserve(u1, 'a5000000-0000-0000-0000-00000000000a', 1);
  begin perform public.apply_promo(u1, o, 'FIXE5', 10, 50); raise exception 'FAIL : tarif non visé'; exception when others then if sqlerrm <> 'PROMO_NOT_APPLICABLE' then raise; end if; end;
  -- période dépassée, code inactif, code inconnu, code d'un autre évènement
  begin perform public.apply_promo(u1, o, 'PERIME', 10, 50); raise exception 'FAIL : périmé'; exception when others then if sqlerrm <> 'PROMO_EXPIRED' then raise; end if; end;
  begin perform public.apply_promo(u1, o, 'OFF', 10, 50); raise exception 'FAIL : inactif'; exception when others then if sqlerrm <> 'PROMO_INVALID' then raise; end if; end;
  begin perform public.apply_promo(u1, o, 'NOPE', 10, 50); raise exception 'FAIL : inconnu'; exception when others then if sqlerrm <> 'PROMO_INVALID' then raise; end if; end;
  begin perform public.apply_promo(u1, o, 'AUTRE', 10, 50); raise exception 'FAIL : autre évènement'; exception when others then if sqlerrm <> 'PROMO_INVALID' then raise; end if; end;
  -- 100 % : refusé (les billets gratuits ont leur parcours) ; la commande n'est pas modifiée
  begin perform public.apply_promo(u1, o, 'TOUT', 10, 50); raise exception 'FAIL : commande gratuite'; exception when others then if sqlerrm <> 'PROMO_FREE' then raise; end if; end;
  if (select unit_price_cents from public.order_items where order_id = o) <> 2000 then raise exception 'FAIL : commande modifiée malgré le refus'; end if;
  -- minimum 0,50 € : 100 × (1 − 90 %) = 10 → relevé à 50
  o := pg_temp.reserve(u1, 'c5000000-0000-0000-0000-00000000000c', 1);
  select * into r from public.apply_promo(u1, o, 'GROS', 0, 0);
  if r.subtotal_cents <> 50 then raise exception 'FAIL : minimum 0,50 € (%)', r.subtotal_cents; end if;
  -- la commande d'un autre client n'est pas accessible
  o := pg_temp.reserve(u2, 'a5000000-0000-0000-0000-00000000000a', 1);
  begin perform public.apply_promo(u1, o, 'GROS', 10, 50); raise exception 'FAIL : commande d''un autre'; exception when others then if sqlerrm <> 'ORDER_NOT_FOUND' then raise; end if; end;
  if has_function_privilege('authenticated', 'public.apply_promo(uuid,uuid,text,numeric,integer)', 'execute') then raise exception 'FAIL : apply_promo exécutable par authenticated'; end if;
end $$;
rollback;
