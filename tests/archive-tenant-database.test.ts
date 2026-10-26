import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('archiving a tenant requires the owner, a reason, and no current room agreement', async t => {
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
  const id = (n: number) => '81000000-0000-4000-8000-' + String(n).padStart(12, '0')
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
  const room = (await db.query<any>("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Bob''s house' and u.label='Room 01'")).rows[0].id
  const today = (await db.query<any>("select (now() at time zone 'Asia/Manila')::date::text as d")).rows[0].d
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Housed Renter', 'individual', id(20), room, '2026-01-05', '3500.00'])
  await db.query('select public.register_tenant($1,$2,$3,$4,null,null,null,null)', [prop, id(11), 'Sample Roomless Renter', 'individual'])
  const archived = async (tenant: string) => { await db.exec('reset role'); return (await db.query<any>('select archived_at is not null as a from public.tenants where id=$1', [tenant])).rows[0].a }

  // A tenant with an open room agreement cannot be archived; after move-out ending today, still not until tomorrow.
  await as(owner)
  await assert.rejects(db.query('select public.archive_tenant($1,$2)', [id(10), 'Moved away']), /move-out before archiving/)
  await db.query('select public.end_rental_agreement($1,$2,$3,$4,$5)', [prop, id(30), id(20), today, 'Fictional move-out'])
  await assert.rejects(db.query('select public.archive_tenant($1,$2)', [id(10), 'Moved away']), /move-out before archiving/)
  assert.equal(await archived(id(10)), false)

  // Reason required; clerks and AAL1 owners cannot archive; owner with MFA can archive a roomless tenant, idempotently.
  await as(owner)
  await assert.rejects(db.query('select public.archive_tenant($1,$2)', [id(11), '  ']), /reason/)
  await as(clerk)
  await assert.rejects(db.query('select public.archive_tenant($1,$2)', [id(11), 'Clerk attempt']), /Access denied/)
  await as(owner, 'aal1')
  await assert.rejects(db.query('select public.archive_tenant($1,$2)', [id(11), 'No MFA']), /Access denied/)
  await as(owner)
  await db.query('select public.archive_tenant($1,$2)', [id(11), 'Never moved in'])
  await db.query('select public.archive_tenant($1,$2)', [id(11), 'Never moved in'])
  assert.equal(await archived(id(11)), true)
  await db.exec('reset role')
  assert.equal((await db.query<any>("select count(*)::int as n from public.audit_events where action='tenant_archived' and tenant_id=$1", [id(11)])).rows[0].n, 1)
  // Archived tenants cannot get a new room.
  await as(owner)
  const room2 = (await db.query<any>("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Bob''s house' and u.label='Room 02'")).rows[0].id
  await assert.rejects(db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, id(40), id(11), room2, '2026-10-01', '3000.00']), /active tenant/)
})
