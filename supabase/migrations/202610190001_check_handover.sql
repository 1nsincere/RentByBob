-- Basic check register and collection handover evidence. Tenant balances change
-- only when an owner records bank-confirmed check clearance.
begin;

create table public.check_reference_counters (
  property_id uuid primary key references public.properties(id) on delete restrict,
  last_value bigint not null check (last_value > 0)
);
create table public.check_records (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  agreement_id uuid not null,
  reference text not null,
  amount numeric(14,2) not null check(amount > 0),
  received_on date not null,
  check_date date not null,
  collector text not null check(collector in ('Bob','James')),
  status text not null check(status in ('received','deposited','cleared','returned','reversed')) default 'received',
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  deposited_by uuid references auth.users(id), deposited_at timestamptz,
  cleared_by uuid references auth.users(id), cleared_at timestamptz,
  returned_by uuid references auth.users(id), returned_at timestamptz,
  reversed_by uuid references auth.users(id), reversed_at timestamptz,
  foreign key(property_id,agreement_id) references public.rental_agreements(property_id,id),
  unique(property_id,id), unique(property_id,reference),
  check ((status <> 'deposited') or (deposited_by is not null and deposited_at is not null)),
  check ((status <> 'cleared') or (cleared_by is not null and cleared_at is not null)),
  check ((status <> 'returned') or (returned_by is not null and returned_at is not null)),
  check ((status <> 'reversed') or (reversed_by is not null and reversed_at is not null))
);
create table public.check_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  check_id uuid not null,
  request_id uuid not null,
  actor_id uuid not null references auth.users(id),
  action text not null check(action in ('received','deposited','cleared','returned','reversed')),
  reason text not null check(length(btrim(reason)) between 1 and 500),
  occurred_at timestamptz not null default now(),
  foreign key(property_id,check_id) references public.check_records(property_id,id) on delete restrict,
  unique(property_id,request_id)
);
create table public.check_allocations (
  property_id uuid not null,
  check_id uuid not null,
  charge_id uuid not null,
  amount numeric(14,2) not null check(amount > 0),
  primary key(check_id,charge_id),
  foreign key(property_id,check_id) references public.check_records(property_id,id),
  foreign key(property_id,charge_id) references public.rent_charges(property_id,id)
);
create index check_records_property_status_idx on public.check_records(property_id,status,received_on);
create index check_allocations_charge_idx on public.check_allocations(charge_id);
create index check_events_check_idx on public.check_events(check_id,occurred_at);

create table public.collection_handovers (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  clerk_id uuid not null references auth.users(id),
  handover_on date not null,
  expected_cash numeric(14,2) not null check(expected_cash >= 0),
  expected_checks numeric(14,2) not null check(expected_checks >= 0),
  actual_cash numeric(14,2) not null check(actual_cash >= 0),
  actual_checks numeric(14,2) not null check(actual_checks >= 0),
  difference_reason text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique(property_id,id),
  check ((expected_cash=actual_cash and expected_checks=actual_checks) or length(btrim(coalesce(difference_reason,''))) between 1 and 500)
);
create table public.handover_events (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  handover_id uuid not null,
  actor_id uuid not null references auth.users(id),
  action text not null check(action='recorded'),
  occurred_at timestamptz not null default now(),
  foreign key(property_id,handover_id) references public.collection_handovers(property_id,id) on delete restrict
);

do $$ declare t text; begin
 foreach t in array array['check_reference_counters','check_records','check_events','check_allocations','collection_handovers','handover_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  if t not in ('check_reference_counters') then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy staff_finance_read on public.%I for select to authenticated using(private.staff_role(property_id) is not null)',t);
  end if;
 end loop;
end $$;
revoke all on sequence public.check_events_id_seq, public.handover_events_id_seq from public,anon,authenticated;

create function public.record_rent_check(p_property_id uuid,p_id uuid,p_agreement_id uuid,p_amount numeric,p_received_on date,p_check_date date,p_collector text)
returns text language plpgsql security definer set search_path='' as $$
declare old public.check_records; a public.rental_agreements; next_ref bigint; ref text;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'clerk' then raise exception 'Clerk MFA required' using errcode='42501'; end if;
 select * into old from public.check_records where id=p_id;
 if found then
  if old.property_id=p_property_id and old.agreement_id=p_agreement_id and old.amount=p_amount and old.received_on=p_received_on and old.check_date=p_check_date and old.collector=p_collector then return old.reference; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 select * into a from public.rental_agreements where id=p_agreement_id and property_id=p_property_id;
 if not found or p_id is null or p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2)
 or p_received_on is null or p_received_on<date '1900-01-01' or p_received_on>(now() at time zone 'Asia/Manila')::date
 or p_check_date is null or p_check_date<date '1900-01-01'
 or p_collector is null or p_collector not in ('Bob','James') then raise exception 'Invalid check record' using errcode='22023'; end if;
 insert into public.check_reference_counters(property_id,last_value) values(p_property_id,1)
 on conflict(property_id) do update set last_value=public.check_reference_counters.last_value+1 returning last_value into next_ref;
 ref:='CHK-'||lpad(next_ref::text,4,'0');
 insert into public.check_records(id,property_id,agreement_id,reference,amount,received_on,check_date,collector,received_by)
 values(p_id,p_property_id,p_agreement_id,ref,p_amount,p_received_on,p_check_date,p_collector,auth.uid());
 insert into public.check_events(property_id,check_id,request_id,actor_id,action,reason) values(p_property_id,p_id,p_id,auth.uid(),'received','Physical check recorded; not settled');
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_check_received',p_id,a.tenant_id,'Physical check received; balance unchanged');
 return ref;
end $$;

