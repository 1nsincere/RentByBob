import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Disposable PostgreSQL, never a remote connection. Only Supabase's identity
// contract is stubbed; the real migration, grants, constraints and RLS execute.
test('saved rent and cash acknowledgment boundaries', async t => {
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

 const id=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const [owner,james,other,prop,tenant,building,unit,agreement,sep,oct,cash]=Array.from({length:11},(_,i)=>id(i+1))
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${owner}','owner@example.invalid',now()),('${james}','james@example.invalid',now()),('${other}','other@example.invalid',now());
 insert into public.properties(id,name) values('${prop}','Fictional property');
 insert into public.staff_memberships(property_id,user_id,role) values('${prop}','${owner}','owner'),('${prop}','${james}','clerk');
 insert into public.tenants(id,property_id,display_name,kind) values('${tenant}','${prop}','Sample tenant','individual');
 insert into public.buildings(id,property_id,label) values('${building}','${prop}','Sample building');
 insert into public.units(id,property_id,building_id,label) values('${unit}','${prop}','${building}','Room 1');`)
 async function as(user:string,aal='aal2') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,aal})]); await db.exec('set role authenticated') }
 const confirm=()=>db.query<{confirm_rent_cash: any}>('select public.confirm_rent_cash($1,$2)',[prop,cash])
 await as(owner)
 await db.query('select public.assign_cash_verifier($1,$2,$3)',[prop,james,'james@example.invalid'])
 const args=[prop,agreement,tenant,unit,'2024-01-31','5000.25']
 await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)',args)
 await db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)',args)
 await assert.rejects(db.query('select public.create_rental_agreement($1,$2,$3,$4,$5,$6)',[...args.slice(0,5),'5000.26']))
 await db.query('select public.add_rent_month($1,$2,$3,$4)',[prop,sep,agreement,'2024-02-01'])
 await db.query('select public.add_rent_month($1,$2,$3,$4)',[prop,oct,agreement,'2024-03-01'])
 assert.deepEqual((await db.query<{due:string}>('select due_date::text as due from public.rent_charges order by due_date')).rows.map(r=>r.due),['2024-02-29','2024-03-31'])
 const record=[prop,cash,agreement,'6000.50','2024-04-02','Bob']
 await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)',record)
 await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)',record)
 assert.equal((await db.query('select * from public.cash_allocations')).rows.length,0)
 await assert.rejects(confirm(),/Designated cash verifier/)
 await as(james,'aal1'); await assert.rejects(confirm(),/Staff MFA/)
 await as(other); assert.equal((await db.query('select * from public.cash_records')).rows.length,0); await assert.rejects(confirm())
 await as(james)
 const ack=(await confirm()).rows[0].confirm_rent_cash
 assert.equal(ack.amount,'6000.50'); assert.equal(ack.balance_at_issuance,'4000.00'); assert.equal(ack.allocations.length,2)
 assert.deepEqual((await confirm()).rows[0].confirm_rent_cash,ack)
 assert.equal((await db.query('select * from public.cash_allocations')).rows.length,2)
 await assert.rejects(db.query('update public.cash_records set acknowledgment=null'))
 await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)',[prop,id(20),agreement,'4000.01','2024-04-03','James'])
 await assert.rejects(db.query('select public.confirm_rent_cash($1,$2)',[prop,id(20)]),/exceeds unpaid/)
 assert.equal((await db.query('select * from public.cash_allocations')).rows.length,2)
 const view=(await db.query<{read_rent_workspace:any}>('select public.read_rent_workspace($1)',[prop])).rows[0].read_rent_workspace
 assert.equal(view.agreements[0].balance,'4000.00')
 assert.equal(typeof view.cash[0].amount,'string')
 await db.exec('reset role')
 await db.exec(`create function public.fail_cash_audit() returns trigger language plpgsql as $$ begin if new.action='rent_cash_confirmed' then raise exception 'Simulated audit failure'; end if; return new; end $$; create trigger test_cash_audit before insert on public.audit_events for each row execute function public.fail_cash_audit();`)
 await as(james)
 await db.query('select public.record_rent_cash($1,$2,$3,$4,$5,$6)',[prop,id(21),agreement,'1000.00','2024-04-03','James'])
 await assert.rejects(db.query('select public.confirm_rent_cash($1,$2)',[prop,id(21)]),/Simulated audit failure/)
 assert.equal((await db.query('select * from public.cash_allocations')).rows.length,2)
 assert.equal((await db.query<{confirmed_at:string|null}>('select confirmed_at from public.cash_records where id=$1',[id(21)])).rows[0].confirmed_at,null)
 await db.exec('reset role')
 await db.exec('drop trigger test_cash_audit on public.audit_events; drop function public.fail_cash_audit()')
 await db.query('update public.tenants set display_name=$1 where id=$2',['Changed name',tenant])
 await db.query('update public.staff_memberships set revoked_at=now() where user_id=$1',[james])
 await as(james); await assert.rejects(confirm(),/Staff MFA/)
 await as(owner)
 assert.deepEqual((await db.query<{ack:unknown}>('select acknowledgment as ack from public.cash_records where id=$1',[cash])).rows[0].ack,ack)
 await db.exec('set role anon'); await assert.rejects(db.query('select * from public.cash_records'))
})
