import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('public listings expose only listed, unoccupied rooms; inquiries are write-only for visitors', async t => {
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
  const id = (n: number) => '50000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, outsider, prop, tenant, b1, b2, free, occupied, b2room, archivedRoom, agreement] = Array.from({ length: 12 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${outsider}','outsider@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional boarding houses');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');
    insert into public.tenants(id,property_id,display_name,kind) values('${tenant}','${prop}','Sample Private Tenant','individual');
    insert into public.buildings(id,property_id,label) values('${b1}','${prop}','Building 1'),('${b2}','${prop}','Building 2');
    insert into public.units(id,property_id,building_id,label) values('${free}','${prop}','${b1}','Room 01'),('${occupied}','${prop}','${b1}','Room 02'),('${b2room}','${prop}','${b2}','Room 05');
    insert into public.units(id,property_id,building_id,label,archived_at) values('${archivedRoom}','${prop}','${b2}','Old room',now());`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  async function anonymous() {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claims','',false)")
    await db.exec('set role anon')
  }
  const publicView = async () => (await db.query<any>('select public.read_public_listings()')).rows[0].read_public_listings
  const list = (unit: string, listed: boolean, rent = '3500.00', description = 'Second floor, good for 2 persons') =>
    db.query('select public.set_room_listing($1,$2,$3,$4,$5)', [prop, unit, listed, rent, description])
  const inquire = (n: number, unit: string, contact = '0917 000 0000', name = 'Sample Visitor', message = 'Is this still available?') =>
    db.query('select public.submit_rental_inquiry($1,$2,$3,$4,$5)', [id(n), unit, name, contact, message])

  await anonymous()
  assert.deepEqual(await publicView(), { properties: [] }, 'nothing is public until staff list a room')
  await assert.rejects(db.query('select * from public.room_listings'), /permission denied/)
  await assert.rejects(db.query('select * from public.units'), /permission denied/)
  await assert.rejects(list(free, true), /permission denied/)

  // A clerk or owner with MFA may list rooms; AAL1 and outsiders may not.
  await as(clerk, 'aal1'); await assert.rejects(list(free, true), /Staff MFA required/)
  await as(outsider); await assert.rejects(list(free, true), /Staff MFA required/)
  await as(clerk)
  await assert.rejects(list(free, true, '0'), /positive monthly rent/)
  await assert.rejects(list(archivedRoom, true), /active room/)
  await list(free, true)
  await list(occupied, true, '3000.00', 'Ground floor')
  await list(b2room, true, '4200.50', 'Near the gym')
  await as(owner)
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, agreement, tenant, occupied, '2024-01-01', '3000.00'])

  await anonymous()
  const view = await publicView()
  assert.deepEqual(view, { properties: [{ name: 'Fictional boarding houses', buildings: [
    { label: 'Building 1', rooms: [{ unit_id: free, room: 'Room 01', asking_rent: '3500.00', description: 'Second floor, good for 2 persons' }] },
    { label: 'Building 2', rooms: [{ unit_id: b2room, room: 'Room 05', asking_rent: '4200.50', description: 'Near the gym' }] },
  ] }] }, 'only listed rooms without a current agreement, and only public fields')
  assert.equal(JSON.stringify(view).includes('Sample Private Tenant'), false)

  // Visitors may leave inquiries for listed, available rooms only; retries are safe; spam is limited.
  await inquire(20, free)
  await inquire(20, free)
  await assert.rejects(inquire(21, occupied), /no longer listed/)
  await assert.rejects(inquire(22, free, 'x'), /Enter your name/)
  await assert.rejects(inquire(23, free, '0917 000 0000', ' '), /Enter your name/)
  await inquire(24, b2room)
  await inquire(25, free, ' 0917 000 0000 ')
  await assert.rejects(inquire(26, free), /Too many inquiries/, 'three per contact per day')
  await assert.rejects(db.query('select * from public.rental_inquiries'), /permission denied/)
  await assert.rejects(db.query('select public.read_rental_inquiries($1)', [prop]), /permission denied/)

  // Staff read and handle inquiries; visitors' details never reach the public view.
  await as(clerk)
  const inbox = (await db.query<any>('select public.read_rental_inquiries($1)', [prop])).rows[0].read_rental_inquiries
  assert.equal(inbox.inquiries.length, 3)
  assert.equal(inbox.listings.find((l: any) => l.unit_id === occupied).publicly_available, false)
  await db.query('select public.mark_inquiry_handled($1,$2)', [prop, id(20)])
  const handled = (await db.query<any>('select public.read_rental_inquiries($1)', [prop])).rows[0].read_rental_inquiries.inquiries
  assert.equal(handled.at(-1).id, id(20), 'handled inquiries sort after new ones')
  assert.ok(handled.at(-1).handled_at)

  // Move-out in the past returns a listed room to the public page; an upcoming agreement removes it.
  await as(owner)
  await db.query('select public.end_rental_agreement($1,$2,$3,$4,$5)', [prop, id(30), agreement, '2024-06-30', 'Moved out'])
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, id(31), tenant, b2room, '2099-01-01', '4200.50'])
  await anonymous()
  assert.deepEqual((await publicView()).properties[0].buildings.map((b: any) => [b.label, b.rooms.map((r: any) => r.room)]), [['Building 1', ['Room 01', 'Room 02']]])

  // Unlisting removes a room immediately; inquiries older than 90 days are deleted on the next submission.
  await as(clerk); await list(free, false)
  await db.exec('reset role')
  await db.query("update public.rental_inquiries set created_at = now() - interval '100 days' where id = $1", [id(24)])
  await anonymous()
  assert.deepEqual((await publicView()).properties[0].buildings[0].rooms.map((r: any) => r.room), ['Room 02'])
  await inquire(27, occupied, '0918 111 1111')
  await db.exec('reset role')
  assert.equal((await db.query('select 1 from public.rental_inquiries where id = $1', [id(24)])).rows.length, 0, '90-day retention')
})
