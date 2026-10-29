-- Fixes from the 28 Oct 2026 security and bug sweep.
--  * Bounds: a move-in date more than a year ahead and a rent month more than a year ahead are refused (a typo year used to
--    lock a room for decades or add an unremovable charge); infinite dates are refused by table checks too.
--  * remove_tenant_with_room: a tenant with a future move-in can be removed; the answer is the same for "no such tenant" and
--    "not allowed", and no lock is taken before the caller's role is known.
--  * add_rent_month: a month waiting for a double check can no longer be charged by hand (that skipped the second person);
--    confirming still charges it through the private core function.
--  * draft_rent_months: no notebook months for a removed tenant; the note is limited to 440 characters so the audit text fits.
--  * record_maintenance_expense: retrying an entry that was voided is refused instead of looking like success.
--  * record_collection_handover: NaN and absurd amounts are refused.
--  * confirm_rent_cash: a reversed payment cannot be "confirmed" again into a valid-looking receipt.
--  * set_staff_access: remembered devices are revoked whenever a person's staff access changes, so a revoked clerk's device
--    cannot come back to life when access is granted again.
--  * submit_rental_inquiry (public): contacts are normalised before the per-contact limit (no more 0917..., +63917..., spaced
--    variants), a per-room hourly cap is added, and a contact needs at least 3 real characters.
--  * mark_inquiry_handled is audited; post_due_rent_now records the person who pressed it as the actor.
begin;

