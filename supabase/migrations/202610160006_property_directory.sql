begin;
create table public.buildings (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  label text not null check (label=btrim(label) and length(label) between 1 and 200),
  unique(property_id,id), unique(property_id,label)
);
create table public.units (
  id uuid primary key,
  property_id uuid not null,
  building_id uuid not null,
  label text not null check (label=btrim(label) and length(label) between 1 and 200),
  foreign key(property_id,building_id) references public.buildings(property_id,id) on delete restrict,
  unique(building_id,label)
);
alter table public.buildings enable row level security;
alter table public.units enable row level security;
revoke all on public.buildings,public.units from public,anon,authenticated;
grant select on public.buildings,public.units to authenticated;
create policy buildings_read on public.buildings for select to authenticated using(private.staff_role(property_id) is not null);
create policy units_read on public.units for select to authenticated using(private.staff_role(property_id) is not null);

create function public.create_property_location(p_property_id uuid,p_id uuid,p_label text,p_building_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing_building public.buildings; existing_unit public.units;
begin
  perform 1 from public.properties where id=p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode='42501'; end if;
  if p_id is null or p_label is null or length(btrim(p_label)) not between 1 and 200 then raise exception 'Invalid location' using errcode='22023'; end if;
  select * into existing_building from public.buildings where id=p_id;
  if found then
    if p_building_id is null and existing_building.property_id=p_property_id and existing_building.label=btrim(p_label) then return p_id; end if;
    raise exception 'Request identifier already used' using errcode='22023';
  end if;
  select * into existing_unit from public.units where id=p_id;
  if found then
    if existing_unit.property_id=p_property_id and existing_unit.building_id=p_building_id and existing_unit.label=btrim(p_label) then return p_id; end if;
    raise exception 'Request identifier already used' using errcode='22023';
  end if;
  if p_building_id is null then
    insert into public.buildings(id,property_id,label) values(p_id,p_property_id,btrim(p_label));
  else
    insert into public.units(id,property_id,building_id,label) values(p_id,p_property_id,p_building_id,btrim(p_label));
  end if;
  insert into public.audit_events(property_id,actor_id,action,target_id,reason)
    values(p_property_id,auth.uid(),case when p_building_id is null then 'building_created' else 'unit_created' end,p_id,'Property directory record created');
  return p_id;
end $$;
revoke all on function public.create_property_location(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_property_location(uuid,uuid,text,uuid) to authenticated;
commit;
