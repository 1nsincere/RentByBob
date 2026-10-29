import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('overpayment becomes advance credit that pays the next months automatically, and reversal reopens them', async t => {
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
  const id = (n: number) => '85000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop, renter] = Array.from({ length: 4 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${renter}','renter@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');
    insert into public.cash_verifiers(property_id,user_id) values('${prop}','${clerk}');`)
  async function as(user: string) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal: 'aal2' })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner)
  await db.query('select public.setup_property_from_sketch($1)', [prop])
  await db.exec('reset role')
  const room = (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Bob''s house' and u.label='Room 01'"))[0].id
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), room, '2026-08-10', '3500.00'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(30), id(20), '2026-08-01'])
  const state = async () => {
    await db.exec('reset role')
    const charges = await q("select rental_month::text as m, (amount - coalesce((select sum(al.amount) from public.cash_allocations al where al.charge_id=c.id),0))::text as left from public.rent_charges c where agreement_id=$1 order by rental_month", [id(20)])
    const credit = (await q('select private.agreement_credit($1)::text as c', [id(20)]))[0].c
    return { charges: charges.map((r: any) => `${r.m.slice(0, 7)}:${r.left}`), credit }
  }
  const pay = async (cashId: number, amount: string, day = '2026-08-12') => {
    await as(clerk)
    await db.query("select public.record_rent_cash($1,$2,$3,$4,$5,'Bob')", [prop, id(cashId), id(20), amount, day])
    return (await q('select public.confirm_rent_cash($1,$2) as ack', [prop, id(cashId)]))[0].ack
  }

  // Pays 7000 when 3500 is owed: August is paid and 3500 is kept as advance credit (on the acknowledgment too).
  const ack = await pay(40, '7000.00')
  assert.equal(ack.advance_credit, '3500.00')
  assert.deepEqual(ack.allocations.map((a: any) => a.amount), ['3500.00'])
  assert.deepEqual(await state(), { charges: ['2026-08:0.00'], credit: '3500.00' })

  // Adding September (manually) is paid at once from the credit.
  await as(clerk)
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(31), id(20), '2026-09-01'])
  assert.deepEqual(await state(), { charges: ['2026-08:0.00', '2026-09:0.00'], credit: '0.00' })

  // Partial credit: pays 5000 with 3500 owed for October... first add October (owed), then pay 5000 -> 1500 credit;
  // November is then added by automatic rent and is half paid from that credit.
  await as(clerk)
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(32), id(20), '2026-10-01'])
  await pay(41, '5000.00', '2026-10-05')
  assert.deepEqual(await state(), { charges: ['2026-08:0.00', '2026-09:0.00', '2026-10:0.00'], credit: '1500.00' })
  await db.exec('reset role')
  assert.equal((await q('select private.post_rent_month($1,$2,$3) as n', [prop, '2026-11-01', owner]))[0].n, 1)
  assert.deepEqual(await state(), { charges: ['2026-08:0.00', '2026-09:0.00', '2026-10:0.00', '2026-11:2000.00'], credit: '0.00' })

  // Reversing the 7000 payment reopens August and September (its credit paid September); balances are exact.
  await as(owner)
  await db.query('select public.reverse_rent_cash($1,$2,$3,$4)', [prop, id(50), id(40), 'Fictional: recorded by mistake'])
  assert.deepEqual(await state(), { charges: ['2026-08:3500.00', '2026-09:3500.00', '2026-10:0.00', '2026-11:2000.00'], credit: '0.00' })

  // Pending cash never counts as credit; staff and renter credit readers; anonymous denied.
  await as(clerk)
  await db.query("select public.record_rent_cash($1,$2,$3,'99999.00','2026-10-20','Bob')", [prop, id(42), id(20)])
  assert.deepEqual((await q('select public.read_agreement_credits($1) as c', [prop]))[0].c, {})
  await pay(43, '20000.00', '2026-10-21')
  assert.deepEqual((await q('select public.read_agreement_credits($1) as c', [prop]))[0].c, { [id(20)]: '11000.00' })
  await db.exec('reset role')
  await db.query("insert into public.tenant_contacts(property_id,tenant_id,user_id) values($1,$2,$3)", [prop, id(10), renter])
  await as(renter)
  assert.deepEqual((await q('select public.read_renter_credits() as c'))[0].c, { [id(20)]: '11000.00' })
  await as(owner)
  assert.deepEqual((await q('select public.read_renter_credits() as c'))[0].c, {}, 'staff are not renters: no credit leak through the renter reader')
  await db.exec('reset role'); await db.exec('set role anon')
  await assert.rejects(db.query('select public.read_agreement_credits($1)', [prop]), /permission denied/)
})
