import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration. Proves browser roles cannot write tables directly, anonymous
// visitors hold no table rights at all, and objects added later start locked unless a migration grants them.
test('browser roles have no direct table rights and new objects start locked', async t => {
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
    -- Mimic Supabase's permissive defaults so the migration is shown to remove them.
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `)
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'))
  }
  const rights = await db.query<{ tablename: string; anon_any: boolean; auth_write: boolean }>(`
    select tablename,
      has_table_privilege('anon', format('public.%I', tablename), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_any,
      has_table_privilege('authenticated', format('public.%I', tablename), 'INSERT,UPDATE,DELETE,TRUNCATE') as auth_write
    from pg_tables where schemaname = 'public' order by tablename`)
  assert.ok(rights.rows.length >= 21, 'all application tables are checked')
  assert.deepEqual(rights.rows.filter(r => r.anon_any).map(r => r.tablename), [], 'anonymous visitors hold no table rights')
  assert.deepEqual(rights.rows.filter(r => r.auth_write).map(r => r.tablename), [], 'signed-in users cannot write tables directly; writes go through reviewed functions')

  // A table or function added by a future migration without explicit grants is not reachable from the browser.
  await db.exec(`create table public.future_table(id int); create function public.future_function() returns int language sql as 'select 1';`)
  const future = (await db.query<{ anon_table: boolean; auth_table: boolean; anon_fn: boolean; auth_fn: boolean }>(`select
    has_table_privilege('anon','public.future_table','SELECT') as anon_table,
    has_table_privilege('authenticated','public.future_table','SELECT') as auth_table,
    has_function_privilege('anon','public.future_function()','EXECUTE') as anon_fn,
    has_function_privilege('authenticated','public.future_function()','EXECUTE') as auth_fn`)).rows[0]
  assert.deepEqual(future, { anon_table: false, auth_table: false, anon_fn: false, auth_fn: false })
})
