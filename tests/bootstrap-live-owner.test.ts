import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// The live-project owner script (scripts/bootstrap-live-owner.sql) on a disposable database with every migration.
test('live owner bootstrap needs filled-in values and a confirmed sign-in, runs once, and is safe to repeat', async t => {
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
  const script = await readFile('scripts/bootstrap-live-owner.sql', 'utf8')
  const filled = (email: string) => script.replace('REPLACE_WITH_OWNER_EMAIL', email).replace('REPLACE_WITH_PROPERTY_NAME', 'Fictional trial property')
  const owner = '87100000-0000-4000-8000-000000000001'
  await assert.rejects(db.exec(script), /Fill in the owner email/)
  await assert.rejects(db.exec(filled('owner@example.invalid')), /No confirmed sign-in/)
  await db.query("insert into auth.users(id, email, email_confirmed_at) values ($1, 'Owner@Example.invalid', now()), ('87100000-0000-4000-8000-000000000002', 'other@example.invalid', now())", [owner])
  await db.exec(filled('owner@example.invalid'))
  const rows = async () => (await db.query<{ name: string; role: string; user_id: string }>('select p.name, m.role, m.user_id from public.properties p join public.staff_memberships m on m.property_id = p.id')).rows
  assert.deepEqual(await rows(), [{ name: 'Fictional trial property', role: 'owner', user_id: owner }])
  await db.exec(filled('owner@example.invalid'))
  assert.equal((await rows()).length, 1, 'running again changes nothing')
  await assert.rejects(db.exec(filled('other@example.invalid')), /already has a property/)
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.audit_events where action = 'live_owner_bootstrapped'")).rows[0].n, 1)
})
