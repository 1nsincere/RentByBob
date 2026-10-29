import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL with every real migration; only Supabase's identity contract is stubbed.
test('automatic monthly rent, room change and remove tenant follow the owner decisions', async t => {
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
  const id = (n: number) => '84000000-0000-4000-8000-' + String(n).padStart(12, '0')
  const [owner, clerk, prop] = Array.from({ length: 3 }, (_, i) => id(i + 1))
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${clerk}','clerk@example.invalid',now());
    insert into public.properties(id,name) values('${prop}','Fictional property');
    insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${clerk}','clerk');`)
  async function as(user: string) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal: 'aal2' })])
    await db.exec('set role authenticated')
  }
  const q = async (sql: string, params: unknown[] = []) => (await db.query<any>(sql, params)).rows
  await as(owner)
  await db.query('select public.setup_property_from_sketch($1)', [prop])
  await db.exec('reset role')
  const unit = async (label: string) => (await q("select u.id from public.units u join public.buildings b on b.id=u.building_id where b.label='Bob''s house' and u.label=$1", [label]))[0].id
  const [room1, room2, room3] = [await unit('Room 01'), await unit('Room 02'), await unit('Room 03')]
  const month = (await q("select date_trunc('month', now() at time zone 'Asia/Manila')::date::text as m"))[0].m as string
  const today = (await q("select (now() at time zone 'Asia/Manila')::date::text as d"))[0].d as string
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter A', 'individual', id(20), room1, '2026-01-31', '3500.00'])
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(11), 'Sample Renter B', 'individual', id(21), room2, '2026-01-15', '2800.50'])
  await db.query('select public.register_tenant($1,$2,$3,$4,null,null,null,null)', [prop, id(12), 'Sample Roomless', 'individual'])
  const charges = async () => { await db.exec('reset role'); return q('select agreement_id, rental_month::text as m, due_date::text as due, amount::text as amount from public.rent_charges order by agreement_id, rental_month') }

  // 1. Automatic rent: owner-only switch, off by default; turning it on posts the current month once, at agreement terms.
  await as(owner); assert.equal((await q('select public.post_due_rent_now($1) as n', [prop]))[0].n, 0, 'off by default')
  await as(clerk); assert.equal((await q('select public.set_auto_rent($1,true) as n', [prop]))[0].n, 2, 'clerks run the property, so they can switch it on')
  await as(owner)
  let rows = await charges()
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r: any) => r.m === month))
  const lastDay = (await q("select (date_trunc('month', now() at time zone 'Asia/Manila') + interval '1 month - 1 day')::date::text as d"))[0].d
  assert.equal(rows.find((r: any) => r.agreement_id === id(20)).due, lastDay, 'move-in on the 31st clamps to the last day of shorter months')
  assert.equal(rows.find((r: any) => r.agreement_id === id(21)).due, `${month.slice(0, 8)}15`)
  assert.equal(rows.find((r: any) => r.agreement_id === id(21)).amount, '2800.50')
  // Scheduled runs and catch-ups never duplicate.
  await db.exec('reset role'); assert.equal((await q('select private.post_due_rent() as n'))[0].n, 0)
  await as(clerk); assert.equal((await q('select public.post_due_rent_now($1) as n', [prop]))[0].n, 0)
  assert.equal((await charges()).length, 2)
  // A month after move-out is never posted; turning automation off stops posting.
  await db.exec('reset role')
  await q("delete from public.rent_charges where agreement_id = $1", [id(21)])
  await q("update public.rental_agreements set ended_on = $2::date - 1, end_reason = 'Fictional', ended_by = $3, ended_at = now(), end_request_id = $4 where id = $1", [id(21), month, owner, id(40)])
  assert.equal((await q('select private.post_due_rent() as n'))[0].n, 0, 'ended before this month: no charge')
  await as(owner); await db.query('select public.set_auto_rent($1,false)', [prop])
  await db.exec('reset role'); await q('delete from public.rent_charges')
  assert.equal((await q('select private.post_due_rent() as n'))[0].n, 0, 'automation off: nothing posted')

  // 2. Room change: same agreement and rent; new room from the chosen date; history kept; old room freed.
  await as(clerk)
  await assert.rejects(db.query('select public.change_agreement_room($1,$2,$3,$4,$5,$6)', [prop, id(50), id(20), room1, today, 'Same room']), /different active rentable room/)
  await db.query('select public.change_agreement_room($1,$2,$3,$4,$5,$6)', [prop, id(51), id(20), room3, today, 'Moved to a bigger room'])
  await db.query('select public.change_agreement_room($1,$2,$3,$4,$5,$6)', [prop, id(51), id(20), room3, today, 'Moved to a bigger room'])
  await db.exec('reset role')
  const moved = (await q('select unit_id, rent::text as rent, move_in::text as move_in from public.rental_agreements where id=$1', [id(20)]))[0]
  assert.deepEqual(moved, { unit_id: room3, rent: '3500.00', move_in: '2026-01-31' })
  assert.equal((await q('select count(*)::int as n from public.agreement_room_changes'))[0].n, 1, 'retry-safe and recorded once')
  await as(clerk)
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(13), 'Sample New In Room 1', 'individual', id(22), room1, today, '3000.00'])
  await assert.rejects(db.query('select public.change_agreement_room($1,$2,$3,$4,$5,$6)', [prop, id(52), id(20), room1, today, 'Back again']), /already has an agreement/)
  await assert.rejects(db.query("select public.change_agreement_room($1,$2,$3,$4,($5::date + 1),$6)", [prop, id(53), id(20), room2, today, 'Future']), /move date/)

  // 3. Remove tenant: owner only, reason required, after move-out; records stay.
  await as(clerk); await assert.rejects(db.query('select public.remove_tenant($1,$2)', [id(12), '  ']), /reason/)
  await as(owner)
  await assert.rejects(db.query('select public.remove_tenant($1,$2)', [id(10), 'Still renting']), /move-out before removing/)
  await assert.rejects(db.query("select public.remove_tenant($1,'  ')", [id(12)]), /reason/)
  await db.query('select public.remove_tenant($1,$2)', [id(12), 'Typed twice'])
  await db.query('select public.remove_tenant($1,$2)', [id(11), 'Moved away'])
  await db.exec('reset role')
  const removed = await q('select id, archived_at is not null as archived, removed_at is not null as removed from public.tenants where removed_at is not null order by id')
  assert.deepEqual(removed.map((r: any) => [r.id, r.archived, r.removed]), [[id(11), true, true], [id(12), true, true]])
  assert.equal((await q('select count(*)::int as n from public.rental_agreements where tenant_id=$1', [id(11)]))[0].n, 1, 'agreement and history stay')
  assert.equal((await q("select count(*)::int as n from public.audit_events where action='tenant_removed'"))[0].n, 2)
})
