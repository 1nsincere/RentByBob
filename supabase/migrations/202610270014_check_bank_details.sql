-- Bank name and check number on received checks (original brief, section 12: capture bank name and check number;
-- never bank account numbers or check photos). Descriptive only: no amount, status or balance changes. Staff fill
-- them when recording the check or later; a value once saved is not overwritten (fill-in only), and each save is audited.
begin;

alter table public.check_records
  add column bank_name text check (bank_name is null or length(btrim(bank_name)) between 1 and 80),
  add column check_number text check (check_number is null or check_number ~ '^[0-9A-Za-z-]{1,30}$');

create function public.record_check_details(p_property_id uuid, p_reference text, p_bank_name text, p_check_number text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.check_records; bank text := nullif(btrim(coalesce(p_bank_name, '')), ''); num text := nullif(btrim(coalesce(p_check_number, '')), '');
begin
  perform private.cash_lock(p_property_id);
  select * into c from public.check_records where property_id = p_property_id and reference = p_reference for update;
  if not found then raise exception 'Check unavailable' using errcode = '22023'; end if;
  if bank is null and num is null then raise exception 'Enter the bank name or the check number' using errcode = '22023'; end if;
  if (bank is not null and length(bank) > 80) or (num is not null and num !~ '^[0-9A-Za-z-]{1,30}$') then
    raise exception 'Use up to 80 characters for the bank and only letters, digits or dashes for the check number' using errcode = '22023';
  end if;
  if (c.bank_name is not null and bank is not null and c.bank_name <> bank) or (c.check_number is not null and num is not null and c.check_number <> num) then
    raise exception 'These check details were already saved differently' using errcode = '22023';
  end if;
  if c.bank_name is not distinct from coalesce(bank, c.bank_name) and c.check_number is not distinct from coalesce(num, c.check_number) then return; end if;
  update public.check_records set bank_name = coalesce(c.bank_name, bank), check_number = coalesce(c.check_number, num) where id = c.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), 'rent_check_details_recorded', c.id, 'Bank name / check number recorded; amounts and status unchanged');
end $$;

-- Staff: bank details by check id, for checks that have any.
create function public.read_check_details(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(c.id::text, jsonb_build_object('bank_name', c.bank_name, 'check_number', c.check_number))
    from public.check_records c where c.property_id = p_property_id and (c.bank_name is not null or c.check_number is not null)), '{}'::jsonb);
end $$;

-- Staff: sign-in emails of this property's current staff, so check history and the handover form show people by
-- email instead of account numbers. Only staff of the same property, and only current owner/clerk memberships.
create function public.read_staff_names(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(m.user_id::text, u.email) from public.staff_memberships m join auth.users u on u.id = m.user_id
    where m.property_id = p_property_id and m.revoked_at is null), '{}'::jsonb);
end $$;

revoke all on function public.record_check_details(uuid, text, text, text), public.read_check_details(uuid), public.read_staff_names(uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_check_details(uuid, text, text, text), public.read_check_details(uuid), public.read_staff_names(uuid) to authenticated;
commit;
