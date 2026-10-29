-- Property layout from the owner's fixed site sketch (user decisions 26 Oct 2026): each building may be placed in
-- one fixed sketch position; each room has an optional floor and a type. The shared gym can never be rented or
-- listed. setup_property_from_sketch creates the approved layout once, reusing existing active buildings/rooms by
-- name and never duplicating or changing them. Occupancy is derived from agreements; no occupant names are stored.
begin;

alter table public.buildings add column sketch_slot text
  check (sketch_slot in ('bob', 'b1', 'b2', 'house', 'yamaha', 'store1', 'store2', 'store3'));
create unique index buildings_active_sketch_slot_unique on public.buildings(property_id, sketch_slot)
  where sketch_slot is not null and archived_at is null;
alter table public.units
  add column floor_label text check (floor_label is null or length(btrim(floor_label)) between 1 and 40),
  add column kind text not null default 'room' check (kind in ('room', 'apartment', 'shared', 'house', 'commercial'));

create function public.setup_property_from_sketch(p_property_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  layout jsonb := '[
    {"slot":"b1","label":"Building 1","units":[["Ground floor","apartment","Apartment"],["Ground floor","room","Room 01"],["Ground floor","room","Room 02"],["Ground floor","room","Room 03"],["Second floor","room","Room 04"],["Second floor","room","Room 05"],["Second floor","room","Room 06"],["Second floor","room","Room 07"],["Second floor","room","Room 08"],["Second floor","room","Room 09"]]},
    {"slot":"b2","label":"Building 2","units":[["Ground floor","shared","Gym"],["Ground floor","room","Room 01"],["Ground floor","room","Room 02"],["Ground floor","room","Room 03"],["Second floor","room","Room 04"],["Second floor","room","Room 05"],["Second floor","room","Room 06"],["Second floor","room","Room 07"],["Second floor","room","Room 08"]]},
    {"slot":"bob","label":"Bob''s house","units":[[null,"room","Room 01"],[null,"room","Room 02"],[null,"room","Room 03"],[null,"room","Room 04"],[null,"room","Room 05"],[null,"room","Room 06"]]},
    {"slot":"house","label":"House 1","units":[[null,"house","Whole house"]]},
    {"slot":"yamaha","label":"Yamaha property","units":[[null,"commercial","Commercial space"]]},
    {"slot":"store1","label":"Store 1","units":[[null,"commercial","Shop"]]},
    {"slot":"store2","label":"Store 2","units":[[null,"commercial","Shop"]]},
    {"slot":"store3","label":"Store 3","units":[[null,"commercial","Shop"]]}
  ]';
  item jsonb; unit_item jsonb; target_building uuid;
  buildings_created int := 0; buildings_matched int := 0; units_created int := 0; units_existing int := 0;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode = '42501'; end if;
  for item in select * from jsonb_array_elements(layout) loop
    select b.id into target_building from public.buildings b
      where b.property_id = p_property_id and b.archived_at is null and b.sketch_slot = item->>'slot';
    if target_building is null then
      select b.id into target_building from public.buildings b
        where b.property_id = p_property_id and b.archived_at is null and b.sketch_slot is null and b.label = item->>'label';
      if target_building is not null then
        update public.buildings set sketch_slot = item->>'slot' where id = target_building;
        buildings_matched := buildings_matched + 1;
      else
        target_building := gen_random_uuid();
        insert into public.buildings(id, property_id, label, sketch_slot) values (target_building, p_property_id, item->>'label', item->>'slot');
        buildings_created := buildings_created + 1;
      end if;
    else
      buildings_matched := buildings_matched + 1;
    end if;
    for unit_item in select * from jsonb_array_elements(item->'units') loop
      if exists (select 1 from public.units u where u.building_id = target_building and u.archived_at is null and u.label = unit_item->>2) then
        units_existing := units_existing + 1;
      else
        insert into public.units(id, property_id, building_id, label, floor_label, kind)
          values (gen_random_uuid(), p_property_id, target_building, unit_item->>2, unit_item->>0, unit_item->>1);
        units_created := units_created + 1;
      end if;
    end loop;
    target_building := null;
  end loop;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), 'property_layout_setup', p_property_id,
      format('Sketch layout applied: %s buildings created, %s matched; %s rooms created, %s already existed', buildings_created, buildings_matched, units_created, units_existing));
  return jsonb_build_object('buildings_created', buildings_created, 'buildings_matched', buildings_matched, 'units_created', units_created, 'units_existing', units_existing);
