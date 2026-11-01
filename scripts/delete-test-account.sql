-- Deletes ONE test sign-in account and the invitation, access and log rows that point to it, then the account itself.
-- For test accounts only. Run scripts/find-account-references.sql first and read what it lists.
-- Run in Supabase > SQL Editor. Change only the email on the line marked CHANGE.
--
-- Safety: it refuses (and changes nothing) when the email is an owner, or when the account appears in any rent,
-- payment, check, maintenance, listing or report record. Those accounts belong to real history: switch them off in the
-- app (Accounts & security > Assign or disable access) instead of deleting them. Everything runs in one transaction,
-- so either all of it happens or none of it does.
do $$
declare
  v_email text := 'PUT-THE-TEST-EMAIL-HERE@gmail.com';   -- CHANGE
  v_account uuid;
  link record;
  found_rows bigint;
  blocking text := '';
  -- Rows that may be removed with a test account: invitations, access links, remembered devices and log entries.
  removable constant text[] := array[
    'private.invitation_attempts', 'private.invitation_attempt_reviews', 'staff_memberships', 'public.staff_memberships',
    'tenant_contacts', 'public.tenant_contacts', 'audit_events', 'public.audit_events',
    'private.trusted_devices'];
begin
  select id into v_account from auth.users where lower(email) = lower(btrim(v_email));
  if v_account is null then raise exception 'No account uses the email %', v_email; end if;

  if exists (select 1 from public.staff_memberships where user_id = v_account and role = 'owner') then
    raise exception 'Refused: % is an owner account. Owners are never deleted by this script.', v_email;
  end if;

  for link in
    select con.conrelid::regclass::text as table_name, att.attname as column_name
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.contype = 'f' and con.confrelid = 'auth.users'::regclass
      and con.connamespace not in ('auth'::regnamespace)
  loop
    execute format('select count(*) from %s where %I = $1', link.table_name, link.column_name) into found_rows using v_account;
    if found_rows > 0 and not (link.table_name = any(removable)) then
      blocking := blocking || format(' %s.%s (%s rows)', link.table_name, link.column_name, found_rows);
    end if;
  end loop;
  if blocking <> '' then
    raise exception 'Refused: this account is part of real records:%. Disable its access in the app instead.', blocking;
  end if;

  delete from private.invitation_attempt_reviews r
    using private.invitation_attempts a
    where r.attempt_id = a.attempt_id
      and (a.recipient_email = lower(btrim(v_email)) or v_account in (a.requester_id, a.provider_user_id, a.dispatch_actor_id));
  delete from private.invitation_attempt_reviews where actor_id = v_account;
  delete from private.invitation_attempts
    where recipient_email = lower(btrim(v_email)) or v_account in (requester_id, provider_user_id, dispatch_actor_id);
  delete from public.tenant_contacts where user_id = v_account;
  delete from public.staff_memberships where user_id = v_account;
  delete from public.audit_events where actor_id = v_account;
  delete from auth.users where id = v_account;   -- also removes its sessions, sign-in methods, MFA and remembered devices

  raise notice 'Deleted the test account %', v_email;
end $$;
