-- Cash-only foundation. Apply only after isolated and live PostgreSQL checks.
begin;
create table public.cash_verifiers (
 property_id uuid primary key references public.properties(id),
 user_id uuid not null references auth.users(id),
 assigned_at timestamptz not null default now()
);
create table public.rental_agreements (
 id uuid primary key, property_id uuid not null references public.properties(id),
 tenant_id uuid not null, unit_id uuid not null references public.units(id),
 move_in date not null check(move_in >= date '1900-01-01'),
 rent numeric(14,2) not null check(rent > 0),
 created_at timestamptz not null default now(),
 foreign key(property_id,tenant_id) references public.tenants(property_id,id),
 unique(unit_id), unique(property_id,id)
);
create table public.rent_charges (
 id uuid primary key, property_id uuid not null, agreement_id uuid not null,
 rental_month date not null check(extract(day from rental_month)=1),
 due_date date not null, amount numeric(14,2) not null check(amount>0),
 created_at timestamptz not null default now(),
 foreign key(property_id,agreement_id) references public.rental_agreements(property_id,id),
 unique(agreement_id,rental_month), unique(property_id,id)
);
create table public.cash_records (
 id uuid primary key, property_id uuid not null, agreement_id uuid not null,
 amount numeric(14,2) not null check(amount>0), received_on date not null,
 collector text not null check(collector in ('Bob','James')),
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now(),
 confirmed_by uuid references auth.users(id), confirmed_at timestamptz, acknowledgment jsonb,
 foreign key(property_id,agreement_id) references public.rental_agreements(property_id,id),
 check((confirmed_at is null and confirmed_by is null and acknowledgment is null) or
       (confirmed_at is not null and confirmed_by is not null and acknowledgment is not null)),
 unique(property_id,id)
);
create table public.cash_allocations (
 property_id uuid not null, cash_id uuid not null, charge_id uuid not null,
 amount numeric(14,2) not null check(amount>0), primary key(cash_id,charge_id),
 foreign key(property_id,cash_id) references public.cash_records(property_id,id),
 foreign key(property_id,charge_id) references public.rent_charges(property_id,id)
);
create index rent_charges_property_idx on public.rent_charges(property_id,agreement_id,due_date);
create index cash_records_property_idx on public.cash_records(property_id,agreement_id,received_on);
create index cash_allocations_charge_idx on public.cash_allocations(charge_id);
do $$ declare t text; begin
 foreach t in array array['cash_verifiers','rental_agreements','rent_charges','cash_records','cash_allocations'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy staff_finance_read on public.%I for select to authenticated using(private.staff_role(property_id) is not null)',t);
 end loop;
end $$;

create function private.cash_lock(p_property uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform 1 from public.properties where id=p_property for update;
 if private.staff_role(p_property) is null then raise exception 'Staff MFA required' using errcode='42501'; end if;
end $$;
revoke all on function private.cash_lock(uuid) from public,anon,authenticated,service_role;

create function public.assign_cash_verifier(p_property_id uuid,p_user_id uuid,p_email text)
returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode='42501'; end if;
 if not exists(select 1 from auth.users u join public.staff_memberships m on m.user_id=u.id
   where u.id=p_user_id and lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null
   and m.property_id=p_property_id and m.role='clerk' and m.revoked_at is null) then
  raise exception 'Select an active confirmed clerk by exact identity' using errcode='22023';
 end if;
 insert into public.cash_verifiers(property_id,user_id) values(p_property_id,p_user_id)
 on conflict(property_id) do update set user_id=excluded.user_id,assigned_at=now();
 insert into public.audit_events(property_id,actor_id,action,target_id,reason)
 values(p_property_id,auth.uid(),'cash_verifier_assigned',p_user_id,'Identity-confirmed cash verifier assigned');
end $$;

create function public.create_rental_agreement(p_property_id uuid,p_id uuid,p_tenant_id uuid,p_unit_id uuid,p_move_in date,p_rent numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.rental_agreements;
begin
 perform private.cash_lock(p_property_id);
 if p_id is null or p_move_in is null or p_move_in<date '1900-01-01' or p_rent is null or p_rent<=0 or p_rent>=1000000000000 or p_rent<>round(p_rent,2) then raise exception 'Invalid agreement' using errcode='22023'; end if;
 select * into old from public.rental_agreements where id=p_id;
 if found then
  if old.property_id=p_property_id and old.tenant_id=p_tenant_id and old.unit_id=p_unit_id and old.move_in=p_move_in and old.rent=p_rent then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 if not exists(select 1 from public.tenants where id=p_tenant_id and property_id=p_property_id and archived_at is null)
 or not exists(select 1 from public.units u join public.buildings b on b.id=u.building_id where u.id=p_unit_id and u.property_id=p_property_id and u.archived_at is null and b.archived_at is null) then
  raise exception 'Choose an active tenant and room in this property' using errcode='22023';
 end if;
 insert into public.rental_agreements(id,property_id,tenant_id,unit_id,move_in,rent) values(p_id,p_property_id,p_tenant_id,p_unit_id,p_move_in,p_rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rental_agreement_created',p_id,p_tenant_id,'One responsible tenant for room rent');
 return p_id;
end $$;

create function public.add_rent_month(p_property_id uuid,p_id uuid,p_agreement_id uuid,p_month date)
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
 due := p_month + (least(extract(day from a.move_in)::int,extract(day from (p_month+interval '1 month - 1 day'))::int)-1);
 insert into public.rent_charges(id,property_id,agreement_id,rental_month,due_date,amount) values(p_id,p_property_id,p_agreement_id,p_month,due,a.rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_charge_created',p_id,a.tenant_id,'Monthly rent from agreement terms');
 return p_id;
end $$;

create function public.record_rent_cash(p_property_id uuid,p_id uuid,p_agreement_id uuid,p_amount numeric,p_received_on date,p_collector text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.rental_agreements; old public.cash_records;
begin
 perform private.cash_lock(p_property_id);
 select * into a from public.rental_agreements where id=p_agreement_id and property_id=p_property_id;
 if not found or p_id is null or p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2)
 or p_received_on is null or p_received_on<date '1900-01-01' or p_received_on>(now() at time zone 'Asia/Manila')::date
 or p_collector is null or p_collector not in ('Bob','James') then raise exception 'Invalid cash record' using errcode='22023'; end if;
 select * into old from public.cash_records where id=p_id;
 if found then
  if old.property_id=p_property_id and old.agreement_id=p_agreement_id and old.amount=p_amount and old.received_on=p_received_on and old.collector=p_collector then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 insert into public.cash_records(id,property_id,agreement_id,amount,received_on,collector,recorded_by) values(p_id,p_property_id,p_agreement_id,p_amount,p_received_on,p_collector,auth.uid());
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_cash_reported',p_id,a.tenant_id,'Cash pending verification; no balance reduction');
 return p_id;
end $$;

create function public.confirm_rent_cash(p_property_id uuid,p_cash_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cash_records; a public.rental_agreements; c record; left_to_apply numeric(14,2); part numeric(14,2); balance numeric(14,2); snapshot jsonb;
begin
 -- All financial mutations lock this property first. Serializes agreement/charge/report/confirmation operations.
 perform private.cash_lock(p_property_id);
 if private.staff_role(p_property_id) is distinct from 'clerk' or not exists(select 1 from public.cash_verifiers where property_id=p_property_id and user_id=auth.uid()) then raise exception 'Designated cash verifier with MFA required' using errcode='42501'; end if;
 select * into r from public.cash_records where id=p_cash_id and property_id=p_property_id for update;
 if not found then raise exception 'Cash record unavailable' using errcode='22023'; end if;
 if r.confirmed_at is not null then return r.acknowledgment; end if;
 select * into a from public.rental_agreements where id=r.agreement_id;
 left_to_apply:=r.amount;
 for c in select ch.id,ch.amount-coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id=ch.id),0) as owed
   from public.rent_charges ch where ch.agreement_id=r.agreement_id order by ch.due_date,ch.id loop
  part:=least(left_to_apply,c.owed);
  if part>0 then insert into public.cash_allocations(property_id,cash_id,charge_id,amount) values(p_property_id,p_cash_id,c.id,part); left_to_apply:=left_to_apply-part; end if;
 end loop;
 if left_to_apply>0 then raise exception 'Amount exceeds unpaid rent; advance credit is not configured' using errcode='22023'; end if;
 select coalesce(sum(amount),0)-(select coalesce(sum(al.amount),0) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id)
 into balance from public.rent_charges where agreement_id=a.id;
 select jsonb_build_object('number','RBB-'||r.id::text,'title','Cash Payment Acknowledgment','payment_id',r.id,
  'tenant',t.display_name,'building',b.label,'room',u.label,'property',p.name,'amount',r.amount::text,
  'received_on',r.received_on,'collector',r.collector,'issued_at',now(),'verified_by',auth.uid(),
  'balance_at_issuance',balance::text,'currency','PHP','notice','Payment acknowledgment only. Not an official tax receipt.',
  'allocations',(select jsonb_agg(jsonb_build_object('month',ch.rental_month,'amount',al.amount::text) order by ch.due_date,ch.id)
    from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where al.cash_id=r.id))
 into snapshot from public.tenants t join public.units u on u.id=a.unit_id join public.buildings b on b.id=u.building_id join public.properties p on p.id=a.property_id where t.id=a.tenant_id;
 update public.cash_records set confirmed_by=auth.uid(),confirmed_at=now(),acknowledgment=snapshot where id=r.id;
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rent_cash_confirmed',r.id,a.tenant_id,'Cash settled, oldest rent allocated, acknowledgment issued');
 return snapshot;
end $$;

revoke all on function public.assign_cash_verifier(uuid,uuid,text), public.create_rental_agreement(uuid,uuid,uuid,uuid,date,numeric), public.add_rent_month(uuid,uuid,uuid,date), public.record_rent_cash(uuid,uuid,uuid,numeric,date,text), public.confirm_rent_cash(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.assign_cash_verifier(uuid,uuid,text), public.create_rental_agreement(uuid,uuid,uuid,uuid,date,numeric), public.add_rent_month(uuid,uuid,uuid,date), public.record_rent_cash(uuid,uuid,uuid,numeric,date,text), public.confirm_rent_cash(uuid,uuid) to authenticated;
create function public.read_rent_workspace(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode='42501'; end if;
 return jsonb_build_object(
 'agreements',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'unit_id',a.unit_id,'move_in',a.move_in,'rent',a.rent::text,
 'balance',((select coalesce(sum(ch.amount),0) from public.rent_charges ch where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id))::text)) from public.rental_agreements a where a.property_id=p_property_id),'[]'::jsonb),
 'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'rental_month',c.rental_month,'due_date',c.due_date,'amount',c.amount::text,'remaining',(c.amount-coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id=c.id),0))::text) order by c.due_date,c.id) from public.rent_charges c where c.property_id=p_property_id),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'amount',c.amount::text,'received_on',c.received_on,'collector',c.collector,'confirmed_at',c.confirmed_at,'acknowledgment',c.acknowledgment) order by c.received_on desc,c.id) from public.cash_records c where c.property_id=p_property_id),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'label',u.label,'building_id',u.building_id)) from public.units u where u.property_id=p_property_id and u.archived_at is null),'[]'::jsonb),
 'buildings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label)) from public.buildings b where b.property_id=p_property_id),'[]'::jsonb),
 'verifiers',coalesce((select jsonb_agg(jsonb_build_object('user_id',v.user_id)) from public.cash_verifiers v where v.property_id=p_property_id),'[]'::jsonb));
end $$;
revoke all on function public.read_rent_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_rent_workspace(uuid) to authenticated;
commit;