create or replace function public.create_rental_agreement(p_property_id uuid, p_id uuid, p_tenant_id uuid, p_unit_id uuid, p_move_in date, p_rent numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.rental_agreements;
begin
 perform private.cash_lock(p_property_id);
 if p_id is null or p_move_in is null or p_move_in<date '1900-01-01' or p_move_in>(now() at time zone 'Asia/Manila')::date+366 or p_rent is null or p_rent<=0 or p_rent>=1000000000000 or p_rent<>round(p_rent,2) then raise exception 'Invalid agreement' using errcode='22023'; end if;
 select * into old from public.rental_agreements where id=p_id;
 if found then
  if old.property_id=p_property_id and old.tenant_id=p_tenant_id and old.unit_id=p_unit_id and old.move_in=p_move_in and old.rent=p_rent then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 if not exists(select 1 from public.tenants where id=p_tenant_id and property_id=p_property_id and archived_at is null)
 or not exists(select 1 from public.units u join public.buildings b on b.id=u.building_id where u.id=p_unit_id and u.property_id=p_property_id and u.archived_at is null and b.archived_at is null and u.kind<>'shared') then
  raise exception 'Choose an active tenant and a rentable room in this property' using errcode='22023';
 end if;
 if exists(select 1 from public.rental_agreements where unit_id=p_unit_id and (ended_on is null or ended_on>=p_move_in)) then
  raise exception 'This room already has an agreement for that date' using errcode='22023';
 end if;
 insert into public.rental_agreements(id,property_id,tenant_id,unit_id,move_in,rent) values(p_id,p_property_id,p_tenant_id,p_unit_id,p_move_in,p_rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rental_agreement_created',p_id,p_tenant_id,'One responsible tenant for room rent');
 return p_id;
end $function$;

create or replace function private.add_rent_month_core(p_property_id uuid, p_id uuid, p_agreement_id uuid, p_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rental_agreements; old public.rent_charges; due date;
begin
 perform private.cash_lock(p_property_id);
 select * into a from public.rental_agreements where id=p_agreement_id and property_id=p_property_id;
 if not found or p_id is null or p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 or p_month>(date_trunc('month',now() at time zone 'Asia/Manila')::date+366) or p_month<date_trunc('month',a.move_in)::date then raise exception 'Invalid rental month' using errcode='22023'; end if;
 select * into old from public.rent_charges where id=p_id;
 if found then
  if old.property_id=p_property_id and old.agreement_id=p_agreement_id and old.rental_month=p_month then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 if a.ended_on is not null and p_month>a.ended_on then raise exception 'No rent can be added for a month after move-out' using errcode='22023'; end if;
 due := p_month + (least(extract(day from a.move_in)::int,extract(day from (p_month+interval '1 month - 1 day'))::int)-1);
 insert into public.rent_charges(id,property_id,agreement_id,rental_month,due_date,amount) values(p_id,p_property_id,p_agreement_id,p_month,due,a.rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_charge_created',p_id,a.tenant_id,'Monthly rent from agreement terms');
 perform private.apply_credit(p_property_id, p_agreement_id);
 return p_id;
end $function$;

revoke all on function private.add_rent_month_core(uuid, uuid, uuid, date) from public, anon, authenticated, service_role;

-- The browser-facing function refuses a month that is waiting for a double check (the double check must not be bypassed
-- by adding the same month by hand); everything else behaves exactly as before.
create or replace function public.add_rent_month(p_property_id uuid, p_id uuid, p_agreement_id uuid, p_month date)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.cash_lock(p_property_id);
  if exists (select 1 from public.rent_month_drafts d where d.property_id = p_property_id and d.agreement_id = p_agreement_id and d.rental_month = p_month and d.status = 'waiting') then
    raise exception 'This month is waiting for a double check; confirm it under Months owed from the notebook' using errcode = '22023';
  end if;
  return private.add_rent_month_core(p_property_id, p_id, p_agreement_id, p_month);
end $$;

create or replace function public.confirm_rent_month_drafts(p_property_id uuid, p_draft_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.rent_month_drafts; a public.rental_agreements; confirmed int := 0; draft_id uuid;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_draft_ids is null or cardinality(p_draft_ids) not between 1 and 36 then raise exception 'Choose between 1 and 36 months' using errcode = '22023'; end if;
  for draft_id in select distinct x from unnest(p_draft_ids) as x order by x loop
    select * into d from public.rent_month_drafts where public.rent_month_drafts.id = draft_id and property_id = p_property_id for update;
    if not found then raise exception 'Month unavailable' using errcode = '22023'; end if;
    if d.status = 'confirmed' and d.checked_by = auth.uid() then continue; end if;
    if d.status <> 'waiting' then raise exception 'This month is no longer waiting for a double check' using errcode = '22023'; end if;
    if d.entered_by = auth.uid() then raise exception 'A different staff member must double check these months' using errcode = '42501'; end if;
    if exists (select 1 from public.rent_charges c where c.agreement_id = d.agreement_id and c.rental_month = d.rental_month) then
      raise exception 'Rent for % is already charged; remove this entry instead', to_char(d.rental_month, 'YYYY-MM') using errcode = '22023';
    end if;
    perform private.add_rent_month_core(p_property_id, gen_random_uuid(), d.agreement_id, d.rental_month);
    update public.rent_month_drafts set status = 'confirmed', checked_by = auth.uid(), checked_at = now() where public.rent_month_drafts.id = d.id;
    select * into a from public.rental_agreements where public.rental_agreements.id = d.agreement_id;
    insert into public.audit_events (property_id, actor_id, action, target_id, tenant_id, reason)
      values (p_property_id, auth.uid(), 'rent_month_double_checked', d.id, a.tenant_id, 'Past month confirmed against the notebook: ' || d.source_note);
    confirmed := confirmed + 1;
  end loop;
  return confirmed;
end $function$;

create or replace function public.remove_tenant_with_room(p_tenant_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.tenants; a public.rental_agreements; today date := (now() at time zone 'Asia/Manila')::date; unused boolean; end_on date;
begin
  select * into target from public.tenants where id = p_tenant_id;
  -- One answer for "no such tenant" and "not allowed", and no lock is taken before the role is known.
  if not found or private.staff_role(target.property_id) is null then raise exception 'Access denied' using errcode = '42501'; end if;
  perform private.cash_lock(target.property_id);
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Give a reason for removing' using errcode = '22023'; end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.removed_at is not null then return; end if;
  for a in select * from public.rental_agreements r where r.tenant_id = target.id and (r.ended_on is null or r.ended_on >= today) for update loop
    unused := not exists (select 1 from public.rent_charges c where c.agreement_id = a.id)
      and not exists (select 1 from public.cash_records c where c.agreement_id = a.id)
      and not exists (select 1 from public.check_records k where k.agreement_id = a.id)
      and not exists (select 1 from public.renter_payment_reports p where p.agreement_id = a.id);
    end_on := greatest(case when unused and a.move_in < date_trunc('month', today)::date then a.move_in else today end, a.move_in);
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
end $function$;

create or replace function public.draft_rent_months(p_property_id uuid, p_agreement_id uuid, p_months date[], p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rental_agreements; m date; this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date; added int := 0; skipped int := 0; new_id uuid;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_note, ''))) not between 3 and 440 then raise exception 'Say which notebook notes these months come from' using errcode = '22023'; end if;
  if p_months is null or cardinality(p_months) not between 1 and 36 then raise exception 'Choose between 1 and 36 months' using errcode = '22023'; end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id;
  if not found then raise exception 'Rental account unavailable' using errcode = '22023'; end if;
  if exists (select 1 from public.tenants t where t.id = a.tenant_id and t.removed_at is not null) then raise exception 'This tenant was removed' using errcode = '22023'; end if;
  for m in select distinct x from unnest(p_months) as x order by x loop
    if extract(day from m) <> 1 or m < date_trunc('month', a.move_in)::date or m > this_month or (a.ended_on is not null and m > a.ended_on) then
      raise exception 'Past months must start on or after the move-in month, be no later than this month, and end by move-out' using errcode = '22023';
    end if;
    if exists (select 1 from public.rent_charges c where c.agreement_id = a.id and c.rental_month = m)
       or exists (select 1 from public.rent_month_drafts d where d.agreement_id = a.id and d.rental_month = m and d.status = 'waiting') then
      skipped := skipped + 1; continue;
    end if;
    insert into public.rent_month_drafts (property_id, agreement_id, rental_month, source_note, entered_by)
      values (p_property_id, a.id, m, btrim(p_note), auth.uid()) returning id into new_id;
    insert into public.audit_events (property_id, actor_id, action, target_id, tenant_id, reason)
      values (p_property_id, auth.uid(), 'rent_month_entered_for_check', new_id, a.tenant_id, 'Past month from notebook, waiting for a double check: ' || btrim(p_note));
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped);
end $function$;

create or replace function public.record_maintenance_expense(p_property_id uuid, p_id uuid, p_month date, p_description text, p_place text, p_amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.maintenance_expenses; this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date; place text := nullif(btrim(coalesce(p_place, '')), '');
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_id is null or p_month is null or extract(day from p_month) <> 1 or p_month < date '2000-01-01' or p_month > this_month then
    raise exception 'Choose a month that is not in the future' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 200 or (place is not null and length(place) > 100)
     or p_amount is null or p_amount <= 0 or p_amount >= 1000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter what it was for and an amount in pesos and centavos' using errcode = '22023'; end if;
  select * into old from public.maintenance_expenses where id = p_id;
  if found then
    if old.voided_at is not null then raise exception 'This entry was removed; enter it again as a new entry' using errcode = '22023'; end if;
    if old.property_id = p_property_id and old.expense_month = p_month and old.description = btrim(p_description) and old.place is not distinct from place and old.amount = p_amount and old.recorded_by = auth.uid() then return p_id; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  insert into public.maintenance_expenses(id, property_id, expense_month, description, place, amount, recorded_by) values (p_id, p_property_id, p_month, btrim(p_description), place, p_amount, auth.uid());
  insert into public.audit_events(property_id, actor_id, action, target_id, reason) values (p_property_id, auth.uid(), 'maintenance_expense_recorded', p_id, 'Maintenance for ' || to_char(p_month, 'YYYY-MM') || ': ' || btrim(p_description));
  return p_id;
end $function$;

create or replace function public.record_collection_handover(p_property_id uuid, p_id uuid, p_clerk_id uuid, p_handover_on date, p_expected_cash numeric, p_expected_checks numeric, p_actual_cash numeric, p_actual_checks numeric, p_difference_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.collection_handovers;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode='42501'; end if;
 select * into old from public.collection_handovers where id=p_id;
 if found then
  if old.property_id=p_property_id and old.clerk_id=p_clerk_id and old.handover_on=p_handover_on and old.expected_cash=p_expected_cash and old.expected_checks=p_expected_checks and old.actual_cash=p_actual_cash and old.actual_checks=p_actual_checks and old.difference_reason is not distinct from nullif(btrim(p_difference_reason),'') then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 if p_id is null or p_handover_on is null or p_handover_on>(now() at time zone 'Asia/Manila')::date or p_expected_cash is null or p_expected_cash='NaN'::numeric or p_expected_cash>=1000000000000 or p_expected_cash<0 or p_expected_cash<>round(p_expected_cash,2) or p_expected_checks is null or p_expected_checks='NaN'::numeric or p_expected_checks>=1000000000000 or p_expected_checks<0 or p_expected_checks<>round(p_expected_checks,2) or p_actual_cash is null or p_actual_cash='NaN'::numeric or p_actual_cash>=1000000000000 or p_actual_cash<0 or p_actual_cash<>round(p_actual_cash,2) or p_actual_checks is null or p_actual_checks='NaN'::numeric or p_actual_checks>=1000000000000 or p_actual_checks<0 or p_actual_checks<>round(p_actual_checks,2)
 or not exists(select 1 from public.staff_memberships where property_id=p_property_id and user_id=p_clerk_id and role='clerk' and revoked_at is null) then raise exception 'Invalid collection handover' using errcode='22023'; end if;
 insert into public.collection_handovers(id,property_id,clerk_id,handover_on,expected_cash,expected_checks,actual_cash,actual_checks,difference_reason,recorded_by)
 values(p_id,p_property_id,p_clerk_id,p_handover_on,p_expected_cash,p_expected_checks,p_actual_cash,p_actual_checks,nullif(btrim(p_difference_reason),''),auth.uid());
 insert into public.handover_events(property_id,handover_id,actor_id,action) values(p_property_id,p_id,auth.uid(),'recorded');
 insert into public.audit_events(property_id,actor_id,action,target_id,reason) values(p_property_id,auth.uid(),'collection_handover_recorded',p_id,'Collection handover recorded');
 return p_id;
end $function$;

create or replace function public.confirm_rent_cash(p_property_id uuid, p_cash_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.cash_records; a public.rental_agreements; c record; left_to_apply numeric(14,2); part numeric(14,2); balance numeric(14,2); snapshot jsonb;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'clerk' then raise exception 'Clerk MFA required' using errcode='42501'; end if;
 select * into r from public.cash_records where id=p_cash_id and property_id=p_property_id for update;
 if not found then raise exception 'Cash record unavailable' using errcode='22023'; end if;
 if exists(select 1 from public.cash_reversals v where v.cash_id=r.id) then raise exception 'This payment was reversed' using errcode='22023'; end if;
 if r.confirmed_at is not null then return r.acknowledgment; end if;
 select * into a from public.rental_agreements where id=r.agreement_id;
 left_to_apply:=r.amount;
 for c in select ch.id,ch.amount-coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id=ch.id),0)-coalesce((select sum(al.amount) from public.check_allocations al join public.check_records cr on cr.id=al.check_id where al.charge_id=ch.id and cr.status='cleared'),0) as owed from public.rent_charges ch where ch.agreement_id=r.agreement_id order by ch.due_date,ch.id for update loop
  part:=least(left_to_apply,c.owed); if part>0 then insert into public.cash_allocations(property_id,cash_id,charge_id,amount) values(p_property_id,p_cash_id,c.id,part); left_to_apply:=left_to_apply-part; end if;
 end loop;
 select coalesce(sum(ch.amount),0)-(select coalesce(sum(al.amount),0) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.check_allocations al join public.rent_charges ch on ch.id=al.charge_id join public.check_records cr on cr.id=al.check_id and cr.status='cleared' where ch.agreement_id=a.id) into balance from public.rent_charges ch where ch.agreement_id=a.id;
 select jsonb_build_object('number','RBB-'||r.id::text,'title','Cash Payment Acknowledgment','payment_id',r.id,'tenant',t.display_name,'building',b.label,'room',u.label,'property',p.name,'amount',r.amount::text,'received_on',r.received_on,'collector',r.collector,'issued_at',now(),'verified_by',auth.uid(),'balance_at_issuance',balance::text,'advance_credit',left_to_apply::text,'currency','PHP','notice','Payment acknowledgment only. Not an official tax receipt.','allocations',coalesce((select jsonb_agg(jsonb_build_object('month',ch.rental_month,'amount',al.amount::text) order by ch.due_date,ch.id) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where al.cash_id=r.id),'[]'::jsonb)) into snapshot from public.tenants t join public.units u on u.id=a.unit_id join public.buildings b on b.id=u.building_id join public.properties p on p.id=a.property_id where t.id=a.tenant_id;
 update public.cash_records set confirmed_by=auth.uid(),confirmed_at=now(),acknowledgment=snapshot where id=r.id;
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_cash_confirmed',r.id,a.tenant_id,case when left_to_apply>0 then 'Cash settled; oldest rent allocated; '||left_to_apply::text||' kept as advance credit' else 'Cash settled, oldest rent allocated, acknowledgment issued' end);
 return snapshot;
end $function$;

create or replace function public.set_staff_access(p_property_id uuid, p_user_id uuid, p_role text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('owner', 'clerk') then
    raise exception 'Invalid staff role' using errcode = '22023';
  end if;
  if p_role is distinct from 'owner' and exists (
    select 1 from public.staff_memberships where property_id = p_property_id
      and user_id = p_user_id and role = 'owner' and revoked_at is null
  ) and not exists (
    select 1 from public.staff_memberships where property_id = p_property_id
      and user_id <> p_user_id and role = 'owner' and revoked_at is null
  ) then raise exception 'Keep at least one active owner' using errcode = '23514'; end if;
  if p_role is null then
    update public.staff_memberships set revoked_at = now() where property_id = p_property_id and user_id = p_user_id;
  else
    insert into public.staff_memberships(property_id, user_id, role)
      values (p_property_id, p_user_id, p_role)
      on conflict (property_id, user_id) do update set role = excluded.role, revoked_at = null;
  end if;
  -- A remembered device must not outlive a revocation and come back to life when access is granted again.
  update private.trusted_devices set revoked_at = now() where user_id = p_user_id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_role is null then 'staff_revoked' else 'staff_role_' || p_role end, p_user_id, p_reason);
end $function$;

create or replace function public.submit_rental_inquiry(p_id uuid, p_unit_id uuid, p_name text, p_contact text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare unit_property uuid; prior public.rental_inquiries;
begin
  if p_id is null or length(btrim(coalesce(p_name, ''))) not between 1 and 100 or length(btrim(coalesce(p_contact, ''))) not between 3 and 120 or length(regexp_replace(lower(coalesce(p_contact, '')), '[^a-z0-9@]', '', 'g')) < 3
    or length(coalesce(p_message, '')) > 1000 then
    raise exception 'Enter your name, a phone number or Messenger name, and a message under 1000 characters' using errcode = '22023';
  end if;
  select * into prior from public.rental_inquiries where id = p_id;
  if found then
    if prior.unit_id = p_unit_id and prior.visitor_name = btrim(p_name) and prior.contact = btrim(p_contact) and prior.message = coalesce(p_message, '') then return; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  select u.property_id into unit_property from public.units u where u.id = p_unit_id;
  if unit_property is null or not private.unit_publicly_available(p_unit_id) then
    raise exception 'This room is no longer listed' using errcode = '22023';
  end if;
  perform 1 from public.properties where id = unit_property for update;
  delete from public.rental_inquiries where property_id = unit_property and created_at < now() - interval '90 days';
  if (select count(*) from public.rental_inquiries where regexp_replace(lower(contact), '[^a-z0-9@]', '', 'g') = regexp_replace(lower(p_contact), '[^a-z0-9@]', '', 'g') and created_at > now() - interval '24 hours') >= 3
    or (select count(*) from public.rental_inquiries where property_id = unit_property and created_at > now() - interval '1 hour') >= 20
    or (select count(*) from public.rental_inquiries where unit_id = p_unit_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many inquiries right now. Please try again later.' using errcode = '22023';
  end if;
  insert into public.rental_inquiries(id, property_id, unit_id, visitor_name, contact, message)
    values (p_id, unit_property, p_unit_id, btrim(p_name), btrim(p_contact), coalesce(p_message, ''));
end $function$;

create or replace function public.mark_inquiry_handled(p_property_id uuid, p_inquiry_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  update public.rental_inquiries set handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, auth.uid())
    where id = p_inquiry_id and property_id = p_property_id;
  if not found then raise exception 'Inquiry unavailable' using errcode = '22023'; end if;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason) values (p_property_id, auth.uid(), 'inquiry_handled', p_inquiry_id, 'Visitor inquiry marked handled');
end $function$;

create or replace function public.post_due_rent_now(p_property_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.properties;
begin
  perform private.cash_lock(p_property_id);
  select * into p from public.properties where id = p_property_id;
  if not p.auto_rent or p.auto_rent_by is null then return 0; end if;
  return private.post_rent_month(p_property_id, date_trunc('month', (now() at time zone 'Asia/Manila'))::date, auth.uid()); -- the person who pressed the button is the actor, not whoever switched automatic rent on
end $function$;

alter table public.rent_charges add constraint rent_charges_finite_dates check (isfinite(rental_month) and isfinite(due_date));
alter table public.rental_agreements add constraint rental_agreements_finite_move_in check (isfinite(move_in));

commit;
