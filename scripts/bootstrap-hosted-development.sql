-- Administrative MCP SQL only for vyzexanzktskvjxjpphp after inspecting emptiness.
-- No passwords, Auth edits, public RPC, local reset or assurance bypass.
do $$
declare
  owner_id uuid;
  property_id uuid := gen_random_uuid();
begin
  lock table public.properties in exclusive mode;
  select id into strict owner_id from auth.users
    where lower(email) = 'owner@example.invalid' and email_confirmed_at is not null;
  if exists (select 1 from public.properties) then
    if exists (select 1 from public.audit_events a join public.staff_memberships m
      on m.property_id=a.property_id and m.user_id=a.actor_id
      where a.action='hosted_development_owner_bootstrapped' and a.actor_id=owner_id
        and m.role='owner' and m.revoked_at is null) then return; end if;
    raise exception 'Already initialized; use owner-managed access';
  end if;
  insert into public.properties(id,name) values(property_id,'Fictional hosted development property');
  insert into public.staff_memberships(property_id,user_id,role) values(property_id,owner_id,'owner');
  insert into public.audit_events(property_id,actor_id,action,target_id,reason)
    values(property_id,owner_id,'hosted_development_owner_bootstrapped',owner_id,
      'User-authorized fictional hosted development bootstrap; staff MFA remains required');
end $$;
