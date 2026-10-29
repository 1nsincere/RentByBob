import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('one-step tenant registration is all-or-nothing, retry-safe and staff-only', async t => {
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
  const id = (n: number) => '80000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop] = Array.from({ length: 3 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  await as(owner)
  await db.query('select public.setup_property_from_sketch($1)', [prop])
  const unit = async (building: string, label: string) => (await db.query<any>('select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label=$1 and u.label=$2', [building, label])).rows[0].id
  const room1 = await unit("Bob's house", 'Room 01'), room2 = await unit("Bob's house", 'Room 02'), gym = await unit('Building 2', 'Gym')
  const register = (tenant: number, name: string, unitId: string | null, agreement: number | null, moveIn: string | null = '2026-10-01', rent: string | null = '3500.00', kind = 'individual') =>
    db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(tenant), name, kind, agreement === null ? null : id(agreement), unitId, moveIn, rent])
  const counts = async () => { await db.exec('reset role'); const r = (await db.query<any>('select (select count(*) from public.tenants)::int as tenants, (select count(*) from public.rental_agreements)::int as agreements')).rows[0]; return [r.tenants, r.agreements] }

  // A clerk with MFA registers a tenant into a room in one step; a retry with the same IDs is safe.
  await as(clerk)
  await register(10, 'Sample One-Step Renter', room1, 20)
  await register(10, 'Sample One-Step Renter', room1, 20)
  assert.deepEqual(await counts(), [1, 1])

  // All-or-nothing: an occupied room or the shared gym refuses the agreement, and no tenant is left behind.
  await as(clerk)
  await assert.rejects(register(11, 'Sample Second Renter', room1, 21), /already has an agreement/)
  await assert.rejects(register(12, 'Sample Gym Renter', gym, 22), /rentable room/)
  await assert.rejects(register(13, 'Sample Missing Rent', room2, 23, '2026-10-01', null), /move-in date and monthly rent/)
  await assert.rejects(register(14, 'Sample Bad Rent', room2, 24, '2026-10-01', '0'), /Invalid agreement/)
  assert.deepEqual(await counts(), [1, 1], 'refused registrations leave no tenant or agreement')

  // Room can be assigned later; business tenants work the same way.
  await as(clerk)
  await register(15, 'Sample Assign Later', null, null, null, null)
  await register(16, 'Sample Barbershop', room2, 26, '2026-10-01', '2500.00', 'business')
  assert.deepEqual(await counts(), [3, 2])

  // Staff MFA required; anonymous callers cannot execute it.
  await as(clerk, 'aal1')
  await assert.rejects(register(17, 'Sample No MFA', null, null, null, null), /Access denied/)
  await db.exec('reset role'); await db.exec('set role anon')
  await assert.rejects(register(18, 'Sample Anonymous', null, null, null, null), /permission denied/)
})
