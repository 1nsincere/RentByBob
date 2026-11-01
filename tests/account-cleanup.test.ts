import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// scripts/find-account-references.sql and scripts/delete-test-account.sql, run against a disposable database built
// from every migration (only Supabase's identity contract is stubbed, as in database.test.ts).
test('test-account cleanup removes only a test account and refuses owners and accounts in real records', async () => {
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
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    const [owner, testUser, keeper, property, tenant, attempt] = [1, 2, 3, 10, 20, 30].map(id)
    await db.exec(`
      insert into auth.users(id,email,email_confirmed_at) values
        ('${owner}','owner@example.invalid',now()), ('${testUser}','tester@example.com',now()), ('${keeper}','keeper@example.com',now());
      insert into public.properties(id,name) values ('${property}','Fictional property');
      insert into public.staff_memberships(property_id,user_id,role) values ('${property}','${owner}','owner');
      insert into public.tenants(id,property_id,display_name,kind) values ('${tenant}','${property}','Sample tenant','individual');
      insert into public.tenant_contacts(property_id,tenant_id,user_id) values ('${property}','${tenant}','${testUser}');
      insert into public.audit_events(property_id,actor_id,action,target_id,reason) values ('${property}','${testUser}','test_action','${tenant}','Test row');
      insert into private.invitation_attempts(attempt_id,property_id,requester_id,account_type,recipient_email,status,provider_user_id,dispatch_actor_id)
        values ('${attempt}','${property}','${owner}','tenant','tester@example.com','accepted','${testUser}','${owner}');
      insert into private.invitation_attempt_reviews(attempt_id,actor_id,reason,evidence_source)
        values ('${attempt}','${owner}','Checked','Test');
    `)
    const script = async (name: string, email: string) => {
      const sql = (await readFile(`scripts/${name}`, 'utf8')).replace('PUT-THE-TEST-EMAIL-HERE@gmail.com', email)
      return db.exec(sql)
    }
    const count = async (sql: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n)

    const found = await script('find-account-references.sql', 'Tester@Example.com')
    const listed = found.at(-1)!.rows as { table_name: string; rows: number }[]
    assert.deepEqual(listed.map(row => row.table_name).sort(),
      ['audit_events', 'private.invitation_attempts', 'private.invitation_attempts', 'tenant_contacts'].sort())

    await assert.rejects(script('delete-test-account.sql', 'owner@example.invalid'), /owner account/)
    await db.exec(`update public.properties set auto_rent_by = '${keeper}'`)
    await assert.rejects(script('delete-test-account.sql', 'keeper@example.com'), /real records:.*auto_rent_by/)
    assert.equal(await count(`auth.users where id = '${keeper}'`), 1, 'a refused delete changes nothing')

    await script('delete-test-account.sql', 'tester@example.com')
    assert.equal(await count(`auth.users where id = '${testUser}'`), 0)
    assert.equal(await count(`public.tenant_contacts where user_id = '${testUser}'`), 0)
    assert.equal(await count(`public.audit_events where actor_id = '${testUser}'`), 0)
    assert.equal(await count(`private.invitation_attempts where attempt_id = '${attempt}'`), 0)
    assert.equal(await count('private.invitation_attempt_reviews'), 0)
    assert.equal(await count(`public.tenants where id = '${tenant}'`), 1, 'the tenant record itself stays')
    assert.equal(await count(`auth.users where id in ('${owner}','${keeper}')`), 2)
    await assert.rejects(script('find-account-references.sql', 'tester@example.com'), /No account uses the email/)
  } finally { await db.close() }
})
