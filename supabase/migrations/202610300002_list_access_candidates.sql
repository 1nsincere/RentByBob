-- Owner approval: list sign-in accounts instead of typing each email (owner request, 30 Oct 2026).
-- Shows the owner (with MFA) the accounts they may need to act on: accounts with no access anywhere yet (someone who
-- set a password or tried to sign in and is waiting), and accounts already linked to this property. Accounts linked
-- only to other properties are never listed, so one property's users stay private from another's owner. The owner
-- still reviews the account and retypes its email before any change (assign_account_access is unchanged).
create function public.list_access_candidates(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner MFA required' using errcode = '42501';
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
revoke all on function public.list_access_candidates(uuid) from public, anon;
grant execute on function public.list_access_candidates(uuid) to authenticated;
