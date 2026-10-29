-- "Remember this device" for staff (owner decision 27 Oct 2026: 30 days; owner and clerks).
-- After a real authenticator check (aal2), staff may remember the current browser. On that browser, a password
-- sign-in (aal1) counts as staff-verified for 30 days, so the authenticator code is not asked again. The password
-- is always required. Only a SHA-256 hash of the device secret is stored; the browser sends the secret in the
-- x-rentbybob-device header and the database checks it on every request. Remembering requires a real
-- authenticator check (a remembered device cannot extend itself); devices can be listed and removed by their
-- owner; removing staff access removes their effect because staff_role still requires an active membership.
begin;

create table private.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null check (length(btrim(label)) between 1 and 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index trusted_devices_user_idx on private.trusted_devices(user_id) where revoked_at is null;
alter table private.trusted_devices enable row level security;
revoke all on private.trusted_devices from public, anon, authenticated;

-- True when this request carries a current, unrevoked device secret belonging to the signed-in user.
create function private.trusted_device_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.trusted_devices d
    where d.user_id = (select auth.uid())
      and d.revoked_at is null and d.expires_at > now()
      and d.token_hash = encode(sha256(convert_to(coalesce(
        nullif(current_setting('request.headers', true), '')::json->>'x-rentbybob-device', ''), 'utf8')), 'hex')
      and length(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-rentbybob-device', '')) >= 64
  )
$$;

-- Staff role: unchanged except that a remembered device stands in for the authenticator check.
create or replace function private.staff_role(p_property_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.staff_memberships m
  where m.property_id = p_property_id and m.user_id = (select auth.uid())
    and m.revoked_at is null
    and ((select auth.jwt()->>'aal') = 'aal2'
      or ((select auth.jwt()->>'aal') = 'aal1' and (select private.trusted_device_ok())))
$$;

-- Called right after a real authenticator check. Returns the device secret once; only its hash is kept.
create function public.remember_device(p_label text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare secret text; expiry timestamptz := now() + interval '30 days'; new_id uuid;
begin
  if auth.uid() is null or (select auth.jwt()->>'aal') is distinct from 'aal2'
    or not exists (select 1 from public.staff_memberships where user_id = auth.uid() and revoked_at is null) then
    raise exception 'A staff authenticator check is required to remember a device' using errcode = '42501';
  end if;
  if p_label is null or length(btrim(p_label)) not between 1 and 80 then
    raise exception 'Name this device (1 to 80 characters)' using errcode = '22023';
  end if;
  -- 64 hex characters from two random UUIDs (cryptographically random v4) plus 64 more from a hash of fresh randomness.
  secret := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    || encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'utf8')), 'hex');
  insert into private.trusted_devices(user_id, token_hash, label, expires_at)
    values (auth.uid(), encode(sha256(convert_to(secret, 'utf8')), 'hex'), btrim(p_label), expiry) returning id into new_id;
  -- Keep at most 5 remembered devices per person: the oldest beyond that are removed.
  update private.trusted_devices set revoked_at = now()
    where user_id = auth.uid() and revoked_at is null and id not in (
      select id from private.trusted_devices where user_id = auth.uid() and revoked_at is null order by created_at desc limit 5);
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    select m.property_id, auth.uid(), 'trusted_device_added', new_id, 'Remembered device: ' || btrim(p_label)
    from public.staff_memberships m where m.user_id = auth.uid() and m.revoked_at is null;
  return jsonb_build_object('id', new_id, 'secret', secret, 'expires_at', expiry);
end $$;

-- Lets the app skip the authenticator screen only when the database itself accepts this device.
create function public.check_trusted_device() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.trusted_device_ok() then return false; end if;
  update private.trusted_devices set last_used_at = now()
    where user_id = auth.uid() and revoked_at is null
      and token_hash = encode(sha256(convert_to(current_setting('request.headers', true)::json->>'x-rentbybob-device', 'utf8')), 'hex');
  return true;
end $$;

-- The signed-in person's own remembered devices (never the secret or hash).
create function public.list_trusted_devices() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label, 'created_at', d.created_at,
    'last_used_at', d.last_used_at, 'expires_at', d.expires_at,
    'current', d.token_hash = encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-rentbybob-device', ''), 'utf8')), 'hex'))
    order by d.created_at desc), '[]'::jsonb)
  from private.trusted_devices d
  where d.user_id = (select auth.uid()) and d.revoked_at is null and d.expires_at > now()
$$;

-- Forget one of your own devices (by id), or the current device (null id) — for example when signing out.
create function public.forget_trusted_device(p_device_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare changed uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  update private.trusted_devices set revoked_at = now()
    where user_id = auth.uid() and revoked_at is null
      and (id = p_device_id or (p_device_id is null and token_hash = encode(sha256(convert_to(coalesce(
        nullif(current_setting('request.headers', true), '')::json->>'x-rentbybob-device', ''), 'utf8')), 'hex')))
    returning id into changed;
  if changed is not null then
    insert into public.audit_events(property_id, actor_id, action, target_id, reason)
      select m.property_id, auth.uid(), 'trusted_device_removed', changed, 'Remembered device removed'
      from public.staff_memberships m where m.user_id = auth.uid() and m.revoked_at is null;
  end if;
end $$;

revoke all on function private.trusted_device_ok() from public, anon, authenticated;
grant execute on function private.trusted_device_ok() to authenticated;
revoke all on function public.remember_device(text), public.check_trusted_device(), public.list_trusted_devices(),
  public.forget_trusted_device(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remember_device(text), public.check_trusted_device(), public.list_trusted_devices(),
  public.forget_trusted_device(uuid) to authenticated;
commit;
