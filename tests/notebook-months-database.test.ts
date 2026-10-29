import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Past months from the notebook (202610280001): entered as "waiting", never a balance until a different staff member
// double checks them; best-guess move-in dates are flagged. Disposable database with every migration.
test('notebook months wait for a different staff member before they become rent charges', async t => {
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
  const id = (n: number) => '89000000-0000-4000-8000-' + String(n).padStart(12, '0')
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
  // A tenant who was already living here: the move-in date (Jan 2026) is only a best guess.
  await db.query('select public.register_tenant($1,$2,$3,$4,$5,$6,$7,$8)', [prop, id(10), 'Sample Renter', 'individual', id(20), room, '2026-01-05', '3500.00'])
  const draft = (months: string[], note = 'Notebook page 12') => q('select public.draft_rent_months($1,$2,$3::date[],$4) as r', [prop, id(20), months, note])
  const review = async () => (await q('select public.read_rent_review($1) as r', [prop]))[0].r
  const charges = async () => (await q("select to_char(rental_month,'YYYY-MM') as m from public.rent_charges order by 1")).map(r => r.m)

  // Entering: needs the notes and valid months, and creates no charge.
  await assert.rejects(draft(['2026-01-01'], ' '), /which notebook notes/)
  await assert.rejects(draft(['2025-12-01']), /on or after the move-in month/)
  await assert.rejects(draft(['2099-01-01']), /no later than this month/)
  await assert.rejects(draft(['2026-01-15']), /on or after the move-in month/)
  assert.deepEqual((await draft(['2026-01-01', '2026-02-01', '2026-03-01']))[0].r, { added: 3, skipped: 0 })
  assert.deepEqual((await draft(['2026-02-01', '2026-04-01']))[0].r, { added: 1, skipped: 1 }, 'a month already waiting is skipped, not doubled')
  assert.deepEqual(await charges(), [], 'waiting months are not rent charges, so no balance, late list or reminder can include them')
  const first = await review()
  assert.deepEqual(first.drafts.map((d: any) => d.month), ['2026-01', '2026-02', '2026-03', '2026-04'])
  assert.equal(first.drafts[0].source_note, 'Notebook page 12'); assert.equal(first.drafts[0].entered_by, clerk); assert.equal(first.drafts[0].rent, '3500.00')

  // The person who entered them cannot make them final; nothing changes.
  const ids = first.drafts.map((d: any) => d.id)
  await assert.rejects(q('select public.confirm_rent_month_drafts($1,$2::uuid[])', [prop, ids]), /different staff member/)
  assert.deepEqual(await charges(), [])
  // Move-in estimate: flagged by the clerk; only someone else can confirm it.
  await db.query('select public.flag_move_in_estimate($1,$2)', [prop, id(20)])
  await db.query('select public.flag_move_in_estimate($1,$2)', [prop, id(20)])
  assert.deepEqual(Object.keys((await review()).estimated), [id(20)])
  await assert.rejects(db.query('select public.confirm_move_in_date($1,$2)', [prop, id(20)]), /different staff member/)

  // A different staff member double checks: ordinary charges appear, all or none.
  await as(owner)
  await assert.rejects(q('select public.confirm_rent_month_drafts($1,$2::uuid[])', [prop, [ids[0], id(99)]]), /Month unavailable/)
  assert.deepEqual(await charges(), [], 'one bad id rolls back the whole batch')
  await db.query('select public.remove_rent_month_drafts($1,$2::uuid[],$3)', [prop, [ids[3]], 'Notebook shows April was paid'])
  assert.equal((await q('select public.confirm_rent_month_drafts($1,$2::uuid[]) as n', [prop, ids.slice(0, 3)]))[0].n, 3)
  assert.equal((await q('select public.confirm_rent_month_drafts($1,$2::uuid[]) as n', [prop, ids.slice(0, 3)]))[0].n, 0, 'repeating is harmless')
  assert.deepEqual(await charges(), ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual((await q("select amount::text as a, to_char(due_date,'YYYY-MM-DD') as d from public.rent_charges order by rental_month")).map(c => c.a + ' ' + c.d), ['3500.00 2026-01-05', '3500.00 2026-02-05', '3500.00 2026-03-05'])
  assert.equal((await review()).drafts.length, 0)
  await assert.rejects(q('select public.remove_rent_month_drafts($1,$2::uuid[],$3)', [prop, [ids[0]], 'oops']), /no longer waiting|cannot be removed/)
  await db.query('select public.confirm_move_in_date($1,$2)', [prop, id(20)])
  assert.deepEqual((await review()).estimated, {})

  // A month that is waiting cannot be charged by hand (that would skip the second person); it must be confirmed or removed.
  await as(clerk); await draft(['2026-05-01'])
  await as(owner); await assert.rejects(db.query('select public.add_rent_month($1,$2,$3,$4)', [prop, id(40), id(20), '2026-05-01']), /waiting for a double check/)
  const late = (await review()).drafts[0].id
  await db.query('select public.remove_rent_month_drafts($1,$2::uuid[],$3)', [prop, [late], 'Not needed'])

  // Access: strangers, staff without MFA and anonymous callers get nothing; browser roles cannot touch the table.
  await as(stranger, 'aal1'); await assert.rejects(draft(['2026-01-01']), /Staff MFA required/)
  await as(clerk, 'aal1'); await assert.rejects(review(), /Staff MFA required/)
  await as(owner); await assert.rejects(q('select * from public.rent_month_drafts'), /permission denied/)
  await assert.rejects(q("update public.rent_month_drafts set status = 'confirmed'"), /permission denied/)
  await db.exec('reset role'); await db.exec('set role anon'); await assert.rejects(draft(['2026-01-01']), /permission denied/)
  await db.exec('reset role')
  const actions = (await q("select action, count(*)::int as n from public.audit_events where action like 'rent_month_%' or action like 'move_in_%' group by action order by action")).map(a => a.action + ':' + a.n)
  assert.deepEqual(actions, ['move_in_date_double_checked:1', 'move_in_marked_estimate:1', 'rent_month_double_checked:3', 'rent_month_entered_for_check:5', 'rent_month_entry_removed:2'])
})
