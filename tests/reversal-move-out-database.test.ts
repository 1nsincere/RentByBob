import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('owner-only cash reversal reopens rent and keeps history; move-out stops new charges and frees the room', async t => {
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

  const id = (n: number) => '40000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, james, renter, prop, tenantA, tenantB, building, unit, agreement, nextAgreement] = Array.from({ length: 10 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${james}','james@example.invalid',now()),('${renter}','renter@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${james}','clerk');
    insert into public.tenants(id,property_id,display_name,kind) values('${tenantA}','${prop}','Sample Leaving Renter','individual'),('${tenantB}','${prop}','Sample Next Renter','individual');
    insert into public.tenant_contacts(property_id,tenant_id,user_id) values('${prop}','${tenantA}','${renter}');
    insert into public.buildings(id,property_id,label) values('${building}','${prop}','Sample building');
    insert into public.units(id,property_id,building_id,label) values('${unit}','${prop}','${building}','Room 1');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const workspace = async () => (await db.query<{ read_rent_workspace: any }>('select public.read_rent_workspace($1)', [prop])).rows[0].read_rent_workspace
  const balance = async (agreementId = agreement) => (await workspace()).agreements.find((a: any) => a.id === agreementId).balance
  const reverse = (request: number, cash: string, reason: string) => db.query('select public.reverse_rent_cash($1,$2,$3,$4)', [prop, id(request), cash, reason])
  const endAgreement = (request: number, date: string, reason: string) => db.query('select public.end_rental_agreement($1,$2,$3,$4,$5)', [prop, id(request), agreement, date, reason])

  await as(owner)
  await db.query('select public.assign_cash_verifier($1,$2,$3)', [prop, james, 'james@example.invalid'])
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, agreement, tenantA, unit, '2024-01-15', '5000.00'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(20), agreement, '2024-02-01'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(21), agreement, '2024-03-01'])
  const wrongCash = id(30), pendingCash = id(31)
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, wrongCash, agreement, '6000.00', '2024-03-02', 'Bob'])
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, pendingCash, agreement, '100.00', '2024-03-03', 'Bob'])
  await as(james)
  const acknowledgment = (await db.query<{ confirm_rent_cash: any }>('select public.confirm_rent_cash($1,$2)', [prop, wrongCash])).rows[0].confirm_rent_cash
  assert.equal(await balance(), '4000.00')

  // Only an MFA owner may reverse, always with a reason, and only confirmed cash.
  await assert.rejects(reverse(40, wrongCash, 'Clerk attempt'), /Owner MFA required/)
  await as(owner, 'aal1'); await assert.rejects(reverse(40, wrongCash, 'No MFA'), /Staff MFA required/)
  await as(owner)
  await assert.rejects(reverse(40, wrongCash, '   '), /reason is required/)
  await assert.rejects(reverse(41, pendingCash, 'Pending cannot be reversed'), /Only confirmed cash/)
  await assert.rejects(db.query('insert into public.cash_reversals(cash_id,property_id,request_id,reason,reversed_by,allocations) values ($1,$2,$3,$4,$5,$6)', [wrongCash, prop, id(99), 'direct', owner, '[]']), /permission denied/)

  await reverse(42, wrongCash, 'Recorded against the wrong tenant')
  assert.equal(await balance(), '10000.00', 'reversal reopens the rent it had paid')
  await reverse(42, wrongCash, 'Recorded against the wrong tenant')
  await assert.rejects(reverse(43, wrongCash, 'Second attempt'), /already reversed/)
  await assert.rejects(reverse(42, wrongCash, 'Changed reason'), /Request identifier already used/)
  await db.exec('reset role')
  const history = (await db.query<any>('select allocations, reason from public.cash_reversals where cash_id=$1', [wrongCash])).rows[0]
  assert.deepEqual(history.allocations.map((item: any) => [item.month, item.amount]), [['2024-02-01', '5000.00'], ['2024-03-01', '1000.00']], 'reversed allocations are kept')
  assert.equal(history.reason, 'Recorded against the wrong tenant')
  assert.deepEqual((await db.query<any>('select acknowledgment from public.cash_records where id=$1', [wrongCash])).rows[0].acknowledgment, acknowledgment, 'acknowledgment is never edited')
  assert.equal((await db.query("select 1 from public.audit_events where action='rent_cash_reversed' and target_id=$1", [wrongCash])).rows.length, 1)
  await as(owner)
  const reversedRow = (await workspace()).cash.find((c: any) => c.id === wrongCash)
  assert.equal(reversedRow.reversal.reason, 'Recorded against the wrong tenant')
  assert.equal((await workspace()).cash.find((c: any) => c.id === pendingCash).reversal, null)

  // After reversal, a new confirmed payment allocates oldest-first again.
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, id(32), agreement, '5000.00', '2024-03-04', 'Bob'])
  await as(james)
  const replacement = (await db.query<{ confirm_rent_cash: any }>('select public.confirm_rent_cash($1,$2)', [prop, id(32)])).rows[0].confirm_rent_cash
  assert.deepEqual(replacement.allocations.map((item: any) => item.month), ['2024-02-01'])
  await as(renter, 'aal1')
  const renterPayments = (await db.query<any>('select public.read_renter_account()')).rows[0].read_renter_account.tenants[0].agreements[0].payments
  assert.deepEqual(renterPayments.map((p: any) => p.id), [id(32)], 'renters do not see the reversed payment as paid')

  // Move-out: owner only, reason required, never before move-in, never after an existing later charge.
  await as(james); await assert.rejects(endAgreement(50, '2024-03-20', 'Clerk attempt'), /Owner MFA required/)
  await as(owner)
  await assert.rejects(endAgreement(50, '2024-03-20', ''), /move-out date and reason are required/)
  await assert.rejects(endAgreement(50, '2024-01-10', 'Before move-in'), /on or after move-in/)
  await assert.rejects(endAgreement(50, '2024-02-20', 'Charge exists for March'), /already recorded for a month after/)
  await endAgreement(51, '2024-03-20', 'Renter moved out')
  await endAgreement(51, '2024-03-20', 'Renter moved out')
  await assert.rejects(endAgreement(52, '2024-03-25', 'Different date'), /already has a move-out date/)
  await assert.rejects(db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(22), agreement, '2024-04-01']), /after move-out/)
  const ended = (await workspace()).agreements.find((a: any) => a.id === agreement)
  assert.equal(ended.ended_on, '2024-03-20')
  assert.equal(ended.balance, '5000.00', 'unpaid rent stays owed after move-out')

  // The room is free only after the previous agreement's end date.
  await assert.rejects(db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, nextAgreement, tenantB, unit, '2024-03-20', '5200.00']), /already has an agreement/)
  await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, nextAgreement, tenantB, unit, '2024-03-21', '5200.00'])
  await assert.rejects(db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)', [prop, id(60), tenantA, unit, '2024-04-01', '5000.00']), /already has an agreement/, 'only one open agreement per room')
  await as(renter, 'aal1')
  assert.equal((await db.query<any>('select public.read_renter_account()')).rows[0].read_renter_account.tenants[0].agreements[0].ended_on, '2024-03-20')
})
