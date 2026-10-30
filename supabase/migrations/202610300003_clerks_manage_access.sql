-- Clerks may assign or disable account access too (owner request, 30 Oct 2026), so James or Jake can let a tenant or
-- a new clerk in when the owner is away. Limits, enforced here and not only in the screen:
--   * any staff member (with the authenticator code) may look up accounts, see the account list, and give or remove a
--     tenant's sign-in access;
--   * a clerk may give clerk access, and remove a clerk's access, but never their own;
--   * only an owner may grant or remove owner access (and the last owner is still protected);
--   * every change is in the access history, which stays owner-only to read.

create or replace function public.set_tenant_contact(
  p_tenant_id uuid, p_user_id uuid, p_enabled boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is null then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.archived_at is not null or p_enabled is null then
    raise exception 'Cannot change contact access for this record' using errcode = '22023';
  end if;
  insert into public.tenant_contacts(property_id, tenant_id, user_id, revoked_at)
    values (target.property_id, target.id, p_user_id, case when p_enabled then null else now() end)
    on conflict (tenant_id, user_id) do update set revoked_at = excluded.revoked_at;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), case when p_enabled then 'contact_enabled' else 'contact_revoked' end, p_user_id, target.id, p_reason);
end $$;

create or replace function public.set_staff_access(p_property_id uuid, p_user_id uuid, p_role text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_role text; target_role text;
begin
  perform 1 from public.properties where id = p_property_id for update;
  actor_role := private.staff_role(p_property_id);
  if actor_role is null then raise exception 'Access denied' using errcode = '42501'; end if;
  if p_role is not null and p_role not in ('owner', 'clerk') then
    raise exception 'Invalid staff role' using errcode = '22023';
  end if;
  if actor_role = 'clerk' then
    select role into target_role from public.staff_memberships
      where property_id = p_property_id and user_id = p_user_id and revoked_at is null;
    if p_user_id = auth.uid() or p_role = 'owner' or target_role = 'owner' then
      raise exception 'Only the owner can change owner access or your own access' using errcode = '42501';
    end if;
  end if;
  if p_role is distinct from 'owner' and exists (
    select 1 from public.staff_memberships where property_id = p_property_id
      and user_id = p_user_id and role = 'owner' and revoked_at is null
  ) and not exists (
    select 1 from public.staff_memberships where property_id = p_property_id
      and user_id <> p_user_id and role = 'owner' and revoked_at is null
  ) then raise exception 'Keep at least one active owner' using errcode = '23514'; end if;
  if p_role is null then
    update public.staff_memberships set revoked_at = now() where property_id = p_property_id and user_id = p_user_id;
  else
    insert into public.staff_memberships(property_id, user_id, role)
      values (p_property_id, p_user_id, p_role)
      on conflict (property_id, user_id) do update set role = excluded.role, revoked_at = null;
  end if;
  -- A remembered device must not outlive a revocation and come back to life when access is granted again.
  update private.trusted_devices set revoked_at = now() where user_id = p_user_id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_role is null then 'staff_revoked' else 'staff_role_' || p_role end, p_user_id, p_reason);
end $function$;

create or replace function public.assign_account_access(p_property_id uuid, p_user_id uuid,
  p_expected_email text, p_kind text, p_tenant_id uuid, p_role text, p_enabled boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target auth.users;
begin
  perform 1 from public.properties where id=p_property_id for update;
  if private.staff_role(p_property_id) is null then
    raise exception 'Staff MFA required' using errcode='42501';
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

create or replace function public.find_account_for_assignment(p_property_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target auth.users; staff public.staff_memberships; contacts jsonb;
begin
  if private.staff_role(p_property_id) is null then
    raise exception 'Staff MFA required' using errcode='42501';
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

-- The account list (202610300002) opens to clerks the same way.
create or replace function public.list_access_candidates(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.staff_role(p_property_id) is null then
    raise exception 'Staff MFA required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(row order by (row->>'last_sign_in_at') desc nulls last, row->>'email')
    from (
      select jsonb_build_object(
        'email', u.email,
        'confirmed', u.email_confirmed_at is not null,
        'last_sign_in_at', u.last_sign_in_at,
        'created_at', u.created_at,
        'access', case
          when s.role is not null and s.revoked_at is null then s.role
          when exists (select 1 from public.tenant_contacts c join public.tenants t on t.id = c.tenant_id
            where c.property_id = p_property_id and c.user_id = u.id and c.revoked_at is null and t.archived_at is null) then 'tenant'
          when s.role is not null or exists (select 1 from public.tenant_contacts c where c.property_id = p_property_id and c.user_id = u.id) then 'disabled'
          else 'none' end) as row
      from auth.users u
      left join public.staff_memberships s on s.property_id = p_property_id and s.user_id = u.id
      where u.email is not null and (
        s.user_id is not null
        or exists (select 1 from public.tenant_contacts c where c.property_id = p_property_id and c.user_id = u.id)
        or (not exists (select 1 from public.staff_memberships o where o.user_id = u.id)
            and not exists (select 1 from public.tenant_contacts o where o.user_id = u.id)))
      limit 500
    ) listed), '[]'::jsonb);
end $$;
