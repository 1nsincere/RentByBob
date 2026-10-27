-- Stores and the Yamaha space are private negotiations (owner decision 27 Oct 2026): commercial spaces never
-- appear on the public rooms page, cannot be listed (manually or automatically), and are left out of the staff
-- listings screen. Rooms, apartments and the whole house are unchanged.
begin;

create or replace function private.unit_publicly_available(p_unit_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.units u
    join public.buildings b on b.id = u.building_id and b.archived_at is null
    join public.properties p on p.id = u.property_id
    left join public.room_listings l on l.unit_id = u.id
    where u.id = p_unit_id and u.archived_at is null and u.kind not in ('shared', 'commercial')
      and ((l.unit_id is not null and not l.hidden) or (l.unit_id is null and p.auto_list_vacant))
      and not exists (select 1 from public.rental_agreements a where a.unit_id = u.id
        and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)))
$$;
revoke all on function private.unit_publicly_available(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_rental_inquiries(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'auto_list_vacant', (select auto_list_vacant from public.properties where id = p_property_id),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('unit_id', l.unit_id, 'asking_rent', l.asking_rent::text, 'description', l.description, 'listed_at', l.listed_at, 'hidden', l.hidden, 'publicly_available', private.unit_publicly_available(l.unit_id))) from public.room_listings l where l.property_id = p_property_id), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('unit_id', u.id, 'publicly_available', private.unit_publicly_available(u.id),
      'occupied', exists (select 1 from public.rental_agreements a where a.unit_id = u.id and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date))))
      from public.units u where u.property_id = p_property_id and u.archived_at is null and u.kind not in ('shared', 'commercial')), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'unit_id', i.unit_id, 'visitor_name', i.visitor_name, 'contact', i.contact, 'message', i.message, 'created_at', i.created_at, 'handled_at', i.handled_at) order by i.handled_at nulls first, i.created_at desc)
      from public.rental_inquiries i where i.property_id = p_property_id and i.created_at >= now() - interval '90 days'), '[]'::jsonb));
end $$;

create or replace function public.set_room_listing(p_property_id uuid, p_unit_id uuid, p_listed boolean, p_asking_rent numeric, p_description text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.properties where id = p_property_id for update;
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  if p_listed is null or not exists (select 1 from public.units where id = p_unit_id and property_id = p_property_id and archived_at is null and kind not in ('shared', 'commercial')) then
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

-- Remove any listing a commercial space already had.
delete from public.room_listings l using public.units u where u.id = l.unit_id and u.kind = 'commercial';
commit;
