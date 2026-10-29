-- First owner for the live (client trial) project. Run ONCE in the Supabase dashboard SQL editor of the live project,
-- after creating the owner's sign-in under Authentication > Users > Add user (email confirmed).
-- Replace the two values below. No passwords appear here; MFA is still required at the owner's first sign-in.
-- Refuses to run on a project that already has a property (except to confirm the same owner was already set up).
do $$
declare
  owner_email text := 'REPLACE_WITH_OWNER_EMAIL';
  property_name text := 'REPLACE_WITH_PROPERTY_NAME';
  owner_id uuid;
  property_id uuid := gen_random_uuid();
begin
  if owner_email like 'REPLACE_%' or property_name like 'REPLACE_%' then raise exception 'Fill in the owner email and property name first'; end if;
  lock table public.properties in exclusive mode;
  select id into owner_id from auth.users where lower(email) = lower(owner_email) and email_confirmed_at is not null;
  if owner_id is null then raise exception 'No confirmed sign-in with that email. Create it under Authentication > Users first.'; end if;
  if exists (select 1 from public.properties) then
    if exists (select 1 from public.audit_events a join public.staff_memberships m on m.property_id = a.property_id and m.user_id = a.actor_id
      where a.action = 'live_owner_bootstrapped' and a.actor_id = owner_id and m.role = 'owner' and m.revoked_at is null) then
      raise notice 'Already set up for this owner; nothing changed.'; return;
    end if;
    raise exception 'This project already has a property; add people from the app (Assign or disable access) instead.';
  end if;
  insert into public.properties(id, name) values (property_id, property_name);
  insert into public.staff_memberships(property_id, user_id, role) values (property_id, owner_id, 'owner');
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (property_id, owner_id, 'live_owner_bootstrapped', owner_id, 'Owner-authorized first owner for the live project; staff MFA remains required');
  raise notice 'Owner set up. Sign in on the website and add your authenticator.';
end $$;
