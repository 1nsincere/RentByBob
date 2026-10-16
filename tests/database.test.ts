import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL, never a remote connection. Only Supabase's identity
// contract is stubbed; the real migration, grants, constraints and RLS execute.
test('access migration enforces roles, tenant isolation, revocation and atomic audit', async t => {
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
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const [owner, clerk, alice, business, outsider, otherOwner] = [1, 2, 3, 4, 5, 6].map(id)
  const [property, otherProperty, tenant, otherTenant, company] = [10, 11, 20, 21, 22].map(id)
  await db.exec(`
    insert into auth.users(id) values ${[owner, clerk, alice, business, outsider, otherOwner].map(v => `('${v}')`).join(',')};
    insert into public.properties(id,name) values ('${property}','Fictional property'), ('${otherProperty}','Other property');
    insert into public.staff_memberships(property_id,user_id,role) values
      ('${property}','${owner}','owner'), ('${property}','${clerk}','clerk'), ('${otherProperty}','${otherOwner}','owner');
    insert into public.tenants(id,property_id,display_name,kind) values
      ('${tenant}','${property}','Sample Alice','individual'),
      ('${otherTenant}','${otherProperty}','Other tenant','individual'),
      ('${company}','${property}','Sample business','business');
    insert into public.tenant_contacts(property_id,tenant_id,user_id) values
      ('${property}','${tenant}','${alice}'), ('${property}','${company}','${business}');
  `)
  await db.exec("update auth.users set email=id::text || '@example.invalid', email_confirmed_at=now()")
  const staffSql = "select public.assign_account_access($1,$2,$2::uuid::text || '@example.invalid','staff',null,$3,$3::text is not null,$4)"
  const contactSql = "select public.assign_account_access((select property_id from public.tenants where id=$1),$2,$2::uuid::text || '@example.invalid','contact',$1,null,$3,$4)"
  async function as(user: string, aal = 'aal2') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [user, JSON.stringify({ sub: user, aal, user_metadata: { role: 'owner' } })])
    await db.exec('set role authenticated')
  }
  const visible = async () => (await db.query<{ id: string }>('select id from public.tenants order by id')).rows.map(r => r.id)
  const denied = async (sql: string, params: unknown[] = []) => assert.rejects(db.query(sql, params), (error: unknown) => (error as { code: string }).code === '42501')

  await t.test('every application table has RLS and anonymous access is denied', async () => {
    const rows = (await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows
    assert.equal(rows.length, 7)
    assert.ok(rows.every(r => r.relrowsecurity))
    await db.exec('set role anon')
    await denied('select * from public.tenants')
    await denied('select public.archive_tenant($1,$2)', [tenant, 'unauthorized'])
  })
  await t.test('tenant and business contacts only see their records, not other contacts or audit', async () => {
    await as(alice, 'aal1')
    assert.deepEqual(await visible(), [tenant])
    assert.equal((await db.query('select * from public.tenant_contacts')).rows.length, 1)
    assert.equal((await db.query('select * from public.audit_events')).rows.length, 0)
    await as(business, 'aal1')
    assert.deepEqual(await visible(), [company])
    await as(outsider)
    assert.deepEqual(await visible(), [])
  })
  await t.test('staff require MFA and remain scoped to their property', async () => {
    await as(clerk, 'aal1')
    assert.deepEqual(await visible(), [])
    await denied('select public.create_tenant($1,$2,$3,$4)', [property, id(30), 'Sample', 'individual'])
    await as(clerk)
    assert.deepEqual(await visible(), [tenant, company])
    await as(otherOwner)
    assert.deepEqual(await visible(), [otherTenant])
  })
  await t.test('metadata cannot elevate roles; direct writes and clerk role grants fail', async () => {
    await as(clerk)
    await denied("update public.staff_memberships set role='owner' where user_id=$1", [clerk])
    await denied(staffSql, [property, clerk, 'owner', 'attempt'])
    await denied(contactSql.replace('$3,$4','true,$3'), [tenant, outsider, 'attempt'])
    await denied('delete from public.tenants where id=$1', [tenant])
    await denied('insert into public.audit_events(property_id,actor_id,action,target_id,reason) values ($1,$2,$3,$4,$5)', [property, clerk, 'forged', tenant, 'attempt'])
  })
  await t.test('tenant creation is validated, scoped and retry-safe', async () => {
    await as(clerk)
    const args = [property, id(30), 'New sample', 'individual']
    await db.query('select public.create_tenant($1,$2,$3,$4)', args)
    await db.query('select public.create_tenant($1,$2,$3,$4)', args)
    await assert.rejects(db.query('select public.create_tenant($1,$2,$3,$4)', [property, id(30), 'Changed payload', 'individual']))
    await assert.rejects(db.query('select public.create_tenant($1,$2,$3,$4)', [property, id(31), ' ', 'individual']))
    await denied('select public.create_tenant($1,$2,$3,$4)', [otherProperty, id(32), 'Cross property', 'individual'])
    await as(owner)
    assert.equal((await db.query("select * from public.audit_events where action='tenant_created'")).rows.length, 1)
  })
  await t.test('invalid audit reason rolls back contact access and last owner cannot be revoked', async () => {
    await as(owner)
    await assert.rejects(db.query(contactSql.replace('$3,$4','true,$3'), [tenant, outsider, ' ']))
    await assert.rejects(db.query(staffSql.replace('$3,$3::text is not null,$4','null,false,$3'), [property, owner, 'remove last owner']))
    await as(outsider)
    assert.deepEqual(await visible(), [])
  })
  await t.test('owner grants and revokes contacts without changing the existing session claims', async () => {
    await as(owner)
    await db.query(contactSql.replace('$3,$4','true,$3'), [tenant, outsider, 'Authorized contact'])
    await as(outsider, 'aal1')
    assert.deepEqual(await visible(), [tenant])
    await db.exec('reset role')
    await db.query('update public.tenant_contacts set revoked_at=now() where user_id=$1', [outsider])
    await db.exec('set role authenticated')
    assert.deepEqual(await visible(), [])
  })
  await t.test('revoked clerk loses access with unchanged JWT claims', async () => {
    await as(owner)
    await db.query(staffSql.replace('$3,$3::text is not null,$4','null,false,$3'), [property, clerk, 'Staff access ended'])
    await as(clerk)
    assert.deepEqual(await visible(), [])
    await denied('select public.create_tenant($1,$2,$3,$4)', [property, id(33), 'No access', 'individual'])
  })
  await t.test('archive revokes old tenant sessions while retaining records and audit', async () => {
    await as(owner)
    await db.query('select public.archive_tenant($1,$2)', [tenant, 'Record archived'])
    await db.query('select public.archive_tenant($1,$2)', [tenant, 'Retry'])
    assert.ok((await visible()).includes(tenant))
    assert.equal((await db.query("select * from public.audit_events where action='tenant_archived'")).rows.length, 1)
    await assert.rejects(db.query(contactSql.replace('$3,$4','true,$3'), [tenant, alice, 'Reactivate archived access']))
    await as(alice, 'aal1')
    assert.deepEqual(await visible(), [])
    assert.equal((await db.query('select * from public.tenant_contacts')).rows.length, 0)
  })
  await t.test('cross-property contacts violate the composite foreign key', async () => {
    await db.exec('reset role')
    await assert.rejects(db.query('insert into public.tenant_contacts(property_id,tenant_id,user_id) values ($1,$2,$3)', [otherProperty, company, outsider]), (error: unknown) => (error as { code: string }).code === '23503')
  })
  await t.test('definer functions pin search paths and have no anonymous execution grants', async () => {
    await db.exec('reset role')
    const result = await db.query<{ proname: string; proconfig: string[]; anon_execute: boolean }>(`
      select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','private') and p.prosecdef
    `)
    assert.equal(result.rows.length, 16)
    for (const fn of result.rows) {
      assert.ok(fn.proconfig.some(value => value === 'search_path=""'), fn.proname)
      assert.equal(fn.anon_execute, false, fn.proname)
    }
  })
  await t.test('archival audit failure leaves record and access unchanged', async () => {
    await as(owner)
    await assert.rejects(db.query('select public.archive_tenant($1,$2)', [company, ' ']))
    await as(business, 'aal1')
    assert.deepEqual(await visible(), [company])
  })
  await t.test('invitation authority is owner-wide and clerk-limited to renter invitations', async () => {
    await as(owner)
    await db.query(
      staffSql.replace('$3,$3::text is not null,$4', "'clerk',true,'Restore clerk for invitation test'"),
      [property, clerk],
    )
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'tenant') as allowed", [property],
    )).rows[0].allowed, true)
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'staff') as allowed", [property],
    )).rows[0].allowed, true)
    await as(clerk)
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'tenant') as allowed", [property],
    )).rows[0].allowed, true)
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'staff') as allowed", [property],
    )).rows[0].allowed, false)
    await as(clerk, 'aal1')
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'tenant') as allowed", [property],
    )).rows[0].allowed, false)
    await as(alice, 'aal1')
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'tenant') as allowed", [property],
    )).rows[0].allowed, false)
    assert.equal((await db.query<{ allowed: boolean }>(
      "select public.can_issue_account_invitation($1, 'staff') as allowed", [property],
    )).rows[0].allowed, false)
  })
  await t.test('invitation audit is authorized, idempotent and contains no recipient email', async () => {
    const invitationId = id(50)
    await as(clerk)
    await db.query(
      "select public.record_account_invitation($1, 'tenant', $2, 'requested')",
      [property, invitationId],
    )
    await db.query(
      "select public.record_account_invitation($1, 'tenant', $2, 'requested')",
      [property, invitationId],
    )
    await denied(
      "select public.record_account_invitation($1, 'staff', $2, 'requested')",
      [property, id(51)],
    )
    await as(alice, 'aal1')
    await denied(
      "select public.record_account_invitation($1, 'tenant', $2, 'sent')",
      [property, id(52)],
    )
    await as(owner)
    const events = (await db.query<{ action: string; target_id: string; reason: string }>(
      "select action, target_id, reason from public.audit_events where action like 'account_invitation_%'",
    )).rows
    assert.deepEqual(events, [{
      action: 'account_invitation_requested',
      target_id: invitationId,
      reason: 'tenant account invitation requested',
    }])
    assert.equal(events.some(event => event.reason.includes('@')), false)
  })
  await t.test('only dispatcher records outcomes, with ordered and retry-safe audit', async () => {
    await as(owner)
    await denied("select public.record_account_invitation($1,'tenant',$2,'sent')", [property,id(50)])
    await denied("select public.complete_account_invitation($1,'sent')", [id(50)])
    await db.exec('reset role; set role service_role')
    await assert.rejects(db.query("select public.complete_account_invitation($1,'sent')", [id(99)]))
    await db.query("select public.complete_account_invitation($1,'sent')", [id(50)])
    await db.query("select public.complete_account_invitation($1,'sent')", [id(50)])
    await assert.rejects(db.query("select public.complete_account_invitation($1,'failed')", [id(50)]))
    await as(owner)
    assert.equal((await db.query("select * from public.audit_events where target_id=$1", [id(50)])).rows.length, 2)
  })
  await t.test('assignment binds verified email to ID and disallows legacy ID-only writes', async () => {
    await as(owner)
    await denied("select public.set_staff_access($1,$2,'owner','Attempt')", [property,outsider])
    await denied("select public.set_tenant_contact($1,$2,true,'Attempt')", [company,outsider])
    const args = [property,outsider,`${outsider}@example.invalid`,'contact',company,null,true,'Identity reviewed']
    const sql = 'select public.assign_account_access($1,$2,$3,$4,$5,$6,$7,$8)'
    await assert.rejects(db.query(sql,[...args.slice(0,2),`${business}@example.invalid`,...args.slice(3)]))
    await assert.rejects(db.query(sql,[property,outsider,`${outsider}@example.invalid`,'staff',null,'administrator',true,'Bad role']))
    await assert.rejects(db.query(sql,[property,outsider,`${outsider}@example.invalid`,'contact',otherTenant,null,true,'Wrong property']))
    await db.exec('reset role')
    await db.query('update auth.users set email_confirmed_at=null where id=$1',[outsider])
    await as(owner)
    await assert.rejects(db.query(sql,args))
    await db.exec('reset role')
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[outsider])
    await as(owner,'aal1'); await denied(sql,args)
    await as(clerk); await denied(sql,args)
    await denied('select public.find_account_for_assignment($1,$2)',[property,`${outsider}@example.invalid`])
    await as(owner)
    await db.query(sql,args)
    const found = await db.query<{account:{id:string;state:string}}>('select public.find_account_for_assignment($1,$2) as account',[property,`${outsider}@example.invalid`])
    assert.equal(found.rows[0].account.id,outsider)
    assert.equal(found.rows[0].account.state,'ready')
    await db.query(sql,[...args.slice(0,6),false,'Access ended'])
    await as(outsider,'aal1')
    assert.equal((await db.query<{access:{state:string}}>('select public.my_access_state() as access')).rows[0].access.state,'disabled')
    assert.deepEqual(await visible(),[])
  })
  await t.test('property directory is owner-written, scoped, audited and retry-safe', async () => {
    const sql='select public.create_property_location($1,$2,$3,$4)'
    await as(owner)
    await db.query(sql,[property,id(60),'Sample building',null])
    await db.query(sql,[property,id(60),'Sample building',null])
    await db.query(sql,[property,id(61),'Sample unit',id(60)])
    await assert.rejects(db.query(sql,[property,id(61),'Different payload',id(60)]))
    const manage='select public.manage_property_location($1,$2,$3,$4,$5)'
    await db.exec('reset role')
    await db.exec("alter table public.audit_events add constraint reject_building_rename check(action <> 'building_renamed')")
    await db.exec('set role authenticated')
    await assert.rejects(db.query(manage,[property,id(60),'rename','Failed rename','Audit rollback check']))
    assert.equal((await db.query('select label from public.buildings where id=$1',[id(60)])).rows[0].label,'Sample building')
    await db.exec('reset role')
    await db.exec('alter table public.audit_events drop constraint reject_building_rename')
    await db.exec('set role authenticated')
    await db.query(manage,[property,id(60),'rename','Renamed building','Clearer directory label'])
    await db.query(manage,[property,id(61),'rename','Renamed unit','Clearer directory label'])
    await db.query(manage,[property,id(61),'archive',null,'Unit no longer in use'])
    await db.query(manage,[property,id(61),'archive',null,'Retry'])
    await assert.rejects(db.query(manage,[property,id(61),'rename','Reactivation attempt','Archived unit']))
    const archivedUnit=await db.query<{archived_at:string}>('select archived_at from public.units where id=$1',[id(61)])
    assert.ok(archivedUnit.rows[0].archived_at)
    await db.query(sql,[property,id(64),'Renamed unit',id(60)])
    await db.query(manage,[property,id(60),'archive',null,'Building no longer in use'])
    await db.query(manage,[property,id(60),'archive',null,'Retry'])
    const archivedRows=await db.query<{archived_at:string|null}>('select archived_at from public.units where building_id=$1',[id(60)])
    assert.equal(archivedRows.rows.length,2)
    assert.ok(archivedRows.rows.every(row=>row.archived_at))
    await assert.rejects(db.query(manage,[property,id(60),'rename','Cannot rename','Archived records remain unchanged']))
    await assert.rejects(db.query(sql,[property,id(65),'Blocked unit',id(60)]))
    await db.query(sql,[property,id(65),'Renamed building',null])
    await as(otherOwner)
    assert.equal((await db.query('select * from public.buildings')).rows.length,0)
    await assert.rejects(db.query(sql,[otherProperty,id(62),'Cross-property unit',id(60)]))
    await as(clerk)
    assert.equal((await db.query('select * from public.units')).rows.length,2)
    await denied(sql,[property,id(63),'Not allowed',null])
    await denied(manage,[property,id(65),'archive',null,'Clerk cannot archive'])
    await as(owner,'aal1');await denied(sql,[property,id(63),'MFA required',null])
    await denied(manage,[property,id(65),'rename','No MFA','MFA required'])
    await as(business,'aal1')
    assert.equal((await db.query('select * from public.units')).rows.length,0)
    await as(owner)
    assert.equal((await db.query("select * from public.audit_events where action in ('building_created','unit_created')")).rows.length,4)
    for (const action of ['building_renamed','unit_renamed','unit_archived','building_archived']) {
      assert.equal((await db.query('select * from public.audit_events where action=$1',[action])).rows.length,1)
    }
    const feed=await db.query<{action:string;actor_email:string;reason:string}>(
      'select action,actor_email,reason from public.read_access_audit($1)',[property])
    assert.ok(feed.rows.some(row=>row.action==='contact_enabled' && row.actor_email===`${owner}@example.invalid`))
    assert.ok(feed.rows.every(row=>!['building_archived','unit_archived','building_renamed','unit_renamed'].includes(row.action)))
    await as(clerk)
    await denied('select * from public.read_access_audit($1)',[property])
    await as(owner,'aal1')
    await denied('select * from public.read_access_audit($1)',[property])
  })
})
