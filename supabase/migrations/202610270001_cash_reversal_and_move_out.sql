-- Owner-only reversal of confirmed cash (reason required) and owner-recorded move-out.
-- Reversal moves the payment's rent-month allocations into an append-only reversal record, so every
-- existing balance formula (staff, renter, confirmation, check clearance) reopens the rent automatically.
-- The original cash record and its acknowledgment are never edited or deleted.
-- Move-out: full months only (no proration), no deposit handling, unpaid rent stays owed on the ended
-- agreement, no charge may be added for a month after the move-out date, and the room can take a new agreement.
begin;

create table public.cash_reversals (
  cash_id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  request_id uuid not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  reversed_by uuid not null references auth.users(id),
  reversed_at timestamptz not null default now(),
  allocations jsonb not null,
  foreign key (property_id, cash_id) references public.cash_records(property_id, id) on delete restrict,
  unique (property_id, request_id)
);
alter table public.cash_reversals enable row level security;
revoke all on public.cash_reversals from public, anon, authenticated;
grant select on public.cash_reversals to authenticated;
create policy staff_finance_read on public.cash_reversals for select to authenticated using (private.staff_role(property_id) is not null);

alter table public.rental_agreements
  add column ended_on date,
  add column end_reason text,
  add column ended_by uuid references auth.users(id),
  add column ended_at timestamptz,
  add column end_request_id uuid unique,
  add constraint rental_agreements_end_consistent check (
    (ended_on is null and end_reason is null and ended_by is null and ended_at is null and end_request_id is null) or
    (ended_on is not null and ended_on >= move_in and length(btrim(end_reason)) between 1 and 500 and ended_by is not null and ended_at is not null and end_request_id is not null));
-- One open agreement per room; ended agreements keep their history and free the room.
alter table public.rental_agreements drop constraint rental_agreements_unit_id_key;
create unique index rental_agreements_open_unit_idx on public.rental_agreements(unit_id) where ended_on is null;

create function public.reverse_rent_cash(p_property_id uuid, p_id uuid, p_cash_id uuid, p_reason text)
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
end $$;

create function public.end_rental_agreement(p_property_id uuid, p_id uuid, p_agreement_id uuid, p_end_date date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode = '42501'; end if;
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
end $$;

create or replace function public.create_rental_agreement(p_property_id uuid,p_id uuid,p_tenant_id uuid,p_unit_id uuid,p_move_in date,p_rent numeric)
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
 -- A room can take a new agreement only after the previous one has ended before the new move-in date.
 if exists(select 1 from public.rental_agreements where unit_id=p_unit_id and (ended_on is null or ended_on>=p_move_in)) then
  raise exception 'This room already has an agreement for that date' using errcode='22023';
 end if;
 insert into public.rental_agreements(id,property_id,tenant_id,unit_id,move_in,rent) values(p_id,p_property_id,p_tenant_id,p_unit_id,p_move_in,p_rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rental_agreement_created',p_id,p_tenant_id,'One responsible tenant for room rent');
 return p_id;
end $$;

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
 return p_id;
end $$;

create or replace function public.read_rent_workspace(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode='42501'; end if;
 return jsonb_build_object(
 'agreements',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'unit_id',a.unit_id,'move_in',a.move_in,'rent',a.rent::text,'ended_on',a.ended_on,'end_reason',a.end_reason,'balance',((select coalesce(sum(ch.amount),0) from public.rent_charges ch where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.cash_allocations al join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id)-(select coalesce(sum(al.amount),0) from public.check_allocations al join public.check_records cr on cr.id=al.check_id and cr.status='cleared' join public.rent_charges ch on ch.id=al.charge_id where ch.agreement_id=a.id))::text)) from public.rental_agreements a where a.property_id=p_property_id),'[]'::jsonb),
 'charges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'rental_month',c.rental_month,'due_date',c.due_date,'amount',c.amount::text,'remaining',(c.amount-coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id=c.id),0)-coalesce((select sum(al.amount) from public.check_allocations al join public.check_records cr on cr.id=al.check_id and cr.status='cleared' where al.charge_id=c.id),0))::text) order by c.due_date,c.id) from public.rent_charges c where c.property_id=p_property_id),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'amount',c.amount::text,'received_on',c.received_on,'collector',c.collector,'confirmed_at',c.confirmed_at,'acknowledgment',c.acknowledgment,'reversal',(select jsonb_build_object('reason',v.reason,'reversed_at',v.reversed_at) from public.cash_reversals v where v.cash_id=c.id)) order by c.received_on desc,c.id) from public.cash_records c where c.property_id=p_property_id),'[]'::jsonb),
 'checks',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'agreement_id',c.agreement_id,'reference',c.reference,'amount',c.amount::text,'received_on',c.received_on,'check_date',c.check_date,'collector',c.collector,'status',c.status,'received_by',c.received_by,'received_at',c.received_at,'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'reason',e.reason,'actor_id',e.actor_id,'occurred_at',e.occurred_at) order by e.occurred_at,e.id),'[]'::jsonb) from public.check_events e where e.check_id=c.id)) order by c.received_on desc,c.reference) from public.check_records c where c.property_id=p_property_id),'[]'::jsonb),
 'handovers',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'clerk_id',h.clerk_id,'handover_on',h.handover_on,'expected_cash',h.expected_cash::text,'expected_checks',h.expected_checks::text,'actual_cash',h.actual_cash::text,'actual_checks',h.actual_checks::text,'difference_reason',h.difference_reason,'recorded_by',h.recorded_by,'recorded_at',h.recorded_at) order by h.handover_on desc,h.recorded_at desc) from public.collection_handovers h where h.property_id=p_property_id),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'label',u.label,'building_id',u.building_id)) from public.units u where u.property_id=p_property_id and u.archived_at is null),'[]'::jsonb),
 'buildings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label)) from public.buildings b where b.property_id=p_property_id),'[]'::jsonb),
 'verifiers',coalesce((select jsonb_agg(jsonb_build_object('user_id',v.user_id)) from public.cash_verifiers v where v.property_id=p_property_id),'[]'::jsonb),
 'clerks',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id)) from public.staff_memberships m where m.property_id=p_property_id and m.role='clerk' and m.revoked_at is null),'[]'::jsonb));
