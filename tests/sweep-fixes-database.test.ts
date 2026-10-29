import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Fixes from the 28 Oct 2026 security and bug sweep (202610280005), on a disposable database with every real migration.
test('sweep fixes: future move-in removal, notebook double check cannot be bypassed, removed tenants, voided retries', async t => {
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
  const id = (n: number) => '8c000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop] = [id(1), id(2), id(3)]
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner); await db.query('select public.setup_property_from_sketch($1)', [prop]); await db.exec('reset role')
  const room = async (label: string) => (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Building 1' and u.label=$1", [label]))[0].id as string
  const [r4, r5, r6] = [await room('Room 04'), await room('Room 05'), await room('Room 06')]
  const nextWeek = (await q("select ((now() at time zone 'Asia/Manila')::date + 7)::text as d"))[0].d as string

  // 1. A tenant who has not moved in yet (future move-in) can be removed; the agreement ends on its move-in date.
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Future Renter', 'individual', id(20), r4, nextWeek, '3500.00'])
  await db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'Changed their mind'])
  await db.exec('reset role')
  assert.equal((await q('select ended_on::text as e, move_in::text as m from public.rental_agreements where id = $1', [id(20)]))[0].e, nextWeek, 'ends on the move-in date at the earliest')
  assert.equal((await q('select removed_at is not null as r from public.tenants where id = $1', [id(10)]))[0].r, true)

  // 2. A month waiting for a double check cannot be charged by hand; confirming by a different person still charges it.
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(11), 'Sample Renter', 'individual', id(21), r5, '2026-01-05', '3500.00'])
  await db.query('select public.draft_rent_months($1,$2,$3::date[],$4)', [prop, id(21), ['2026-01-01'], 'Notebook page 1'])
  await assert.rejects(db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(40), id(21), '2026-01-01']), /waiting for a double check/)
  await as(owner)
  await assert.rejects(db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(41), id(21), '2026-01-01']), /waiting for a double check/, 'not even the owner can skip the double check by hand')
  assert.equal((await q('select count(*)::int as n from public.rent_charges where agreement_id = $1', [id(21)]))[0].n, 0)
  const draftId = (await q('select public.read_rent_review($1) as r', [prop]))[0].r.drafts[0].id
  assert.equal((await q('select public.confirm_rent_month_drafts($1,$2::uuid[]) as n', [prop, [draftId]]))[0].n, 1)
  assert.equal((await q('select count(*)::int as n from public.rent_charges where agreement_id = $1', [id(21)]))[0].n, 1, 'the second person made it final')
  // Other months still add normally by hand, with the same rules as before.
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(42), id(21), '2026-02-01'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(42), id(21), '2026-02-01']) // idempotent retry
  assert.equal((await q('select count(*)::int as n from public.rent_charges where agreement_id = $1', [id(21)]))[0].n, 2)
  await assert.rejects(db.query('select private.add_rent_month_core($1,$2,$3,$4)', [prop, id(43), id(21), '2026-03-01']), /permission denied/, 'the private core is not callable from the browser')

  // 3. No new notebook months for a removed tenant.
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(12), 'Sample Removed Renter', 'individual', id(22), r6, '2026-01-05', '3000.00'])
  await db.query('select public.remove_tenant_with_room($1,$2)', [id(12), 'Entered by mistake'])
  await assert.rejects(db.query('select public.draft_rent_months($1,$2,$3::date[],$4)', [prop, id(22), ['2026-01-01'], 'Notebook']), /tenant was removed/)

  // 4. A retry of a voided maintenance entry is refused, not silently "successful".
  await db.query('select public.record_maintenance_expense($1,$2,$3,$4,$5,$6)', [prop, id(50), '2026-01-01', 'Roof', null, '100.00'])
  await db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(50), 'Entered twice'])
  await assert.rejects(db.query('select public.record_maintenance_expense($1,$2,$3,$4,$5,$6)', [prop, id(50), '2026-01-01', 'Roof', null, '100.00']), /was removed/)
})

