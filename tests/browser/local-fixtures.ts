import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// CLI output is captured, never logged: it contains local keys.
const cli = join(process.cwd(),'node_modules/@supabase/cli-windows-x64/bin/supabase.exe')
const env = { ...process.env, PATH: `C:\\Program Files\\Docker\\Docker\\resources\\bin;${process.env.PATH}` }
const output = execFileSync(cli,['status','--output','json'],{env,stdio:['ignore','pipe','pipe']}).toString()
const local = JSON.parse(output.slice(output.indexOf('{'),output.lastIndexOf('}')+1))
if(local.API_URL !== 'http://127.0.0.1:54321' || local.MAILPIT_URL !== 'http://127.0.0.1:54324') throw new Error('Non-local services refused')
export const api = local.API_URL as string
export const anon = local.ANON_KEY as string
export const admin = createClient(api,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
export const client = () => createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}})
export function sql(query:string) {
  const file=join(tmpdir(),`rent-test-${randomUUID()}.sql`)
  try { writeFileSync(file,query); const result=execFileSync(cli,['db','query','--local','--file',file],{env,stdio:['ignore','pipe','pipe']}).toString(); return result.includes('{') ? (JSON.parse(result.slice(result.indexOf('{'),result.lastIndexOf('}')+1)).rows ?? []) : [] }
  catch {throw new Error('Local fixture SQL failed (details withheld)')}
  finally {unlinkSync(file)}
}
export function totp(secret:string) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits=''
  for(const c of secret.toUpperCase().replaceAll('=','')) bits+=alphabet.indexOf(c).toString(2).padStart(5,'0')
  const bytes=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2)))
  const count=Buffer.alloc(8);count.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const h=createHmac('sha1',bytes).update(count).digest();const offset=h[19]&15
  return ((h.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0')
}
export async function fixtures() {
  const tag=randomUUID();const property=randomUUID(),tenantA=randomUUID(),tenantB=randomUUID()
  const users:Record<string,{id:string;email:string;password:string}>={}
  const invitedEmails:string[]=[]
  async function cleanup() {
    // Only this run's UUID-scoped fixtures; never reset or touch unrelated data.
    sql(`do $$ begin
      delete from public.audit_events where property_id='${property}';
      delete from private.invitation_attempt_reviews r using private.invitation_attempts a
        where r.attempt_id=a.attempt_id and a.property_id='${property}';
      delete from private.invitation_attempts where property_id='${property}';
      delete from public.tenant_contacts where property_id='${property}';
      delete from public.staff_memberships where property_id='${property}';
      delete from public.tenants where property_id='${property}';
      delete from public.units where property_id='${property}';
      delete from public.buildings where property_id='${property}';
      delete from public.properties where id='${property}'; end $$;`)
    for(const email of invitedEmails) {
      const ids=sql(`select id from auth.users where email='${email}'`)
      for(const row of ids) {const {error}=await admin.auth.admin.deleteUser(row.id);if(error) throw new Error('Invited fixture cleanup failed')}
    }
    for(const user of Object.values(users)) {const {error}=await admin.auth.admin.deleteUser(user.id);if(error)throw new Error('Auth fixture cleanup failed')}
    const mail=await (await fetch(`${local.MAILPIT_URL}/api/v1/messages?start=0&limit=500`)).json()
    const addresses=[...Object.values(users).map(u=>u.email),...invitedEmails]
    const IDs=mail.messages.filter((m:{To:{Address:string}[]})=>m.To.some(r=>addresses.includes(r.Address))).map((m:{ID:string})=>m.ID)
    if(IDs.length) {const result=await fetch(`${local.MAILPIT_URL}/api/v1/messages`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs})});if(!result.ok)throw new Error('Mail fixture cleanup failed')}
  }
  try {
    for(const name of ['owner','clerk','alice','bob','unassigned']) {
      const email=`${name}-${tag}@example.invalid`,password=`${randomUUID()}aA1!`
      const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true})
      if(error||!data.user)throw new Error('Local fixture user creation failed')
      users[name]={id:data.user.id,email,password}
    }
    sql(`do $$ begin
      insert into public.properties(id,name) values('${property}','Browser test property ${tag}');
      insert into public.tenants(id,property_id,display_name,kind) values('${tenantA}','${property}','Fictional Renter A ${tag}','individual'),('${tenantB}','${property}','Fictional Renter B ${tag}','business');
      insert into public.staff_memberships(property_id,user_id,role) values('${property}','${users.owner.id}','owner'),('${property}','${users.clerk.id}','clerk');
      insert into public.tenant_contacts(property_id,tenant_id,user_id) values('${property}','${tenantA}','${users.alice.id}'),('${property}','${tenantB}','${users.bob.id}');
      end $$;`)
    return {tag,property,tenantA,tenantB,users,invitedEmails,cleanup}
  } catch(e) {await cleanup();throw e}
}
export async function invitationLink(email:string) {
  const list=await (await fetch(`${local.MAILPIT_URL}/api/v1/messages?limit=500`)).json()
  const message=list.messages.find((m:{To:{Address:string}[]})=>m.To.some(r=>r.Address===email))
  if(!message) return null
  const full=await (await fetch(`${local.MAILPIT_URL}/api/v1/message/${message.ID}`)).json()
  const match=(full.HTML as string).match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)
  if(!match)throw new Error('Invitation link missing')
  const url=match[1].replaceAll('&amp;','&')
  if(!url.startsWith(`${api}/auth/v1/verify?`))throw new Error('Non-local verification refused')
  return url
}