end $$;

create or replace function public.read_renter_account() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  return jsonb_build_object('tenants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'display_name', t.display_name,
      'kind', t.kind,
      'property', p.name,
      'agreements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'building', b.label,
          'room', u.label,
          'move_in', a.move_in,
          'ended_on', a.ended_on,
          'rent', a.rent::text,
          'balance', (
            (select coalesce(sum(ch.amount), 0) from public.rent_charges ch where ch.agreement_id = a.id)
            - (select coalesce(sum(al.amount), 0) from public.cash_allocations al join public.rent_charges ch on ch.id = al.charge_id where ch.agreement_id = a.id)
            - (select coalesce(sum(al.amount), 0) from public.check_allocations al join public.check_records cr on cr.id = al.check_id and cr.status = 'cleared' join public.rent_charges ch on ch.id = al.charge_id where ch.agreement_id = a.id)
          )::text,
          'charges', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', c.id,
              'rental_month', c.rental_month,
              'due_date', c.due_date,
              'amount', c.amount::text,
              'remaining', (c.amount
                - coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id = c.id), 0)
                - coalesce((select sum(al.amount) from public.check_allocations al join public.check_records cr on cr.id = al.check_id and cr.status = 'cleared' where al.charge_id = c.id), 0))::text
            ) order by c.due_date, c.id)
            from public.rent_charges c where c.agreement_id = a.id), '[]'::jsonb),
          'payments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'kind', 'cash',
              'id', cr.id,
              'amount', cr.amount::text,
              'received_on', cr.received_on,
              'confirmed_at', cr.confirmed_at,
              'months', coalesce((select jsonb_agg(jsonb_build_object('month', ch.rental_month, 'amount', al.amount::text) order by ch.due_date, ch.id)
                from public.cash_allocations al join public.rent_charges ch on ch.id = al.charge_id where al.cash_id = cr.id), '[]'::jsonb),
              'acknowledgment', cr.acknowledgment - 'verified_by'
            ) order by cr.received_on desc, cr.id)
            from public.cash_records cr where cr.agreement_id = a.id and cr.confirmed_at is not null
              and not exists (select 1 from public.cash_reversals v where v.cash_id = cr.id)), '[]'::jsonb)
            || coalesce((
            select jsonb_agg(jsonb_build_object(
              'kind', 'check',
              'id', k.id,
              'reference', k.reference,
              'amount', k.amount::text,
              'received_on', k.received_on,
              'confirmed_at', k.cleared_at,
              'months', coalesce((select jsonb_agg(jsonb_build_object('month', ch.rental_month, 'amount', al.amount::text) order by ch.due_date, ch.id)
                from public.check_allocations al join public.rent_charges ch on ch.id = al.charge_id where al.check_id = k.id), '[]'::jsonb)
            ) order by k.received_on desc, k.reference)
            from public.check_records k where k.agreement_id = a.id and k.status = 'cleared'), '[]'::jsonb),
          'unconfirmed', coalesce((
            select jsonb_agg(jsonb_build_object('kind', 'cash', 'id', cr.id, 'amount', cr.amount::text, 'received_on', cr.received_on) order by cr.received_on desc, cr.id)
            from public.cash_records cr where cr.agreement_id = a.id and cr.confirmed_at is null), '[]'::jsonb)
            || coalesce((
            select jsonb_agg(jsonb_build_object('kind', 'check', 'id', k.id, 'reference', k.reference, 'amount', k.amount::text, 'received_on', k.received_on, 'status', k.status) order by k.received_on desc, k.reference)
            from public.check_records k where k.agreement_id = a.id and k.status in ('received', 'deposited')), '[]'::jsonb)
        ) order by a.move_in, a.id)
        from public.rental_agreements a
        join public.units u on u.id = a.unit_id
        join public.buildings b on b.id = u.building_id
        where a.tenant_id = t.id), '[]'::jsonb)
    ) order by t.display_name, t.id)
    from public.tenants t
    join public.properties p on p.id = t.property_id
    where t.archived_at is null
      and exists (select 1 from public.tenant_contacts c where c.tenant_id = t.id and c.user_id = uid and c.revoked_at is null)
  ), '[]'::jsonb));
end $$;

revoke all on function public.reverse_rent_cash(uuid, uuid, uuid, text), public.end_rental_agreement(uuid, uuid, uuid, date, text) from public, anon, authenticated, service_role;
grant execute on function public.reverse_rent_cash(uuid, uuid, uuid, text), public.end_rental_agreement(uuid, uuid, uuid, date, text) to authenticated;
commit;