end $$;

-- The shared gym (kind 'shared') can never take a rental agreement or a public listing.
create or replace function public.create_rental_agreement(p_property_id uuid,p_id uuid,p_tenant_id uuid,p_unit_id uuid,p_move_in date,p_rent numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare old public.rental_agreements;
begin
 perform private.cash_lock(p_property_id);
 if p_id is null or p_move_in is null or p_move_in<date '1900-01-01' or p_rent is null or p_rent<=0 or p_rent>=1000000000000 or p_rent<>round(p_rent,2) then raise exception 'Invalid agreement' using errcode='22023'; end if;
 select * into old from public.rental_agreements where id=p_id;
 if found then
  if old.property_id=p_property_id and old.tenant_id=p_tenant_id and old.unit_id=p_unit_id and old.move_in=p_move_in and old.rent=p_rent then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 if not exists(select 1 from public.tenants where id=p_tenant_id and property_id=p_property_id and archived_at is null)
 or not exists(select 1 from public.units u join public.buildings b on b.id=u.building_id where u.id=p_unit_id and u.property_id=p_property_id and u.archived_at is null and b.archived_at is null and u.kind<>'shared') then
  raise exception 'Choose an active tenant and a rentable room in this property' using errcode='22023';
 end if;
 if exists(select 1 from public.rental_agreements where unit_id=p_unit_id and (ended_on is null or ended_on>=p_move_in)) then
  raise exception 'This room already has an agreement for that date' using errcode='22023';
 end if;
 insert into public.rental_agreements(id,property_id,tenant_id,unit_id,move_in,rent) values(p_id,p_property_id,p_tenant_id,p_unit_id,p_move_in,p_rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rental_agreement_created',p_id,p_tenant_id,'One responsible tenant for room rent');
 return p_id;
end $$;

create or replace function public.set_room_listing(p_property_id uuid, p_unit_id uuid, p_listed boolean, p_asking_rent numeric, p_description text)
returns void language plpgsql security definer set search_path = '' as $$
declare unit_record public.units;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  select * into unit_record from public.units where id = p_unit_id and property_id = p_property_id and archived_at is null and kind <> 'shared';
  if not found or p_listed is null then raise exception 'Choose an active rentable room in this property' using errcode = '22023'; end if;
  if not p_listed then
    delete from public.room_listings where unit_id = p_unit_id;
  else
    if p_asking_rent is null or p_asking_rent <= 0 or p_asking_rent >= 1000000000000 or p_asking_rent <> round(p_asking_rent, 2)
      or length(coalesce(p_description, '')) > 300 then
      raise exception 'Enter a positive monthly rent and a description under 300 characters' using errcode = '22023';
    end if;
    insert into public.room_listings(unit_id, property_id, asking_rent, description, listed_by)
      values (p_unit_id, p_property_id, p_asking_rent, btrim(coalesce(p_description, '')), auth.uid())
      on conflict (unit_id) do update set asking_rent = excluded.asking_rent, description = excluded.description, listed_by = excluded.listed_by, listed_at = now();
  end if;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_listed then 'room_listing_published' else 'room_listing_removed' end, p_unit_id, 'Public room listing ' || case when p_listed then 'saved' else 'removed' end);
end $$;

revoke all on function public.setup_property_from_sketch(uuid) from public, anon, authenticated, service_role;
grant execute on function public.setup_property_from_sketch(uuid) to authenticated;
commit;
