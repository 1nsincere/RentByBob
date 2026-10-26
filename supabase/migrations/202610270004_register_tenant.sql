-- One-step tenant registration (user request 26 Oct 2026): create the tenant record and, optionally, its room
-- agreement in a single transaction. Reuses the reviewed create_tenant and create_rental_agreement checks
-- (staff MFA, active rentable room, no overlapping agreement, exact rent, retry-safe IDs); if the agreement
-- is refused, the tenant is not created either. No occupant names are collected.
begin;

create function public.register_tenant(
  p_property_id uuid, p_tenant_id uuid, p_display_name text, p_kind text,
  p_agreement_id uuid, p_unit_id uuid, p_move_in date, p_rent numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_unit_id is not null and (p_agreement_id is null or p_move_in is null or p_rent is null) then
    raise exception 'Choose the move-in date and monthly rent for the room' using errcode = '22023';
  end if;
  perform public.create_tenant(p_property_id, p_tenant_id, p_display_name, p_kind);
  if p_unit_id is not null then
    perform public.create_rental_agreement(p_property_id, p_agreement_id, p_tenant_id, p_unit_id, p_move_in, p_rent);
  end if;
  return p_tenant_id;
end $$;

revoke all on function public.register_tenant(uuid, uuid, text, text, uuid, uuid, date, numeric) from public, anon, authenticated, service_role;
grant execute on function public.register_tenant(uuid, uuid, text, text, uuid, uuid, date, numeric) to authenticated;
commit;
