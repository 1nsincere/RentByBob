-- Automatic room listings (user request 27 Oct 2026): when the owner turns on "List vacant rooms automatically"
-- for a property, every active rentable room appears on the public page while it has no current or upcoming
-- agreement, disappears as soon as a tenant is assigned (including future move-ins), and returns after the move-out
-- date, without anyone ticking a box. Staff can still hide any room (it stays hidden until shown again).
-- The switch is off by default because it infers vacancy from the absence of an agreement: turn it on only after
-- every current tenant has a room agreement in the app. Asking rent becomes optional ("Ask for the price").
begin;

alter table public.properties add column auto_list_vacant boolean not null default false;
alter table public.room_listings alter column asking_rent drop not null;
alter table public.room_listings add column hidden boolean not null default false;

-- Publicly available: active rentable room in an active building, no current/upcoming agreement, and either
-- listed by staff (not hidden) or covered by the property's automatic listing (and not hidden by staff).
create or replace function private.unit_publicly_available(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.units u
    join public.buildings b on b.id = u.building_id and b.archived_at is null
    join public.properties p on p.id = u.property_id
    left join public.room_listings l on l.unit_id = u.id
    where u.id = p_unit_id and u.archived_at is null and u.kind <> 'shared'
      and ((l.unit_id is not null and not l.hidden) or (l.unit_id is null and p.auto_list_vacant))
      and not exists (select 1 from public.rental_agreements a where a.unit_id = u.id
        and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)))
$$;
revoke all on function private.unit_publicly_available(uuid) from public, anon, authenticated, service_role;

-- Same public fields as before; asking_rent may now be null (shown as "Ask for the price").
create or replace function public.read_public_listings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('properties', coalesce((
    select jsonb_agg(jsonb_build_object('name', p.name, 'buildings', (
      select jsonb_agg(jsonb_build_object('label', b.label, 'rooms', (
        select jsonb_agg(jsonb_build_object('unit_id', u.id, 'room', u.label, 'asking_rent', l.asking_rent::text, 'description', coalesce(l.description, '')) order by u.label)
        from public.units u left join public.room_listings l on l.unit_id = u.id
        where u.building_id = b.id and private.unit_publicly_available(u.id))) order by b.label)
      from public.buildings b
      where b.property_id = p.id and exists (select 1 from public.units u where u.building_id = b.id and private.unit_publicly_available(u.id)))) order by p.name)
    from public.properties p
    where exists (select 1 from public.units u where u.property_id = p.id and private.unit_publicly_available(u.id))), '[]'::jsonb))
$$;

-- Staff view: the automatic switch and every rentable room with its public status.
create or replace function public.read_rental_inquiries(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'auto_list_vacant', (select auto_list_vacant from public.properties where id = p_property_id),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('unit_id', l.unit_id, 'asking_rent', l.asking_rent::text, 'description', l.description, 'listed_at', l.listed_at, 'hidden', l.hidden, 'publicly_available', private.unit_publicly_available(l.unit_id))) from public.room_listings l where l.property_id = p_property_id), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('unit_id', u.id, 'publicly_available', private.unit_publicly_available(u.id),
      'occupied', exists (select 1 from public.rental_agreements a where a.unit_id = u.id and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date))))
      from public.units u where u.property_id = p_property_id and u.archived_at is null and u.kind <> 'shared'), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'unit_id', i.unit_id, 'visitor_name', i.visitor_name, 'contact', i.contact, 'message', i.message, 'created_at', i.created_at, 'handled_at', i.handled_at) order by i.handled_at nulls first, i.created_at desc)
      from public.rental_inquiries i where i.property_id = p_property_id and i.created_at >= now() - interval '90 days'), '[]'::jsonb));
end $$;

-- Show (p_listed true, optional rent and description) or hide (p_listed false) one room. Hiding keeps its
-- rent and description so showing it again is one click.
create or replace function public.set_room_listing(p_property_id uuid, p_unit_id uuid, p_listed boolean, p_asking_rent numeric, p_description text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_listed is null or not exists (select 1 from public.units where id = p_unit_id and property_id = p_property_id and archived_at is null and kind <> 'shared') then
    raise exception 'Choose an active rentable room in this property' using errcode = '22023';
  end if;
  if p_listed and ((p_asking_rent is not null and (p_asking_rent <= 0 or p_asking_rent >= 1000000000000 or p_asking_rent <> round(p_asking_rent, 2)))
    or length(coalesce(p_description, '')) > 300) then
    raise exception 'Enter a positive monthly rent (or leave it empty) and a description under 300 characters' using errcode = '22023';
  end if;
  if p_listed then
    insert into public.room_listings(unit_id, property_id, asking_rent, description, listed_by, hidden)
      values (p_unit_id, p_property_id, p_asking_rent, btrim(coalesce(p_description, '')), auth.uid(), false)
      on conflict (unit_id) do update set asking_rent = excluded.asking_rent, description = excluded.description, listed_by = excluded.listed_by, listed_at = now(), hidden = false;
  else
    insert into public.room_listings(unit_id, property_id, asking_rent, description, listed_by, hidden)
      values (p_unit_id, p_property_id, null, '', auth.uid(), true)
      on conflict (unit_id) do update set hidden = true, listed_by = excluded.listed_by, listed_at = now();
  end if;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_listed then 'room_listing_published' else 'room_listing_removed' end, p_unit_id, 'Public room listing ' || case when p_listed then 'shown' else 'hidden' end);
end $$;

-- Owner switch for automatic listing of vacant rooms.
create function public.set_auto_listing(p_property_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is distinct from 'owner' then raise exception 'Owner MFA required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Choose on or off' using errcode = '22023'; end if;
  update public.properties set auto_list_vacant = p_enabled where id = p_property_id;
  insert into public.audit_events(property_id, actor_id, action, target_id, reason)
    values (p_property_id, auth.uid(), case when p_enabled then 'auto_listing_enabled' else 'auto_listing_disabled' end, p_property_id, 'Automatic listing of vacant rooms ' || case when p_enabled then 'turned on' else 'turned off' end);
end $$;

revoke all on function public.set_auto_listing(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_auto_listing(uuid, boolean) to authenticated;
commit;
