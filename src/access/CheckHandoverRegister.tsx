import { useEffect, useState } from 'react'
import { supabase } from './client'
import { Button } from '../components/atoms'
import { roomName, type SavedCheck, type SavedHandover } from './saved-payments-model'
import { decimalPesos } from './CashAcknowledgment'
import { text, type Language } from '../i18n'

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

export function CheckHandoverRegister({propertyId,data,tenants,owner,canRecordCheck,busy,mutate,language='en'}:{propertyId:string;data:Snapshot;tenants:{id:string;display_name:string}[];owner:boolean;canRecordCheck:boolean;busy:boolean;mutate:Mutate;language?:Language}) {
 const tr=(english:string,bisaya:string)=>text(language,english,bisaya)
 const [reason,setReason]=useState<Record<string,string>>({})
 const [handoverMessage,setHandoverMessage]=useState('')
 const [handoverError,setHandoverError]=useState('')
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})
 // Bank name and check number (202610270014): optional, read separately; empty when the update is not applied.
 // Staff emails by account (202610270014); falls back to "account <id>" when unavailable.
 const [names,setNames]=useState<Record<string,string>>({})
 useEffect(()=>{void supabase?.rpc('read_staff_names',{p_property_id:propertyId}).then(({data:value,error})=>setNames(!error&&value&&typeof value==='object'?value as Record<string,string>:{}),()=>setNames({}))},[propertyId])
 const staffName=(userId:string)=>names[userId]??`${tr('account','account')} ${userId}`
 const [details,setDetails]=useState<Record<string,{bank_name:string|null;check_number:string|null}>>({})
 useEffect(()=>{void supabase?.rpc('read_check_details',{p_property_id:propertyId}).then(({data:value,error})=>setDetails(!error&&value&&typeof value==='object'?value as typeof details:{}),()=>setDetails({}))},[propertyId,data])
 function nameForCheck(check:SavedCheck) {
  const agreement=data.agreements.find(item=>item.id===check.agreement_id)
  const unit=agreement&&data.units.find(item=>item.id===agreement.unit_id)
  const building=unit&&data.buildings.find(item=>item.id===unit.building_id)
  return {tenant:tenants.find(item=>item.id===agreement?.tenant_id)?.display_name??tr('Tenant unavailable','Hindi makita ang talaan ng umuupa'),space:`${building?.label??tr('Building unavailable','Hindi makita ang gusali')} / ${unit?.label??tr('Room unavailable','Hindi makita ang kuwarto')}`}
 }
 async function transition(check:SavedCheck,action:'deposited'|'cleared'|'returned'|'reversed') {
  const text=reason[check.id]?.trim()??''
  if(action==='reversed'&&!text){setHandoverError(tr('A reason is required to reverse a cleared check.','Kailangan ng dahilan sa pagbawi ng kumpirmadong tseke.'));return}
  const saved=await mutate('transition_rent_check',{p_check_id:check.id,p_action:action,p_reason:text})
  if(saved!==false)setReason(value=>({...value,[check.id]:''}))
 }
 return <>
  <section className="card" aria-labelledby="checks-heading">
   <h3 id="checks-heading">{tr('Check register','Listahan ng mga tseke')}</h3>
   <p>{tr('Reference numbers are generated in order. A check does not reduce rent until staff mark it cleared after bank confirmation.','Sunud-sunod ang mga reference number. Hindi bababa ang upa dahil sa tseke hangga\'t hindi kinukumpirma ng staff ang clearance sa bangko.')}</p>
   {canRecordCheck&&data.agreements.length>0&&<form className="rent-setup" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const bank=String(form.get('bank')??'').trim(),number=String(form.get('number')??'').trim();void mutate('record_rent_check',{p_agreement_id:String(form.get('agreement')),p_amount:String(form.get('amount')),p_received_on:String(form.get('date')),p_check_date:String(form.get('checkDate')),p_collector:String(form.get('collector'))}).then(ref=>{if(typeof ref==='string'&&(bank||number))void mutate('record_check_details',{p_reference:ref,p_bank_name:bank||null,p_check_number:number||null},false)})}}>
    <h4>{tr('Record check received','Itala ang natanggap na tseke')}</h4>
    <label htmlFor="check-agreement">{tr('Tenant / room','Umuupa / kuwarto')}</label><select id="check-agreement" name="agreement" required><option value="">{tr('Choose an agreement','Pumili ng kasunduan')}</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??tr('Tenant unavailable','Hindi makita ang talaan ng umuupa')} / {roomName(data,a.unit_id,tr('Room unavailable','Hindi makita ang kuwarto'))}</option>)}</select>
    <label htmlFor="check-amount">{tr('Amount (PHP)','Halaga (PHP)')}</label><input id="check-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required />
    <label htmlFor="check-date">{tr('Date received','Petsa ng pagkatanggap')}</label><input id="check-date" name="date" type="date" max={today} required />
    <label htmlFor="check-written-date">{tr('Date written on check','Petsang nakasulat sa tseke')}</label><input id="check-written-date" name="checkDate" type="date" required />
    <label htmlFor="check-bank">{tr('Bank name (optional)','Pangalan ng bangko (hindi kailangan)')}</label><input id="check-bank" name="bank" maxLength={80} placeholder={tr('Example: BDO','Halimbawa: BDO')} />
    <label htmlFor="check-number">{tr('Check number (optional)','Numero ng tseke (hindi kailangan)')}</label><input id="check-number" name="number" maxLength={30} pattern="[0-9A-Za-z]+(-[0-9A-Za-z]+)*" inputMode="numeric" aria-describedby="check-number-help" /><p id="check-number-help" className="field-help">{tr('The number printed on the check. Never write the bank account number.','Ang numerong nakalimbag sa tseke. Huwag isulat ang numero ng bank account.')}</p>
    <label htmlFor="check-collector">{tr('Received by','Tinanggap ni')}</label><select id="check-collector" name="collector"><option>James</option><option>Bob</option></select>
    <Button disabled={busy} className="primary">{tr('Save check received','I-save ang natanggap na tseke')}</Button>
   </form>}
   {!canRecordCheck&&<p>{tr('Only an authorized clerk can record check receipt.','Ang pinahintulutang clerk lang ang makapagtatala ng natanggap na tseke.')}</p>}
   {!data.checks.length?<p role="status">{tr('No checks recorded.','Walang naitalang tseke.')}</p>:data.checks.map(check=>{
    const who=nameForCheck(check)
    return <article className="cash-queue-row" key={check.id}>
     <div><strong>{check.reference} · {who.tenant}</strong><p>{who.space}</p></div>
     <div><strong>{decimalPesos(check.amount)}</strong><p>{tr('Received','Natanggap')} {check.received_on} {tr('by','ni')} {check.collector} · {tr('Check dated','Petsa ng tseke')} {check.check_date}</p>{details[check.id]&&<p className="check-bank-line">{[details[check.id].bank_name,details[check.id].check_number&&`${tr('No.','Blg.')} ${details[check.id].check_number}`].filter(Boolean).join(' · ')}</p>}</div>
     <p className={`status status--${check.status}`}>{check.status==='received'?tr('Received — not settled','Natanggap — hindi pa naideposito'):check.status==='deposited'?tr('Deposited — awaiting clearance','Naideposito — naghihintay ng clearance'):check.status==='cleared'?tr('Cleared by bank','Kinumpirma ng bangko'):check.status==='returned'?tr('Returned by bank','Ibinalik ng bangko'):tr('Cleared check reversed','Binawi ang kumpirmasyon')}</p>
     {check.events.length>0&&<details><summary>{tr('Check history','Kasaysayan ng tseke')}</summary><ul>{check.events.map((event,index)=><li key={`${event.occurred_at}-${index}`}>{language==='fil'?({received:'Nadawat',deposited:'Gideposito',cleared:'Kinumpirma ng bangko',returned:'Gibalik',reversed:'Gibawi'} as Record<string,string>)[event.action]??event.action:event.action} · {localTime(event.occurred_at)} · {staffName(event.actor_id)} · {event.reason}</li>)}</ul></details>}
     {owner&&check.status!=='returned'&&check.status!=='reversed'&&<div className="rent-setup">
      <label htmlFor={`check-reason-${check.id}`}>{tr('Owner note (reason required for reversal)','Tala ng may-ari (kailangan ng dahilan sa pagbawi)')}</label><input id={`check-reason-${check.id}`} value={reason[check.id]??''} onChange={event=>setReason(value=>({...value,[check.id]:event.target.value}))} maxLength={500} />
      <div className="person-actions">
       {check.status==='received'&&<Button variant="secondary" disabled={busy} onClick={()=>void transition(check,'deposited')}>{tr('Record deposit','Itala ang deposito')}</Button>}
       {check.status==='deposited'&&<Button variant="approve" disabled={busy} onClick={()=>void transition(check,'cleared')}>{tr('Confirm bank clearance','Kumpirmahin ang clearance sa bangko')}</Button>}
       <Button variant="danger-quiet" disabled={busy} onClick={()=>void transition(check,'returned')}>{tr('Record returned','Itala na ibinalik')}</Button>
       {check.status==='cleared'&&<Button variant="danger-quiet" disabled={busy} onClick={()=>void transition(check,'reversed')}>{tr('Reverse cleared check','Bawiin ang kumpirmadong tseke')}</Button>}
      </div>
     </div>}
    </article>
   })}
  </section>
  {owner&&<section className="card" aria-labelledby="handover-heading">
   <h3 id="handover-heading">{tr('Collection handover log','Talaan ng pag-turnover ng koleksiyon')}</h3>
   <p>{tr('Record the clerk’s stated totals and the amount the owner actually received. This is a comparison record only; differences do not change renter balances.','Itala ang kabuuang sinabi ng clerk at ang talagang natanggap ng may-ari. Paghahambing lang ito; hindi magbabago ang balanse ng umuupa kahit may pagkakaiba.')}</p>
   {handoverError&&<p role="alert" className="notice">{handoverError}</p>}{handoverMessage&&<p role="status" className="notice">{handoverMessage}</p>}
   <form className="rent-setup" onSubmit={async event=>{event.preventDefault();setHandoverError('');setHandoverMessage('');const form=event.currentTarget;const values=new FormData(form);const expectedCash=String(values.get('expectedCash'));const expectedChecks=String(values.get('expectedChecks'));const actualCash=String(values.get('actualCash'));const actualChecks=String(values.get('actualChecks'));const note=String(values.get('reason'));const different=!sameAmount(expectedCash,actualCash)||!sameAmount(expectedChecks,actualChecks);if(different&&!note.trim()){setHandoverError(tr('Explain any difference between the expected and received totals.','Ipaliwanag ang pagkakaiba ng inaasahan at natanggap na kabuuan.'));return}const saved=await mutate('record_collection_handover',{p_clerk_id:String(values.get('clerk')),p_handover_on:String(values.get('date')),p_expected_cash:expectedCash,p_expected_checks:expectedChecks,p_actual_cash:actualCash,p_actual_checks:actualChecks,p_difference_reason:note},true);if(saved!==false){form.reset();setHandoverMessage(tr('Handover recorded. Renter balances were not changed.','Naitala ang pag-turnover. Hindi nabago ang balanse ng umuupa.'))}}}>
    <label htmlFor="handover-clerk">{tr('Clerk handing over','Clerk na magta-turnover')}</label><select id="handover-clerk" name="clerk" required><option value="">{tr('Choose clerk','Pumili ng clerk')}</option>{data.clerks.map(item=><option key={item.user_id} value={item.user_id}>{names[item.user_id]??item.user_id}</option>)}</select>
    <label htmlFor="handover-date">{tr('Handover date','Petsa ng pag-turnover')}</label><input id="handover-date" name="date" type="date" max={today} required />
    <label htmlFor="handover-expected-cash">{tr('Cash the clerk says was handed over (PHP)','Cash na sinabi ng clerk na na-turnover (PHP)')}</label><input id="handover-expected-cash" name="expectedCash" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-expected-checks">{tr('Checks the clerk says were handed over (PHP)','Mga tseke na sinabi ng clerk na na-turnover (PHP)')}</label><input id="handover-expected-checks" name="expectedChecks" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-actual-cash">{tr('Cash actually received by owner (PHP)','Cash na talagang natanggap ng may-ari (PHP)')}</label><input id="handover-actual-cash" name="actualCash" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-actual-checks">{tr('Checks actually received by owner (PHP)','Mga tseke na talagang natanggap ng may-ari (PHP)')}</label><input id="handover-actual-checks" name="actualChecks" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-reason">{tr('Difference reason (required if totals do not match)','Dahilan ng pagkakaiba (kailangan kung magkaiba ang kabuuan)')}</label><input id="handover-reason" name="reason" maxLength={500} />
    <Button disabled={busy||!data.clerks.length} className="primary">{tr('Save handover','I-save ang pag-turnover')}</Button>{!data.clerks.length&&<p>{tr('No active clerk account is available.','Walang aktibong account ng clerk.')}</p>}
   </form>
   <h4>{tr('Past handovers','Mga nakaraang pag-turnover')}</h4>{!data.handovers.length?<p>{tr('No handovers recorded.','Walang naitalang pag-turnover.')}</p>:<ul>{data.handovers.map(item=><li key={item.id}>{item.handover_on}: {tr('expected cash','inaasahang cash')} {decimalPesos(item.expected_cash)}, {tr('checks','mga tseke')} {decimalPesos(item.expected_checks)}; {tr('received cash','natanggap na cash')} {decimalPesos(item.actual_cash)}, {tr('checks','mga tseke')} {decimalPesos(item.actual_checks)}{item.difference_reason?` — ${item.difference_reason}`:''} · {tr('recorded by','itinala ni')} {staffName(item.recorded_by)} {tr('at','noong')} {localTime(item.recorded_at)}</li>)}</ul>}
  </section>}
 </>
}
