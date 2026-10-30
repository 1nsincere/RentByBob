import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// The owner's list of sign-in accounts (202610300002), on a disposable database with every real migration.
test('owners see waiting and own-property accounts, never another property\'s users; clerks see it too', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;
  `)
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
  const id = (n: number) => '8c000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [ownerA, clerkA, ownerB, waiting, tenantB, neverSigned, propA, propB] = Array.from({ length: 8 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values
      ('${ownerA}','owner-a@example.invalid',now(),now()), ('${clerkA}','clerk-a@example.invalid',now(),now() - interval '1 day'),
      ('${ownerB}','owner-b@example.invalid',now(),now()), ('${waiting}','waiting@example.invalid',now(),now() - interval '1 hour'),
      ('${tenantB}','tenant-b@example.invalid',now(),now()), ('${neverSigned}','new@example.invalid',null,null);
    insert into public.properties(id,name) values('${propA}','Property A'),('${propB}','Property B');
    insert into public.staff_memberships(property_id,user_id,role) values('${propA}','${ownerA}','owner'),('${propA}','${clerkA}','clerk'),('${propB}','${ownerB}','owner');
    insert into public.tenants(id,property_id,display_name,kind) values('${id(20)}','${propB}','Sample B Renter','individual');
    insert into public.tenant_contacts(property_id,tenant_id,user_id) values('${propB}','${id(20)}','${tenantB}');`)
  const as = async (user: string, aal = 'aal2') => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const list = async (prop: string) => (await db.query<{ l: { email: string; access: string; confirmed: boolean }[] }>('select public.list_access_candidates($1) as l', [prop])).rows[0].l

  await as(ownerA)
  const seen = await list(propA)
  assert.deepEqual(seen.map(r => r.email), ['owner-a@example.invalid', 'waiting@example.invalid', 'clerk-a@example.invalid', 'new@example.invalid'], 'newest sign-in first; never signed in last')
  assert.deepEqual(Object.fromEntries(seen.map(r => [r.email, r.access])), { 'owner-a@example.invalid': 'owner', 'waiting@example.invalid': 'none', 'clerk-a@example.invalid': 'clerk', 'new@example.invalid': 'none' })
  assert.ok(!seen.some(r => r.email.includes('-b@')), "property B's owner and tenant stay private")
  assert.equal(seen.find(r => r.email === 'new@example.invalid')?.confirmed, false)

  await as(clerkA); assert.equal((await list(propA)).length, seen.length, 'clerks see the same list (202610300003)')
  await as(ownerA, 'aal1'); await assert.rejects(list(propA), /MFA required/)
  await as(ownerA); await assert.rejects(list(propB), /MFA required/, 'not the owner of B')
  await db.exec('reset role'); await db.exec('set role anon')
  await assert.rejects(list(propA), /permission denied/)
})
