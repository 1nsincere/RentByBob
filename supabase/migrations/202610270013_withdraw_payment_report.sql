-- Renters may withdraw a payment report they sent by mistake while the property has not checked it yet (original
-- brief: "Submit or withdraw pending payment reports"). Only the renter who sent it, while still linked to the room;
-- a report staff already recorded or marked not received cannot be withdrawn. Repeating a withdrawal is harmless.
begin;

alter table public.renter_payment_reports drop constraint renter_payment_reports_status_check;
alter table public.renter_payment_reports add constraint renter_payment_reports_status_check check (status in ('new', 'recorded', 'dismissed', 'withdrawn'));

create function public.withdraw_payment_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.renter_payment_reports;
begin
  select * into r from public.renter_payment_reports where id = p_report_id for update;
  if not found or auth.uid() is null or r.reported_by <> auth.uid() or not private.renter_owns_agreement(r.agreement_id) then
    raise exception 'Only the renter who sent this report can withdraw it' using errcode = '42501';
  end if;
  if r.status = 'withdrawn' then return; end if;
  if r.status <> 'new' then raise exception 'This report was already checked by the property' using errcode = '22023'; end if;
  update public.renter_payment_reports set status = 'withdrawn', handled_by = auth.uid(), handled_at = now() where id = r.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (r.property_id, auth.uid(), 'renter_payment_report_withdrawn', r.id, 'Renter withdrew the report before it was checked');
end $$;

revoke all on function public.withdraw_payment_report(uuid) from public, anon, authenticated, service_role;
grant execute on function public.withdraw_payment_report(uuid) to authenticated;
commit;
