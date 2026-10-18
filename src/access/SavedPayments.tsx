import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase, type Tenant } from './client'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'

type Agreement = { id:string; tenant_id:string; unit_id:string; move_in:string; rent:string; balance:string }
type Unit = { id:string; label:string; building_id:string }
type Charge = { id:string; agreement_id:string; rental_month:string; due_date:string; amount:string; remaining:string }
type Cash = { id:string; agreement_id:string; amount:string; received_on:string; collector:string; confirmed_at:string|null; acknowledgment:CashAcknowledgmentData|null }
type Snapshot = { agreements:Agreement[]; units:Unit[]; charges:Charge[]; cash:Cash[]; verifiers:{user_id:string}[]; buildings:{id:string;label:string}[] }
// PostgREST returns numeric JSON as numbers; monetary API reads cast to text in SQL RPC below.
export function SavedPayments({ propertyId, tenants, owner, userId }: { propertyId:string; tenants:Tenant[]; owner:boolean; userId:string }) {
 const [data,setData] = useState<Snapshot|null>(null), [error,setError] = useState(''), [message,setMessage] = useState('')
 const [selected,setSelected] = useState(''), [receipt,setReceipt] = useState<CashAcknowledgmentData|null>(null)
 const [review,setReview] = useState<Cash|null>(null), [busy,setBusy] = useState(false)
 const request = useRef<{key:string;id:string}|null>(null), sending = useRef(false)
 const refresh = useCallback(async () => {
  const result = await supabase!.rpc('read_rent_workspace',{p_property_id:propertyId})
  if(result.error) { setData(null); setError('Saved rent records are unavailable. The cash migration must be applied and your staff MFA session must be active. Nothing has been saved by this screen.'); return }
  setData(result.data as Snapshot)
 },[propertyId])
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
 const agreement=data?.agreements.find(a=>a.id===selected)
 const verifier=data?.verifiers.some(v=>v.user_id===userId)??false
 return <section className="payments-preview simple-payments"><h2>Saved rent and cash</h2><p>Pending cash does not reduce rent. Only the designated James account can confirm it and issue an acknowledgment.</p>
 {error&&<p className="notice" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 <Button disabled={busy} onClick={()=>void refresh()}>Refresh saved records</Button>
 {!data&&!error&&<p role="status">Loading saved records…</p>}
 {data&&<>
 <div className="card"><label htmlFor="saved-agreement">Tenant / room agreement</label><select id="saved-agreement" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setReview(null)}}><option value="">Choose an agreement</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??'Tenant'} / {data.units.find(u=>u.id===a.unit_id)?.label??'Room'}</option>)}</select></div>
 {agreement&&<><div className="card simple-balance"><span>Rent left to pay</span><strong>{decimalPesos(agreement.balance)}</strong><span>After confirmed cash only</span></div>
 <form className="card rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('record_rent_cash',{p_agreement_id:agreement.id,p_amount:String(f.get('amount')),p_received_on:String(f.get('date')),p_collector:String(f.get('collector'))})}}><h3>Record cash received</h3><label htmlFor="saved-amount">Amount (PHP)</label><input id="saved-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required /><label htmlFor="saved-date">Actual payment date</label><input id="saved-date" name="date" type="date" required /><label htmlFor="saved-collector">Received by</label><select id="saved-collector" name="collector"><option>Bob</option><option>James</option></select><Button disabled={busy} className="primary">Save pending cash</Button></form>
 <section className="card"><h3>Cash records</h3>{data.cash.filter(c=>c.agreement_id===agreement.id).map(c=><div className="cash-row" key={c.id}><div><strong>{decimalPesos(c.amount)}</strong><p>{c.received_on} / {c.collector}</p><span>{c.confirmed_at?'Confirmed cash':'Waiting for James'}</span></div>{c.acknowledgment?<Button onClick={()=>setReceipt(c.acknowledgment)}>Open acknowledgment</Button>:verifier?<Button disabled={busy} onClick={()=>setReview(c)}>Review confirmation</Button>:null}</div>)}</section>
 {review&&<section className="card"><h3>Confirm cash received?</h3><p>{decimalPesos(review.amount)} received by {review.collector} on {review.received_on}.</p><p>Confirm only after checking receipt of the cash. It will cover the oldest unpaid rent first and issue a permanent acknowledgment.</p><div className="person-actions"><Button disabled={busy} className="primary" onClick={async()=>{const result=await mutate('confirm_rent_cash',{p_cash_id:review.id},false);if(result){setReview(null);setReceipt(result as CashAcknowledgmentData)}}}>Confirm and issue acknowledgment</Button><Button disabled={busy} onClick={()=>setReview(null)}>Cancel</Button></div></section>}
 <details className="card"><summary>Monthly rent</summary>{data.charges.filter(c=>c.agreement_id===agreement.id).map(c=><p key={c.id}>{c.rental_month.slice(0,7)} / Due {c.due_date} / {decimalPesos(c.amount)} / Remaining {decimalPesos(c.remaining)}</p>)}<form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('add_rent_month',{p_agreement_id:agreement.id,p_month:String(f.get('month'))+'-01'})}}><label htmlFor="saved-month">Month to add</label><input id="saved-month" name="month" type="month" required /><Button disabled={busy}>Add agreed monthly rent</Button></form></details>
 </>}
 <details className="card"><summary>Create room rental agreement</summary><p>One responsible tenant per room. Other occupants are not separately charged. Move-in day sets monthly due dates.</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('create_rental_agreement',{p_tenant_id:String(f.get('tenant')),p_unit_id:String(f.get('unit')),p_move_in:String(f.get('start')),p_rent:String(f.get('rent'))})}}><label htmlFor="agreement-tenant">Responsible tenant</label><select id="agreement-tenant" name="tenant" required><option value="">Choose tenant</option>{tenants.filter(t=>!t.archived_at).map(t=><option key={t.id} value={t.id}>{t.display_name}</option>)}</select><label htmlFor="agreement-unit">Room</label><select id="agreement-unit" name="unit" required><option value="">Choose room</option>{data.units.filter(u=>!data.agreements.some(a=>a.unit_id===u.id)).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="agreement-start">Move-in date</label><input id="agreement-start" name="start" type="date" required /><label htmlFor="agreement-rent">Monthly room rent (PHP)</label><input id="agreement-rent" name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required /><Button disabled={busy}>Save agreement</Button></form></details>
 {owner&&<details className="card"><summary>Designate James as cash verifier</summary><p>Select James's existing clerk account by its account ID and exact confirmed email. This does not create an account or send email.</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('assign_cash_verifier',{p_user_id:String(f.get('id')),p_email:String(f.get('email'))},false)}}><label htmlFor="verifier-id">Existing clerk account ID</label><input id="verifier-id" name="id" required /><label htmlFor="verifier-email">Confirmed email</label><input id="verifier-email" name="email" type="email" required /><Button disabled={busy}>Assign cash verifier</Button></form></details>}
 </>}
 {receipt&&<CashAcknowledgment data={receipt} close={()=>setReceipt(null)} />}
 </section>
}
