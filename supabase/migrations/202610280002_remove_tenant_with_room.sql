-- Owner request (28 Oct 2026): "I can't remove tenants." Remove was hidden for tenants who still have a room, and
-- remove_tenant refuses until the move-out date has passed. This lets the owner remove such a tenant in one step: the
-- room agreement is ended and the tenant is hidden from every list. Nothing is deleted: rent charges, cash,
-- acknowledgments and the audit log stay for reports, and any unpaid rent stays in the records.
--  * An agreement that never had rent charged, cash, a check or a payment report, and whose move-in was before this
--    month (an entry made by mistake) ends on its move-in date, so the room is free again at once and no rent can
--    ever be added.
--  * Any other agreement ends today (the normal move-out rule: the move-out month stays a full month, no rent is added
--    after it), so the room is free from tomorrow.
-- Waiting notebook months (202610280001) for the agreement are removed. The renter's sign-in links are revoked.
begin;

create function public.remove_tenant_with_room(p_tenant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.tenants; a public.rental_agreements; today date := (now() at time zone 'Asia/Manila')::date; unused boolean; end_on date;
begin
  select * into target from public.tenants where id = p_tenant_id;
  if not found then raise exception 'Tenant unavailable' using errcode = '22023'; end if;
  perform private.cash_lock(target.property_id);
  if private.staff_role(target.property_id) is distinct from 'owner' then raise exception 'Access denied' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Give a reason for removing' using errcode = '22023'; end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.removed_at is not null then return; end if;
  for a in select * from public.rental_agreements r where r.tenant_id = target.id and (r.ended_on is null or r.ended_on >= today) for update loop
    unused := not exists (select 1 from public.rent_charges c where c.agreement_id = a.id)
      and not exists (select 1 from public.cash_records c where c.agreement_id = a.id)
      and not exists (select 1 from public.check_records k where k.agreement_id = a.id)
      and not exists (select 1 from public.renter_payment_reports p where p.agreement_id = a.id);
    end_on := case when unused and a.move_in < date_trunc('month', today)::date then a.move_in else today end;
    if a.ended_on is null or a.ended_on > end_on then
      update public.rental_agreements set ended_on = end_on, end_reason = left('Tenant removed: ' || btrim(p_reason), 500), ended_by = auth.uid(), ended_at = now(), end_request_id = gen_random_uuid() where id = a.id;
      insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
        values (target.property_id, auth.uid(), 'rental_agreement_ended', a.id, target.id, left('Tenant removed: ' || btrim(p_reason), 500));
    end if;
    update public.rent_month_drafts set status = 'removed', checked_by = auth.uid(), checked_at = now(), reason = 'Tenant removed'
      where agreement_id = a.id and status = 'waiting';
  end loop;
  update public.tenants set archived_at = coalesce(archived_at, now()), removed_at = now() where id = target.id;
  update public.tenant_contacts set revoked_at = now() where tenant_id = target.id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), 'tenant_removed', target.id, target.id, btrim(p_reason));
end $$;

revoke all on function public.remove_tenant_with_room(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.remove_tenant_with_room(uuid, text) to authenticated;
commit;
