import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Migration 202611010002: each person reads and changes only their own name and picture; bad input is refused.
test('account profiles are private to each person and validated', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
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
    const [ana, ben] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
    await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [ana, 'ana@example.invalid', ben, 'ben@example.invalid'])
    const as = async (user: string | null) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
      await db.exec(user ? 'set role authenticated' : 'set role anon')
    }
    type Row = { preferred_name: string | null; photo: string | null; welcomed: boolean }
    const call = async (sql: string, params: unknown[] = []) => (await db.query<{ r: Row }>(`select ${sql} as r`, params)).rows[0].r
    const code = (expected: string) => (error: unknown) => (error as { code: string }).code === expected
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400) + '=='

    await as(null)
    await assert.rejects(db.query('select public.read_my_profile()'), code('42501'))
    await as(ana)
    await assert.rejects(db.query('select * from public.account_profiles'), code('42501'))
    assert.deepEqual(await call('public.read_my_profile()'), { preferred_name: null, photo: null, welcomed: false })

    assert.deepEqual(await call('public.save_my_profile($1,$2,true)', ['  Ana  ', photo]), { preferred_name: 'Ana', photo, welcomed: true })
    assert.deepEqual(await call('public.save_my_profile($1,null,false)', ['Ate Ana']), { preferred_name: 'Ate Ana', photo, welcomed: true }, 'photo kept when not changed')
    assert.equal((await call('public.dismiss_profile_welcome()')).preferred_name, 'Ate Ana', 'later never wipes a saved profile')

    for (const bad of ['x'.repeat(41), 'Ana <script>']) await assert.rejects(db.query('select public.save_my_profile($1,null,false)', [bad]), code('22023'))
    for (const bad of ['https://example.com/a.jpg', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(150001)]) {
      await assert.rejects(db.query('select public.save_my_profile($1,$2,true)', ['Ana', bad]), code('22023'))
    }

    await as(ben)
    assert.deepEqual(await call('public.read_my_profile()'), { preferred_name: null, photo: null, welcomed: false }, 'Ben never sees Ana')
    assert.equal((await call('public.dismiss_profile_welcome()')).welcomed, true)
    await as(ana)
    assert.equal((await call('public.save_my_profile($1,null,true)', [''])).photo, null, 'blank name and removed photo')
    assert.equal((await call('public.read_my_profile()')).preferred_name, null)

    await db.exec('reset role')
    await db.query('delete from auth.users where id = $1', [ana])
    assert.equal((await db.query('select * from public.account_profiles where user_id = $1', [ana])).rows.length, 0, 'deleting an account removes its profile')
  } finally { await db.close() }
})
