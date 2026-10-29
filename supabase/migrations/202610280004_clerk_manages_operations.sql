-- The clerk runs the rental system day to day; the owner oversees (owner request, 28 Oct 2026). Operational actions that
-- were owner-only now work for any signed-in staff member (owner or clerk, with the authenticator code or a remembered
-- device): removing or archiving tenants, move-outs, reversing a confirmed payment, check deposit/clearing/return/
-- reversal, collection handovers, the automatic rent and listing switches, building layout and room renames, and
-- voiding maintenance entries. Cash confirmation (the approval) now belongs to every clerk, not one designated verifier.
-- Still owner-only on purpose: who may sign in (invitations, assigning or disabling staff and renter access, the
-- access history) and designating a verifier. Nothing here weakens MFA: staff_role() still requires it.
begin;

create or replace function public.archive_tenant(p_tenant_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is null then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Give a reason for archiving' using errcode = '22023';
  end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.archived_at is not null then return; end if;
  if exists (
    select 1 from public.rental_agreements a
    where a.tenant_id = target.id
      and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)
  ) then
    raise exception 'Record the move-out before archiving this tenant' using errcode = '22023';
  end if;
  update public.tenants set archived_at = now() where id = target.id;
  update public.tenant_contacts set revoked_at = now() where tenant_id = target.id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), 'tenant_archived', target.id, target.id, btrim(p_reason));
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

create or replace function public.create_property_location(p_property_id uuid, p_id uuid, p_label text, p_building_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_building public.buildings;
  existing_unit public.units;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then
    raise exception 'Staff MFA required' using errcode = '42501';
  end if;
  if p_id is null or p_label is null or length(btrim(p_label)) not between 1 and 200 then
    raise exception 'Invalid location' using errcode = '22023';
  end if;

  select * into existing_building from public.buildings where id = p_id;
  if found then
    if existing_building.property_id = p_property_id
      and existing_building.label = btrim(p_label)
      and p_building_id is null and existing_building.archived_at is null then
      return p_id;
    end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;

  select * into existing_unit from public.units where id = p_id;
  if found then
    if existing_unit.property_id = p_property_id
      and existing_unit.building_id = p_building_id
      and existing_unit.label = btrim(p_label)
      and existing_unit.archived_at is null then
      return p_id;
    end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;

  if p_building_id is null then
    insert into public.buildings(id, property_id, label)
      values (p_id, p_property_id, btrim(p_label));
  else
    if not exists (
      select 1 from public.buildings
      where id = p_building_id and property_id = p_property_id and archived_at is null
    ) then
      raise exception 'Choose an active building or section' using errcode = '22023';
    end if;
    insert into public.units(id, property_id, building_id, label)
      values (p_id, p_property_id, p_building_id, btrim(p_label));
  end if;

  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(),
      case when p_building_id is null then 'building_created' else 'unit_created' end,
      p_id, 'Property directory record created');
  return p_id;
end $function$;

create or replace function public.end_rental_agreement(p_property_id uuid, p_id uuid, p_agreement_id uuid, p_end_date date, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.rental_agreements;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_id is null or p_end_date is null or length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'A move-out date and reason are required' using errcode = '22023'; end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id for update;
  if not found then raise exception 'Agreement unavailable' using errcode = '22023'; end if;
  if a.ended_on is not null then
    if a.end_request_id = p_id and a.ended_on = p_end_date and a.end_reason = btrim(p_reason) then return; end if;
    raise exception 'This agreement already has a move-out date' using errcode = '22023';
  end if;
  if p_end_date < a.move_in or p_end_date > (now() at time zone 'Asia/Manila')::date + 366 then raise exception 'Choose a move-out date on or after move-in and within one year' using errcode = '22023'; end if;
  if exists (select 1 from public.rent_charges where agreement_id = a.id and rental_month > p_end_date) then
    raise exception 'Rent is already recorded for a month after this move-out date' using errcode = '22023';
  end if;
  update public.rental_agreements set ended_on = p_end_date, end_reason = btrim(p_reason), ended_by = auth.uid(), ended_at = now(), end_request_id = p_id where id = a.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'rental_agreement_ended', a.id, a.tenant_id, btrim(p_reason));
end $function$;

