-- Past rent months copied from the paper notebook, and move-in dates that are only a best guess (owner request,
-- 28 Oct 2026: tenants were already living here before this app, so the exact move-in date and the months owed may
-- not be known). Months are first entered as "waiting for a double check": they are NOT rent charges, so they never
-- change a balance, late-rent list or reminder. A different staff member (clerk or owner) must double check them
-- against the notebook; only then are they turned into ordinary rent charges (the same add_rent_month rules apply, and
-- any unused advance credit pays them). Every entry records which notebook notes it came from.
begin;

alter table public.rental_agreements
  add column move_in_estimated boolean not null default false,
  add column move_in_flagged_by uuid references auth.users(id);

create table public.rent_month_drafts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  agreement_id uuid not null,
  rental_month date not null check (extract(day from rental_month) = 1),
  source_note text not null check (length(btrim(source_note)) between 3 and 500),
  entered_by uuid not null references auth.users(id),
  entered_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting', 'confirmed', 'removed')),
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  reason text check (reason is null or length(btrim(reason)) between 1 and 500),
  foreign key (property_id, agreement_id) references public.rental_agreements (property_id, id),
  check ((status = 'waiting') = (checked_by is null)),
  check (status <> 'confirmed' or checked_by <> entered_by)
);
create unique index rent_month_drafts_waiting_idx on public.rent_month_drafts (agreement_id, rental_month) where status = 'waiting';
alter table public.rent_month_drafts enable row level security;
revoke all on public.rent_month_drafts from public, anon, authenticated, service_role;

-- Enter past months from the notebook. Months already charged or already waiting are skipped and counted.
create function public.draft_rent_months(p_property_id uuid, p_agreement_id uuid, p_months date[], p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements; m date; this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date; added int := 0; skipped int := 0; new_id uuid;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_note, ''))) not between 3 and 500 then raise exception 'Say which notebook notes these months come from' using errcode = '22023'; end if;
  if p_months is null or cardinality(p_months) not between 1 and 36 then raise exception 'Choose between 1 and 36 months' using errcode = '22023'; end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id;
  if not found then raise exception 'Rental account unavailable' using errcode = '22023'; end if;
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
end $$;

-- The double check: a different staff member turns the waiting months into ordinary rent charges, all or none.
create function public.confirm_rent_month_drafts(p_property_id uuid, p_draft_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
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
    perform public.add_rent_month(p_property_id, gen_random_uuid(), d.agreement_id, d.rental_month);
    update public.rent_month_drafts set status = 'confirmed', checked_by = auth.uid(), checked_at = now() where public.rent_month_drafts.id = d.id;
    select * into a from public.rental_agreements where public.rental_agreements.id = d.agreement_id;
    insert into public.audit_events (property_id, actor_id, action, target_id, tenant_id, reason)
      values (p_property_id, auth.uid(), 'rent_month_double_checked', d.id, a.tenant_id, 'Past month confirmed against the notebook: ' || d.source_note);
    confirmed := confirmed + 1;
  end loop;
  return confirmed;
end $$;

-- Remove entries that turned out wrong (any staff member, including the one who entered them; a reason is required).
create function public.remove_rent_month_drafts(p_property_id uuid, p_draft_ids uuid[], p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare d public.rent_month_drafts; a public.rental_agreements; removed int := 0; draft_id uuid;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'A reason is required' using errcode = '22023'; end if;
  if p_draft_ids is null or cardinality(p_draft_ids) not between 1 and 36 then raise exception 'Choose between 1 and 36 months' using errcode = '22023'; end if;
  for draft_id in select distinct x from unnest(p_draft_ids) as x order by x loop
    select * into d from public.rent_month_drafts where public.rent_month_drafts.id = draft_id and property_id = p_property_id for update;
    if not found then raise exception 'Month unavailable' using errcode = '22023'; end if;
    if d.status = 'removed' then continue; end if;
    if d.status <> 'waiting' then raise exception 'Confirmed months cannot be removed here' using errcode = '22023'; end if;
    update public.rent_month_drafts set status = 'removed', checked_by = auth.uid(), checked_at = now(), reason = btrim(p_reason) where public.rent_month_drafts.id = d.id;
    select * into a from public.rental_agreements where public.rental_agreements.id = d.agreement_id;
    insert into public.audit_events (property_id, actor_id, action, target_id, tenant_id, reason)
      values (p_property_id, auth.uid(), 'rent_month_entry_removed', d.id, a.tenant_id, btrim(p_reason));
    removed := removed + 1;
  end loop;
  return removed;
end $$;

-- A best-guess move-in date is flagged; a different staff member later confirms it from the notes. Descriptive only:
-- it never changes rent, charges or due dates.
create function public.flag_move_in_estimate(p_property_id uuid, p_agreement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id for update;
  if not found then raise exception 'Rental account unavailable' using errcode = '22023'; end if;
  if a.move_in_estimated then return; end if;
  update public.rental_agreements set move_in_estimated = true, move_in_flagged_by = auth.uid() where id = a.id;
  insert into public.audit_events (property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'move_in_marked_estimate', a.id, a.tenant_id, 'Move-in date is a best guess and needs a double check');
end $$;

create function public.confirm_move_in_date(p_property_id uuid, p_agreement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements;
begin
  perform private.cash_lock(p_property_id);
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id for update;
  if not found then raise exception 'Rental account unavailable' using errcode = '22023'; end if;
  if not a.move_in_estimated then return; end if;
  if a.move_in_flagged_by = auth.uid() then raise exception 'A different staff member must double check the move-in date' using errcode = '42501'; end if;
  update public.rental_agreements set move_in_estimated = false where id = a.id;
  insert into public.audit_events (property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'move_in_date_double_checked', a.id, a.tenant_id, 'Move-in date confirmed against the notebook');
end $$;

-- Staff view: months waiting for a double check and agreements whose move-in date is a guess.
create function public.read_rent_review(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'drafts', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'agreement_id', d.agreement_id, 'month', to_char(d.rental_month, 'YYYY-MM'),
        'rent', a.rent::text, 'source_note', d.source_note, 'entered_by', d.entered_by, 'entered_at', d.entered_at) order by d.rental_month, d.entered_at)
      from public.rent_month_drafts d join public.rental_agreements a on a.id = d.agreement_id
      where d.property_id = p_property_id and d.status = 'waiting'), '[]'::jsonb),
    'estimated', coalesce((select jsonb_object_agg(a.id, a.move_in_flagged_by) from public.rental_agreements a
      where a.property_id = p_property_id and a.move_in_estimated), '{}'::jsonb));
end $$;

revoke all on function public.draft_rent_months(uuid, uuid, date[], text), public.confirm_rent_month_drafts(uuid, uuid[]),
  public.remove_rent_month_drafts(uuid, uuid[], text), public.flag_move_in_estimate(uuid, uuid), public.confirm_move_in_date(uuid, uuid),
  public.read_rent_review(uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_rent_months(uuid, uuid, date[], text), public.confirm_rent_month_drafts(uuid, uuid[]),
  public.remove_rent_month_drafts(uuid, uuid[], text), public.flag_move_in_estimate(uuid, uuid), public.confirm_move_in_date(uuid, uuid),
  public.read_rent_review(uuid) to authenticated;
commit;
