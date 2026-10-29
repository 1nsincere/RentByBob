import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
// Fixtures are created through the reviewed staff RPCs, then read back as renters.
test('renter account view is limited to the caller\'s own active tenant records', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on all functions in schema auth to authenticated, anon;
  `)
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
  }

  const id = (n: number) => '20000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, james, renterA, renterB, revokedRenter, stranger, prop, tenantA, tenantB, archivedTenant, building, unitA, unitB, agreementA, agreementB] = Array.from({ length: 15 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
      ('${owner}','owner@example.invalid',now()),('${james}','james@example.invalid',now()),('${renterA}','a@example.invalid',now()),
      ('${renterB}','b@example.invalid',now()),('${revokedRenter}','revoked@example.invalid',now()),('${stranger}','stranger@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${james}','clerk');
    insert into public.tenants(id,property_id,display_name,kind) values('${tenantA}','${prop}','Sample Renter A','individual'),('${tenantB}','${prop}','Sample Renter B','business');
    insert into public.tenants(id,property_id,display_name,kind,archived_at) values('${archivedTenant}','${prop}','Sample Archived','individual',now());
    insert into public.tenant_contacts(property_id,tenant_id,user_id) values('${prop}','${tenantA}','${renterA}'),('${prop}','${tenantB}','${renterB}'),('${prop}','${archivedTenant}','${renterA}');
    insert into public.tenant_contacts(property_id,tenant_id,user_id,revoked_at) values('${prop}','${tenantA}','${revokedRenter}',now());
    insert into public.buildings(id,property_id,label) values('${building}','${prop}','Sample building');
    insert into public.units(id,property_id,building_id,label) values('${unitA}','${prop}','${building}','Room A'),('${unitB}','${prop}','${building}','Room B');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const read = async () => (await db.query<{ read_renter_account: any }>('select public.read_renter_account()')).rows[0].read_renter_account

  // Staff create the fictional fixture through the reviewed RPCs.
  await as(owner)
  await db.query('select public.assign_cash_verifier($1,$2,$3)', [prop, james, 'james@example.invalid'])
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, agreementA, tenantA, unitA, '2024-01-15', '5000.00'])
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, agreementB, tenantB, unitB, '2024-01-10', '4000.00'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(40), agreementA, '2024-02-01'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(41), agreementA, '2024-03-01'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(42), agreementB, '2024-02-01'])
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, id(50), agreementA, '5000.00', '2024-02-14', 'Bob'])
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, id(51), agreementA, '1000.00', '2024-03-05', 'James'])
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, id(52), agreementB, '1000.00', '2024-02-09', 'Bob'])
  await as(james)
  await db.query('select public.confirm_rent_cash($1,$2)', [prop, id(50)])
  await db.query('select public.confirm_rent_cash($1,$2)', [prop, id(52)])
  await db.query('select public.record_rent_check($1,$2,$3,$4,$5,$6,$7)', [prop, id(60), agreementA, '1500.00', '2024-03-10', '2024-03-09', 'James'])
  await db.query('select public.record_rent_check($1,$2,$3,$4,$5,$6,$7)', [prop, id(61), agreementA, '700.00', '2024-03-12', '2024-03-12', 'Bob'])
  await as(owner)
  await db.query('select public.transition_rent_check($1,$2,$3,$4,$5)', [prop, id(70), id(60), 'deposited', 'Taken to bank'])
  await db.query('select public.transition_rent_check($1,$2,$3,$4,$5)', [prop, id(71), id(60), 'cleared', 'Bank confirmed funds'])
  const staffView = (await db.query<{ read_rent_workspace: any }>('select public.read_rent_workspace($1)', [prop])).rows[0].read_rent_workspace

  // Renter A (no MFA required for renters) sees only their own active record.
  await as(renterA, 'aal1')
  const viewA = await read()
  assert.deepEqual(viewA.tenants.map((tenant: any) => tenant.display_name), ['Sample Renter A'], 'archived tenant and other renters are excluded')
  const [rental] = viewA.tenants[0].agreements
  assert.equal(viewA.tenants[0].property, 'Fictional property')
  assert.deepEqual([rental.building, rental.room, rental.rent], ['Sample building', 'Room A', '5000.00'])
  assert.equal(rental.balance, '3500.00', 'pending cash and the uncleared check do not reduce the balance')
  assert.equal(rental.balance, staffView.agreements.find((agreement: any) => agreement.id === agreementA).balance, 'renter and staff balances use the same rule')
  assert.deepEqual(rental.charges.map((charge: any) => [charge.rental_month, charge.remaining]), [['2024-02-01', '0.00'], ['2024-03-01', '3500.00']])
  assert.deepEqual(rental.payments.map((payment: any) => [payment.kind, payment.amount, payment.months.map((m: any) => m.month)]),
    [['cash', '5000.00', ['2024-02-01']], ['check', '1500.00', ['2024-03-01']]])
  assert.equal(rental.payments[0].acknowledgment.number, `RBB-${id(50)}`)
  assert.equal('verified_by' in rental.payments[0].acknowledgment, false, 'verifier account ID is removed from the renter copy')
  assert.deepEqual(rental.unconfirmed.map((item: any) => [item.kind, item.amount, item.status ?? null]), [['cash', '1000.00', null], ['check', '700.00', 'received']])
  const serialized = JSON.stringify(viewA)
  for (const hidden of [owner, james, renterB, tenantB, agreementB, 'Sample Renter B', 'recorded_by', 'received_by', 'confirmed_by', 'handover']) {
    assert.equal(serialized.includes(hidden), false, `renter view must not include ${hidden}`)
  }
  assert.equal((await db.query('select * from public.rent_charges')).rows.length, 0, 'direct table reads stay staff-only')
  assert.equal((await db.query('select * from public.cash_records')).rows.length, 0)

  // Renter B sees only their own business record.
  await as(renterB, 'aal1')
  const viewB = await read()
  assert.deepEqual(viewB.tenants.map((tenant: any) => tenant.display_name), ['Sample Renter B'])
  assert.equal(viewB.tenants[0].agreements[0].balance, '3000.00')
  assert.equal(JSON.stringify(viewB).includes(tenantA), false)

  // Revoked contacts, unrelated accounts and staff without a contact link see nothing.
  for (const user of [revokedRenter, stranger, owner]) {
    await as(user)
    assert.deepEqual(await read(), { tenants: [] })
  }

  // Anonymous callers cannot execute the function at all.
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await db.exec('set role anon')
  await assert.rejects(db.query('select public.read_renter_account()'), /permission denied/)
  await db.exec('reset role')

  // Revoking the link removes access immediately.
  await db.query('update public.tenant_contacts set revoked_at=now() where user_id=$1 and tenant_id=$2', [renterA, tenantA])
  await as(renterA, 'aal1')
  assert.deepEqual(await read(), { tenants: [] })
})
