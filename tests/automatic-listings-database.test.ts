import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('automatic listing shows vacant rooms, hides occupied or staff-hidden ones, and returns rooms after move-out', async t => {
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
  const id = (n: number) => '83000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop] = Array.from({ length: 3 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal: 'aal2' })])
    await db.exec('set role authenticated')
  }
  async function publicRooms() {
    await db.exec('reset role'); await db.exec('set role anon')
    const data = (await db.query<any>('select public.read_public_listings() as d')).rows[0].d
    return data.properties.flatMap((p: any) => p.buildings.flatMap((b: any) => b.rooms.map((r: any) => ({ name: `${b.label} ${r.room}`, rent: r.asking_rent, id: r.unit_id }))))
  }
  const names = async () => (await publicRooms()).map((r: any) => r.name).sort()
  await as(owner)
  await db.query('select public.setup_property_from_sketch($1)', [prop])
  const unit = async (building: string, label: string) => { await db.exec('reset role'); return (await db.query<any>('select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label=$1 and u.label=$2', [building, label])).rows[0].id }
  const room1 = await unit("Bob's house", 'Room 01'), room2 = await unit("Bob's house", 'Room 02'), gym = await unit('Building 2', 'Gym')

  // Off by default: nothing is public until listed or staff turn automatic listing on.
  assert.deepEqual(await names(), [])
  await as(clerk) // the clerk runs the system and may switch automatic listing on
  await db.query('select public.set_auto_listing($1,true)', [prop])
  const all = await names()
  assert.equal(all.length, 25, 'every rentable room is shown automatically (30 spaces minus the shared gym and the 4 private commercial spaces)')
  assert.ok(all.includes("Bob's house Room 01") && !all.some((n: string) => n.includes('Gym') || n.startsWith('Store') || n.startsWith('Yamaha')))
  assert.equal((await publicRooms()).find((r: any) => r.id === room1).rent, null, 'no asking rent: shown as "Ask for the price"')

  // Assigning a tenant (now or for a future move-in) hides the room at once.
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), room1, '2026-01-05', '3500.00'])
  await db.query("select public.register_tenant($1,$2,$3,$4,$5,$6,(now() at time zone 'Asia/Manila')::date + 30,$7)", [prop, id(11), 'Sample Future Renter', 'individual', id(21), room2, '3000.00'])
  let shown = await names()
  assert.ok(!shown.includes("Bob's house Room 01") && !shown.includes("Bob's house Room 02"))
  // Inquiries cannot target a hidden room.
  await db.exec('reset role'); await db.exec('set role anon')
  await assert.rejects(db.query("select public.submit_rental_inquiry($1,$2,'Visitor','0917 000 0000','Hi')", [id(30), room1]), /no longer listed/)

  // After the move-out date has passed, the room comes back by itself.
  await db.exec('reset role')
  await db.query("update public.rental_agreements set ended_on = (now() at time zone 'Asia/Manila')::date - 1, end_reason = 'Fictional move-out', ended_by = $2, ended_at = now(), end_request_id = $3 where id = $1", [id(20), owner, id(40)])
  assert.ok((await names()).includes("Bob's house Room 01"))

  // Staff can hide a vacant room; it stays hidden until shown again (with an optional rent).
  await as(clerk)
  await db.query('select public.set_room_listing($1,$2,false,null,null)', [prop, room1])
  assert.ok(!(await names()).includes("Bob's house Room 01"))
  await as(clerk)
  await db.query("select public.set_room_listing($1,$2,true,3200.50,'Near the gate')", [prop, room1])
  assert.equal((await publicRooms()).find((r: any) => r.id === room1).rent, '3200.50')
  await as(clerk)
  await assert.rejects(db.query('select public.set_room_listing($1,$2,true,0,null)', [prop, room1]), /positive monthly rent/)
  await assert.rejects(db.query('select public.set_room_listing($1,$2,true,null,null)', [prop, gym]), /rentable room/)
  // Stores and the Yamaha space are private negotiations: they can never be listed publicly (202610270011).
  const store = await unit('Store 1', 'Store 1').catch(() => null) ?? (await db.query<any>("select u.id from public.units u where u.kind = 'commercial' limit 1")).rows[0].id
  await as(clerk)
  await assert.rejects(db.query('select public.set_room_listing($1,$2,true,3000,null)', [prop, store]), /rentable room/)

  // Turning automatic listing off leaves only rooms staff listed explicitly.
  await as(owner)
  await db.query('select public.set_auto_listing($1,false)', [prop])
  assert.deepEqual(await names(), ["Bob's house Room 01"])
  await db.exec('reset role')
  assert.equal((await db.query<any>("select count(*)::int as n from public.audit_events where action in ('auto_listing_enabled','auto_listing_disabled')")).rows[0].n, 2)
})
