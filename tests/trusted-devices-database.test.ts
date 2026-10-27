import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; Supabase identity and request headers are stubbed.
test('a remembered device stands in for the authenticator code only for its own user, for 30 days, until removed', async t => {
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
  const id = (n: number) => '82000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop, renter] = Array.from({ length: 4 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${renter}','renter@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');
    insert into public.tenants(id,property_id,display_name,kind) values('${id(9)}','${prop}','Sample Tenant','individual');`)
  async function as(user: string, aal: string, device = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)",
      [user, JSON.stringify({ sub: user, aal }), JSON.stringify(device ? { 'x-rentbybob-device': device } : {})])
    await db.exec('set role authenticated')
  }
  const seesTenants = async () => (await db.query<any>('select count(*)::int as n from public.tenants')).rows[0].n > 0
  const remember = async (label = 'Office laptop') => (await db.query<any>('select public.remember_device($1) as r', [label])).rows[0].r

  // Password-only (aal1) staff see nothing; remembering needs a real authenticator check.
  await as(clerk, 'aal1')
  assert.equal(await seesTenants(), false)
  await assert.rejects(remember(), /authenticator check is required/)
  await as(clerk, 'aal2')
  const device = await remember()
  assert.equal(device.secret.length, 128)
  assert.ok(new Date(device.expires_at).getTime() - Date.now() > 29.9 * 86400000 && new Date(device.expires_at).getTime() - Date.now() <= 30 * 86400000 + 5000)

  // The remembered browser: password sign-in now counts as staff-verified.
  await as(clerk, 'aal1', device.secret)
  assert.equal(await seesTenants(), true)
  assert.equal((await db.query<any>('select public.check_trusted_device() as ok')).rows[0].ok, true)
  const listed = (await db.query<any>('select public.list_trusted_devices() as l')).rows[0].l
  assert.equal(listed.length, 1); assert.equal(listed[0].current, true); assert.equal(listed[0].label, 'Office laptop')
  assert.ok(!JSON.stringify(listed).includes(device.secret), 'the secret is never listed')
  // A remembered device cannot extend itself without the authenticator.
  await assert.rejects(remember('Extension attempt'), /authenticator check is required/)

  // Wrong secret, someone else's secret, or a short guess: no access.
  await as(clerk, 'aal1', device.secret.slice(0, -1) + (device.secret.endsWith('a') ? 'b' : 'a'))
  assert.equal(await seesTenants(), false)
  await as(owner, 'aal1', device.secret)
  assert.equal(await seesTenants(), false, "another user's device secret does not work")
  await as(clerk, 'aal1', 'short')
  assert.equal((await db.query<any>('select public.check_trusted_device() as ok')).rows[0].ok, false)
  // The secret is stored only as a hash.
  await db.exec('reset role')
  assert.equal((await db.query<any>('select count(*)::int as n from private.trusted_devices where token_hash = $1', [device.secret])).rows[0].n, 0)
  assert.equal((await db.query<any>("select count(*)::int as n from public.audit_events where action='trusted_device_added'")).rows[0].n, 1)

  // Expired devices stop working.
  await db.query("update private.trusted_devices set expires_at = now() - interval '1 second'")
  await as(clerk, 'aal1', device.secret)
  assert.equal(await seesTenants(), false)
  await db.exec('reset role'); await db.query("update private.trusted_devices set expires_at = now() + interval '1 day'")

  // Removing staff access also removes what the device unlocks.
  await db.query('update public.staff_memberships set revoked_at = now() where user_id = $1', [clerk])
  await as(clerk, 'aal1', device.secret)
  assert.equal(await seesTenants(), false)
  await db.exec('reset role'); await db.query('update public.staff_memberships set revoked_at = null where user_id = $1', [clerk])

  // Forgetting the current device (as on "forget this device" sign-out) ends it immediately.
  await as(clerk, 'aal1', device.secret)
  await db.query('select public.forget_trusted_device(null)')
  assert.equal(await seesTenants(), false)

  // At most five remembered devices per person; renters cannot remember devices; anonymous callers cannot call.
  await as(owner, 'aal2')
  for (let i = 0; i < 7; i++) await remember(`Device ${i}`)
  assert.equal((await db.query<any>('select jsonb_array_length(public.list_trusted_devices()) as n')).rows[0].n, 5)
  await as(renter, 'aal2')
  await assert.rejects(remember(), /authenticator check is required/)
  await db.exec('reset role'); await db.exec('set role anon')
  await assert.rejects(db.query("select public.remember_device('x')"), /permission denied/)
  await assert.rejects(db.query('select * from private.trusted_devices'), /permission denied/)
})
