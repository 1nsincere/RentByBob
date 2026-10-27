-- Renter "Report a payment" (user request 27 Oct 2026). A renter tells the property they paid their collector.
-- A report is only a notice: it never changes a balance and is not pending cash. Staff check that the cash arrived,
-- then either record it as pending cash (the usual verifier confirmation still applies) or mark it not received
-- with a reason. Only renters linked to the tenant may report, for their own agreements; reports are rate-limited.
begin;

create table public.renter_payment_reports (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  agreement_id uuid not null references public.rental_agreements(id) on delete restrict,
  reported_by uuid not null references auth.users(id),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  paid_on date not null,
  paid_to text not null check (paid_to in ('Bob', 'James', 'Other')),
  note text not null default '' check (length(note) <= 300),
  status text not null default 'new' check (status in ('new', 'recorded', 'dismissed')),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  handled_note text check (handled_note is null or length(btrim(handled_note)) between 1 and 300),
  cash_id uuid references public.cash_records(id),
  created_at timestamptz not null default now(),
  check ((status = 'new') = (handled_at is null) and (status = 'new') = (handled_by is null)),
  check (status <> 'recorded' or cash_id is not null),
  check (status <> 'dismissed' or handled_note is not null)
);
create index renter_payment_reports_property_idx on public.renter_payment_reports(property_id, status, created_at desc);
create index renter_payment_reports_agreement_idx on public.renter_payment_reports(agreement_id, created_at desc);
alter table public.renter_payment_reports enable row level security;
revoke all on public.renter_payment_reports from public, anon, authenticated;
grant select on public.renter_payment_reports to authenticated;
create policy staff_read on public.renter_payment_reports for select to authenticated using (private.staff_role(property_id) is not null);

-- True when the signed-in user is an active renter contact for the agreement's tenant.
create function private.renter_owns_agreement(p_agreement_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rental_agreements a
    join public.tenants t on t.id = a.tenant_id and t.archived_at is null
    join public.tenant_contacts c on c.tenant_id = t.id and c.user_id = (select auth.uid()) and c.revoked_at is null
    where a.id = p_agreement_id)
$$;
revoke all on function private.renter_owns_agreement(uuid) from public, anon, authenticated, service_role;

create function public.report_rent_payment(p_id uuid, p_agreement_id uuid, p_amount numeric, p_paid_on date, p_paid_to text, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements; prior public.renter_payment_reports; today date := (now() at time zone 'Asia/Manila')::date;
begin
  if auth.uid() is null or not private.renter_owns_agreement(p_agreement_id) then
    raise exception 'Only the renter of this room can report a payment' using errcode = '42501';
  end if;
  select * into a from public.rental_agreements where id = p_agreement_id;
  perform 1 from public.properties where id = a.property_id for update;
  select * into prior from public.renter_payment_reports where id = p_id;
  if found then
    if prior.agreement_id = p_agreement_id and prior.amount = p_amount and prior.paid_on = p_paid_on and prior.paid_to = p_paid_to and prior.reported_by = auth.uid() then return p_id; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  if p_id is null or p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount, 2)
    or p_paid_on is null or p_paid_on > today or p_paid_on < today - 90
    or p_paid_to is null or p_paid_to not in ('Bob', 'James', 'Other') or length(coalesce(p_note, '')) > 300 then
    raise exception 'Enter the amount, a date within the last 90 days (not in the future), and who received it' using errcode = '22023';
  end if;
  if (select count(*) from public.renter_payment_reports where agreement_id = p_agreement_id and status = 'new') >= 5
    or (select count(*) from public.renter_payment_reports where reported_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many reports are waiting. Please wait for the property to check them.' using errcode = '22023';
  end if;
  insert into public.renter_payment_reports(id, property_id, agreement_id, reported_by, amount, paid_on, paid_to, note)
    values (p_id, a.property_id, a.id, auth.uid(), p_amount, p_paid_on, p_paid_to, btrim(coalesce(p_note, '')));
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (a.property_id, auth.uid(), 'renter_payment_reported', p_id, a.tenant_id, 'Renter reported a payment; balance unchanged until staff record and confirm it');
  return p_id;
end $$;

-- The renter's own reports (newest first) for agreements they are linked to.
create function public.read_my_payment_reports() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'agreement_id', r.agreement_id, 'amount', r.amount::text, 'paid_on', r.paid_on,
    'paid_to', r.paid_to, 'note', r.note, 'status', r.status, 'handled_note', r.handled_note, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
  from public.renter_payment_reports r
  where private.renter_owns_agreement(r.agreement_id) and r.created_at > now() - interval '180 days'
$$;

-- Staff: reports still to check, plus those handled in the last 30 days.
create function public.read_payment_reports(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'agreement_id', r.agreement_id, 'amount', r.amount::text, 'paid_on', r.paid_on,
    'paid_to', r.paid_to, 'note', r.note, 'status', r.status, 'handled_note', r.handled_note, 'cash_id', r.cash_id, 'created_at', r.created_at)
    order by (r.status = 'new') desc, r.created_at desc)
    from public.renter_payment_reports r
    where r.property_id = p_property_id and (r.status = 'new' or r.handled_at > now() - interval '30 days')), '[]'::jsonb);
end $$;

-- Staff: link a report to the cash they recorded for it, or mark it not received (reason required).
create function public.resolve_payment_report(p_property_id uuid, p_report_id uuid, p_action text, p_cash_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.renter_payment_reports;
begin
  perform private.cash_lock(p_property_id);
  select * into r from public.renter_payment_reports where id = p_report_id and property_id = p_property_id for update;
  if not found then raise exception 'Report unavailable' using errcode = '22023'; end if;
  if r.status <> 'new' then
    if r.status = p_action and (p_action <> 'recorded' or r.cash_id = p_cash_id) then return; end if;
    raise exception 'This report was already handled' using errcode = '22023';
  end if;
  if p_action = 'recorded' then
    if p_cash_id is null or not exists (select 1 from public.cash_records c where c.id = p_cash_id and c.agreement_id = r.agreement_id and c.property_id = p_property_id) then
      raise exception 'Record the cash for this room first' using errcode = '22023';
    end if;
    update public.renter_payment_reports set status = 'recorded', cash_id = p_cash_id, handled_by = auth.uid(), handled_at = now(),
      handled_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
  elsif p_action = 'dismissed' then
    if p_note is null or length(btrim(p_note)) not between 1 and 300 then raise exception 'Give a reason' using errcode = '22023'; end if;
    update public.renter_payment_reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now(), handled_note = btrim(p_note) where id = r.id;
  else
    raise exception 'Choose recorded or dismissed' using errcode = '22023';
  end if;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), 'renter_payment_report_' || p_action, r.id, coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Recorded as cash'));
end $$;

revoke all on function public.report_rent_payment(uuid, uuid, numeric, date, text, text), public.read_my_payment_reports(),
  public.read_payment_reports(uuid), public.resolve_payment_report(uuid, uuid, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.report_rent_payment(uuid, uuid, numeric, date, text, text), public.read_my_payment_reports(),
  public.read_payment_reports(uuid), public.resolve_payment_report(uuid, uuid, text, uuid, text) to authenticated;
commit;
