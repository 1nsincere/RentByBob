import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase, type Tenant } from './client'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { AccountStatement } from './AccountStatement'
import { hasPositiveSavedBalance, parseRentWorkspaceSnapshot, savedCashFitsBalance, type RentWorkspaceSnapshot, type SavedCashRecord } from './saved-payments-model'

export function SavedPayments({ propertyId, tenants, owner, userId }: { propertyId:string; tenants:Tenant[]; owner:boolean; userId:string }) {
 const [data,setData] = useState<RentWorkspaceSnapshot|null>(null), [error,setError] = useState(''), [message,setMessage] = useState('')
 const [selected,setSelected] = useState(''), [receipt,setReceipt] = useState<CashAcknowledgmentData|null>(null)
 const [review,setReview] = useState<SavedCashRecord|null>(null), [busy,setBusy] = useState(false)
 const verifierSetup = useRef<HTMLDetailsElement>(null)
 const request = useRef<{key:string;id:string}|null>(null), sending = useRef(false)
 const refresh = useCallback(async () => {
  let result
  try {
   result = await supabase!.rpc('read_rent_workspace',{p_property_id:propertyId})
  } catch {
   setData(null); setError('Saved rent records could not be loaded. Check your connection and refresh; nothing was changed.'); return
  }
  if(result.error) { setData(null); setError('Saved rent records are unavailable. The cash migration must be applied and your staff MFA session must be active. Nothing has been saved by this screen.'); return }
  try {
   setData(parseRentWorkspaceSnapshot(result.data, tenants))
   setError('')
  } catch {
   setData(null)
   setError('Saved rent records could not be validated, so financial details are hidden. Contact the system administrator; nothing was changed.')
  }
 },[propertyId,tenants])
 useEffect(()=>{setData(null);setSelected('');setReview(null);setReceipt(null);setError('');void refresh()},[refresh])
 async function mutate(name:string, args:Record<string,unknown>, idempotent=true) {
  if(sending.current) return false
  const key=JSON.stringify({name,args}); if(idempotent && request.current && request.current.key!==key) { setError('An earlier request has an uncertain outcome. Retry it unchanged or reload to check the saved records before entering a different request.'); return false }
  if(idempotent && !request.current) request.current={key,id:crypto.randomUUID()}
  sending.current=true;setBusy(true);setError('');setMessage('')
  try {
   const result=await supabase!.rpc(name,{p_property_id:propertyId,...args,...(idempotent?{p_id:request.current!.id}:{})})
   if(result.error) { setError(result.error.code==='42501'?'Your account is not authorized for this action, or MFA needs renewing.':result.error.code==='23505'?'This room agreement or monthly rent already exists. Refresh and check the records.':result.error.code==='22023'?'Check the dates, amount and selected records. Confirmation cannot exceed unpaid rent.':'Save could not be confirmed. Retry unchanged to avoid duplicates.'); if(['42501','23505','22023'].includes(result.error.code??''))request.current=null; return false }
   request.current=null;setMessage('Saved to the database.');await refresh();return result.data ?? true
  }catch{setError('Connection interrupted. Retry the same request to check its result safely.');return false}
  finally{sending.current=false;setBusy(false)}
 }
 function openVerifierSetup() {
  const panel=verifierSetup.current
  if(!panel) return
  panel.open=true
  requestAnimationFrame(()=> {
   panel.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
   panel.querySelector('summary')?.focus({preventScroll:true})
  })
 }
 const agreement=data?.agreements.find(a=>a.id===selected)
 const agreementUnit=agreement&&data?.units.find(u=>u.id===agreement.unit_id)
 const agreementBuilding=agreementUnit&&data?.buildings.find(b=>b.id===agreementUnit.building_id)
 const agreementTenant=agreement&&tenants.find(t=>t.id===agreement.tenant_id)
 const verifier=data?.verifiers.some(v=>v.user_id===userId)??false
 const verifierAssigned=(data?.verifiers.length??0)>0
 const pendingCount=data?.cash.filter(c=>!c.confirmed_at).length??0
 const confirmedCount=(data?.cash.length??0)-pendingCount
 const pendingCash=data?.cash.filter(c=>!c.confirmed_at)??[]
 return <section className="payments-preview simple-payments"><h2>Saved rent and cash</h2><p>Pending cash does not reduce rent. Only the owner-designated cash verifier can confirm it and issue an acknowledgment.</p>
 {error&&<p className="notice" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 <Button disabled={busy} onClick={()=>void refresh()}>Refresh saved records</Button>
 {!data&&!error&&<p role="status">Loading saved records…</p>}
 {data&&<>
 <section className="card saved-readiness" aria-labelledby="saved-readiness-heading">
  <h3 id="saved-readiness-heading">Saved workflow readiness</h3>
  <p>These are live database records. Review the real tenant, room and agreed rent terms before saving anything.</p>
  <ul>
   <li><span className={verifierAssigned?'readiness-state readiness-state--ready':'readiness-state'}>{verifierAssigned?'Ready':'Needs setup'}</span><div><strong>Cash verifier</strong><p>{verifierAssigned?'An owner-designated verifier is assigned.':'No verifier is assigned, so pending cash cannot be confirmed yet.'}</p></div>{owner&&!verifierAssigned&&<Button onClick={openVerifierSetup}>Open verifier setup</Button>}</li>
   <li><span className={data.agreements.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.agreements.length?`${data.agreements.length} saved`:'Needs setup'}</span><div><strong>Room agreements</strong><p>{data.agreements.length?'Saved agreements are listed below.':data.units.length?'No agreements are saved. Add one only after the actual rent terms are reviewed.':'No active rental spaces are available for an agreement.'}</p></div></li>
   <li><span className={data.charges.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.charges.length?`${data.charges.length} saved`:'Needs setup'}</span><div><strong>Monthly rent charges</strong><p>{data.charges.length?'Only saved charges appear in rent balances.':'No charges are saved; no rent is assumed or generated automatically.'}</p></div></li>
   <li><span className="readiness-state">{pendingCount+confirmedCount} records</span><div><strong>Cash status</strong><p>{pendingCount} awaiting confirmation · {confirmedCount} confirmed</p></div></li>
  </ul>
  {!verifierAssigned&&<p className="field-help">Before assigning a verifier, the owner must independently confirm the existing clerk account ID and confirmed email. Do not guess from a display name.</p>}
 </section>
 <section className="card cash-verification-queue" aria-labelledby="cash-queue-heading">
  <div className="section-heading"><div><h3 id="cash-queue-heading">Cash awaiting confirmation</h3><p>{pendingCash.length} pending {pendingCash.length===1?'record':'records'} across this property</p></div></div>
  {!pendingCash.length?<p role="status">No cash is awaiting confirmation.</p>:pendingCash.map(c=>{
   const linkedAgreement=data.agreements.find(a=>a.id===c.agreement_id)
   const tenant=linkedAgreement&&tenants.find(t=>t.id===linkedAgreement.tenant_id)
   const unit=linkedAgreement&&data.units.find(u=>u.id===linkedAgreement.unit_id)
   const building=unit&&data.buildings.find(b=>b.id===unit.building_id)
   return <article className="cash-queue-row" key={c.id}>
    <div><strong>{tenant?.display_name??'Tenant record unavailable'}</strong><p>{building?.label??'Building unavailable'} / {unit?.label??'Room unavailable'}</p></div>
    <div><strong>{decimalPesos(c.amount)}</strong><p>Received {c.received_on} by {c.collector}</p></div>
    <p className="status status--pending">Pending verification</p>
    {verifier?<Button disabled={busy} onClick={()=>setReview(c)}>Review confirmation</Button>:<p className="field-help">Only the designated cash verifier can confirm.</p>}
   </article>
  })}
 </section>
 {review&&<section className="card cash-confirmation-review" aria-labelledby="cash-confirm-heading"><h3 id="cash-confirm-heading">Confirm cash received?</h3><p>{decimalPesos(review.amount)} received by {review.collector} on {review.received_on}.</p><p>Confirm only after checking receipt of the cash. It will cover the oldest unpaid rent first and issue a permanent acknowledgment.</p><div className="person-actions"><Button disabled={busy} className="primary" onClick={async()=>{const result=await mutate('confirm_rent_cash',{p_cash_id:review.id},false);if(result){setReview(null);setReceipt(result as CashAcknowledgmentData)}}}>Confirm and issue acknowledgment</Button><Button disabled={busy} onClick={()=>setReview(null)}>Cancel</Button></div></section>}
 <div className="card"><label htmlFor="saved-agreement">Tenant / room agreement</label><select id="saved-agreement" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setReview(null)}}><option value="">Choose an agreement</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??'Tenant'} / {data.units.find(u=>u.id===a.unit_id)?.label??'Room'}</option>)}</select></div>
 {agreement&&<><div className="card simple-balance"><span>Rent left to pay</span><strong>{decimalPesos(agreement.balance)}</strong><span>After confirmed cash only</span></div>
 {hasPositiveSavedBalance(agreement.balance)?<form className="card rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const amount=String(f.get('amount'));if(!savedCashFitsBalance(amount,agreement.balance)){setError('Enter a positive amount no greater than the recorded rent balance. Advance payments are not configured, so no cash report was saved.');return}void mutate('record_rent_cash',{p_agreement_id:agreement.id,p_amount:amount,p_received_on:String(f.get('date')),p_collector:String(f.get('collector'))})}}><h3>Record cash received</h3><p>Report money already handed to an authorized collector. The balance will not change until the designated verifier confirms it.</p><label htmlFor="saved-amount">Amount (PHP)</label><input id="saved-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" aria-describedby="saved-amount-help" required /><p id="saved-amount-help" className="field-help">Must not exceed the current rent balance of {decimalPesos(agreement.balance)}. Advance payments are not configured.</p><label htmlFor="saved-date">Actual payment date</label><input id="saved-date" name="date" type="date" required /><label htmlFor="saved-collector">Received by</label><select id="saved-collector" name="collector"><option>Bob</option><option>James</option></select><Button disabled={busy} className="primary">Save pending cash</Button></form>:<div className="card"><h3>Cash report unavailable</h3><p>There is no recorded rent balance for this agreement. Add only an owner-approved monthly rent charge before recording cash; this screen will not accept advance payments.</p></div>}
 <AccountStatement tenantName={agreementTenant?.display_name??'Tenant record unavailable'} rentalSpace={`${agreementBuilding?.label??'Building unavailable'} / ${agreementUnit?.label??'Room unavailable'}`} charges={data.charges.filter(c=>c.agreement_id===agreement.id)} cash={data.cash.filter(c=>c.agreement_id===agreement.id)} openAcknowledgment={setReceipt} />
 <details className="card"><summary>Monthly rent</summary>{data.charges.filter(c=>c.agreement_id===agreement.id).map(c=><p key={c.id}>{c.rental_month.slice(0,7)} / Due {c.due_date} / {decimalPesos(c.amount)} / Remaining {decimalPesos(c.remaining)}</p>)}<form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('add_rent_month',{p_agreement_id:agreement.id,p_month:String(f.get('month'))+'-01'})}}><label htmlFor="saved-month">Month to add</label><input id="saved-month" name="month" type="month" required /><Button disabled={busy}>Add agreed monthly rent</Button></form></details>
 </>}
 <details className="card"><summary>Create room rental agreement</summary><p>One responsible tenant per room. Other occupants are not separately charged. Move-in day sets monthly due dates.</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('create_rental_agreement',{p_tenant_id:String(f.get('tenant')),p_unit_id:String(f.get('unit')),p_move_in:String(f.get('start')),p_rent:String(f.get('rent'))})}}><label htmlFor="agreement-tenant">Responsible tenant</label><select id="agreement-tenant" name="tenant" required><option value="">Choose tenant</option>{tenants.filter(t=>!t.archived_at).map(t=><option key={t.id} value={t.id}>{t.display_name}</option>)}</select><label htmlFor="agreement-unit">Room</label><select id="agreement-unit" name="unit" required><option value="">Choose room</option>{data.units.filter(u=>!data.agreements.some(a=>a.unit_id===u.id)).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="agreement-start">Move-in date</label><input id="agreement-start" name="start" type="date" required /><label htmlFor="agreement-rent">Monthly room rent (PHP)</label><input id="agreement-rent" name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required /><Button disabled={busy}>Save agreement</Button></form></details>
 {owner&&<details ref={verifierSetup} className="card"><summary>Designate an existing clerk as cash verifier</summary><p>Select the approved clerk account by its account ID and exact confirmed email. Verify both through trusted account management first. This does not create an account or send email.</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('assign_cash_verifier',{p_user_id:String(f.get('id')),p_email:String(f.get('email'))},false)}}><label htmlFor="verifier-id">Existing clerk account ID</label><input id="verifier-id" name="id" required /><label htmlFor="verifier-email">Confirmed email</label><input id="verifier-email" name="email" type="email" required /><Button disabled={busy}>Assign cash verifier</Button></form></details>}
 </>}
 {receipt&&<CashAcknowledgment data={receipt} close={()=>setReceipt(null)} />}
 </section>
}
