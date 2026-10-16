begin;

create table private.invitation_attempts (
  attempt_id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  requester_id uuid not null references auth.users(id) on delete restrict,
  account_type text not null check (account_type in ('tenant', 'staff')),
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email))),
  status text not null check (status in ('prepared', 'dispatching', 'issued', 'rejected', 'uncertain', 'accepted')),
  provider_user_id uuid references auth.users(id) on delete restrict,
  confirmation_at_request timestamptz,
  provider_http_status integer,
  created_at timestamptz not null default now(),
  dispatch_started_at timestamptz,
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  check ((status in ('issued', 'accepted')) = (provider_user_id is not null)),
  check (status <> 'rejected' or provider_http_status is not null)
);

create unique index invitation_attempts_recipient_once
  on private.invitation_attempts(property_id, recipient_email);
create index invitation_attempts_property_recent
  on private.invitation_attempts(property_id, created_at desc);

create table private.invitation_attempt_reviews (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.invitation_attempts(attempt_id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  evidence_source text not null check (length(btrim(evidence_source)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index invitation_attempt_reviews_recent
  on private.invitation_attempt_reviews(attempt_id, created_at desc);

alter table private.invitation_attempts enable row level security;
alter table private.invitation_attempt_reviews enable row level security;
revoke all on private.invitation_attempts, private.invitation_attempt_reviews
  from public, anon, authenticated, service_role;
revoke all on sequence private.invitation_attempt_reviews_id_seq
  from public, anon, authenticated, service_role;
grant usage on schema private to service_role;

create function public.prepare_account_invitation(
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
  if normalized_email !~ '^[^@]+@[^@]+\.[^@]+$'
    or split_part(normalized_email, '@', 2) !~ '\.invalid$' then
    raise exception 'Only fictional .invalid invitation addresses are allowed locally' using errcode = '22023';
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

  select u.email_confirmed_at into confirmed_before
    from auth.users u where lower(u.email) = normalized_email;
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
    raise exception 'A prior invitation attempt exists for this address; reissue is disabled pending policy review'
      using errcode = '23505';
end $$;

create function public.claim_account_invitation_dispatch(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt private.invitation_attempts;
begin
  select * into attempt from private.invitation_attempts where attempt_id = p_attempt_id;
  if not found then raise exception 'Invitation attempt not found' using errcode = '22023'; end if;
  perform 1 from public.properties where id = attempt.property_id for update;
  if private.staff_role(attempt.property_id) is null
    or (attempt.account_type = 'staff' and private.staff_role(attempt.property_id) <> 'owner') then
    raise exception 'Current invitation permission and MFA are required' using errcode = '42501';
  end if;
  select * into attempt from private.invitation_attempts where attempt_id = p_attempt_id for update;
  if attempt.status <> 'prepared' then
    return jsonb_build_object('claimed', false, 'status', attempt.status);
  end if;
  update private.invitation_attempts
    set status = 'dispatching', dispatch_started_at = now(), updated_at = now()
    where attempt_id = p_attempt_id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (attempt.property_id, auth.uid(), 'account_invitation_dispatch_started',
      attempt.attempt_id, 'Invitation provider call may start');
  return jsonb_build_object('claimed', true, 'status', 'dispatching');
end $$;

create function public.get_prepared_account_invitation_dispatch(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt private.invitation_attempts;
begin
  select * into attempt from private.invitation_attempts where attempt_id = p_attempt_id;
  if not found then raise exception 'Invitation attempt not found' using errcode = '22023'; end if;
  if attempt.status <> 'prepared' then
    return jsonb_build_object('attempt_id', attempt.attempt_id, 'status', attempt.status);
  end if;
  return jsonb_build_object(
    'attempt_id', attempt.attempt_id, 'status', attempt.status,
    'property_id', attempt.property_id, 'account_type', attempt.account_type,
    'email', attempt.recipient_email
  );
end $$;

create function public.complete_account_invitation_dispatch(
  p_attempt_id uuid, p_outcome text, p_provider_user_id uuid default null,
  p_provider_http_status integer default null
) returns text language plpgsql security definer set search_path = '' as $$
declare attempt private.invitation_attempts; audit_action text;
begin
  if p_outcome is null or p_outcome not in ('issued', 'rejected', 'uncertain')
    or (p_outcome = 'issued' and (p_provider_user_id is null or p_provider_http_status is not null))
    or (p_outcome = 'rejected' and (p_provider_user_id is not null
      or p_provider_http_status not in (400, 401, 403, 404, 422)))
    or (p_outcome = 'uncertain' and (p_provider_user_id is not null or p_provider_http_status is not null)) then
    raise exception 'Invalid provider outcome' using errcode = '22023';
  end if;
  select * into attempt from private.invitation_attempts where attempt_id = p_attempt_id for update;
  if not found then raise exception 'Invitation attempt not found' using errcode = '22023'; end if;
  if attempt.status <> 'dispatching' then
    if attempt.status = p_outcome
      and attempt.provider_user_id is not distinct from p_provider_user_id
      and attempt.provider_http_status is not distinct from p_provider_http_status then
      return attempt.status;
    end if;
    raise exception 'Invitation attempt already has a different outcome' using errcode = '22023';
  end if;
  update private.invitation_attempts set status = p_outcome,
    provider_user_id = p_provider_user_id,
    provider_http_status = p_provider_http_status, updated_at = now()
    where attempt_id = p_attempt_id;
  audit_action := case p_outcome
    when 'issued' then 'account_invitation_provider_issued'
    when 'rejected' then 'account_invitation_provider_rejected'
    else 'account_invitation_outcome_uncertain' end;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (attempt.property_id, attempt.requester_id, audit_action, p_attempt_id,
      case when p_outcome = 'rejected'
        then 'Provider definitively rejected invitation; HTTP ' || p_provider_http_status::text
        when p_outcome = 'issued' then 'Provider confirmed invitation issuance; delivery is not confirmed'
        else 'Provider outcome could not be established; do not resend' end);
  return p_outcome;
end $$;

create function public.read_invitation_attempts(p_property_id uuid)
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
      returning a.property_id, a.attempt_id, a.requester_id
  )
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    select accepted.property_id, accepted.requester_id, 'account_invitation_accepted',
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

create function public.record_invitation_attempt_review(
  p_property_id uuid, p_attempt_id uuid, p_reason text, p_evidence_source text
) returns void language plpgsql security definer set search_path = '' as $$
declare attempt private.invitation_attempts;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner access and MFA required' using errcode = '42501';
  end if;
  select * into attempt from private.invitation_attempts
    where attempt_id = p_attempt_id and property_id = p_property_id for update;
  if not found then raise exception 'Invitation attempt not found' using errcode = '22023'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500
    or p_evidence_source is null or length(btrim(p_evidence_source)) not between 1 and 200
    or (p_reason || ' ' || p_evidence_source) ~* '(https?://|access_token|refresh_token|password|secret|[^[:space:]]+@[^[:space:]]+)' then
    raise exception 'Use a brief reason and evidence source; never paste links or credentials'
      using errcode = '22023';
  end if;
  insert into private.invitation_attempt_reviews(attempt_id, actor_id, reason, evidence_source)
    values (p_attempt_id, auth.uid(), btrim(p_reason), btrim(p_evidence_source));
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), 'account_invitation_reviewed', p_attempt_id,
      'Owner recorded a review; attempt state was not changed');
end $$;

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
        'account_invitation_requested', 'account_invitation_sent', 'account_invitation_failed',
        'account_invitation_dispatch_started', 'account_invitation_provider_issued',
        'account_invitation_provider_rejected', 'account_invitation_outcome_uncertain',
        'account_invitation_accepted', 'account_invitation_reviewed')
    order by e.occurred_at desc, e.id desc
    limit 100;
end $$;

revoke all on function public.prepare_account_invitation(uuid, uuid, text, text),
  public.claim_account_invitation_dispatch(uuid),
  public.get_prepared_account_invitation_dispatch(uuid),
  public.complete_account_invitation_dispatch(uuid, text, uuid, integer),
  public.read_invitation_attempts(uuid),
  public.record_invitation_attempt_review(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_account_invitation(uuid, uuid, text, text),
  public.claim_account_invitation_dispatch(uuid),
  public.read_invitation_attempts(uuid),
  public.record_invitation_attempt_review(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.complete_account_invitation_dispatch(uuid, text, uuid, integer)
  to service_role;
grant execute on function public.get_prepared_account_invitation_dispatch(uuid)
  to service_role;

commit;
