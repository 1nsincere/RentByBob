import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('sketch setup creates the approved layout once, reuses existing buildings, and keeps the gym unrentable', async t => {
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
  const id = (n: number) => '70000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop, existingBuilding, tenant] = Array.from({ length: 5 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');
    insert into public.tenants(id,property_id,display_name,kind) values('${tenant}','${prop}','Sample Tenant','individual');
    insert into public.buildings(id,property_id,label) values('${existingBuilding}','${prop}','Building 1');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const setup = async () => (await db.query<any>('select public.setup_property_from_sketch($1)', [prop])).rows[0].setup_property_from_sketch

  await as(owner, 'aal1'); await assert.rejects(setup(), /Staff MFA required/)
  await as(owner)
  assert.deepEqual(await setup(), { buildings_created: 7, buildings_matched: 1, units_created: 30, units_existing: 0 })
  assert.deepEqual(await setup(), { buildings_created: 0, buildings_matched: 8, units_created: 0, units_existing: 30 }, 'running again changes nothing')

  const layout = (await db.query<any>(`select b.label, b.sketch_slot, u.floor_label, u.kind, u.label as unit from public.buildings b join public.units u on u.building_id=b.id where b.property_id=$1 order by b.label, u.label`, [prop])).rows
  const of = (building: string) => layout.filter(row => row.label === building)
  assert.equal(of('Building 1')[0].sketch_slot, 'b1')
  assert.equal((await db.query('select 1 from public.buildings where id=$1 and sketch_slot=$2', [existingBuilding, 'b1'])).rows.length, 1, 'existing Building 1 is reused, not duplicated')
  assert.deepEqual(of('Building 1').map(row => [row.floor_label, row.kind]).filter(([floor]) => floor === 'Ground floor').length, 4)
  assert.equal(of('Building 1').filter(row => row.floor_label === 'Second floor').length, 6)
  assert.equal(of('Building 2').filter(row => row.floor_label === 'Second floor').length, 5)
  assert.deepEqual(of('Building 2').find(row => row.unit === 'Gym'), { label: 'Building 2', sketch_slot: 'b2', floor_label: 'Ground floor', kind: 'shared', unit: 'Gym' })
  assert.equal(of("Bob's house").length, 6)
  assert.deepEqual(of('House 1').map(row => [row.unit, row.kind]), [['Whole house', 'house']])
  assert.deepEqual(of('Yamaha property').map(row => row.kind), ['commercial'])
  assert.deepEqual(['Store 1', 'Store 2', 'Store 3'].map(store => of(store).map(row => row.unit)), [['Shop'], ['Shop'], ['Shop']])

  // The gym can never be rented or publicly listed; ordinary rooms still can.
  const gym = (await db.query<any>("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.sketch_slot='b2' and u.label='Gym'")).rows[0].id
  const room = (await db.query<any>("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.sketch_slot='bob' and u.label='Room 01'")).rows[0].id
  await assert.rejects(db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, id(20), tenant, gym, '2024-01-01', '1000.00']), /rentable room/)
  await assert.rejects(db.query('select public.set_room_listing($1,$2,$3,$4,$5)', [prop, gym, true, '1000.00', 'Gym']), /rentable room/)
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, id(21), tenant, room, '2024-01-01', '3500.00'])
  await db.query('select public.set_room_listing($1,$2,$3,$4,$5)', [prop, room, true, '3500.00', 'Listed'])
})
