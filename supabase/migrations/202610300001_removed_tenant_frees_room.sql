-- A removed tenant never occupies a room (owner request, 30 Oct 2026).
-- remove_tenant_with_room ends the agreement today (or on the move-in date when nothing was ever recorded), and an
-- agreement counts through its end date, so a room stayed "occupied" for the rest of the removal day: it was not
-- listed as open, could not be given to a new tenant and showed the old tenant on the map. Every occupancy check now
-- skips agreements of removed tenants, so the room is free the moment the tenant is removed. The agreement, its
-- charges, payments and audit trail are unchanged; ordinary move-outs keep their end date as the last occupied day.

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
        and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)
        and not exists (select 1 from public.tenants t where t.id = a.tenant_id and t.removed_at is not null)))
$$;
revoke all on function private.unit_publicly_available(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_rental_inquiries(p_property_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$ begin
  if private.staff_role(p_property_id) is null then raise exception 'Staff MFA required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'auto_list_vacant', (select auto_list_vacant from public.properties where id = p_property_id),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('unit_id', l.unit_id, 'asking_rent', l.asking_rent::text, 'description', l.description, 'listed_at', l.listed_at, 'hidden', l.hidden, 'publicly_available', private.unit_publicly_available(l.unit_id))) from public.room_listings l where l.property_id = p_property_id), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('unit_id', u.id, 'publicly_available', private.unit_publicly_available(u.id),
      'occupied', exists (select 1 from public.rental_agreements a where a.unit_id = u.id and (a.ended_on is null or a.ended_on >= (now() at time zone 'Asia/Manila')::date)
        and not exists (select 1 from public.tenants t where t.id = a.tenant_id and t.removed_at is not null))))
      from public.units u where u.property_id = p_property_id and u.archived_at is null and u.kind not in ('shared', 'commercial')), '[]'::jsonb),
    'inquiries', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'unit_id', i.unit_id, 'visitor_name', i.visitor_name, 'contact', i.contact, 'message', i.message, 'created_at', i.created_at, 'handled_at', i.handled_at) order by i.handled_at nulls first, i.created_at desc)
      from public.rental_inquiries i where i.property_id = p_property_id and i.created_at >= now() - interval '90 days'), '[]'::jsonb));
end $$;

create or replace function public.create_rental_agreement(p_property_id uuid, p_id uuid, p_tenant_id uuid, p_unit_id uuid, p_move_in date, p_rent numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old public.rental_agreements;
begin
 perform private.cash_lock(p_property_id);
 if p_id is null or p_move_in is null or p_move_in<date '1900-01-01' or p_move_in>(now() at time zone 'Asia/Manila')::date+366 or p_rent is null or p_rent<=0 or p_rent>=1000000000000 or p_rent<>round(p_rent,2) then raise exception 'Invalid agreement' using errcode='22023'; end if;
 select * into old from public.rental_agreements where id=p_id;
 if found then
  if old.property_id=p_property_id and old.tenant_id=p_tenant_id and old.unit_id=p_unit_id and old.move_in=p_move_in and old.rent=p_rent then return p_id; end if;
  raise exception 'Request identifier already used' using errcode='22023';
 end if;
 if not exists(select 1 from public.tenants where id=p_tenant_id and property_id=p_property_id and archived_at is null)
 or not exists(select 1 from public.units u join public.buildings b on b.id=u.building_id where u.id=p_unit_id and u.property_id=p_property_id and u.archived_at is null and b.archived_at is null and u.kind<>'shared') then
  raise exception 'Choose an active tenant and a rentable room in this property' using errcode='22023';
 end if;
 if exists(select 1 from public.rental_agreements r where r.unit_id=p_unit_id and (r.ended_on is null or r.ended_on>=p_move_in)
   and not exists(select 1 from public.tenants t where t.id=r.tenant_id and t.removed_at is not null)) then
  raise exception 'This room already has an agreement for that date' using errcode='22023';
 end if;
 insert into public.rental_agreements(id,property_id,tenant_id,unit_id,move_in,rent) values(p_id,p_property_id,p_tenant_id,p_unit_id,p_move_in,p_rent);
 insert into public.audit_events(property_id,actor_id,action,target_id,tenant_id,reason) values(p_property_id,auth.uid(),'rental_agreement_created',p_id,p_tenant_id,'One responsible tenant for room rent');
 return p_id;
end $function$;

create or replace function public.change_agreement_room(p_property_id uuid, p_id uuid, p_agreement_id uuid, p_unit_id uuid, p_effective date, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.rental_agreements; prior public.agreement_room_changes; today date := (now() at time zone 'Asia/Manila')::date;
begin
  perform private.cash_lock(p_property_id);
  select * into prior from public.agreement_room_changes where id = p_id;
  if found then
    if prior.agreement_id = p_agreement_id and prior.to_unit_id = p_unit_id and prior.effective_on = p_effective then return p_id; end if;
    raise exception 'Request identifier already used' using errcode = '22023';
  end if;
  select * into a from public.rental_agreements where id = p_agreement_id and property_id = p_property_id for update;
  if not found or a.ended_on is not null then raise exception 'Choose a current room agreement' using errcode = '22023'; end if;
  if p_id is null or p_effective is null or p_effective < a.move_in or p_effective > today
    or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Choose a move date between move-in and today, and give a reason' using errcode = '22023';
  end if;
  if p_unit_id = a.unit_id or not exists (select 1 from public.units u join public.buildings b on b.id = u.building_id
      where u.id = p_unit_id and u.property_id = p_property_id and u.archived_at is null and b.archived_at is null and u.kind <> 'shared') then
    raise exception 'Choose a different active rentable room' using errcode = '22023';
  end if;
  if exists (select 1 from public.rental_agreements r where r.unit_id = p_unit_id and r.id <> a.id and (r.ended_on is null or r.ended_on >= p_effective)
      and not exists (select 1 from public.tenants t where t.id = r.tenant_id and t.removed_at is not null)) then
    raise exception 'That room already has an agreement' using errcode = '22023';
  end if;
  insert into public.agreement_room_changes(id, property_id, agreement_id, from_unit_id, to_unit_id, effective_on, reason, changed_by)
    values (p_id, p_property_id, a.id, a.unit_id, p_unit_id, p_effective, btrim(p_reason), auth.uid());
  update public.rental_agreements set unit_id = p_unit_id where id = a.id;
  insert into public.audit_events(property_id, actor_id, action, target_id, tenant_id, reason)
    values (p_property_id, auth.uid(), 'rental_room_changed', a.id, a.tenant_id, btrim(p_reason));
  return p_id;
end $$;
