import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Removing a tenant who still has a room (202610280002) and monthly maintenance expenses (202610280003),
// on a disposable database with every real migration.
async function setup(t: { after: (fn: () => void) => void }) {
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
  const id = (n: number) => '8a000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, clerk2, prop, stranger] = [id(1), id(2), id(3), id(4), id(5)]
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now()),('${clerk2}','clerk2@example.invalid',now()),('${stranger}','stranger@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk'),('${prop}','${clerk2}','clerk');`)
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner); await db.query('select public.setup_property_from_sketch($1)', [prop]); await db.exec('reset role')
  const room = async (label: string) => (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Building 1' and u.label=$1", [label]))[0].id as string
  return { db, id, owner, clerk, clerk2, prop, stranger, as, q, room }
}

test('the owner can remove a tenant who still has a room; the room is freed and history stays', async t => {
  const { db, id, owner, clerk, prop, as, q, room } = await setup(t)
  const today = (await q("select (now() at time zone 'Asia/Manila')::date::text as d"))[0].d as string
  const [r4, r5, r6] = [await room('Room 04'), await room('Room 05'), await room('Room 06')]
  await as(owner)
  // Mistaken entry: older move-in, nothing ever recorded. Used: has a rent charge. Waiting notebook months go too.
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Mistake Renter', 'individual', id(20), r4, '2026-01-05', '3500.00'])
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(11), 'Sample Used Renter', 'individual', id(21), r5, '2026-01-05', '3000.00'])
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(12), 'Sample Keeper', 'individual', id(22), r6, '2026-01-05', '3000.00'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(40), id(21), '2026-01-01'])
  await as(clerk); await db.query('select public.draft_rent_months($1,$2,$3::date[],$4)', [prop, id(20), ['2026-02-01'], 'Notebook'])

  // Any staff member with MFA (the clerk runs the system), and a reason.
  await assert.rejects(db.query('select public.remove_tenant_with_room($1,$2)', [id(10), '  ']), /reason/)
  await as(owner, 'aal1'); await assert.rejects(db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'No MFA']), /Staff MFA required|Access denied/)
  await as(owner); await assert.rejects(db.query('select public.remove_tenant_with_room($1,$2)', [id(10), '  ']), /reason/)
  await assert.rejects(db.query('select public.remove_tenant_with_room($1,$2)', [id(99), 'Nobody']), /Access denied/)
  // The old rule still protects the plain remove: it needs the move-out first.
  await assert.rejects(db.query('select public.remove_tenant($1,$2)', [id(10), 'Plain remove']), /move-out before removing/)

  await db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'Entered by mistake'])
  await db.query('select public.remove_tenant_with_room($1,$2)', [id(10), 'Entered by mistake'])
  await as(clerk); await db.query('select public.remove_tenant_with_room($1,$2)', [id(11), 'Moved away']) // a clerk may remove too
  await as(owner)
  await db.exec('reset role')
  const tenants = await q('select id, removed_at is not null as removed, archived_at is not null as archived from public.tenants where id in ($1,$2,$3) order by id', [id(10), id(11), id(12)])
  assert.deepEqual(tenants.map(x => [x.removed, x.archived]), [[true, true], [true, true], [false, false]], 'the other tenant is untouched')
  const ended = await q('select id, ended_on::text as e, move_in::text as m from public.rental_agreements where id in ($1,$2,$3) order by id', [id(20), id(21), id(22)])
  assert.equal(ended[0].e, ended[0].m, 'an unused old entry ends on its move-in date, so no rent can ever be added and the room is free now')
  assert.equal(ended[1].e, today, 'an agreement with history ends today')
  assert.equal(ended[2].e, null)
  assert.equal((await q('select count(*)::int as n from public.rent_charges where agreement_id = $1', [id(21)]))[0].n, 1, 'rent history stays')
  assert.equal((await q("select count(*)::int as n from public.rent_month_drafts where agreement_id = $1 and status = 'waiting'", [id(20)]))[0].n, 0, 'waiting notebook months are dropped')
  assert.equal((await q("select count(*)::int as n from public.audit_events where action = 'tenant_removed'"))[0].n, 2, 'the repeat is a no-op')

  // The freed room can take a new tenant the same day; the used room only from tomorrow.
  await as(owner)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(13), 'Sample New Renter', 'individual', id(23), r4, today, '3200.00'])
  await assert.rejects(db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(14), 'Sample Too Soon', 'individual', id(24), r5, today, '3200.00']), /already has an agreement|unavailable|taken/i)
  // Removed tenants no longer appear as the renter of that room's open agreement.
  assert.equal((await q("select count(*)::int as n from public.rental_agreements a join public.tenants t on t.id = a.tenant_id where t.removed_at is not null and (a.ended_on is null or a.ended_on > (now() at time zone 'Asia/Manila')::date)"))[0].n, 0)
})

test('maintenance expenses: any staff member records and voids them, nothing touches balances, and access is limited', async t => {
  const { db, id, owner, clerk, clerk2, prop, stranger, as, q, room } = await setup(t)
  const thisMonth = (await q("select to_char(date_trunc('month', now() at time zone 'Asia/Manila'), 'YYYY-MM-01') as m"))[0].m as string
  const record = (eid: string, month: string, what: string, place: string | null, amount: string) => db.query('select public.record_maintenance_expense($1,$2,$3,$4,$5,$6)', [prop, eid, month, what, place, amount])
  const read = async (from = '2026-01-01', to = thisMonth) => (await q('select public.read_maintenance_expenses($1,$2,$3) as r', [prop, from, to]))[0].r as any[]
  await as(owner)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), await room('Room 04'), '2026-01-05', '3500.00'])
  await db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(40), id(20), '2026-01-01'])
  const balanceBefore = (await q('select coalesce(sum(amount),0)::text as s from public.rent_charges'))[0].s

  await as(clerk)
  await assert.rejects(record(id(50), '2026-01-15', 'Roof', null, '100.00'), /month/)
  await assert.rejects(record(id(50), '2099-01-01', 'Roof', null, '100.00'), /not in the future/)
  await assert.rejects(record(id(50), '2026-01-01', ' ', null, '100.00'), /what it was for/)
  await assert.rejects(record(id(50), '2026-01-01', 'Roof', null, '0'), /amount/)
  await assert.rejects(record(id(50), '2026-01-01', 'Roof', null, '10.005'), /amount/)
  await record(id(50), '2026-01-01', 'Fix roof leak', 'Building 1', '1250.50')
  await record(id(50), '2026-01-01', 'Fix roof leak', 'Building 1', '1250.50')
  await assert.rejects(record(id(50), '2026-01-01', 'Something else', null, '5.00'), /already used/)
  await record(id(51), '2026-01-01', 'Paint', null, '300.00')
  await as(owner); await record(id(52), thisMonth, 'Plumbing', 'Room 04', '800.00')
  assert.deepEqual((await read()).map(r => [r.month, r.description, r.place, r.amount]), [
    [thisMonth.slice(0, 7), 'Plumbing', 'Room 04', '800.00'], ['2026-01', 'Fix roof leak', 'Building 1', '1250.50'], ['2026-01', 'Paint', null, '300.00']])
  assert.deepEqual((await read('2026-01-01', '2026-01-31')).map(r => r.description), ['Fix roof leak', 'Paint'], 'filtered to a month')
  await assert.rejects(read('2020-01-01', '2026-01-01'), /up to 36 months/)

  // Voiding: owner, or whoever entered it; a reason is required; hidden afterwards; repeating is harmless.
  await as(clerk2); await db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(50), 'Wrong amount']) // any staff member may void
  await as(clerk); await assert.rejects(db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(50), ' ']), /reason/)
  await db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(51), 'Entered twice'])
  await db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(51), 'Entered twice'])
  await as(owner); await db.query('select public.void_maintenance_expense($1,$2,$3)', [prop, id(50), 'Wrong amount'])
  assert.deepEqual((await read()).map(r => r.description), ['Plumbing'])

  // Expenses never touch rent; access: strangers, no MFA, anonymous and direct table access are refused.
  assert.equal((await q('select coalesce(sum(amount),0)::text as s from public.rent_charges'))[0].s, balanceBefore)
  await as(stranger, 'aal1'); await assert.rejects(record(id(53), '2026-01-01', 'x', null, '1.00'), /Staff MFA required/)
  await as(clerk, 'aal1'); await assert.rejects(read(), /Staff MFA required/)
  await as(owner); await assert.rejects(q('select * from public.maintenance_expenses'), /permission denied/)
  await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(record(id(54), '2026-01-01', 'x', null, '1.00'), /permission denied/); await db.exec('reset role')
  const actions = (await q("select action, count(*)::int as n from public.audit_events where action like 'maintenance_%' group by action order by action")).map(a => a.action + ':' + a.n)
  assert.deepEqual(actions, ['maintenance_expense_recorded:3', 'maintenance_expense_voided:2'])
})
