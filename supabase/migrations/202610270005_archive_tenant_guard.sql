-- Tenant archiving now respects room agreements (the foundation note asked for this before agreements existed).
-- A tenant whose room agreement is open, or ends today or later (Philippine business date), cannot be archived:
-- record the move-out first. Unpaid rent stays on the ended agreement; archiving never changes balances.
begin;

create or replace function public.archive_tenant(p_tenant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.tenants;
begin
  select * into target from public.tenants where id = p_tenant_id;
  perform 1 from public.properties where id = target.property_id for update;
  if private.staff_role(target.property_id) is distinct from 'owner' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Give a reason for archiving' using errcode = '22023';
  end if;
  select * into target from public.tenants where id = p_tenant_id for update;
  if target.archived_at is not null then return; end if;
  if exists (
    select 1 from public.rental_agreements a
    where a.tenant_id = target.id
      and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)
  ) then
    raise exception 'Record the move-out before archiving this tenant' using errcode = '22023';
  end if;
  update public.tenants set archived_at = now() where id = target.id;
  update public.tenant_contacts set revoked_at = now() where tenant_id = target.id and revoked_at is null;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (target.property_id, auth.uid(), 'tenant_archived', target.id, target.id, btrim(p_reason));
end $$;

revoke all on function public.archive_tenant(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.archive_tenant(uuid, text) to authenticated;
commit;
