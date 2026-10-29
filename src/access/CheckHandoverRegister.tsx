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
  return {tenant:tenants.find(item=>item.id===agreement?.tenant_id)?.display_name??tr('Tenant unavailable','Wala makita ang rekord sa nag-abang'),space:`${building?.label??tr('Building unavailable','Wala makita ang bilding')} / ${unit?.label??tr('Room unavailable','Wala makita ang kwarto')}`}
 }
 async function transition(check:SavedCheck,action:'deposited'|'cleared'|'returned'|'reversed') {
  const text=reason[check.id]?.trim()??''
  if(action==='reversed'&&!text){setHandoverError(tr('A reason is required to reverse a cleared check.','Kinahanglan og rason sa pagbawi sa kumpirmadong tseke.'));return}
  const saved=await mutate('transition_rent_check',{p_check_id:check.id,p_action:action,p_reason:text})
  if(saved!==false)setReason(value=>({...value,[check.id]:''}))
 }
 return <>
  <section className="card" aria-labelledby="checks-heading">
   <h3 id="checks-heading">{tr('Check register','Lista sa mga tseke')}</h3>
   <p>{tr('Reference numbers are generated in order. A check does not reduce rent until staff mark it cleared after bank confirmation.','Sunod-sunod ang mga reference number. Dili moubos ang abang tungod sa tseke hangtod kumpirmahon sa staff ang clearance sa bangko.')}</p>
   {canRecordCheck&&data.agreements.length>0&&<form className="rent-setup" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const bank=String(form.get('bank')??'').trim(),number=String(form.get('number')??'').trim();void mutate('record_rent_check',{p_agreement_id:String(form.get('agreement')),p_amount:String(form.get('amount')),p_received_on:String(form.get('date')),p_check_date:String(form.get('checkDate')),p_collector:String(form.get('collector'))}).then(ref=>{if(typeof ref==='string'&&(bank||number))void mutate('record_check_details',{p_reference:ref,p_bank_name:bank||null,p_check_number:number||null},false)})}}>
    <h4>{tr('Record check received','Irekord ang nadawat nga tseke')}</h4>
    <label htmlFor="check-agreement">{tr('Tenant / room','Nag-abang / kwarto')}</label><select id="check-agreement" name="agreement" required><option value="">{tr('Choose an agreement','Pagpili og kasabotan')}</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??tr('Tenant unavailable','Wala makita ang rekord sa nag-abang')} / {roomName(data,a.unit_id,tr('Room unavailable','Wala makita ang kwarto'))}</option>)}</select>
    <label htmlFor="check-amount">{tr('Amount (PHP)','Kantidad (PHP)')}</label><input id="check-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required />
    <label htmlFor="check-date">{tr('Date received','Petsa nga nadawat')}</label><input id="check-date" name="date" type="date" max={today} required />
    <label htmlFor="check-written-date">{tr('Date written on check','Petsa nga nakasulat sa tseke')}</label><input id="check-written-date" name="checkDate" type="date" required />
    <label htmlFor="check-bank">{tr('Bank name (optional)','Ngalan sa bangko (dili kinahanglan)')}</label><input id="check-bank" name="bank" maxLength={80} placeholder={tr('Example: BDO','Pananglitan: BDO')} />
    <label htmlFor="check-number">{tr('Check number (optional)','Numero sa tseke (dili kinahanglan)')}</label><input id="check-number" name="number" maxLength={30} pattern="[0-9A-Za-z]+(-[0-9A-Za-z]+)*" inputMode="numeric" aria-describedby="check-number-help" /><p id="check-number-help" className="field-help">{tr('The number printed on the check. Never write the bank account number.','Ang numero nga naimprinta sa tseke. Ayaw isulat ang numero sa bank account.')}</p>
    <label htmlFor="check-collector">{tr('Received by','Gidawat ni')}</label><select id="check-collector" name="collector"><option>James</option><option>Bob</option></select>
    <Button disabled={busy} className="primary">{tr('Save check received','I-save ang nadawat nga tseke')}</Button>
   </form>}
   {!canRecordCheck&&<p>{tr('Only an authorized clerk can record check receipt.','Ang gitugot nga clerk lang ang makarekord sa nadawat nga tseke.')}</p>}
   {!data.checks.length?<p role="status">{tr('No checks recorded.','Walay tseke nga narekord.')}</p>:data.checks.map(check=>{
    const who=nameForCheck(check)
    return <article className="cash-queue-row" key={check.id}>
     <div><strong>{check.reference} · {who.tenant}</strong><p>{who.space}</p></div>
     <div><strong>{decimalPesos(check.amount)}</strong><p>{tr('Received','Nadawat')} {check.received_on} {tr('by','ni')} {check.collector} · {tr('Check dated','Petsa sa tseke')} {check.check_date}</p>{details[check.id]&&<p className="check-bank-line">{[details[check.id].bank_name,details[check.id].check_number&&`${tr('No.','Num.')} ${details[check.id].check_number}`].filter(Boolean).join(' · ')}</p>}</div>
     <p className={`status status--${check.status}`}>{check.status==='received'?tr('Received — not settled','Nadawat — wala pa mabayri'):check.status==='deposited'?tr('Deposited — awaiting clearance','Gideposito — naghulat sa clearance'):check.status==='cleared'?tr('Cleared by bank','Gikumpirma sa bangko'):check.status==='returned'?tr('Returned by bank','Gibalik sa bangko'):tr('Cleared check reversed','Gibawi ang kumpirmasyon')}</p>
     {check.events.length>0&&<details><summary>{tr('Check history','Kasaysayan sa tseke')}</summary><ul>{check.events.map((event,index)=><li key={`${event.occurred_at}-${index}`}>{language==='ceb'?({received:'Nadawat',deposited:'Gideposito',cleared:'Gikumpirma sa bangko',returned:'Gibalik',reversed:'Gibawi'} as Record<string,string>)[event.action]??event.action:event.action} · {localTime(event.occurred_at)} · {staffName(event.actor_id)} · {event.reason}</li>)}</ul></details>}
     {owner&&check.status!=='returned'&&check.status!=='reversed'&&<div className="rent-setup">
      <label htmlFor={`check-reason-${check.id}`}>{tr('Owner note (reason required for reversal)','Nota sa tag-iya (kinahanglan og rason sa pagbawi)')}</label><input id={`check-reason-${check.id}`} value={reason[check.id]??''} onChange={event=>setReason(value=>({...value,[check.id]:event.target.value}))} maxLength={500} />
      <div className="person-actions">
       {check.status==='received'&&<Button variant="secondary" disabled={busy} onClick={()=>void transition(check,'deposited')}>{tr('Record deposit','Irekord ang deposito')}</Button>}
       {check.status==='deposited'&&<Button variant="approve" disabled={busy} onClick={()=>void transition(check,'cleared')}>{tr('Confirm bank clearance','Kumpirmaha ang clearance sa bangko')}</Button>}
       <Button variant="danger-quiet" disabled={busy} onClick={()=>void transition(check,'returned')}>{tr('Record returned','Irekord nga gibalik')}</Button>
       {check.status==='cleared'&&<Button variant="danger-quiet" disabled={busy} onClick={()=>void transition(check,'reversed')}>{tr('Reverse cleared check','Bawiha ang kumpirmadong tseke')}</Button>}
      </div>
     </div>}
    </article>
   })}
  </section>
  {owner&&<section className="card" aria-labelledby="handover-heading">
   <h3 id="handover-heading">{tr('Collection handover log','Rekord sa pagtugyan sa koleksiyon')}</h3>
   <p>{tr('Record the clerk’s stated totals and the amount the owner actually received. This is a comparison record only; differences do not change renter balances.','Irekord ang total nga giingon sa clerk ug ang tinuod nga nadawat sa tag-iya. Pagtandi lang kini; dili mausab ang balanse sa nag-abang bisan adunay kalainan.')}</p>
   {handoverError&&<p role="alert" className="notice">{handoverError}</p>}{handoverMessage&&<p role="status" className="notice">{handoverMessage}</p>}
   <form className="rent-setup" onSubmit={async event=>{event.preventDefault();setHandoverError('');setHandoverMessage('');const form=event.currentTarget;const values=new FormData(form);const expectedCash=String(values.get('expectedCash'));const expectedChecks=String(values.get('expectedChecks'));const actualCash=String(values.get('actualCash'));const actualChecks=String(values.get('actualChecks'));const note=String(values.get('reason'));const different=!sameAmount(expectedCash,actualCash)||!sameAmount(expectedChecks,actualChecks);if(different&&!note.trim()){setHandoverError(tr('Explain any difference between the expected and received totals.','Ipasabot ang kalainan sa gilauman ug nadawat nga total.'));return}const saved=await mutate('record_collection_handover',{p_clerk_id:String(values.get('clerk')),p_handover_on:String(values.get('date')),p_expected_cash:expectedCash,p_expected_checks:expectedChecks,p_actual_cash:actualCash,p_actual_checks:actualChecks,p_difference_reason:note},true);if(saved!==false){form.reset();setHandoverMessage(tr('Handover recorded. Renter balances were not changed.','Narekord ang pagtugyan. Wala mausab ang balanse sa nag-abang.'))}}}>
    <label htmlFor="handover-clerk">{tr('Clerk handing over','Clerk nga motugyan')}</label><select id="handover-clerk" name="clerk" required><option value="">{tr('Choose clerk','Pagpili og clerk')}</option>{data.clerks.map(item=><option key={item.user_id} value={item.user_id}>{names[item.user_id]??item.user_id}</option>)}</select>
    <label htmlFor="handover-date">{tr('Handover date','Petsa sa pagtugyan')}</label><input id="handover-date" name="date" type="date" max={today} required />
    <label htmlFor="handover-expected-cash">{tr('Cash the clerk says was handed over (PHP)','Kwarta nga giingon sa clerk nga gitugyan (PHP)')}</label><input id="handover-expected-cash" name="expectedCash" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-expected-checks">{tr('Checks the clerk says were handed over (PHP)','Mga tseke nga giingon sa clerk nga gitugyan (PHP)')}</label><input id="handover-expected-checks" name="expectedChecks" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-actual-cash">{tr('Cash actually received by owner (PHP)','Kwarta nga tinuod nga nadawat sa tag-iya (PHP)')}</label><input id="handover-actual-cash" name="actualCash" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-actual-checks">{tr('Checks actually received by owner (PHP)','Mga tseke nga tinuod nga nadawat sa tag-iya (PHP)')}</label><input id="handover-actual-checks" name="actualChecks" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required />
    <label htmlFor="handover-reason">{tr('Difference reason (required if totals do not match)','Rason sa kalainan (kinahanglan kung lahi ang total)')}</label><input id="handover-reason" name="reason" maxLength={500} />
    <Button disabled={busy||!data.clerks.length} className="primary">{tr('Save handover','I-save ang pagtugyan')}</Button>{!data.clerks.length&&<p>{tr('No active clerk account is available.','Walay aktibong account sa clerk.')}</p>}
   </form>
   <h4>{tr('Past handovers','Miaging mga pagtugyan')}</h4>{!data.handovers.length?<p>{tr('No handovers recorded.','Walay pagtugyan nga narekord.')}</p>:<ul>{data.handovers.map(item=><li key={item.id}>{item.handover_on}: {tr('expected cash','gilaumang kwarta')} {decimalPesos(item.expected_cash)}, {tr('checks','mga tseke')} {decimalPesos(item.expected_checks)}; {tr('received cash','nadawat nga kwarta')} {decimalPesos(item.actual_cash)}, {tr('checks','mga tseke')} {decimalPesos(item.actual_checks)}{item.difference_reason?` — ${item.difference_reason}`:''} · {tr('recorded by','gi-rekord ni')} {staffName(item.recorded_by)} {tr('at','niadtong')} {localTime(item.recorded_at)}</li>)}</ul>}
  </section>}
 </>
}