// Second half of the sweep fixes: bounds, handover amounts, reversed receipts, remembered devices, public inquiries, audit.
test('sweep fixes: date and amount bounds, reversed receipt, revived device, inquiry flooding, audit actors', async t => {
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
  const id = (n: number) => '8d000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop] = [id(1), id(2), id(3)]
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string, aal = 'aal2', device = '') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false),set_config('request.headers',$3,false)", [user, JSON.stringify({ sub: user, aal }), JSON.stringify(device ? { 'x-rentbybob-device': device } : {})])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner); await db.query('select public.setup_property_from_sketch($1)', [prop]); await db.exec('reset role')
  const room = async (label: string) => (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Building 1' and u.label=$1", [label]))[0].id as string
  const today = (await q("select (now() at time zone 'Asia/Manila')::date::text as d"))[0].d as string
  const register = (n: number, name: string, unit: string, moveIn: string) => db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10 + n), name, 'individual', id(20 + n), unit, moveIn, '3500.00'])

  // Bounds: a typo year cannot lock a room; no infinite months.
  await as(clerk)
  await assert.rejects(register(0, 'Sample Typo', await room('Room 04'), '2062-10-28'), /Invalid agreement/)
  await assert.rejects(register(0, 'Sample Infinity', await room('Room 04'), 'infinity'), /Invalid agreement|invalid input|out of range|finite/i)
  await register(1, 'Sample Renter', await room('Room 05'), '2026-01-05')
  await assert.rejects(db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(40), id(21), '2099-01-01']), /Invalid rental month/)
  await assert.rejects(db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(41), id(21), 'infinity']), /Invalid rental month/)
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(42), id(21), '2026-01-01'])
  await db.exec('reset role')
  await assert.rejects(db.query("insert into public.rent_charges(id,property_id,agreement_id,rental_month,due_date,amount) values ($1,$2,$3,'infinity','infinity',1)", [id(43), prop, id(21)]), /finite|null value|violates|check/i)

  // Handover amounts: NaN is refused.
  await as(clerk)
  await assert.rejects(db.query('select public.record_collection_handover($1,$2,$3,$4,$5,$6,$7,$8,$9)', [prop, id(60), clerk, today, 'NaN', '0', 'NaN', '0', null]), /Invalid collection handover/)

  // A reversed payment cannot be confirmed again into a valid-looking receipt.
  await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)', [prop, id(70), id(21), '1000.00', '2026-01-10', 'Bob'])
  await db.query('select public.confirm_rent_cash($1,$2)', [prop, id(70)])
  await db.query('select public.reverse_rent_cash($1,$2,$3,$4)', [prop, id(71), id(70), 'Counted twice'])
  await assert.rejects(db.query('select public.confirm_rent_cash($1,$2)', [prop, id(70)]), /This payment was reversed/)

  // A remembered device does not come back to life after a revocation and re-grant.
  await as(clerk, 'aal2')
  const device = (await q('select public.remember_device($1) as r', ['Office laptop']))[0].r
  await as(clerk, 'aal1', device.secret); await q('select public.read_staff_names($1)', [prop]) // works while the access is current
  await as(owner); await db.query('select public.assign_account_access($1,$2,$3,$4,$5,$6,$7,$8)', [prop, clerk, 'clerk@example.invalid', 'staff', null, null, false, 'Left the job'])
  await db.query('select public.assign_account_access($1,$2,$3,$4,$5,$6,$7,$8)', [prop, clerk, 'clerk@example.invalid', 'staff', null, 'clerk', true, 'Back again'])
  await as(clerk, 'aal1', device.secret)
  await assert.rejects(q('select public.read_staff_names($1)', [prop]), /Staff MFA required/)

  // Public inquiries: contact variants count as one contact, a room has an hourly cap, junk contacts are refused.
  await as(clerk); await db.query('select public.set_auto_listing($1,true)', [prop])
  const listed = await room('Room 07')
  await db.exec('reset role'); await db.exec('set role anon')
  const inquire = (n: number, contact: string) => db.query('select public.submit_rental_inquiry($1,$2,$3,$4,$5)', [id(100 + n), listed, 'Sample Visitor', contact, 'Is it available?'])
  await assert.rejects(inquire(0, '+++'), /Enter your name/)
  await inquire(1, '0917 111 2222'); await inquire(2, '0917-111-2222'); await inquire(3, '(0917)1112222')
  await assert.rejects(inquire(4, '0917.111.2222'), /Too many inquiries/, 'spaced or dashed variants of one number count together')
  await inquire(5, '0918 000 0001'); await inquire(6, '0918 000 0002')
  await assert.rejects(inquire(7, '0918 000 0003'), /Too many inquiries/, 'five inquiries per room per hour')
  await db.exec('reset role')
  assert.equal((await q('select count(*)::int as n from public.rental_inquiries'))[0].n, 5)

  // Audit: handling an inquiry is recorded; automatic rent is attributed to the person who pressed the button.
  const inquiryId = (await q('select id from public.rental_inquiries order by created_at limit 1'))[0].id
  await as(clerk); await db.query('select public.mark_inquiry_handled($1,$2)', [prop, inquiryId])
  await db.exec('reset role')
  assert.equal((await q("select count(*)::int as n from public.audit_events where action = 'inquiry_handled' and actor_id = $1", [clerk]))[0].n, 1)
  await as(owner); await db.query('select public.set_auto_rent($1,true)', [prop])
  await as(clerk); await register(2, 'Sample Late Renter', await room('Room 08'), '2026-01-05')
  assert.equal((await q('select public.post_due_rent_now($1) as n', [prop]))[0].n, 1)
  await db.exec('reset role')
  assert.equal((await q("select actor_id from public.audit_events where action = 'rent_charge_created' and tenant_id = $1 order by occurred_at desc limit 1", [id(12)]))[0].actor_id, clerk, 'the clerk who pressed the button is the recorded actor, not the owner who switched it on')
})
