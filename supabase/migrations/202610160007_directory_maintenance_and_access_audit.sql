begin;

alter table public.buildings add column archived_at timestamptz;
alter table public.units add column archived_at timestamptz;

alter table public.buildings drop constraint buildings_property_id_label_key;
alter table public.units drop constraint units_building_id_label_key;
create unique index buildings_active_label_unique
  on public.buildings(property_id, label) where archived_at is null;
create unique index units_active_label_unique
  on public.units(building_id, label) where archived_at is null;

create or replace function public.create_property_location(
  p_property_id uuid, p_id uuid, p_label text, p_building_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  existing_building public.buildings;
  existing_unit public.units;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner MFA required' using errcode = '42501';
  end if;
  if p_id is null or p_label is null or length(btrim(p_label)) not between 1 and 200 then
    raise exception 'Invalid location' using errcode = '22023';
  end if;

  select * into existing_building from public.buildings where id = p_id;
  if found then
    if existing_building.property_id = p_property_id
      and existing_building.label = btrim(p_label)
      and p_building_id is null and existing_building.archived_at is null then
      return p_id;
    end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;

  select * into existing_unit from public.units where id = p_id;
  if found then
    if existing_unit.property_id = p_property_id
      and existing_unit.building_id = p_building_id
      and existing_unit.label = btrim(p_label)
      and existing_unit.archived_at is null then
      return p_id;
    end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;

  if p_building_id is null then
    insert into public.buildings(id, property_id, label)
      values (p_id, p_property_id, btrim(p_label));
  else
    if not exists (
      select 1 from public.buildings
      where id = p_building_id and property_id = p_property_id and archived_at is null
    ) then
      raise exception 'Choose an active building or section' using errcode = '22023';
    end if;
    insert into public.units(id, property_id, building_id, label)
      values (p_id, p_property_id, p_building_id, btrim(p_label));
  end if;

  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(),
      case when p_building_id is null then 'building_created' else 'unit_created' end,
      p_id, 'Property directory record created');
  return p_id;
end $$;

create function public.manage_property_location(
  p_property_id uuid, p_location_id uuid, p_action text, p_label text, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  location_property_id uuid;
  building_id uuid;
  current_label text;
  location_archived_at timestamptz;
  is_building boolean := false;
  audit_action text;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then
    raise exception 'Owner MFA required' using errcode = '42501';
  end if;
  if p_location_id is null or p_action is null or p_action not in ('rename', 'archive')
    or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid directory change' using errcode = '22023';
  end if;

  select property_id, label, archived_at
    into location_property_id, current_label, location_archived_at
    from public.buildings where id = p_location_id for update;
  if found then
    is_building := true;
  else
    select u.property_id, u.building_id, u.label, u.archived_at
      into location_property_id, building_id, current_label, location_archived_at
      from public.units u where u.id = p_location_id for update;
    if not found then
      raise exception 'Directory record not found' using errcode = '22023';
    end if;
  end if;
  if location_property_id is distinct from p_property_id then
    raise exception 'Directory record not found' using errcode = '22023';
  end if;

  if p_action = 'rename' then
    if location_archived_at is not null then
      raise exception 'Archived directory records cannot be changed' using errcode = '22023';
    end if;
    if p_label is null or length(btrim(p_label)) not between 1 and 200 then
      raise exception 'Location label must contain 1 to 200 characters' using errcode = '22023';
    end if;
    if btrim(p_label) = current_label then
      return;
    end if;
    if is_building then
      update public.buildings set label = btrim(p_label) where id = p_location_id;
      audit_action := 'building_renamed';
    else
      update public.units set label = btrim(p_label) where id = p_location_id;
      audit_action := 'unit_renamed';
    end if;
  else
    if location_archived_at is not null then
      return;
    end if;
    if is_building then
      update public.buildings set archived_at = now() where id = p_location_id;
      update public.units u set archived_at = now()
        where u.building_id = p_location_id and u.archived_at is null;
      audit_action := 'building_archived';
    else
      update public.units set archived_at = now() where id = p_location_id;
      audit_action := 'unit_archived';
    end if;
  end if;

  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), audit_action, p_location_id, btrim(p_reason));
end $$;

create function public.read_access_audit(p_property_id uuid)
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
    select e.id, e.occurred_at, e.action, actor.email, target.email, tenant.display_name, e.reason
    from public.audit_events e
    join auth.users actor on actor.id = e.actor_id
    left join auth.users target on target.id = e.target_id
      and e.action in ('contact_enabled', 'contact_revoked', 'staff_revoked',
        'staff_role_owner', 'staff_role_clerk')
    left join public.tenants tenant on tenant.id = e.tenant_id
    where e.property_id = p_property_id
      and e.action in ('contact_enabled', 'contact_revoked', 'staff_revoked',
        'staff_role_owner', 'staff_role_clerk', 'tenant_archived',
        'account_invitation_requested', 'account_invitation_sent', 'account_invitation_failed')
    order by e.occurred_at desc, e.id desc
    limit 100;
end $$;

revoke all on function public.manage_property_location(uuid, uuid, text, text, text),
  public.read_access_audit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.manage_property_location(uuid, uuid, text, text, text),
  public.read_access_audit(uuid) to authenticated;

commit;
