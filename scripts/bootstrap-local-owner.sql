-- Executed by the local administrative script, never installed as an RPC.
do $$
declare
  bootstrap_owner_id uuid := '__OWNER_ID__';
  bootstrap_property_id uuid := '__PROPERTY_ID__';
begin
  lock table public.properties in exclusive mode;
  if not exists (select 1 from auth.users where id=bootstrap_owner_id
    and lower(email) like '%@%.invalid' and email_confirmed_at is not null) then
    raise exception 'Bootstrap requires a confirmed fictional .invalid Auth user';
  end if;
  if exists (select 1 from public.properties) then
    if (select count(*) from public.properties)=1
      and exists (select 1 from public.staff_memberships m where m.property_id=bootstrap_property_id
        and m.user_id=bootstrap_owner_id and m.role='owner' and m.revoked_at is null)
      and exists (select 1 from public.audit_events a where a.property_id=bootstrap_property_id
        and a.actor_id=bootstrap_owner_id and a.action='local_owner_bootstrapped') then
      return;
    end if;
    raise exception 'Bootstrap already closed; use owner-managed access';
  end if;
  insert into public.properties(id,name) values(bootstrap_property_id,'Fictional local development property');
  insert into public.staff_memberships(property_id,user_id,role) values(bootstrap_property_id,bootstrap_owner_id,'owner');
  insert into public.audit_events(property_id,actor_id,action,target_id,reason)
    values(bootstrap_property_id,bootstrap_owner_id,'local_owner_bootstrapped',bootstrap_owner_id,'Local fictional owner bootstrap');
end $$;