create or replace function public.manage_property_location(p_property_id uuid, p_location_id uuid, p_action text, p_label text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  location_property_id uuid;
  building_id uuid;
  current_label text;
  location_archived_at timestamptz;
  is_building boolean := false;
  audit_action text;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then
    raise exception 'Staff MFA required' using errcode = '42501';
  end if;
  if p_location_id is null or p_action is null or p_action not in ('rename', 'archive')
    or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid directory change' using errcode = '22023';
  end if;

  select property_id, label, archived_at
    into location_property_id, current_label, location_archived_at
    from public.buildings where id = p_location_id for update;
  if found then
    is_building := true;
  else
    select u.property_id, u.building_id, u.label, u.archived_at
      into location_property_id, building_id, current_label, location_archived_at
      from public.units u where u.id = p_location_id for update;
    if not found then
      raise exception 'Directory record not found' using errcode = '22023';
    end if;
  end if;
  if location_property_id is distinct from p_property_id then
    raise exception 'Directory record not found' using errcode = '22023';
  end if;

  if p_action = 'rename' then
    if location_archived_at is not null then
      raise exception 'Archived directory records cannot be changed' using errcode = '22023';
    end if;
    if p_label is null or length(btrim(p_label)) not between 1 and 200 then
      raise exception 'Location label must contain 1 to 200 characters' using errcode = '22023';
    end if;
    if btrim(p_label) = current_label then
      return;
    end if;
    if is_building then
      update public.buildings set label = btrim(p_label) where id = p_location_id;
      audit_action := 'building_renamed';
    else
      update public.units set label = btrim(p_label) where id = p_location_id;
      audit_action := 'unit_renamed';
    end if;
  else
    if location_archived_at is not null then
      return;
    end if;
    if is_building then
      update public.buildings set archived_at = now() where id = p_location_id;
      update public.units u set archived_at = now()
        where u.building_id = p_location_id and u.archived_at is null;
      audit_action := 'building_archived';
    else
      update public.units set archived_at = now() where id = p_location_id;
      audit_action := 'unit_archived';
    end if;
  end if;

  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), audit_action, p_location_id, btrim(p_reason));
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
 if p_id is null or p_handover_on is null or p_handover_on>(now() at time zone 'Asia/Manila')::date or p_expected_cash is null or p_expected_cash<0 or p_expected_cash<>round(p_expected_cash,2) or p_expected_checks is null or p_expected_checks<0 or p_expected_checks<>round(p_expected_checks,2) or p_actual_cash is null or p_actual_cash<0 or p_actual_cash<>round(p_actual_cash,2) or p_actual_checks is null or p_actual_checks<0 or p_actual_checks<>round(p_actual_checks,2)
 or not exists(select 1 from public.staff_memberships where property_id=p_property_id and user_id=p_clerk_id and role='clerk' and revoked_at is null) then raise exception 'Invalid collection handover' using errcode='22023'; end if;
 insert into public.collection_handovers(id,property_id,clerk_id,handover_on,expected_cash,expected_checks,actual_cash,actual_checks,difference_reason,recorded_by)
 values(p_id,p_property_id,p_clerk_id,p_handover_on,p_expected_cash,p_expected_checks,p_actual_cash,p_actual_checks,nullif(btrim(p_difference_reason),''),auth.uid());
 insert into public.handover_events(property_id,handover_id,actor_id,action) values(p_property_id,p_id,auth.uid(),'recorded');
 insert into public.audit_events(property_id,actor_id,action,target_id,reason) values(p_property_id,auth.uid(),'collection_handover_recorded',p_id,'Collection handover recorded');
 return p_id;
end $function$;

create or replace function public.remove_tenant(p_tenant_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is null then raise exception 'Access denied' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Give a reason for removing' using errcode = '22023'; end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.removed_at is not null then return; end if;
  if exists (select 1 from public.rental_agreements a where a.tenant_id = target.id
      and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)) then
    raise exception 'Record the move-out before removing this tenant' using errcode = '22023';
  end if;
  update public.tenants set archived_at = coalesce(archived_at, now()), removed_at = now() where id = target.id;
  update public.tenant_contacts set revoked_at = now() where tenant_id = target.id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), 'tenant_removed', target.id, target.id, btrim(p_reason));
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
  if not found then raise exception 'Tenant unavailable' using errcode = '22023'; end if;
  perform private.cash_lock(target.property_id);
  if private.staff_role(target.property_id) is null then raise exception 'Access denied' using errcode = '42501'; end if;
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
end $function$;

create or replace function public.reverse_rent_cash(p_property_id uuid, p_id uuid, p_cash_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.cash_records; prior public.cash_reversals; a public.rental_agreements; snapshot jsonb;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_id is null or length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'A reason is required to reverse a payment' using errcode = '22023'; end if;
  select * into prior from public.cash_reversals where property_id = p_property_id and request_id = p_id;
  if found then
    if prior.cash_id = p_cash_id and prior.reason = btrim(p_reason) and prior.reversed_by = auth.uid() then return; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  select * into r from public.cash_records where id = p_cash_id and property_id = p_property_id for update;
  if not found then raise exception 'Cash record unavailable' using errcode = '22023'; end if;
  if r.confirmed_at is null then raise exception 'Only confirmed cash can be reversed' using errcode = '22023'; end if;
  if exists (select 1 from public.cash_reversals where cash_id = r.id) then raise exception 'This payment is already reversed' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('charge_id', ch.id, 'month', ch.rental_month, 'amount', al.amount::text) order by ch.due_date, ch.id), '[]'::jsonb)
    into snapshot from public.cash_allocations al join public.rent_charges ch on ch.id = al.charge_id where al.cash_id = r.id;
  delete from public.cash_allocations where cash_id = r.id;
  insert into public.cash_reversals(cash_id, property_id, request_id, reason, reversed_by, allocations)
    values (r.id, p_property_id, p_id, btrim(p_reason), auth.uid(), snapshot);
  select * into a from public.rental_agreements where id = r.agreement_id;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'rent_cash_reversed', r.id, a.tenant_id, btrim(p_reason));
  perform private.apply_credit(p_property_id, r.agreement_id);