create function public.transition_rent_check(p_property_id uuid,p_id uuid,p_check_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.check_records; a public.rental_agreements; c record; prior public.check_events; left_to_apply numeric(14,2); part numeric(14,2); event_reason text;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode='42501'; end if;
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
 if p_action='reversed' and (r.status<>'cleared' or private.staff_role(p_property_id)<>'owner') then raise exception 'Only a cleared check can be reversed by owner' using errcode='42501'; end if;
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
end $$;

create function public.record_collection_handover(p_property_id uuid,p_id uuid,p_clerk_id uuid,p_handover_on date,p_expected_cash numeric,p_expected_checks numeric,p_actual_cash numeric,p_actual_checks numeric,p_difference_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.collection_handovers;
begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode='42501'; end if;
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
end $$;

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
 if left_to_apply>0 then raise exception 'Amount exceeds unpaid rent; advance credit is not configured' using errcode='22023'; end if;
 select coalesce(sum(ch.amount),0)-(select coalesce(sum(al.amount),0) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.check_allocations al join public.rent_charges ch on ch.id=al.charge_id join public.check_records cr on cr.id=al.check_id and cr.status='cleared' where ch.agreement_id=a.id) into balance from public.rent_charges ch where ch.agreement_id=a.id;
 select jsonb_build_object('number','RBB-'||r.id::text,'title','Cash Payment Acknowledgment','payment_id',r.id,'tenant',t.display_name,'building',b.label,'room',u.label,'property',p.name,'amount',r.amount::text,'received_on',r.received_on,'collector',r.collector,'issued_at',now(),'verified_by',auth.uid(),'balance_at_issuance',balance::text,'currency','PHP','notice','Payment acknowledgment only. Not an official tax receipt.','allocations',(select jsonb_agg(jsonb_build_object('month',ch.rental_month,'amount',al.amount::text) order by ch.due_date,ch.id) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where al.cash_id=r.id)) into snapshot from public.tenants t join public.units u on u.id=a.unit_id join public.buildings b on b.id=u.building_id join public.properties p on p.id=a.property_id where t.id=a.tenant_id;
 update public.cash_records set confirmed_by=auth.uid(),confirmed_at=now(),acknowledgment=snapshot where id=r.id;
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_cash_confirmed',r.id,a.tenant_id,'Cash settled, oldest rent allocated, acknowledgment issued');
 return snapshot;
end $$;

create or replace function public.read_rent_workspace(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode='42501'; end if;
 return jsonb_build_object(
 'agreements',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'unit_id',a.unit_id,'move_in',a.move_in,'rent',a.rent::text,'balance',((select coalesce(sum(ch.amount),0) from public.rent_charges ch where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.check_allocations al join public.check_records cr on cr.id=al.check_id and cr.status='cleared' join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id))::text)) from public.rental_agreements a where a.property_id=p_property_id),'[]'::jsonb),
 'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'rental_month',c.rental_month,'due_date',c.due_date,'amount',c.amount::text,'remaining',(c.amount-coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id=c.id),0)-coalesce((select sum(al.amount) from public.check_allocations al join public.check_records cr on cr.id=al.check_id and cr.status='cleared' where al.charge_id=c.id),0))::text) order by c.due_date,c.id) from public.rent_charges c where c.property_id=p_property_id),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'amount',c.amount::text,'received_on',c.received_on,'collector',c.collector,'confirmed_at',c.confirmed_at,'acknowledgment',c.acknowledgment) order by c.received_on desc,c.id) from public.cash_records c where c.property_id=p_property_id),'[]'::jsonb),
 'checks',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'reference',c.reference,'amount',c.amount::text,'received_on',c.received_on,'check_date',c.check_date,'collector',c.collector,'status',c.status,'received_by',c.received_by,'received_at',c.received_at,'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'actor_id',e.actor_id,'occurred_at',e.occurred_at) order by e.occurred_at,e.id),'[]'::jsonb) from public.check_events e where e.check_id=c.id)) order by c.received_on desc,c.reference) from public.check_records c where c.property_id=p_property_id),'[]'::jsonb),
 'handovers',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'clerk_id',h.clerk_id,'handover_on',h.handover_on,'expected_cash',h.expected_cash::text,'expected_checks',h.expected_checks::text,'actual_cash',h.actual_cash::text,'actual_checks',h.actual_checks::text,'difference_reason',h.difference_reason,'recorded_by',h.recorded_by,'recorded_at',h.recorded_at) order by h.handover_on desc,h.recorded_at desc) from public.collection_handovers h where h.property_id=p_property_id),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'label',u.label,'building_id',u.building_id)) from public.units u where u.property_id=p_property_id and u.archived_at is null),'[]'::jsonb),
 'buildings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label)) from public.buildings b where b.property_id=p_property_id),'[]'::jsonb),
 'verifiers',coalesce((select jsonb_agg(jsonb_build_object('user_id',v.user_id)) from public.cash_verifiers v where v.property_id=p_property_id),'[]'::jsonb),
 'clerks',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id)) from public.staff_memberships m where m.property_id=p_property_id and m.role='clerk' and m.revoked_at is null),'[]'::jsonb));
end $$;

revoke all on function public.record_rent_check(uuid,uuid,uuid,numeric,date,date,text),public.transition_rent_check(uuid,uuid,uuid,text,text),public.record_collection_handover(uuid,uuid,uuid,date,numeric,numeric,numeric,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.record_rent_check(uuid,uuid,uuid,numeric,date,date,text),public.transition_rent_check(uuid,uuid,uuid,text,text),public.record_collection_handover(uuid,uuid,uuid,date,numeric,numeric,numeric,numeric,text) to authenticated;
commit;
