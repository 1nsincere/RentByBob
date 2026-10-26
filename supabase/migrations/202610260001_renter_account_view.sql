-- Renter self-service read model. Read-only: no table, grant or write path is added.
-- Scope is derived from the caller's own identity (no tenant/property parameter), limited to
-- unarchived tenants with an active contact link. Balances use the same rule as staff:
-- charges minus confirmed cash allocations minus allocations from cleared checks only.
-- Pending cash and received/deposited checks are listed separately and never reduce balances.
-- Staff identifiers, verifier IDs, collectors' internal records, handovers and other tenants are never returned.
begin;

create function public.read_renter_account() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Sign-in required' using errcode = '42501'; end if;
  return jsonb_build_object('tenants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'display_name', t.display_name,
      'kind', t.kind,
      'property', p.name,
      'agreements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'building', b.label,
          'room', u.label,
          'move_in', a.move_in,
          'rent', a.rent::text,
          'balance', (
            (select coalesce(sum(ch.amount), 0) from public.rent_charges ch where ch.agreement_id = a.id)
            - (select coalesce(sum(al.amount), 0) from public.cash_allocations al join public.rent_charges ch on ch.id = al.charge_id where ch.agreement_id = a.id)
            - (select coalesce(sum(al.amount), 0) from public.check_allocations al join public.check_records cr on cr.id = al.check_id and cr.status = 'cleared' join public.rent_charges ch on ch.id = al.charge_id where ch.agreement_id = a.id)
          )::text,
          'charges', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', c.id,
              'rental_month', c.rental_month,
              'due_date', c.due_date,
              'amount', c.amount::text,
              'remaining', (c.amount
                - coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id = c.id), 0)
                - coalesce((select sum(al.amount) from public.check_allocations al join public.check_records cr on cr.id = al.check_id and cr.status = 'cleared' where al.charge_id = c.id), 0))::text
            ) order by c.due_date, c.id)
            from public.rent_charges c where c.agreement_id = a.id), '[]'::jsonb),
          'payments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'kind', 'cash',
              'id', cr.id,
              'amount', cr.amount::text,
              'received_on', cr.received_on,
              'confirmed_at', cr.confirmed_at,
              'months', coalesce((select jsonb_agg(jsonb_build_object('month', ch.rental_month, 'amount', al.amount::text) order by ch.due_date, ch.id)
                from public.cash_allocations al join public.rent_charges ch on ch.id = al.charge_id where al.cash_id = cr.id), '[]'::jsonb),
              'acknowledgment', cr.acknowledgment - 'verified_by'
            ) order by cr.received_on desc, cr.id)
            from public.cash_records cr where cr.agreement_id = a.id and cr.confirmed_at is not null), '[]'::jsonb)
            || coalesce((
            select jsonb_agg(jsonb_build_object(
              'kind', 'check',
              'id', k.id,
              'reference', k.reference,
              'amount', k.amount::text,
              'received_on', k.received_on,
              'confirmed_at', k.cleared_at,
              'months', coalesce((select jsonb_agg(jsonb_build_object('month', ch.rental_month, 'amount', al.amount::text) order by ch.due_date, ch.id)
                from public.check_allocations al join public.rent_charges ch on ch.id = al.charge_id where al.check_id = k.id), '[]'::jsonb)
            ) order by k.received_on desc, k.reference)
            from public.check_records k where k.agreement_id = a.id and k.status = 'cleared'), '[]'::jsonb),
          'unconfirmed', coalesce((
            select jsonb_agg(jsonb_build_object('kind', 'cash', 'id', cr.id, 'amount', cr.amount::text, 'received_on', cr.received_on) order by cr.received_on desc, cr.id)
            from public.cash_records cr where cr.agreement_id = a.id and cr.confirmed_at is null), '[]'::jsonb)
            || coalesce((
            select jsonb_agg(jsonb_build_object('kind', 'check', 'id', k.id, 'reference', k.reference, 'amount', k.amount::text, 'received_on', k.received_on, 'status', k.status) order by k.received_on desc, k.reference)
            from public.check_records k where k.agreement_id = a.id and k.status in ('received', 'deposited')), '[]'::jsonb)
        ) order by a.move_in, a.id)
        from public.rental_agreements a
        join public.units u on u.id = a.unit_id
        join public.buildings b on b.id = u.building_id
        where a.tenant_id = t.id), '[]'::jsonb)
    ) order by t.display_name, t.id)
    from public.tenants t
    join public.properties p on p.id = t.property_id
    where t.archived_at is null
      and exists (select 1 from public.tenant_contacts c where c.tenant_id = t.id and c.user_id = uid and c.revoked_at is null)
  ), '[]'::jsonb));
end $$;

revoke all on function public.read_renter_account() from public, anon, authenticated, service_role;
grant execute on function public.read_renter_account() to authenticated;
commit;
