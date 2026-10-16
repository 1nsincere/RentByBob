begin;

create unique index audit_account_invitation_once
  on public.audit_events(target_id, action)
  where action in (
    'account_invitation_requested',
    'account_invitation_sent',
    'account_invitation_failed'
  );

create function public.can_issue_account_invitation(
  p_property_id uuid,
  p_account_type text
) returns boolean
language sql stable security definer set search_path = '' as $$
  select case private.staff_role(p_property_id)
    when 'owner' then p_account_type in ('tenant', 'staff')
    when 'clerk' then p_account_type = 'tenant'
    else false
  end
$$;

create function public.record_account_invitation(
  p_property_id uuid,
  p_account_type text,
  p_invitation_id uuid,
  p_outcome text
) returns void
language plpgsql security definer set search_path = '' as $$
declare invitation_action text;
begin
  if p_account_type not in ('tenant', 'staff')
    or p_outcome not in ('requested', 'sent', 'failed')
    or p_invitation_id is null
    or not coalesce(public.can_issue_account_invitation(p_property_id, p_account_type), false) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  invitation_action := 'account_invitation_' || p_outcome;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (
      p_property_id,
      auth.uid(),
      invitation_action,
      p_invitation_id,
      p_account_type || ' account invitation ' || p_outcome
    )
    on conflict (target_id, action) where action in (
      'account_invitation_requested',
      'account_invitation_sent',
      'account_invitation_failed'
    ) do nothing;
end $$;

revoke all on function public.can_issue_account_invitation(uuid, text),
  public.record_account_invitation(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.can_issue_account_invitation(uuid, text),
  public.record_account_invitation(uuid, text, uuid, text)
  to authenticated;

commit;
