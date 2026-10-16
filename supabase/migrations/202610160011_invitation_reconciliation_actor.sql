begin;

create or replace function public.read_invitation_attempts(p_property_id uuid)
returns table (
  attempt_id uuid, account_type text, masked_recipient text, status text,
  created_at timestamptz, dispatch_started_at timestamptz, updated_at timestamptz,
  provider_http_status integer, auth_account_matches boolean,
  provider_account_confirmed boolean, review_count bigint,
  last_review_at timestamptz, last_review_reason text, last_evidence_source text
)
language plpgsql security definer set search_path = '' as $$
begin
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner access and MFA required' using errcode = '42501';
  end if;

  with accepted as (
    update private.invitation_attempts a
      set status = 'accepted', accepted_at = now(), updated_at = now()
      from auth.users u
      where a.property_id = p_property_id and a.status = 'issued'
        and u.id = a.provider_user_id and lower(u.email) = a.recipient_email
        and u.email_confirmed_at is not null
        and (a.confirmation_at_request is null
          or u.email_confirmed_at > a.confirmation_at_request)
      returning a.property_id, a.attempt_id
  )
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    select accepted.property_id, auth.uid(), 'account_invitation_accepted',
      accepted.attempt_id, 'Provider-linked recipient account confirmed after invitation issuance'
    from accepted;

  return query
    select a.attempt_id, a.account_type,
      left(split_part(a.recipient_email, '@', 1), 1) || '***'
        || '@***.invalid',
      a.status, a.created_at, a.dispatch_started_at, a.updated_at,
      a.provider_http_status,
      exists(select 1 from auth.users u where lower(u.email) = a.recipient_email),
      exists(select 1 from auth.users u where u.id = a.provider_user_id
        and u.email_confirmed_at is not null and lower(u.email) = a.recipient_email),
      (select count(*) from private.invitation_attempt_reviews r where r.attempt_id = a.attempt_id),
      (select r.created_at from private.invitation_attempt_reviews r
        where r.attempt_id = a.attempt_id order by r.created_at desc limit 1),
      (select r.reason from private.invitation_attempt_reviews r
        where r.attempt_id = a.attempt_id order by r.created_at desc limit 1),
      (select r.evidence_source from private.invitation_attempt_reviews r
        where r.attempt_id = a.attempt_id order by r.created_at desc limit 1)
    from private.invitation_attempts a
    where a.property_id = p_property_id
    order by a.created_at desc limit 100;
end $$;

commit;
