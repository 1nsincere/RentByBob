begin;

-- The ID-only operations remain implementation details, not browser entry points.
revoke execute on function public.set_staff_access(uuid,uuid,text,text),
  public.set_tenant_contact(uuid,uuid,boolean,text) from authenticated, anon, public, service_role;

-- Minimal self-only routing information, including before staff reaches AAL2.
-- No property, tenant, other identity or financial details are returned here.
create function public.my_access_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'staff_mfa_required', exists(select 1 from public.staff_memberships m
      where m.user_id=auth.uid() and m.revoked_at is null),
    'state', case
      when exists(select 1 from public.staff_memberships m where m.user_id=auth.uid() and m.revoked_at is null)
        or exists(select 1 from public.tenant_contacts c join public.tenants t on t.id=c.tenant_id
          where c.user_id=auth.uid() and c.revoked_at is null and t.archived_at is null) then 'ready'
      when exists(select 1 from public.staff_memberships m where m.user_id=auth.uid())
        or exists(select 1 from public.tenant_contacts c where c.user_id=auth.uid()) then 'disabled'
      else 'unassigned' end)
$$;

create function public.find_account_for_assignment(p_property_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target auth.users; staff public.staff_memberships; contacts jsonb;
begin
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner MFA required' using errcode='42501';
  end if;
  if p_email is null or length(p_email)>320 then raise exception 'Invalid identity' using errcode='22023'; end if;
  select * into target from auth.users where lower(email)=lower(btrim(p_email));
  if not found then return null; end if;
  select * into staff from public.staff_memberships where property_id=p_property_id and user_id=target.id;
  select coalesce(jsonb_agg(jsonb_build_object('tenant_id',c.tenant_id,'name',t.display_name,
    'enabled', c.revoked_at is null and t.archived_at is null)), '[]'::jsonb) into contacts
    from public.tenant_contacts c join public.tenants t on t.id=c.tenant_id
    where c.property_id=p_property_id and c.user_id=target.id;
  return jsonb_build_object('id',target.id,'email',target.email,
    'accepted',target.email_confirmed_at is not null,
    'staff_role',case when staff.revoked_at is null then staff.role else null end,
    'contacts',contacts,
    'state',case when target.email_confirmed_at is null then 'pending'
      when (staff.role is not null and staff.revoked_at is null)
        or exists(select 1 from public.tenant_contacts c join public.tenants t on t.id=c.tenant_id
          where c.property_id=p_property_id and c.user_id=target.id and c.revoked_at is null and t.archived_at is null) then 'ready'
      when staff.role is not null or jsonb_array_length(contacts)>0 then 'disabled'
      else 'unassigned' end);
end $$;

create function public.assign_account_access(p_property_id uuid, p_user_id uuid,
  p_expected_email text, p_kind text, p_tenant_id uuid, p_role text, p_enabled boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target auth.users;
begin
  perform 1 from public.properties where id=p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner MFA required' using errcode='42501';
  end if;
  select * into target from auth.users where id=p_user_id for share;
  if not found or p_expected_email is null or lower(target.email) is distinct from lower(btrim(p_expected_email))
    or target.email_confirmed_at is null then
    raise exception 'Verified account does not match the confirmed email' using errcode='22023';
  end if;
  if p_enabled is null then raise exception 'Choose an access action' using errcode='22023'; end if;
  if p_kind='staff' and p_tenant_id is null and (p_role in ('owner','clerk') or (not p_enabled and p_role is null)) then
    perform public.set_staff_access(p_property_id,p_user_id,case when p_enabled then p_role else null end,p_reason);
  elsif p_kind='contact' and p_role is null and exists(select 1 from public.tenants where id=p_tenant_id and property_id=p_property_id) then
    perform public.set_tenant_contact(p_tenant_id,p_user_id,p_enabled,p_reason);
  else
    raise exception 'Invalid access assignment' using errcode='22023';
  end if;
end $$;

revoke all on function public.my_access_state(), public.find_account_for_assignment(uuid,text),
  public.assign_account_access(uuid,uuid,text,text,uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.my_access_state(), public.find_account_for_assignment(uuid,text),
  public.assign_account_access(uuid,uuid,text,text,uuid,text,boolean,text) to authenticated;
commit;
