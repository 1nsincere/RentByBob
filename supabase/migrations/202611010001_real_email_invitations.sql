begin;

-- Real email invitations (owner request, 1 Nov 2026, after a custom SMTP sender was set up for the live project).
-- 1. Any valid email address may be invited, not only fictional .invalid addresses.
-- 2. An address may be invited again (an expired or missed link, a rate-limited send), but never while an earlier
--    attempt for it is still open or uncertain (prepared, dispatching, uncertain: an owner reviews those first), and
--    never once it has a confirmed account (that person signs in already; assign their access instead).
-- 3. The owner's review list masks addresses as j***@gmail.com instead of a made-up ".invalid" ending.
-- Who may invite is unchanged: staff with MFA for tenants, the owner for staff.

drop index private.invitation_attempts_recipient_once;
create unique index invitation_attempts_recipient_open
  on private.invitation_attempts(property_id, recipient_email)
  where status in ('prepared', 'dispatching', 'uncertain');

create or replace function public.prepare_account_invitation(
  p_property_id uuid, p_attempt_id uuid, p_account_type text, p_email text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_attempt private.invitation_attempts;
  normalized_email text;
  confirmed_before timestamptz;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null
    or p_account_type is null or p_account_type not in ('tenant', 'staff')
    or (p_account_type = 'staff' and private.staff_role(p_property_id) <> 'owner')
    or p_attempt_id is null or p_email is null or length(p_email) > 320
    or p_email ~ '[[:space:][:cntrl:]]' then
    raise exception 'Invitation request is invalid or not authorized' using errcode = '42501';
  end if;
  normalized_email := lower(btrim(p_email));
  if normalized_email !~ '^[^@]+@[^@.]+(\.[^@.]+)+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select * into current_attempt
    from private.invitation_attempts where attempt_id = p_attempt_id for update;
  if found then
    if current_attempt.property_id <> p_property_id
      or current_attempt.account_type <> p_account_type
      or current_attempt.recipient_email <> normalized_email then
      raise exception 'Invitation identifier is already bound to different details' using errcode = '22023';
    end if;
    return jsonb_build_object('attempt_id', current_attempt.attempt_id, 'status', current_attempt.status);
  end if;

  if exists (select 1 from private.invitation_attempts a
      where a.property_id = p_property_id and a.recipient_email = normalized_email
        and a.status in ('prepared', 'dispatching', 'uncertain')) then
    raise exception 'An earlier invitation to this address is still open or waiting for owner review'
      using errcode = '23505';
  end if;
  select u.email_confirmed_at into confirmed_before
    from auth.users u where lower(u.email) = normalized_email;
  if confirmed_before is not null or exists (select 1 from private.invitation_attempts a
      where a.property_id = p_property_id and a.recipient_email = normalized_email and a.status = 'accepted') then
    raise exception 'This address already has a confirmed account; assign its access instead'
      using errcode = 'RB409';
  end if;

  insert into private.invitation_attempts(
    attempt_id, property_id, requester_id, account_type, recipient_email,
    status, confirmation_at_request
  ) values (
    p_attempt_id, p_property_id, auth.uid(), p_account_type, normalized_email,
    'prepared', confirmed_before
  );
  perform public.record_account_invitation(p_property_id, p_account_type, p_attempt_id, 'requested');
  return jsonb_build_object('attempt_id', p_attempt_id, 'status', 'prepared');
exception
  when unique_violation then
    raise exception 'An earlier invitation to this address is still open or waiting for owner review'
      using errcode = '23505';
end $$;

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
      left(split_part(a.recipient_email, '@', 1), 1) || '***@' || split_part(a.recipient_email, '@', 2),
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
