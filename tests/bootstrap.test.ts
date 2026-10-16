import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('local bootstrap is atomic, restricted to fictional confirmed identities and retry-safe', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`)
    for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
    }
    const owner='00000000-0000-4000-8000-000000000001'
    const property='00000000-0000-4000-8000-000000000002'
    const template=await readFile('scripts/bootstrap-local-owner.sql','utf8')
    const sql=template.replaceAll('__OWNER_ID__',owner).replaceAll('__PROPERTY_ID__',property)
    const rejected = async () => { await assert.rejects(db.exec(sql)); await db.exec('rollback') }
    await rejected()
    await db.query('insert into auth.users values($1,$2,now())',[owner,'fictional@example.com'])
    await rejected()
    await db.query('update auth.users set email=$1,email_confirmed_at=null',['owner@example.invalid'])
    await rejected()
    await db.exec('update auth.users set email_confirmed_at=now(); set role authenticated')
    await rejected()
    await db.exec('reset role')
    // Deliberately fail the final audit insert: property and membership must roll back.
    await db.exec("alter table public.audit_events add constraint reject_bootstrap check(action <> 'local_owner_bootstrapped')")
    await rejected()
    assert.equal((await db.query('select * from public.properties')).rows.length,0)
    assert.equal((await db.query('select * from public.staff_memberships')).rows.length,0)
    await db.exec('alter table public.audit_events drop constraint reject_bootstrap')
    await db.exec(sql)
    await db.exec(sql)
    assert.equal((await db.query('select * from public.audit_events')).rows.length,1)
    await assert.rejects(db.exec(sql.replaceAll(property,'00000000-0000-4000-8000-000000000003')))
    await db.exec('rollback')
    await db.exec('update public.staff_memberships set revoked_at=now()')
    await rejected()
  } finally { await db.close() }
})
