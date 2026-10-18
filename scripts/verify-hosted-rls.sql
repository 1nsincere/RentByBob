-- Administrative SQL role simulation, NOT proof of hosted JWT/MFA verification.
-- All fictional tenant writes roll back. Run only on the authorized development project.
begin;
select set_config('request.jwt.claims', jsonb_build_object('sub',id,'aal','aal1')::text,true)
  from auth.users where email='owner@example.invalid';
select set_config('rent_test.property_id',property_id::text,true)
  from public.staff_memberships where user_id=(select id from auth.users where email='owner@example.invalid') and role='owner';
set local role authenticated;
do $$
begin
  if (select count(*) from public.properties) <> 0 then raise exception 'AAL1 staff read allowed'; end if;
  begin
    perform public.create_tenant(current_setting('rent_test.property_id')::uuid,gen_random_uuid(),'Fictional denied fixture','individual');
    raise exception 'AAL1 staff write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"aal":"aal2"}'::jsonb)::text,true);
do $$
declare fixture_id uuid:=gen_random_uuid(); p uuid:=current_setting('rent_test.property_id')::uuid;
begin
  if (select count(*) from public.properties) <> 1 then raise exception 'AAL2 owner read failed'; end if;
  perform public.create_tenant(p,fixture_id,'Fictional rollback fixture','individual');
  perform public.create_tenant(p,fixture_id,'Fictional rollback fixture','individual');
  if (select count(*) from public.tenants where id=fixture_id) <> 1 then raise exception 'Retry failed'; end if;
  if (select count(*) from public.audit_events where target_id=fixture_id and action='tenant_created') <> 1 then raise exception 'Audit duplicated'; end if;
  begin
    insert into public.tenants(property_id,display_name,kind) values(p,'Denied direct write','individual');
    raise exception 'Direct write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'AAL1 denied; AAL2 owner read/RPC allowed; direct write denied; retry/audit verified; fixtures rolled back' as result;
