-- Owner decisions 27 Oct 2026:
-- 1. Automatic monthly rent: on the 1st of each month (Philippine date) every current agreement gets that month's
--    rent, due on its usual anniversary day, exactly as add_rent_month computes it. Owner switch per property
--    (off by default); each charge is created once per agreement and month; nothing after a move-out month.
-- 2. Room change while still renting: same agreement, rent, due day and balance continue; only the room changes
--    from a chosen date; the history is kept.
-- 3. Remove tenant: hides a tenant (after move-out) from every list; their records stay for reports and audit.
begin;

-- 1. Automatic monthly rent -------------------------------------------------------------------------------
alter table public.properties add column auto_rent boolean not null default false;
alter table public.properties add column auto_rent_by uuid references auth.users(id);

-- Posts one Philippine month for one property (callers hold the property lock). Returns how many were created.
create function private.post_rent_month(p_property_id uuid, p_month date, p_actor uuid) returns integer
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
    end if;
  end loop;
  return created;
end $$;
revoke all on function private.post_rent_month(uuid, date, uuid) from public, anon, authenticated, service_role;

-- Scheduled entry point (and catch-up): posts the current Philippine month for every property with automatic rent on.
create function private.post_due_rent() returns integer
language plpgsql security definer set search_path = '' as $$
declare p public.properties; total integer := 0; month date := date_trunc('month', (now() at time zone 'Asia/Manila'))::date;
begin
  for p in select * from public.properties where auto_rent and auto_rent_by is not null for update loop
    total := total + private.post_rent_month(p.id, month, p.auto_rent_by);
  end loop;
  return total;
end $$;
revoke all on function private.post_due_rent() from public, anon, authenticated, service_role;

-- Staff catch-up when Payments opens (in case the scheduler did not run). Returns the number of charges created.
create function public.post_due_rent_now(p_property_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare p public.properties;
begin
  perform private.cash_lock(p_property_id);
  select * into p from public.properties where id = p_property_id;
  if not p.auto_rent or p.auto_rent_by is null then return 0; end if;
  return private.post_rent_month(p_property_id, date_trunc('month', (now() at time zone 'Asia/Manila'))::date, p.auto_rent_by);
end $$;

-- Owner switch. Turning it on posts the current month straight away (once), so nobody waits for the 1st.
create function public.set_auto_rent(p_property_id uuid, p_enabled boolean) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Choose on or off' using errcode = '22023'; end if;
  update public.properties set auto_rent = p_enabled, auto_rent_by = case when p_enabled then auth.uid() else auto_rent_by end where id = p_property_id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_enabled then 'auto_rent_enabled' else 'auto_rent_disabled' end, p_property_id,
      'Automatic monthly rent ' || case when p_enabled then 'turned on' else 'turned off' end);
  if p_enabled then return private.post_rent_month(p_property_id, date_trunc('month', (now() at time zone 'Asia/Manila'))::date, auth.uid()); end if;
  return 0;
end $$;

-- Hourly schedule where pg_cron is available (Supabase). Posting is idempotent, so extra runs change nothing.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rentbybob-post-due-rent', '5 * * * *', 'select private.post_due_rent()');
  end if;
exception when others then
  raise notice 'pg_cron is unavailable; automatic rent posts when staff open Payments (post_due_rent_now).';
end $$;

-- 2. Room change ------------------------------------------------------------------------------------------
create table public.agreement_room_changes (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  agreement_id uuid not null references public.rental_agreements(id) on delete restrict,
  from_unit_id uuid not null references public.units(id) on delete restrict,
  to_unit_id uuid not null references public.units(id) on delete restrict,
  effective_on date not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
alter table public.agreement_room_changes enable row level security;
revoke all on public.agreement_room_changes from public, anon, authenticated;
grant select on public.agreement_room_changes to authenticated;
create policy staff_read on public.agreement_room_changes for select to authenticated using (private.staff_role(property_id) is not null);

create function public.change_agreement_room(p_property_id uuid, p_id uuid, p_agreement_id uuid, p_unit_id uuid, p_effective date, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements; prior public.agreement_room_changes; today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform private.cash_lock(p_property_id);
  select * into prior from public.agreement_room_changes where id = p_id;
  if found then
    if prior.agreement_id = p_agreement_id and prior.to_unit_id = p_unit_id and prior.effective_on = p_effective then return p_id; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id for update;
  if not found or a.ended_on is not null then raise exception 'Choose a current room agreement' using errcode = '22023'; end if;
  if p_id is null or p_effective is null or p_effective < a.move_in or p_effective > today
    or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Choose a move date between move-in and today, and give a reason' using errcode = '22023';
  end if;
  if p_unit_id = a.unit_id or not exists (select 1 from public.units u join public.buildings b on b.id = u.building_id
      where u.id = p_unit_id and u.property_id = p_property_id and u.archived_at is null and b.archived_at is null and u.kind <> 'shared') then
    raise exception 'Choose a different active rentable room' using errcode = '22023';
  end if;
  if exists (select 1 from public.rental_agreements r where r.unit_id = p_unit_id and r.id <> a.id and (r.ended_on is null or r.ended_on >= p_effective)) then
    raise exception 'That room already has an agreement' using errcode = '22023';
  end if;
  insert into public.agreement_room_changes(id, property_id, agreement_id, from_unit_id, to_unit_id, effective_on, reason, changed_by)
    values (p_id, p_property_id, a.id, a.unit_id, p_unit_id, p_effective, btrim(p_reason), auth.uid());
  update public.rental_agreements set unit_id = p_unit_id where id = a.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'rental_room_changed', a.id, a.tenant_id, btrim(p_reason));
  return p_id;
end $$;

-- 3. Remove tenant ----------------------------------------------------------------------------------------
alter table public.tenants add column removed_at timestamptz;

create function public.remove_tenant(p_tenant_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is distinct from 'owner' then raise exception 'Access denied' using errcode = '42501'; end if;
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
end $$;

revoke all on function public.post_due_rent_now(uuid), public.set_auto_rent(uuid, boolean),
  public.change_agreement_room(uuid, uuid, uuid, uuid, date, text), public.remove_tenant(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.post_due_rent_now(uuid), public.set_auto_rent(uuid, boolean),
  public.change_agreement_room(uuid, uuid, uuid, uuid, date, text), public.remove_tenant(uuid, text) to authenticated;
commit;
