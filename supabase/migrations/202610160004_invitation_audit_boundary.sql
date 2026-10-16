begin;

-- Preserve the existing caller/MFA validation for request events only.
alter function public.record_account_invitation(uuid,text,uuid,text)
  rename to record_account_invitation_request_internal;
revoke all on function public.record_account_invitation_request_internal(uuid,text,uuid,text)
  from public, anon, authenticated, service_role;
alter function public.record_account_invitation_request_internal(uuid,text,uuid,text) set schema private;

create function public.record_account_invitation(p_property_id uuid, p_account_type text,
  p_invitation_id uuid, p_outcome text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome is distinct from 'requested' then
    raise exception 'Only the trusted dispatcher can record outcomes' using errcode = '42501';
  end if;
  perform private.record_account_invitation_request_internal(
    p_property_id, p_account_type, p_invitation_id, p_outcome);
end $$;
revoke all on function public.record_account_invitation(uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.record_account_invitation(uuid,text,uuid,text) to authenticated;

create function public.complete_account_invitation(p_invitation_id uuid, p_outcome text)
returns void language plpgsql security definer set search_path = '' as $$
declare request_event public.audit_events; existing_outcome text;
begin
  if p_outcome is null or p_outcome not in ('sent','failed') then
    raise exception 'Invalid invitation outcome' using errcode = '22023';
  end if;
  select * into request_event from public.audit_events
    where target_id = p_invitation_id and action = 'account_invitation_requested' for update;
  if not found then raise exception 'Invitation request missing' using errcode = '22023'; end if;
  select action into existing_outcome from public.audit_events where target_id = p_invitation_id
    and action in ('account_invitation_sent','account_invitation_failed');
  if found then
    if existing_outcome = 'account_invitation_' || p_outcome then return; end if;
    raise exception 'Conflicting invitation outcome' using errcode = '22023';
  end if;
  insert into public.audit_events(property_id,actor_id,action,target_id,reason)
    values (request_event.property_id, request_event.actor_id, 'account_invitation_' || p_outcome,
      p_invitation_id, replace(request_event.reason, ' requested', ' ' || p_outcome));
end $$;
revoke all on function public.complete_account_invitation(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.complete_account_invitation(uuid,text) to service_role;

commit;
