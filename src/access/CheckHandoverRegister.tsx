import { useState } from 'react'
import { Button } from '../components/atoms'
import type { SavedCheck, SavedHandover } from './saved-payments-model'
import { decimalPesos } from './CashAcknowledgment'

type Agreement = { id:string; tenant_id:string; unit_id:string }
type Snapshot = { checks:SavedCheck[]; handovers:SavedHandover[]; clerks:{user_id:string}[]; agreements:Agreement[]; units:{id:string;label:string;building_id:string}[]; buildings:{id:string;label:string}[] }
type Mutate = (name:string,args:Record<string,unknown>,idempotent?:boolean)=>Promise<unknown|false>
function localTime(value:string) {
 return new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value))
}
function sameAmount(a:string,b:string) {
 const minor=(value:string)=>{const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());return match?BigInt(match[1])*100n+BigInt((match[2]??'').padEnd(2,'0')):null}
 const left=minor(a),right=minor(b)
 return left!==null&&right!==null&&left===right
}

export function CheckHandoverRegister({data,tenants,owner,canRecordCheck,busy,mutate}:{data:Snapshot;tenants:{id:string;display_name:string}[];owner:boolean;canRecordCheck:boolean;busy:boolean;mutate:Mutate}) {
 const [reason,setReason]=useState<Record<string,string>>({})
 const [handoverMessage,setHandoverMessage]=useState('')
 const [handoverError,setHandoverError]=useState('')
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})
 function nameForCheck(check:SavedCheck) {
  const agreement=data.agreements.find(item=>item.id===check.agreement_id)
  const unit=agreement&&data.units.find(item=>item.id===agreement.unit_id)
  const building=unit&&data.buildings.find(item=>item.id===unit.building_id)
  return {tenant:tenants.find(item=>item.id===agreement?.tenant_id)?.display_name??'Tenant unavailable',space:`${building?.label??'Building'} / ${unit?.label??'Room'}`}
 }
 async function transition(check:SavedCheck,action:'deposited'|'cleared'|'returned'|'reversed') {
  const text=reason[check.id]?.trim()??''
  if(action==='reversed'&&!text){setHandoverError('A reason is required to reverse a cleared check.');return}
  const saved=await mutate('transition_rent_check',{p_check_id:check.id,p_action:action,p_reason:text})
  if(saved!==false)setReason(value=>({...value,[check.id]:''}))
 }
 return <>
  <section className="card" aria-labelledby="checks-heading">
   <h3 id="checks-heading">Check register</h3>
   <p>Reference numbers are generated in order. A check does not reduce rent until the owner marks it cleared after bank confirmation.</p>
   {canRecordCheck&&data.agreements.length>0&&<form className="rent-setup" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void mutate('record_rent_check',{p_agreement_id:String(form.get('agreement')),p_amount:String(form.get('amount')),p_received_on:String(form.get('date')),p_check_date:String(form.get('checkDate')),p_collector:String(form.get('collector'))})}}>
    <h4>Record check received</h4>
    <label htmlFor="check-agreement">Tenant / room</label><select id="check-agreement" name="agreement" required><option value="">Choose an agreement</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??'Tenant'} / {data.units.find(u=>u.id===a.unit_id)?.label??'Room'}</option>)}</select>
    <label htmlFor="check-amount">Amount (PHP)</label><input id="check-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required />
    <label htmlFor="check-date">Date received</label><input id="check-date" name="date" type="date" max={today} required />
    <label htmlFor="check-written-date">Date written on check</label><input id="check-written-date" name="checkDate" type="date" required />
    <label htmlFor="check-collector">Received by</label><select id="check-collector" name="collector"><option>James</option><option>Bob</option></select>
    <Button disabled={busy} className="primary">Save check received</Button>
   </form>}
   {!canRecordCheck&&<p>Only an authorized clerk can record check receipt.</p>}
   {!data.checks.length?<p role="status">No checks recorded.</p>:data.checks.map(check=>{
    const who=nameForCheck(check)
    return <article className="cash-queue-row" key={check.id}>
     <div><strong>{check.reference} · {who.tenant}</strong><p>{who.space}</p></div>
     <div><strong>{decimalPesos(check.amount)}</strong><p>Received {check.received_on} by {check.collector} · Check dated {check.check_date}</p></div>
     <p className={`status status--${check.status}`}>{check.status==='received'?'Received — not settled':check.status==='deposited'?'Deposited — awaiting clearance':check.status[0].toUpperCase()+check.status.slice(1)}</p>
     {check.events.length>0&&<details><summary>Check history</summary><ul>{check.events.map((event,index)=><li key={`${event.occurred_at}-${index}`}>{event.action} · {localTime(event.occurred_at)} · account {event.actor_id} · {event.reason}</li>)}</ul></details>}
     {owner&&check.status!=='returned'&&check.status!=='reversed'&&<div className="rent-setup">
      <label htmlFor={`check-reason-${check.id}`}>Owner note (reason required for reversal)</label><input id={`check-reason-${check.id}`} value={reason[check.id]??''} onChange={event=>setReason(value=>({...value,[check.id]:event.target.value}))} maxLength={500} />
      <div className="person-actions">
       {check.status==='received'&&<Button disabled={busy} onClick={()=>void transition(check,'deposited')}>Record deposit</Button>}
       {check.status==='deposited'&&<Button disabled={busy} onClick={()=>void transition(check,'cleared')}>Confirm bank clearance</Button>}
       <Button disabled={busy} onClick={()=>void transition(check,'returned')}>Record returned</Button>
       {check.status==='cleared'&&<Button disabled={busy} onClick={()=>void transition(check,'reversed')}>Reverse cleared check</Button>}
      </div>
     </div>}
    </article>
   })}
  </section>
  {owner&&<section className="card" aria-labelledby="handover-heading">
   <h3 id="handover-heading">Collection handover log</h3>
   <p>Record the clerk’s stated totals and the amount the owner actually received. This is a comparison record only; differences do not change renter balances.</p>
   {handoverError&&<p role="alert" className="notice">{handoverError}</p>}{handoverMessage&&<p role="status" className="notice">{handoverMessage}</p>}
   <form className="rent-setup" onSubmit={async event=>{event.preventDefault();setHandoverError('');setHandoverMessage('');const form=event.currentTarget;const values=new FormData(form);const expectedCash=String(values.get('expectedCash'));const expectedChecks=String(values.get('expectedChecks'));const actualCash=String(values.get('actualCash'));const actualChecks=String(values.get('actualChecks'));const note=String(values.get('reason'));const different=!sameAmount(expectedCash,actualCash)||!sameAmount(expectedChecks,actualChecks);if(different&&!note.trim()){setHandoverError('Explain any difference between the expected and received totals.');return}const saved=await mutate('record_collection_handover',{p_clerk_id:String(values.get('clerk')),p_handover_on:String(values.get('date')),p_expected_cash:expectedCash,p_expected_checks:expectedChecks,p_actual_cash:actualCash,p_actual_checks:actualChecks,p_difference_reason:note},true);if(saved!==false){form.reset();setHandoverMessage('Handover recorded. Renter balances were not changed.')}}}>
    <label htmlFor="handover-clerk">Clerk handing over</label><select id="handover-clerk" name="clerk" required><option value="">Choose clerk</option>{data.clerks.map(item=><option key={item.user_id} value={item.user_id}>{item.user_id}</option>)}</select>
    <label htmlFor="handover-date">Handover date</label><input id="handover-date" name="date" type="date" max={today} required />
    <label htmlFor="handover-expected-cash">Cash the clerk says was handed over (PHP)</label><input id="handover-expected-cash" name="expectedCash" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-expected-checks">Checks the clerk says were handed over (PHP)</label><input id="handover-expected-checks" name="expectedChecks" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-actual-cash">Cash actually received by owner (PHP)</label><input id="handover-actual-cash" name="actualCash" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-actual-checks">Checks actually received by owner (PHP)</label><input id="handover-actual-checks" name="actualChecks" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-reason">Difference reason (required if totals do not match)</label><input id="handover-reason" name="reason" maxLength={500} />
    <Button disabled={busy||!data.clerks.length} className="primary">Save handover</Button>{!data.clerks.length&&<p>No active clerk account is available.</p>}
   </form>
   <h4>Past handovers</h4>{!data.handovers.length?<p>No handovers recorded.</p>:<ul>{data.handovers.map(item=><li key={item.id}>{item.handover_on}: expected cash {decimalPesos(item.expected_cash)}, checks {decimalPesos(item.expected_checks)}; received cash {decimalPesos(item.actual_cash)}, checks {decimalPesos(item.actual_checks)}{item.difference_reason?` — ${item.difference_reason}`:''} · recorded by account {item.recorded_by} at {localTime(item.recorded_at)}</li>)}</ul>}
  </section>}
 </>
}