end $function$;

create or replace function public.set_auto_listing(p_property_id uuid, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Choose on or off' using errcode = '22023'; end if;
  update public.properties set auto_list_vacant = p_enabled where id = p_property_id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_enabled then 'auto_listing_enabled' else 'auto_listing_disabled' end, p_property_id, 'Automatic listing of vacant rooms ' || case when p_enabled then 'turned on' else 'turned off' end);
end $function$;

create or replace function public.set_auto_rent(p_property_id uuid, p_enabled boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Choose on or off' using errcode = '22023'; end if;
  update public.properties set auto_rent = p_enabled, auto_rent_by = case when p_enabled then auth.uid() else auto_rent_by end where id = p_property_id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_enabled then 'auto_rent_enabled' else 'auto_rent_disabled' end, p_property_id,
      'Automatic monthly rent ' || case when p_enabled then 'turned on' else 'turned off' end);
  if p_enabled then return private.post_rent_month(p_property_id, date_trunc('month', (now() at time zone 'Asia/Manila'))::date, auth.uid()); end if;
  return 0;
end $function$;

create or replace function public.setup_property_from_sketch(p_property_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  layout jsonb := '[
    {"slot":"b1","label":"Building 1","units":[["Ground floor","apartment","Apartment"],["Ground floor","room","Room 01"],["Ground floor","room","Room 02"],["Ground floor","room","Room 03"],["Second floor","room","Room 04"],["Second floor","room","Room 05"],["Second floor","room","Room 06"],["Second floor","room","Room 07"],["Second floor","room","Room 08"],["Second floor","room","Room 09"]]},
    {"slot":"b2","label":"Building 2","units":[["Ground floor","shared","Gym"],["Ground floor","room","Room 01"],["Ground floor","room","Room 02"],["Ground floor","room","Room 03"],["Second floor","room","Room 04"],["Second floor","room","Room 05"],["Second floor","room","Room 06"],["Second floor","room","Room 07"],["Second floor","room","Room 08"]]},
    {"slot":"bob","label":"Bob''s house","units":[[null,"room","Room 01"],[null,"room","Room 02"],[null,"room","Room 03"],[null,"room","Room 04"],[null,"room","Room 05"],[null,"room","Room 06"]]},
    {"slot":"house","label":"House 1","units":[[null,"house","Whole house"]]},
    {"slot":"yamaha","label":"Yamaha property","units":[[null,"commercial","Commercial space"]]},
    {"slot":"store1","label":"Store 1","units":[[null,"commercial","Shop"]]},
    {"slot":"store2","label":"Store 2","units":[[null,"commercial","Shop"]]},
    {"slot":"store3","label":"Store 3","units":[[null,"commercial","Shop"]]}
  ]';
  item jsonb; unit_item jsonb; target_building uuid;
  buildings_created int := 0; buildings_matched int := 0; units_created int := 0; units_existing int := 0;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  for item in select * from jsonb_array_elements(layout) loop
    select b.id into target_building from public.buildings b
      where b.property_id = p_property_id and b.archived_at is null and b.sketch_slot = item->>'slot';
    if target_building is null then
      select b.id into target_building from public.buildings b
        where b.property_id = p_property_id and b.archived_at is null and b.sketch_slot is null and b.label = item->>'label';
      if target_building is not null then
        update public.buildings set sketch_slot = item->>'slot' where id = target_building;
        buildings_matched := buildings_matched + 1;
      else
        target_building := gen_random_uuid();
        insert into public.buildings(id, property_id, label, sketch_slot) values (target_building, p_property_id, item->>'label', item->>'slot');
        buildings_created := buildings_created + 1;
      end if;
    else
      buildings_matched := buildings_matched + 1;
    end if;
    for unit_item in select * from jsonb_array_elements(item->'units') loop
      if exists (select 1 from public.units u where u.building_id = target_building and u.archived_at is null and u.label = unit_item->>2) then
        units_existing := units_existing + 1;
      else
        insert into public.units(id, property_id, building_id, label, floor_label, kind)
          values (gen_random_uuid(), p_property_id, target_building, unit_item->>2, unit_item->>0, unit_item->>1);
        units_created := units_created + 1;
      end if;
    end loop;
    target_building := null;
  end loop;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), 'property_layout_setup', p_property_id,
      format('Sketch layout applied: %s buildings created, %s matched; %s rooms created, %s already existed', buildings_created, buildings_matched, units_created, units_existing));
  return jsonb_build_object('buildings_created', buildings_created, 'buildings_matched', buildings_matched, 'units_created', units_created, 'units_existing', units_existing);
