import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('renters report payments for their own room only; reports never change balances until staff record and confirm cash', async t => {
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
  const id = (n: number) => '86000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop, renter, stranger] = Array.from({ length: 5 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${renter}','renter@example.invalid',now()),('${stranger}','stranger@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner)
  await db.query('select public.setup_property_from_sketch($1)', [prop])
  await db.exec('reset role')
  const room = (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Bob''s house' and u.label='Room 01'"))[0].id
  const today = (await q("select (now() at time zone 'Asia/Manila')::date::text as d"))[0].d as string
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), room, '2026-01-05', '3500.00'])
  await db.query("select public.add_rent_month($1,$2,$3,$4)", [prop, id(30), id(20), today.slice(0, 7) + '-01'])
  await db.exec('reset role')
  await db.query('insert into public.tenant_contacts(property_id,tenant_id,user_id) values($1,$2,$3)', [prop, id(10), renter])
  const report = (n: number, amount = '3500.00', paidOn = today, paidTo = 'Bob') => db.query('select public.report_rent_payment($1,$2,$3,$4,$5,$6)', [id(n), id(20), amount, paidOn, paidTo, 'Paid at the gate'])
  const balance = async () => { await db.exec('reset role'); return (await q('select (sum(amount) - coalesce((select sum(al.amount) from public.cash_allocations al join public.rent_charges ch on ch.id = al.charge_id where ch.agreement_id = $1), 0))::text as b from public.rent_charges where agreement_id = $1', [id(20)]))[0].b }

  // The linked renter (no staff MFA needed) reports a payment; a retry is safe; the balance does not move.
  await as(renter, 'aal1')
  await report(40); await report(40)
  assert.equal(await balance(), '3500.00', 'a report never changes the balance')
  await as(renter, 'aal1')
  const mine = (await q('select public.read_my_payment_reports() as r'))[0].r
  assert.deepEqual(mine.map((r: any) => [r.amount, r.status, r.paid_to]), [['3500.00', 'new', 'Bob']])
  // Validation: future date, older than 90 days, zero, bad collector.
  const future = (await q("select ((now() at time zone 'Asia/Manila')::date + 1)::text as d"))[0].d
  const old = (await q("select ((now() at time zone 'Asia/Manila')::date - 91)::text as d"))[0].d
  await assert.rejects(report(41, '3500.00', future), /within the last 90 days/)
  await assert.rejects(report(42, '3500.00', old), /within the last 90 days/)
  await assert.rejects(report(43, '0'), /within the last 90 days/)
  await assert.rejects(report(44, '100.00', today, 'Mallory'), /within the last 90 days/)
  // Only the renter of this room: a stranger, staff (not renters) and anonymous visitors cannot report.
  await as(stranger, 'aal1'); await assert.rejects(report(45), /Only the renter/)
  await as(clerk); await assert.rejects(report(46), /Only the renter/)
  await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(report(47), /permission denied/)
  // Rate limit: at most 5 waiting reports per room.
  await as(renter, 'aal1')
  for (const n of [48, 49, 50, 51]) await report(n, '10.00')
  await assert.rejects(report(52, '10.00'), /Too many reports/)
  // Renters cannot read the staff list or handle reports; neither can staff without MFA.
  await assert.rejects(q('select public.read_payment_reports($1)', [prop]), /Staff MFA required/)
  await assert.rejects(db.query("select public.resolve_payment_report($1,$2,'dismissed',null,'Mine')", [prop, id(40)]), /Staff MFA required/)
  await as(clerk, 'aal1')
  await assert.rejects(q('select public.read_payment_reports($1)', [prop]), /Staff MFA required/)
  await assert.rejects(db.query("select public.resolve_payment_report($1,$2,'dismissed',null,'No MFA')", [prop, id(40)]), /Staff MFA required/)
  await db.exec('reset role')
  assert.deepEqual((await q("select status from public.renter_payment_reports where id = $1", [id(40)])).map(r => r.status), ['new'])

  // Staff see the reports; recording needs real cash for this room; dismissing needs a reason.
  await as(clerk)
  assert.equal((await q('select jsonb_array_length(public.read_payment_reports($1)) as n', [prop]))[0].n, 5)
  await assert.rejects(db.query("select public.resolve_payment_report($1,$2,'recorded',$3,null)", [prop, id(40), id(99)]), /Record the cash/)
  await db.query("select public.record_rent_cash($1,$2,$3,'3500.00',$4,'Bob')", [prop, id(60), id(20), today])
  await db.query("select public.resolve_payment_report($1,$2,'recorded',$3,null)", [prop, id(40), id(60)])
  await db.query("select public.resolve_payment_report($1,$2,'recorded',$3,null)", [prop, id(40), id(60)])
  await assert.rejects(db.query("select public.resolve_payment_report($1,$2,'dismissed',null,'  ')", [prop, id(48)]), /reason/)
  await db.query("select public.resolve_payment_report($1,$2,'dismissed',null,'No cash received on that day')", [prop, id(48)])
  assert.equal(await balance(), '3500.00', 'recorded cash is still pending until the verifier confirms it')
  await as(renter, 'aal1')
  const statuses = Object.fromEntries((await q('select public.read_my_payment_reports() as r'))[0].r.map((r: any) => [r.id, [r.status, r.handled_note]]))
  assert.deepEqual(statuses[id(40)], ['recorded', null])
  assert.deepEqual(statuses[id(48)], ['dismissed', 'No cash received on that day'])
  // A revoked renter link removes access to report and to read.
  await db.exec('reset role'); await db.query('update public.tenant_contacts set revoked_at = now() where user_id = $1', [renter])
  await as(renter, 'aal1')
  await assert.rejects(report(53, '10.00'), /Only the renter/)
  assert.deepEqual((await q('select public.read_my_payment_reports() as r'))[0].r, [])
  await db.exec('reset role')
  assert.equal((await q("select count(*)::int as n from public.audit_events where action like 'renter_payment%'"))[0].n, 7)
})
