-- Monthly maintenance costs (owner request, 28 Oct 2026): staff record what was spent on upkeep for a month (what it was
-- for and the amount); the totals appear in the monthly report PDF. These are expenses only: they never change a tenant
-- balance, rent charge, payment or allocation. An entry is never edited or deleted: a mistake is voided with a reason
-- (by the owner, or by the staff member who entered it) and re-entered. Every change is audited.
begin;

create table public.maintenance_expenses (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  expense_month date not null check (extract(day from expense_month) = 1),
  description text not null check (length(btrim(description)) between 1 and 200),
  place text check (place is null or length(btrim(place)) between 1 and 100),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid references auth.users(id), void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  check ((voided_at is null) = (voided_by is null) and (voided_at is null) = (void_reason is null))
);
create index maintenance_expenses_month_idx on public.maintenance_expenses (property_id, expense_month);
alter table public.maintenance_expenses enable row level security;
revoke all on public.maintenance_expenses from public, anon, authenticated, service_role;

-- Retrying with the same id and details is harmless; the same id with different details is refused.
create function public.record_maintenance_expense(p_property_id uuid, p_id uuid, p_month date, p_description text, p_place text, p_amount numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    if old.property_id = p_property_id and old.expense_month = p_month and old.description = btrim(p_description) and old.place is not distinct from place and old.amount = p_amount and old.recorded_by = auth.uid() then return p_id; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  insert into public.maintenance_expenses(id, property_id, expense_month, description, place, amount, recorded_by) values (p_id, p_property_id, p_month, btrim(p_description), place, p_amount, auth.uid());
  insert into public.audit_events(property_id, actor_id, action, target_id, reason) values (p_property_id, auth.uid(), 'maintenance_expense_recorded', p_id, 'Maintenance for ' || to_char(p_month, 'YYYY-MM') || ': ' || btrim(p_description));
  return p_id;
end $$;

create function public.void_maintenance_expense(p_property_id uuid, p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.maintenance_expenses; role text;
begin
  perform private.cash_lock(p_property_id);
  role := private.staff_role(p_property_id);
  if role is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'A reason is required' using errcode = '22023'; end if;
  select * into e from public.maintenance_expenses where id = p_id and property_id = p_property_id for update;
  if not found then raise exception 'Expense unavailable' using errcode = '22023'; end if;
  if e.voided_at is not null then return; end if;
  if role <> 'owner' and e.recorded_by <> auth.uid() then raise exception 'Only the owner or the person who entered it can void this' using errcode = '42501'; end if;
  update public.maintenance_expenses set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason) where id = e.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason) values (p_property_id, auth.uid(), 'maintenance_expense_voided', e.id, btrim(p_reason));
end $$;

-- Entries (not voided) for the months from..to, newest month first. At most 36 months at a time.
create function public.read_maintenance_expenses(p_property_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_from > p_to or p_to > p_from + interval '36 months' then raise exception 'Choose up to 36 months' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'month', to_char(e.expense_month, 'YYYY-MM'), 'description', e.description, 'place', e.place,
      'amount', e.amount::text, 'recorded_by', e.recorded_by, 'recorded_at', e.recorded_at) order by e.expense_month desc, e.recorded_at, e.id)
    from public.maintenance_expenses e where e.property_id = p_property_id and e.voided_at is null
      and e.expense_month >= date_trunc('month', p_from)::date and e.expense_month <= date_trunc('month', p_to)::date), '[]'::jsonb);
end $$;

revoke all on function public.record_maintenance_expense(uuid, uuid, date, text, text, numeric), public.void_maintenance_expense(uuid, uuid, text),
  public.read_maintenance_expenses(uuid, date, date) from public, anon, authenticated, service_role;
grant execute on function public.record_maintenance_expense(uuid, uuid, date, text, text, numeric), public.void_maintenance_expense(uuid, uuid, text),
  public.read_maintenance_expenses(uuid, date, date) to authenticated;
commit;
