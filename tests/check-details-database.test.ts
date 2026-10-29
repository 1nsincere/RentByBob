import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Bank name and check number on checks (202610270014), on a disposable database with every migration.
test('check bank details are staff-only, fill-in only, audited, and never touch amounts or balances', async t => {
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
  const id = (n: number) => '88000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop, stranger] = [id(1), id(2), id(3), id(4)]
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${stranger}','stranger@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner); await db.query('select public.setup_property_from_sketch($1)', [prop]); await db.exec('reset role')
  const room = (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Building 1' and u.label='Room 04'"))[0].id
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), room, '2026-01-05', '3500.00'])
  const ref = (await q("select public.record_rent_check($1,$2,$3,'2500.00',(now() at time zone 'Asia/Manila')::date,(now() at time zone 'Asia/Manila')::date,'James') as r", [prop, id(30), id(20)]))[0].r
  const details = async () => { await as(clerk); return (await q('select public.read_check_details($1) as d', [prop]))[0].d }
  const save = (bank: string | null, num: string | null, reference = ref) => db.query('select public.record_check_details($1,$2,$3,$4)', [prop, reference, bank, num])

  assert.deepEqual(await details(), {}, 'no details yet')
  await assert.rejects(save(null, '  '), /bank name or the check number/)
  await assert.rejects(save('BDO', '12 34'), /letters, digits or dashes/)
  await assert.rejects(save('BDO', null, 'CHK-9999'), /Check unavailable/)
  await save('BDO', null)
  await save(null, '001234')
  await save('BDO', '001234')
  assert.deepEqual(await details(), { [id(30)]: { bank_name: 'BDO', check_number: '001234' } })
  await assert.rejects(save('BPI', null), /already saved differently/)
  // Staff names: current staff of this property only.
  assert.deepEqual((await q('select public.read_staff_names($1) as n', [prop]))[0].n, { [owner]: 'owner@example.invalid', [clerk]: 'clerk@example.invalid' })
  await db.exec('reset role'); await db.query('update public.staff_memberships set revoked_at = now() where user_id = $1', [owner]); await as(clerk)
  assert.deepEqual((await q('select public.read_staff_names($1) as n', [prop]))[0].n, { [clerk]: 'clerk@example.invalid' }, 'revoked staff are not listed')
  await as(stranger, 'aal1'); await assert.rejects(q('select public.read_staff_names($1)', [prop]), /Staff MFA required/)
  // Not staff, or staff without MFA: denied. Anonymous: no access at all.
  await as(stranger, 'aal1'); await assert.rejects(save('BDO', null), /Staff MFA required/)
  await as(clerk, 'aal1'); await assert.rejects(q('select public.read_check_details($1)', [prop]), /Staff MFA required/)
  await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(save('BDO', null), /permission denied/)
  await db.exec('reset role')
  const check = (await q('select amount::text, status from public.check_records where id = $1', [id(30)]))[0]
  assert.deepEqual(check, { amount: '2500.00', status: 'received' }, 'details never change amount or status')
  assert.equal((await q("select count(*)::int as n from public.audit_events where action = 'rent_check_details_recorded'"))[0].n, 2, 'two real changes audited; the repeat is a no-op')
})
