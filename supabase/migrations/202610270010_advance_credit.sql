-- Advance payments (user request 27 Oct 2026): confirmed cash above the rent owed is kept as advance credit on the
-- same agreement and pays the next rent months automatically, oldest payment first, as soon as each month's rent
-- is added (manually or automatically). Nothing else changes: pending cash still never reduces a balance; the
-- verifier still confirms; reversing a payment also reopens any months its credit paid. Credit is never paid out
-- by the app (refunds are handled outside it). Credit = confirmed, unreversed cash minus what it has paid.
begin;

-- Unused advance credit for one agreement.
create function private.agreement_credit(p_agreement_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(c.amount - coalesce((select sum(al.amount) from public.cash_allocations al where al.cash_id = c.id), 0)), 0)
  from public.cash_records c
  where c.agreement_id = p_agreement_id and c.confirmed_at is not null
    and not exists (select 1 from public.cash_reversals v where v.cash_id = c.id)
$$;
revoke all on function private.agreement_credit(uuid) from public, anon, authenticated, service_role;

-- Pays open rent months from unused credit: oldest month first, from the oldest payment first. Callers hold the lock.
create function private.apply_credit(p_property_id uuid, p_agreement_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ch record; cash record; owed numeric(14,2); part numeric(14,2);
begin
  for ch in select c.id, c.amount from public.rent_charges c where c.agreement_id = p_agreement_id order by c.due_date, c.id loop
    owed := ch.amount
      - coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id = ch.id), 0)
      - coalesce((select sum(al.amount) from public.check_allocations al join public.check_records cr on cr.id = al.check_id and cr.status = 'cleared' where al.charge_id = ch.id), 0);
    continue when owed <= 0;
    for cash in select c.id, c.amount - coalesce((select sum(al.amount) from public.cash_allocations al where al.cash_id = c.id), 0) as unused
      from public.cash_records c
      where c.agreement_id = p_agreement_id and c.confirmed_at is not null
        and not exists (select 1 from public.cash_reversals v where v.cash_id = c.id)
      order by c.received_on, c.confirmed_at, c.id loop
      continue when cash.unused <= 0;
      part := least(owed, cash.unused);
      insert into public.cash_allocations(property_id, cash_id, charge_id, amount) values (p_property_id, cash.id, ch.id, part)
        on conflict (cash_id, charge_id) do update set amount = public.cash_allocations.amount + excluded.amount;
      owed := owed - part;
      exit when owed <= 0;
    end loop;
  end loop;
end $$;
revoke all on function private.apply_credit(uuid, uuid) from public, anon, authenticated, service_role;

-- Confirmation: as before, but any amount above the rent owed becomes advance credit instead of being refused.
create or replace function public.confirm_rent_cash(p_property_id uuid,p_cash_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cash_records; a public.rental_agreements; c record; left_to_apply numeric(14,2); part numeric(14,2); balance numeric(14,2); snapshot jsonb;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'clerk' or not exists(select 1 from public.cash_verifiers where property_id=p_property_id and user_id=auth.uid()) then raise exception 'Designated cash verifier with MFA required' using errcode='42501'; end if;
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
end $$;

-- Adding a month (manual): unchanged, then pays it from any advance credit.
create or replace function public.add_rent_month(p_property_id uuid,p_id uuid,p_agreement_id uuid,p_month date)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.rental_agreements; old public.rent_charges; due date;
begin
 perform private.cash_lock(p_property_id);
 select * into a from public.rental_agreements where id=p_agreement_id and property_id=p_property_id;
 if not found or p_id is null or p_month is null or extract(day from p_month)<>1 or p_month<date_trunc('month',a.move_in)::date then raise exception 'Invalid rental month' using errcode='22023'; end if;
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
end $$;

-- Automatic monthly rent: unchanged, then pays each new month from any advance credit.
create or replace function private.post_rent_month(p_property_id uuid, p_month date, p_actor uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements; created integer := 0; charge_id uuid;
begin
  for a in select * from public.rental_agreements r
    where r.property_id = p_property_id and date_trunc('month', r.move_in)::date <= p_month
      and (r.ended_on is null or p_month <= r.ended_on)
      and not exists (select 1 from public.rent_charges c where c.agreement_id = r.id and c.rental_month = p_month)
  loop
    charge_id := gen_random_uuid();
    insert into public.rent_charges(id, property_id, agreement_id, rental_month, due_date, amount)
      values (charge_id, p_property_id, a.id, p_month,
        p_month + (least(extract(day from a.move_in)::int, extract(day from (p_month + interval '1 month - 1 day'))::int) - 1), a.rent)
      on conflict (agreement_id, rental_month) do nothing;
    if found then
      created := created + 1;
      insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
        values (p_property_id, p_actor, 'rent_charge_created', charge_id, a.tenant_id, 'Automatic monthly rent from agreement terms');
      perform private.apply_credit(p_property_id, a.id);
    end if;
  end loop;
  return created;
end $$;
revoke all on function private.post_rent_month(uuid, date, uuid) from public, anon, authenticated, service_role;

-- Reversal: unchanged, then lets other unused credit pay the months that reopened.
create or replace function public.reverse_rent_cash(p_property_id uuid, p_id uuid, p_cash_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.cash_records; prior public.cash_reversals; a public.rental_agreements; snapshot jsonb;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode = '42501'; end if;
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
end $$;

-- Staff: unused advance credit per agreement (only agreements that have some).
create function public.read_agreement_credits(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(a.id, private.agreement_credit(a.id)::text) from public.rental_agreements a
    where a.property_id = p_property_id and private.agreement_credit(a.id) > 0), '{}'::jsonb);
end $$;

-- Renter: unused advance credit on their own agreements only.
create function public.read_renter_credits() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(a.id, private.agreement_credit(a.id)::text), '{}'::jsonb)
  from public.rental_agreements a
  join public.tenant_contacts tc on tc.tenant_id = a.tenant_id and tc.user_id = (select auth.uid()) and tc.revoked_at is null
  join public.tenants t on t.id = a.tenant_id and t.archived_at is null
  where private.agreement_credit(a.id) > 0
$$;

revoke all on function public.read_agreement_credits(uuid), public.read_renter_credits() from public, anon, authenticated, service_role;
grant execute on function public.read_agreement_credits(uuid), public.read_renter_credits() to authenticated;
commit;
