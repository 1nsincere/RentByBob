import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// 202610280004: the clerk runs the rental system and the owner oversees. Operational actions work for any staff
// member with MFA; who may sign in (access, invitations, the audit history) stays owner-only; cash confirmation is
// the clerk's; and nothing works without a staff MFA session. Disposable database with every real migration.
test('clerks run operations, owners keep access control, and MFA is always required', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to authenticated, anon; grant execute on all functions in schema auth to authenticated, anon;
  `)
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
  const id = (n: number) => '8b000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, other, prop] = [id(1), id(2), id(3), id(4)]
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${other}','other@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(clerk)
  // The clerk sets up the layout, adds tenants, removes one with a room, switches automatic rent on, records and voids maintenance.
  await db.query('select public.setup_property_from_sketch($1)', [prop])
  await db.exec('reset role')
  const room = (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Building 1' and u.label='Room 04'"))[0].id
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), room, '2026-01-05', '3500.00'])
  await db.query('select public.set_auto_listing($1,true)', [prop])
  await db.query('select public.set_auto_rent($1,true)', [prop])
  await db.query('select public.record_maintenance_expense($1,$2,$3,$4,$5,$6)', [prop, id(30), '2026-10-01', 'Roof', null, '100.00'])
  await db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(30), 'Entered twice'])
  await db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'Moved away'])
  await db.exec('reset role')
  assert.equal((await q('select removed_at is not null as r from public.tenants where id = $1', [id(10)]))[0].r, true, 'the clerk removed a tenant who had a room')

  // Access control stays with the owner: the clerk cannot change who may sign in, designate verifiers or read the access history.
  await as(clerk)
  await assert.rejects(db.query('select public.set_staff_access($1,$2,$3,$4)', [prop, other, 'clerk', 'Not allowed']), /permission denied|Owner MFA required/)
  await assert.rejects(db.query('select public.assign_account_access($1,$2,$3,$4,$5,$6,$7,$8)', [prop, other, 'other@example.invalid', 'staff', null, 'clerk', true, 'Not allowed']), /Owner MFA required/)
  await assert.rejects(db.query('select public.read_access_audit($1)', [prop]), /Owner MFA required/)
  await assert.rejects(db.query('select public.assign_cash_verifier($1,$2,$3)', [prop, clerk, 'clerk@example.invalid']), /Owner MFA required/)
  await assert.rejects(db.query('select public.prepare_account_invitation($1,$2,$3,$4)', [prop, id(40), 'staff', 'new@example.invalid']), /./, 'a clerk cannot invite staff accounts')

  // Without MFA nobody operates, clerk or owner; strangers and anonymous callers get nothing.
  await as(clerk, 'aal1'); await assert.rejects(db.query('select public.archive_tenant($1,$2)', [id(10), 'No MFA']), /MFA|denied/)
  await as(owner, 'aal1'); await assert.rejects(db.query('select public.set_auto_rent($1,false)', [prop]), /MFA/)
  await as(other); await assert.rejects(db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'Stranger']), /Access denied|MFA/)
  await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'Anon']), /permission denied/)
  await db.exec('reset role')

  // The owner keeps every operational power too (oversight can still correct things).
  await as(owner)
  await db.query('select public.set_auto_rent($1,false)', [prop])
  await q('select * from public.read_access_audit($1)', [prop]) // the owner can still read the access history
})
