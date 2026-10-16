begin;

create or replace function public.read_access_audit(p_property_id uuid)
returns table (
  event_id bigint,
  occurred_at timestamptz,
  action text,
  actor_email text,
  target_email text,
  tenant_name text,
  reason text
)
language plpgsql security definer set search_path = '' as $$
begin
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner MFA required' using errcode = '42501';
  end if;

  return query
    select e.id, e.occurred_at, e.action, actor.email::text, target.email::text,
      tenant.display_name, e.reason
    from public.audit_events e
    join auth.users actor on actor.id = e.actor_id
    left join auth.users target on target.id = e.target_id
      and e.action in ('contact_enabled', 'contact_revoked', 'staff_revoked',
        'staff_role_owner', 'staff_role_clerk')
    left join public.tenants tenant on tenant.id = e.tenant_id
    where e.property_id = p_property_id
      and e.action in ('contact_enabled', 'contact_revoked', 'staff_revoked',
        'staff_role_owner', 'staff_role_clerk', 'tenant_archived',
        'account_invitation_requested', 'account_invitation_sent', 'account_invitation_failed')
    order by e.occurred_at desc, e.id desc
    limit 100;
end $$;

revoke all on function public.read_access_audit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.read_access_audit(uuid) to authenticated;

commit;