end $function$;

create or replace function public.transition_rent_check(p_property_id uuid, p_id uuid, p_check_id uuid, p_action text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.check_records; a public.rental_agreements; c record; prior public.check_events; left_to_apply numeric(14,2); part numeric(14,2); event_reason text;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode='42501'; end if;
 if p_id is null then raise exception 'Request identifier required' using errcode='22023'; end if;
 select * into prior from public.check_events where property_id=p_property_id and request_id=p_id;
 if found then
  if prior.check_id=p_check_id and prior.action=p_action and prior.reason=coalesce(nullif(btrim(p_reason),''),'Owner recorded '||p_action) and prior.actor_id=auth.uid() then return; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 select * into r from public.check_records where id=p_check_id and property_id=p_property_id for update;
 if not found or p_action not in ('deposited','cleared','returned','reversed') or length(btrim(coalesce(p_reason,'')))>500 or (p_action='reversed' and length(btrim(coalesce(p_reason,'')))=0) then raise exception 'Invalid check transition' using errcode='22023'; end if;
 if r.status=p_action then return; end if;
 if p_action='deposited' and r.status<>'received' then raise exception 'Only received checks can be marked deposited' using errcode='22023'; end if;
 if p_action='cleared' and r.status<>'deposited' then raise exception 'Only deposited checks can be cleared after bank confirmation' using errcode='22023'; end if;
 if p_action='returned' and r.status not in ('received','deposited','cleared') then raise exception 'Check cannot be returned from this status' using errcode='22023'; end if;
 if p_action='reversed' and r.status<>'cleared' then raise exception 'Only a cleared check can be reversed' using errcode='42501'; end if;
 event_reason:=coalesce(nullif(btrim(p_reason),''),'Owner recorded '||p_action);
 if p_action='cleared' then
  select * into a from public.rental_agreements where id=r.agreement_id;
  left_to_apply:=r.amount;
  for c in select ch.id,ch.amount-coalesce((select sum(x.amount) from public.cash_allocations x where x.charge_id=ch.id),0)-coalesce((select sum(y.amount) from public.check_allocations y join public.check_records q on q.id=y.check_id where y.charge_id=ch.id and q.status='cleared'),0) as remaining
   from public.rent_charges ch where ch.agreement_id=r.agreement_id order by ch.due_date,ch.id for update loop
   part:=least(left_to_apply,c.remaining);
   if part>0 then insert into public.check_allocations(property_id,check_id,charge_id,amount) values(p_property_id,r.id,c.id,part); left_to_apply:=left_to_apply-part; end if;
  end loop;
  if left_to_apply>0 then raise exception 'Amount exceeds unpaid rent; excess check credit is not configured' using errcode='22023'; end if;
  update public.check_records set status='cleared',cleared_by=auth.uid(),cleared_at=now() where id=r.id;
 elsif p_action='deposited' then update public.check_records set status='deposited',deposited_by=auth.uid(),deposited_at=now() where id=r.id;
 elsif p_action='returned' then update public.check_records set status='returned',returned_by=auth.uid(),returned_at=now() where id=r.id;
 else update public.check_records set status='reversed',reversed_by=auth.uid(),reversed_at=now() where id=r.id;
 end if;
 select * into a from public.rental_agreements where id=r.agreement_id;
 insert into public.check_events(property_id,check_id,request_id,actor_id,action,reason) values(p_property_id,r.id,p_id,auth.uid(),p_action,event_reason);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_check_'||p_action,r.id,a.tenant_id,event_reason);
end $function$;

create or replace function public.void_maintenance_expense(p_property_id uuid, p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.maintenance_expenses; role text;
begin
  perform private.cash_lock(p_property_id);
  role := private.staff_role(p_property_id);
  if role is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'A reason is required' using errcode = '22023'; end if;
  select * into e from public.maintenance_expenses where id = p_id and property_id = p_property_id for update;
  if not found then raise exception 'Expense unavailable' using errcode = '22023'; end if;
  if e.voided_at is not null then return; end if;
  update public.maintenance_expenses set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = e.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason) values (p_property_id, auth.uid(), 'maintenance_expense_voided', e.id, btrim(p_reason));
end $function$;

commit;
