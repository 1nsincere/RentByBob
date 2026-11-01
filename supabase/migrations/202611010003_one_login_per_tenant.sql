begin;

-- One sign-in per tenant record (owner request, 1 Nov 2026): a tenant record that already has an active sign-in cannot
-- be linked to a different email. To change a tenant's email, disable the old sign-in for that record first, then
-- link the new one (both steps are in the access history). The same person may still be linked to several tenant
-- records (for example two rooms), and re-enabling the same sign-in works as before.

-- Stop here (nothing changes) if any record already has two active sign-ins, and name them so staff can fix it first.
do $$
declare doubled text;
begin
  select string_agg(t.display_name, ', ' order by t.display_name) into doubled
  from (select tenant_id from public.tenant_contacts where revoked_at is null group by tenant_id having count(*) > 1) d
  join public.tenants t on t.id = d.tenant_id;
  if doubled is not null then
    raise exception 'These tenant records have more than one active sign-in: %. Disable the extra sign-ins in Assign or disable access, then run the database update again.', doubled;
  end if;
end $$;

create unique index tenant_contacts_one_active_login on public.tenant_contacts(tenant_id) where revoked_at is null;

create or replace function public.set_tenant_contact(
  p_tenant_id uuid, p_user_id uuid, p_enabled boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is null then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.archived_at is not null or p_enabled is null then
    raise exception 'Cannot change contact access for this record' using errcode = '22023';
  end if;
  if p_enabled and exists (select 1 from public.tenant_contacts c
      where c.tenant_id = target.id and c.revoked_at is null and c.user_id <> p_user_id) then
    raise exception 'This tenant record already has a sign-in; disable it before linking another email'
      using errcode = 'RB410';
  end if;
  insert into public.tenant_contacts(property_id, tenant_id, user_id, revoked_at)
    values (target.property_id, target.id, p_user_id, case when p_enabled then null else now() end)
    on conflict (tenant_id, user_id) do update set revoked_at = excluded.revoked_at;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), case when p_enabled then 'contact_enabled' else 'contact_revoked' end, p_user_id, target.id, p_reason);
end $$;

commit;
