-- Public room listings and inquiries (user decisions 26 Oct 2026): staff explicitly list a room with an asking
-- rent and short description; the public sees only listed rooms that have no current or upcoming agreement
-- (building, room, rent, description). Visitors may leave an inquiry for staff. No tenant, account, payment or
-- staff data is reachable anonymously: tables have no anon grants, and the two public functions return or accept
-- only the fields below. Inquiries older than 90 days are deleted (adjustable retention).
begin;

create table public.room_listings (
  unit_id uuid primary key references public.units(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  asking_rent numeric(14,2) not null check (asking_rent > 0 and asking_rent < 1000000000000),
  description text not null check (length(description) <= 300),
  listed_by uuid not null references auth.users(id),
  listed_at timestamptz not null default now()
);

create table public.rental_inquiries (
  id uuid primary key,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  visitor_name text not null check (length(btrim(visitor_name)) between 1 and 100),
  contact text not null check (length(btrim(contact)) between 3 and 120),
  message text not null check (length(message) <= 1000),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id),
  check ((handled_at is null) = (handled_by is null))
);
create index rental_inquiries_property_idx on public.rental_inquiries(property_id, created_at desc);
create index rental_inquiries_contact_idx on public.rental_inquiries(lower(btrim(contact)), created_at);

alter table public.room_listings enable row level security;
alter table public.rental_inquiries enable row level security;
revoke all on public.room_listings, public.rental_inquiries from public, anon, authenticated;
grant select on public.room_listings, public.rental_inquiries to authenticated;
create policy staff_read on public.room_listings for select to authenticated using (private.staff_role(property_id) is not null);
create policy staff_read on public.rental_inquiries for select to authenticated using (private.staff_role(property_id) is not null);

-- A unit is publicly available only if listed, active, and free of any agreement that is current or upcoming.
create function private.unit_publicly_available(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_listings l
    join public.units u on u.id = l.unit_id and u.archived_at is null
    join public.buildings b on b.id = u.building_id and b.archived_at is null
    where l.unit_id = p_unit_id
      and not exists (select 1 from public.rental_agreements a where a.unit_id = l.unit_id
        and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)))
$$;
revoke all on function private.unit_publicly_available(uuid) from public, anon, authenticated, service_role;

create function public.read_public_listings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('properties', coalesce((
    select jsonb_agg(jsonb_build_object('name', p.name, 'buildings', (
      select jsonb_agg(jsonb_build_object('label', b.label, 'rooms', (
        select jsonb_agg(jsonb_build_object('unit_id', u.id, 'room', u.label, 'asking_rent', l.asking_rent::text, 'description', l.description) order by u.label)
        from public.units u join public.room_listings l on l.unit_id = u.id
        where u.building_id = b.id and private.unit_publicly_available(u.id))) order by b.label)
      from public.buildings b
      where b.property_id = p.id and exists (select 1 from public.units u join public.room_listings l on l.unit_id = u.id where u.building_id = b.id and private.unit_publicly_available(u.id)))) order by p.name)
    from public.properties p
    where exists (select 1 from public.room_listings l where l.property_id = p.id and private.unit_publicly_available(l.unit_id))), '[]'::jsonb))
$$;

create function public.submit_rental_inquiry(p_id uuid, p_unit_id uuid, p_name text, p_contact text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
declare unit_property uuid; prior public.rental_inquiries;
begin
  if p_id is null or length(btrim(coalesce(p_name, ''))) not between 1 and 100 or length(btrim(coalesce(p_contact, ''))) not between 3 and 120
    or length(coalesce(p_message, '')) > 1000 then
    raise exception 'Enter your name, a phone number or Messenger name, and a message under 1000 characters' using errcode = '22023';
  end if;
  select * into prior from public.rental_inquiries where id = p_id;
  if found then
    if prior.unit_id = p_unit_id and prior.visitor_name = btrim(p_name) and prior.contact = btrim(p_contact) and prior.message = coalesce(p_message, '') then return; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  select u.property_id into unit_property from public.units u where u.id = p_unit_id;
  if unit_property is null or not private.unit_publicly_available(p_unit_id) then
    raise exception 'This room is no longer listed' using errcode = '22023';
  end if;
  perform 1 from public.properties where id = unit_property for update;
  delete from public.rental_inquiries where property_id = unit_property and created_at < now() - interval '90 days';
  if (select count(*) from public.rental_inquiries where lower(btrim(contact)) = lower(btrim(p_contact)) and created_at > now() - interval '24 hours') >= 3
    or (select count(*) from public.rental_inquiries where property_id = unit_property and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many inquiries right now. Please try again later.' using errcode = '22023';
  end if;
  insert into public.rental_inquiries(id, property_id, unit_id, visitor_name, contact, message)
    values (p_id, unit_property, p_unit_id, btrim(p_name), btrim(p_contact), coalesce(p_message, ''));
end $$;

create function public.set_room_listing(p_property_id uuid, p_unit_id uuid, p_listed boolean, p_asking_rent numeric, p_description text)
returns void language plpgsql security definer set search_path = '' as $$
declare unit_record public.units;
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  select * into unit_record from public.units where id = p_unit_id and property_id = p_property_id and archived_at is null;
  if not found or p_listed is null then raise exception 'Choose an active room in this property' using errcode = '22023'; end if;
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

create function public.read_rental_inquiries(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'listings', coalesce((select jsonb_agg(jsonb_build_object('unit_id', l.unit_id, 'asking_rent', l.asking_rent::text, 'description', l.description, 'listed_at', l.listed_at, 'publicly_available', private.unit_publicly_available(l.unit_id))) from public.room_listings l where l.property_id = p_property_id), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'unit_id', i.unit_id, 'visitor_name', i.visitor_name, 'contact', i.contact, 'message', i.message, 'created_at', i.created_at, 'handled_at', i.handled_at) order by i.handled_at is not null, i.created_at desc)
      from public.rental_inquiries i where i.property_id = p_property_id and i.created_at >= now() - interval '90 days'), '[]'::jsonb));
end $$;

create function public.mark_inquiry_handled(p_property_id uuid, p_inquiry_id uuid) returns void
language plpgsql security definer set search_path = '' as $$ begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  update public.rental_inquiries set handled_at = coalesce(handled_at, now()), handled_by = coalesce(handled_by, auth.uid())
    where id = p_inquiry_id and property_id = p_property_id;
  if not found then raise exception 'Inquiry unavailable' using errcode = '22023'; end if;
end $$;

revoke all on function public.read_public_listings(), public.submit_rental_inquiry(uuid, uuid, text, text, text),
  public.set_room_listing(uuid, uuid, boolean, numeric, text), public.read_rental_inquiries(uuid), public.mark_inquiry_handled(uuid, uuid)
  from public, anon, authenticated, service_role;
-- The only anonymous entry points: read listed rooms, and leave an inquiry.
grant execute on function public.read_public_listings(), public.submit_rental_inquiry(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.set_room_listing(uuid, uuid, boolean, numeric, text), public.read_rental_inquiries(uuid), public.mark_inquiry_handled(uuid, uuid) to authenticated;
commit;
