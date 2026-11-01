import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { supabase, type Tenant } from './client'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { AccountStatement } from './AccountStatement'
import { hasPositiveSavedBalance, parseRentWorkspaceSnapshot, roomName, type RentWorkspaceSnapshot, type SavedCashRecord } from './saved-payments-model'
import { filterWorklist, planOldestFirst, toCents, worklistRows, type WorklistFilter } from './simple-payments-model'
import { philippineToday, validBusinessDate } from './payment-preview-model'
import { SavedPaidRentReport } from './SavedPaidRentReport'
import { MonthlyRentBatch } from './MonthlyRentBatch'
import { NotebookMonths } from './NotebookMonths'
import { CheckHandoverRegister } from './CheckHandoverRegister'
import { TenantPicker } from './TenantPicker'
import { parsePaymentReports, type PaymentReport } from './payment-reports-model'
import { copy, text, type Language } from '../i18n'

type CashDraft = { amount: string; date: string; collector: string }
const dateText = (date: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'))
const monthText = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month.slice(0, 7) + '-01T00:00:00Z'))

// Same flow as the preview: pick an account (or open one from "What needs attention?"), record cash, check which
// months it covers, save it as pending; a clerk confirms it. Less frequent work lives in More tools.
// Every write still goes through the reviewed RPCs; pending cash and uncleared checks never lower a balance.
export function SavedPayments({ propertyId, propertyName, tenants, owner, userId, focusTenant = null, active = true, language = 'en' }: { propertyId:string; propertyName?:string; active?:boolean; tenants:Tenant[]; owner:boolean; userId:string; focusTenant?: { tenantId:string; nonce:number; tab?:'months'|'history'|'setup' } | null; language?:Language }) {
 const t = copy[language]
 const tr = (english:string,bisaya:string) => text(language,english,bisaya)
 const [data,setData] = useState<RentWorkspaceSnapshot|null>(null), [error,setError] = useState(''), [message,setMessage] = useState('')
 const [selected,setSelected] = useState(''), [receipt,setReceipt] = useState<CashAcknowledgmentData|null>(null)
 const [view,setView] = useState<'records'|'report'|'tools'>('records')
 const [accountTab,setAccountTab] = useState<'months'|'history'|'setup'>('months')
 const [tool,setTool] = useState<'confirm'|'checks'|'monthly'|'setup'>('confirm')
 const [entry,setEntry] = useState<CashDraft|null>(null), [draft,setDraft] = useState<CashDraft|null>(null), [duplicateAccepted,setDuplicateAccepted] = useState(false)
 const [search,setSearch] = useState(''), [filter,setFilter] = useState<WorklistFilter>('all')
 const languageRef = useRef(language)
 useEffect(()=>{languageRef.current=language},[language])
 // The parent rebuilds the tenant list on every access re-check; read the latest list without resetting unsaved entries.
 const tenantsRef = useRef(tenants)
 useEffect(()=>{tenantsRef.current=tenants},[tenants])
 const [review,setReview] = useState<SavedCashRecord|null>(null), [busy,setBusy] = useState(false)
 const accountCard = useRef<HTMLElement>(null), stepHeading = useRef<HTMLHeadingElement>(null)
 const request = useRef<{key:string;id:string}|null>(null), sending = useRef(false)
 const [autoRent,setAutoRent] = useState<boolean|null>(null)
 const [newAgreementTenant,setNewAgreementTenant] = useState('')
 // Unused advance credit per agreement (202610270010); empty when none or before the update is applied.
 const [credits,setCredits] = useState<Record<string,string>>({})
 // Renter payment reports (202610270012): notices only. "Record this cash" pre-fills the entry and links the saved cash.
 const [reports,setReports] = useState<PaymentReport[]>([]), [fromReport,setFromReport] = useState<PaymentReport|null>(null)
 const refreshSeq = useRef(0)
 const refresh = useCallback(async () => {
  const mine = ++refreshSeq.current // a slow, older response must never overwrite a newer one
  let result
  try {
   void supabase!.rpc('read_payment_reports',{p_property_id:propertyId}).then(({data:list,error:listError})=>{try{setReports(listError?[]:parsePaymentReports(list))}catch{setReports([])}})
   await supabase!.rpc('post_due_rent_now',{p_property_id:propertyId}).then(()=>undefined,()=>undefined)
   void supabase!.from('properties').select('auto_rent').eq('id',propertyId).maybeSingle().then(({data:row,error:rowError})=>setAutoRent(rowError||!row?null:Boolean((row as {auto_rent:boolean}).auto_rent)))
   void supabase!.rpc('read_agreement_credits',{p_property_id:propertyId}).then(({data:credit,error:creditError})=>setCredits(creditError||!credit?{}:credit as Record<string,string>))
   result = await supabase!.rpc('read_rent_workspace',{p_property_id:propertyId})
  } catch {
   setData(null); setError(text(languageRef.current,'Saved rent records could not be loaded. Check your connection and refresh; nothing was changed.','Hindi ma-load ang mga talaan ng upa. Suriin ang koneksyon at i-refresh; walang nabago.')); return
  }
  if(mine!==refreshSeq.current) return
  if(result.error) { setData(null); setError(text(languageRef.current,'Saved rent records are unavailable. The cash migration must be applied and your staff MFA session must be active. Nothing has been saved by this screen.','Hindi makita ang mga talaan ng upa. Kailangang ma-apply ang cash migration at aktibo ang MFA session ng staff. Walang na-save sa screen na ito.')); return }
  try {
   setData(parseRentWorkspaceSnapshot(result.data, tenantsRef.current))
   setError('')
  } catch {
   setData(null)
   setError(text(languageRef.current,'Saved rent records could not be validated, so financial details are hidden. Contact the system administrator; nothing was changed.','Hindi pumasa sa pagsusuri ang mga talaan ng upa, kaya nakatago ang detalye ng cash. Kontakin ang administrator; walang nabago.'))
  }
 },[propertyId])
 useEffect(()=>{setData(null);setSelected('');setReview(null);setReceipt(null);setEntry(null);setDraft(null);setError('');void refresh()},[refresh])
 async function mutate(name:string, args:Record<string,unknown>, idempotent=true) {
  if(sending.current) return false
  const key=JSON.stringify({name,args}); if(idempotent && request.current && request.current.key!==key) { setError(tr('An earlier request has an uncertain outcome. Retry it unchanged or reload to check the saved records before entering a different request.','Hindi tiyak ang resulta ng nakaraang kahilingan. Subukan ulit nang walang binabago o i-reload para suriin ang talaan bago maglagay ng ibang kahilingan.')); return false }
  if(idempotent && !request.current) request.current={key,id:crypto.randomUUID()}
  sending.current=true;setBusy(true);setError('');setMessage('')
  try {
   const result=await supabase!.rpc(name,{p_property_id:propertyId,...args,...(idempotent?{p_id:request.current!.id}:{})})
   if(result.error) { const messages={
    unauthorized:tr('Your account is not authorized for this action, or MFA needs renewing.','Hindi pinapayagan ang iyong account sa aksyong ito, o kailangang i-renew ang MFA.'),
    handover:tr('Check the clerk, date, amounts and any required difference reason.','Suriin ang clerk, petsa, halaga at kailangang dahilan ng pagkakaiba.'),
    transition:tr('This check cannot move to that status. Check its current status, bank confirmation and unpaid rent balance.','Hindi mababago ang katayuan ng tseke. Suriin ang katayuan nito, kumpirmasyon ng bangko at natitirang upa.'),
    check:tr('Check the tenant, amount, receipt date and collector.','Suriin ang umuupa, halaga, petsa ng pagkatanggap at kolektor.'),
    duplicate:tr('This room agreement or monthly rent already exists. Refresh and check the records.','Mayroon nang kasunduan sa kuwarto o singil sa buwan na ito. I-refresh at suriin ang mga talaan.'),
    amount:tr('Check the dates, amount and selected records. Confirmation cannot exceed unpaid rent.','Suriin ang mga petsa, halaga at napiling talaan. Hindi lalampas sa hindi nabayarang upa ang kumpirmasyon.'),
    reverse:tr('This payment could not be reversed. Only a confirmed payment that is not already reversed can be reversed, and a reason is required.','Hindi mababawi ang bayad na ito. Ang kumpirmado lang na bayad na hindi pa nababawi ang maaaring bawiin, at kailangan ng dahilan.'),
    moveOut:tr('The move-out could not be saved. Choose a date on or after move-in (within one year) and give a reason. It cannot be earlier than a month that already has rent recorded.','Hindi na-save ang paglipat. Pumili ng petsa pagkatapos ng paglipat (sa loob ng isang taon) at magbigay ng dahilan. Hindi ito mauuna sa buwang may naitala nang upa.'),
    report:tr('This renter report was already handled, or the cash is for another room. Refresh and check.','Tapos na ang ulat na ito, o para sa ibang kuwarto ang cash. I-refresh at suriin.'),
    month:tr('This month\'s rent could not be added. The month must be on or after move-in and not after a move-out date.','Hindi maidaragdag ang upa ngayong buwan. Ang buwan ay dapat pagkatapos ng paglipat at hindi pagkatapos ng pag-alis.'),
    save:tr('Save could not be confirmed. Retry unchanged to avoid duplicates.','Hindi makumpirma ang pag-save. Subukan ulit nang walang binabago para maiwasan ang dobleng talaan.'),
   }; setError(result.error.code==='42501'?messages.unauthorized:name==='record_collection_handover'&&result.error.code==='22023'?messages.handover:name==='transition_rent_check'&&result.error.code==='22023'?messages.transition:name==='record_rent_check'&&result.error.code==='22023'?messages.check:name==='reverse_rent_cash'&&result.error.code==='22023'?messages.reverse:name==='end_rental_agreement'&&result.error.code==='22023'?messages.moveOut:name==='add_rent_month'&&result.error.code==='22023'?messages.month:name==='resolve_payment_report'&&result.error.code==='22023'?messages.report:result.error.code==='23505'?messages.duplicate:result.error.code==='22023'?messages.amount:messages.save); if(['42501','23505','22023'].includes(result.error.code??''))request.current=null; return false }
   request.current=null;setMessage(tr('Saved to the database.','Na-save sa database.'));await refresh();return result.data ?? true
  }catch{setError(tr('Connection interrupted. Retry the same request to check its result safely.','Naputol ang koneksyon. Subukan ulit ang parehong kahilingan para masuri ang resulta.'));return false}
  finally{sending.current=false;setBusy(false)}
 }
 function resetCash() { setEntry(null); setDraft(null); setReview(null); setDuplicateAccepted(false); setFromReport(null); setError('') }
 function openAccount(id:string) { setSelected(id); resetCash(); setMessage(''); setView('records'); requestAnimationFrame(()=>{ accountCard.current?.focus(); accountCard.current?.scrollIntoView({block:'start'}) }) }
 // Opened from a tenant card: reload (the room may have just been assigned), then show that tenant's current
 // agreement (or latest one), on the requested tab.
 const pendingFocus = useRef<typeof focusTenant>(null)
 useEffect(()=>{ if(!focusTenant) return; pendingFocus.current=focusTenant; void refresh() },[focusTenant,refresh])
 useEffect(()=>{
  const focus=pendingFocus.current
  if(!focus||!data) return
  const mine=data.agreements.filter(a=>a.tenant_id===focus.tenantId)
  const pick=mine.find(a=>!a.ended_on)??mine[mine.length-1]
  if(pick) { pendingFocus.current=null; openAccount(pick.id); if(focus.tab) setAccountTab(focus.tab) }
 },[data])
 // Reload whenever Payments is opened, so tenants and rooms added elsewhere appear without pressing Refresh.
 useEffect(()=>{ if(active) void refresh() },[active,refresh])
 // While open, reload every 30 seconds so confirmations by other staff appear (unsaved entries are kept).
 useEffect(()=>{ if(!active) return; const timer=window.setInterval(()=>{ if(!sending.current) void refresh() },30000); return ()=>window.clearInterval(timer) },[active,refresh])
 useEffect(()=>{ if(entry||draft||review) stepHeading.current?.focus() },[entry===null,draft===null,review===null])

 const agreement=data?.agreements.find(a=>a.id===selected)
 const agreementUnit=agreement&&data?.units.find(u=>u.id===agreement.unit_id)
 const agreementBuilding=agreementUnit&&data?.buildings.find(b=>b.id===agreementUnit.building_id)
 const agreementTenant=agreement&&tenants.find(t=>t.id===agreement.tenant_id)
 // Every clerk may confirm cash (28 Oct 2026); the owner oversees. The old single designated verifier is no longer required.
 const verifier=data?.clerks.some(c=>c.user_id===userId)??false
 const verifierAssigned=(data?.clerks.length??0)>0
 const pendingCash=data?.cash.filter(c=>!c.confirmed_at)??[]
 const confirmedCount=(data?.cash.length??0)-pendingCash.length
 const accountCharges=agreement?data!.charges.filter(c=>c.agreement_id===agreement.id):[]
 const accountPending=agreement?pendingCash.filter(c=>c.agreement_id===agreement.id):[]
 const newReports=reports.filter(r=>r.status==='new'&&data?.agreements.some(a=>a.id===r.agreement_id))
 const accountReports=agreement?newReports.filter(r=>r.agreement_id===agreement.id):[]
 const paidToText=(r:PaymentReport)=>r.paid_to==='Other'?tr('someone else','ibang tao'):r.paid_to
 const moneyText=(items:{amount:string}[])=>items.reduce((sum,item)=>sum+toCents(item.amount),0n)
 const pesosOf=(items:{amount:string}[])=>{const total=moneyText(items);return decimalPesos(`${total/100n}.${(total%100n).toString().padStart(2,'0')}`)}
 const today=philippineToday()
 let plan:ReturnType<typeof planOldestFirst>={covered:[],credit:'0.00'}, planError=''
 if(draft) { try { plan=planOldestFirst(accountCharges,draft.amount) } catch(e) { planError=(e as Error).message } }
 const possibleDuplicate=!!draft&&!!agreement&&data!.cash.some(c=>c.agreement_id===agreement.id&&c.received_on===draft.date&&toCents(c.amount)===toCents(draft.amount))
 const rows=data?worklistRows(data,tenants):[]
 const shown=filterWorklist(rows,filter,search)
 const working=!!(entry||draft||review)
 const accountTabs=[['months',tr('Rent by month','Upa kada buwan')],['history',tr('Payment history','Kasaysayan ng bayad')],['setup',tr('Room rent setup','Pagtatakda ng upa sa kuwarto')]] as const
 const tools=[['confirm',`${tr('Cash to confirm','Cash na kukumpirmahin')}${pendingCash.length?` (${pendingCash.length})`:''}`],['checks',tr('Checks & handovers','Tseke at turnover')],['monthly',tr('Monthly rent for everyone','Buwanang upa ng lahat')],['setup',tr('Setup','Setup')]] as const
 const tabKeys=<K extends string>(all:readonly (readonly [K,string])[],index:number,set:(key:K)=>void,prefix:string)=>(event:KeyboardEvent)=>{if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;const next=all[(index+(event.key==='ArrowRight'?1:all.length-1))%all.length][0];set(next);document.getElementById(`${prefix}-${next}`)?.focus()}

 const confirmCard=review&&<section className="card cash-confirmation-review" aria-labelledby="cash-confirm-heading"><h3 id="cash-confirm-heading" ref={stepHeading} tabIndex={-1}>{tr('Confirm cash received?','Kumpirmahin ang natanggap na cash?')}</h3><p><strong>{decimalPesos(review.amount)}</strong> {tr('received by','tinanggap ni')} {review.collector} {tr('on','noong')} {dateText(review.received_on)}.</p><p>{tr('Confirm only after checking that the cash was received. It will cover the oldest unpaid rent first and issue a permanent acknowledgment.','Kumpirmahin lang pagkatapos masuring natanggap ang cash. Ilalaan muna ito sa pinakalumang hindi nabayarang upa at gagawa ng permanenteng resibo.')}</p><div className="person-actions"><Button disabled={busy} variant="approve" onClick={async()=>{const result=await mutate('confirm_rent_cash',{p_cash_id:review.id},false);if(result){setReview(null);setMessage(tr('Cash confirmed. The balance is updated.','Nakumpirma ang cash. Na-update ang balanse.'));setReceipt(result as CashAcknowledgmentData)}}}>{tr('Confirm and issue acknowledgment','Kumpirmahin at gumawa ng resibo')}</Button><Button disabled={busy} variant="secondary" onClick={()=>setReview(null)}>{tr('Cancel','Kanselahin')}</Button></div></section>

 return <section className="payments-preview simple-payments" aria-labelledby="payments-heading">
 <div className="section-heading"><div><p className="eyebrow">{tr('RENT RECORDS','TALAAN NG UPA')}</p><h2 id="payments-heading">{t.paymentRecords}</h2><p>{tr('Find a tenant, record cash, then confirm it.','Hanapin ang umuupa, itala ang cash, saka kumpirmahin.')}</p></div></div>
 {error&&<p className="notice notice--error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 {!data&&!error&&<LoadingSkeleton label={tr('Loading saved records…','Nilo-load ang mga talaan…')} rows={4} shape="table" />}
 {data&&<>
 <div className="segmented-control" role="group" aria-label={tr('Payment views','Mga tingin sa bayad')}><Button aria-pressed={view==='records'} onClick={()=>setView('records')}>{tr('Record and confirm','Itala at kumpirmahin')}</Button><Button aria-pressed={view==='report'} onClick={()=>setView('report')}>{t.paidReport}</Button><Button aria-pressed={view==='tools'} onClick={()=>setView('tools')}>{tr('More tools','Iba pang gamit')}</Button></div>

 {view==='records'&&<div className={`payment-record-view${working?'':' payment-record-view--with-worklist'}`}>
 {!working&&<section className="card payment-overview" aria-labelledby="cash-worklist-heading">
  <h3 id="cash-worklist-heading">{tr('What needs attention?','Ano ang naghihintay na gawin?')}</h3>
  <p>{pendingCash.length?`${pendingCash.length} ${tr(pendingCash.length===1?'cash record is waiting for confirmation.':'cash records are waiting for confirmation.','talaan ng cash ang naghihintay ng kumpirmasyon.')}`:tr('No cash records waiting for confirmation.','Walang talaan ng cash na naghihintay ng kumpirmasyon.')}</p>
  {newReports.length>0&&<div className="renter-reports-inbox"><h4>{tr('Renters say they paid','Sinasabi ng umuupa na nagbayad sila')} ({newReports.length})</h4><p className="field-help">{tr('Check that the cash was received, then record it, or mark it not received. Reports do not change balances.','Suriin kung natanggap ang cash, saka itala, o markahang hindi natanggap. Hindi mababago ang balanse sa ulat.')}</p>
   {newReports.map(r=>{const a=data.agreements.find(x=>x.id===r.agreement_id)!;const who=tenants.find(t=>t.id===a.tenant_id)?.display_name??tr('Tenant','Umuupa');return <article className="cash-row worklist-row" key={r.id}><div><strong>{who}</strong><p>{roomName(data,a.unit_id)}</p><p>{decimalPesos(r.amount)} {tr('paid to','binayaran kay')} {paidToText(r)} · {dateText(r.paid_on)}</p><span className="status status--pending">{tr('Renter report · not cash yet','Ulat ng umuupa · hindi pa cash')}</span></div><Button className="secondary-button" onClick={()=>openAccount(a.id)} aria-label={`${tr('Check report from','Suriin ang ulat ni')} ${who}`}>{tr('Check report','Suriin ang ulat')}</Button></article>})}
  </div>}
  <div className="payment-worklist-filters">
   <div><label htmlFor="cash-search">{tr('Find tenant or room','Hanapin ang umuupa o kuwarto')}</label><input id="cash-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('Name, room or building','Pangalan, kuwarto o gusali')} /></div>
   <div><label htmlFor="cash-filter">{tr('Show','Ipakita')}</label><select id="cash-filter" value={filter} onChange={e=>setFilter(e.target.value as WorklistFilter)}><option value="all">{tr('All tenant accounts','Lahat ng account ng umuupa')}</option><option value="pending">{tr('Waiting for confirmation','Naghihintay ng kumpirmasyon')}</option><option value="unpaid">{tr('Unpaid rent','Hindi nabayarang upa')}</option><option value="setup">{tr('Rent not added yet','Hindi pa naidaragdag ang upa')}</option></select></div>
  </div>
  <p role="status" className="field-help">{shown.length} {tr(shown.length===1?'account shown':'accounts shown','ka account gipakita')}</p>
  {shown.map(r=><article className="cash-row worklist-row" key={r.agreementId} aria-current={r.agreementId===selected?'true':undefined}><div><strong>{r.tenant}</strong><p>{r.location}</p><p>{r.charges?`${decimalPesos(r.balance)} ${tr('left to pay','pa babayaran')}`:tr('No rent months added yet','Wala pang buwan ng upa')}{r.ended?` · ${tr('Moved out','Lumipat na')}`:''}</p>{r.pending>0&&<span className="status status--pending">{r.pending} {tr('waiting for confirmation','naghihintay ng kumpirmasyon')}</span>}</div><Button className="secondary-button" onClick={()=>openAccount(r.agreementId)} aria-label={`${tr('Open account for','Buksan ang account ni')} ${r.tenant}, ${r.location}`}>{tr('Open account','Buksan ang account')}</Button></article>)}
  {!shown.length&&<p className="empty-state">{rows.length?tr('No matching accounts. Choose another filter or clear your search.','Walang nakitang account. Pumili ng ibang filter o burahin ang hinahanap.'):tr('No tenant has a room yet. Add a tenant and choose their room first.','Wala pang umuupang may kuwarto. Idagdag muna ang umuupa at ang kanilang kuwarto.')}</p>}
 </section>}

 <div className="account-workspace">
 <section className="card account-header" ref={accountCard} tabIndex={-1} aria-label={tr('Selected account','Napiling account')}>
  <label htmlFor="saved-agreement">{tr('Tenant / room agreement','Kasunduan ng umuupa / kuwarto')}</label>
  <select id="saved-agreement" value={selected} disabled={busy||working} onChange={e=>{setSelected(e.target.value);resetCash();setMessage('')}}><option value="">{tr('Choose a tenant','Pumili ng umuupa')}</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??'Tenant'} / {roomName(data,a.unit_id)}{a.ended_on?` (${tr('moved out','lumipat na')} ${a.ended_on})`:''}</option>)}</select>
  {agreement?<>
  <p>{agreementBuilding?.label??tr('Building unavailable','Hindi makita ang gusali')} / {agreementUnit?.label??tr('Room unavailable','Hindi makita ang kuwarto')}</p>
  <div className="account-summary"><div className="simple-balance"><span>{tr('Rent left to pay','Natitirang upa')}</span><strong>{decimalPesos(agreement.balance)}</strong><span>{accountCharges.length?tr('After confirmed payments only','Pagkatapos lang ng kumpirmadong bayad'):tr('No rent months added yet','Wala pang buwan ng upa')}</span></div>
   <div className="account-summary__stat"><span>{tr('Waiting for confirmation','Naghihintay ng kumpirmasyon')}</span><strong>{pesosOf(accountPending)}</strong><span>{accountPending.length} {tr('cash report(s) · not counted yet','ulat · hindi pa binibilang')}</span></div>
   <div className="account-summary__stat"><span>{tr('Monthly room rent','Buwanang upa sa kuwarto')}</span><strong>{decimalPesos(agreement.rent)}</strong><span>{tr('Moved in','Lumipat noong')} {dateText(agreement.move_in)}</span></div>
   {credits[agreement.id]&&<div className="account-summary__stat advance-credit"><span>{tr('Advance credit','Paunang bayad (advance)')}</span><strong>{decimalPesos(credits[agreement.id])}</strong><span>{tr('Pays the next rent months automatically','Awtomatikong ibabayad sa mga susunod na buwan')}</span></div>}
  </div>
  {agreement.ended_on&&<p className="notice" role="note"><strong>{tr('Moved out','Lumipat na')} {agreement.ended_on}.</strong> {agreement.end_reason} · {tr('No rent can be added for later months. Any unpaid rent above is still owed.','Wala nang upang maidaragdag sa mga susunod na buwan. Utang pa rin ang anumang hindi nabayaran sa itaas.')}</p>}
  {!working&&(!agreement.ended_on||hasPositiveSavedBalance(agreement.balance))&&<>
   {!hasPositiveSavedBalance(agreement.balance)&&<p className="field-help">{tr('Nothing is owed right now. A payment now is kept as advance credit for the next months.','Walang utang ngayon. Ang bayad ngayon ay itatabi bilang paunang bayad para sa mga susunod na buwan.')}</p>}
   <Button className="primary" onClick={()=>{resetCash();setMessage('');setEntry({amount:(hasPositiveSavedBalance(agreement.balance)&&toCents(agreement.balance)<toCents(agreement.rent)?agreement.balance:agreement.rent),date:today,collector:'Bob'})}}>{tr('Record cash payment','Itala ang bayad na cash')}</Button>
  </>}
  </>:<p className="field-help">{tr('Choose a tenant here or open one from the list to see their balance and record cash.','Pumili ng umuupa rito o buksan mula sa listahan para makita ang balanse at makapagtala ng cash.')}</p>}
 </section>

 {agreement&&entry&&!draft&&<section className="card payment-entry" aria-labelledby="cash-entry-heading"><h3 id="cash-entry-heading" ref={stepHeading} tabIndex={-1}>{tr('Enter cash received','Ilagay ang natanggap na cash')}</h3>
  {fromReport&&<p className="field-help">{tr('Filled in from the renter’s report. Change anything that does not match the cash you received; saving links the report to this cash.','Mula sa ulat ng umuupa. Baguhin kung hindi tugma sa natanggap na cash; ili-link ng pag-save ang ulat sa cash na ito.')}</p>}
  <form className="rent-setup" onSubmit={e=>{e.preventDefault()
   if(!/^\d{1,12}(\.\d{1,2})?$/.test(entry.amount.trim())||toCents(entry.amount)<=0n){setError(tr('Enter a positive amount like 3500 or 3500.50. No cash report was saved.','Ilagay ang halagang higit sa zero, halimbawa 3500 o 3500.50. Walang ulat na na-save.'));return}
   if(!validBusinessDate(entry.date)||entry.date>today){setError(tr('Choose the actual date the cash was received, no later than today.','Piliin ang tunay na petsang natanggap ang cash, hindi lampas ngayon.'));return}
   setError('');setDuplicateAccepted(false);setDraft({...entry,amount:entry.amount.trim()})}}>
   <label htmlFor="saved-amount">{tr('Amount (PHP)','Halaga (PHP)')}</label><input id="saved-amount" inputMode="decimal" value={entry.amount} onChange={e=>setEntry({...entry,amount:e.target.value})} aria-describedby="saved-amount-help" placeholder="2500.00" required />
   <p id="saved-amount-help" className="field-help">{tr('Rent still owed:','Natitirang upa:')} {decimalPesos(agreement.balance)}. {tr('Filled in with the agreed monthly rent; change it to what was actually paid. If more is paid, the extra is kept as advance credit and pays the next months automatically.','Nilagyan ng napagkasunduang upa; baguhin ayon sa talagang nabayaran. Kung sobra, itatabi ang sobra bilang paunang bayad at awtomatikong ibabayad sa mga susunod na buwan.')}</p>
   <label htmlFor="saved-date">{tr('Actual payment date','Tunay na petsa ng bayad')}</label><input id="saved-date" type="date" value={entry.date} max={today} onChange={e=>setEntry({...entry,date:e.target.value})} required />
   <label htmlFor="saved-collector">{tr('Received by','Tinanggap ni')}</label><select id="saved-collector" value={entry.collector} onChange={e=>setEntry({...entry,collector:e.target.value})}><option>Bob</option><option>James</option></select>
   <div className="person-actions"><Button className="primary">{tr('Review payment','Suriin ang bayad')}</Button><Button type="button" variant="secondary" onClick={resetCash}>{tr('Cancel','Kanselahin')}</Button></div>
  </form></section>}

 {agreement&&draft&&<section className="card payment-review" aria-labelledby="cash-review-heading"><h3 id="cash-review-heading" ref={stepHeading} tabIndex={-1}>{tr('Check the payment','Suriin ang bayad')}</h3>
  <p><strong>{decimalPesos(draft.amount)}</strong> {tr('received by','tinanggap ni')} {draft.collector} {tr('on','noong')} {dateText(draft.date)}</p>
  {planError?<p role="alert" className="notice notice--error">{planError}</p>:<><p>{tr('When confirmed, it pays the oldest unpaid rent first:','Kapag nakumpirma, babayaran muna ang pinakalumang hindi nabayarang upa:')}</p><ul className="cash-plan">{plan.covered.map(p=><li key={p.month}>{monthText(p.month)}: <strong>{decimalPesos(p.amount)}</strong> {p.settles?tr('(fully paid)','(bayad na lahat)'):tr('(part)','(bahagi)')}</li>)}{toCents(plan.credit)>0n&&<li className="cash-plan-credit">{tr('Advance credit for the next months','Paunang bayad para sa mga susunod na buwan')}: <strong>{decimalPesos(plan.credit)}</strong></li>}</ul>{accountPending.length>0&&<p className="field-help">{tr('Other cash for this tenant is still waiting. If it is confirmed first, the months covered move later.','May ibang cash na naghihintay pa. Kung iyon ang unang makumpirma, magbabago ang mga buwang matatakpan.')}</p>}</>}
  <p>{tr('This is saved as pending. The balance does not change until a clerk confirms it.','I-save ito bilang nakabinbin. Hindi magbabago ang balanse hanggang kumpirmahin ng clerk.')}</p>
  {possibleDuplicate&&<label className="duplicate-warning"><input type="checkbox" checked={duplicateAccepted} onChange={e=>setDuplicateAccepted(e.target.checked)} /> {tr('A payment with the same amount and date already exists for this tenant. I checked that this is a separate payment.','May bayad na pareho ang halaga at petsa para sa umuupang ito. Sinuri ko na ibang bayad ito.')}</label>}
  <div className="person-actions"><Button className="primary" disabled={busy||!!planError||(possibleDuplicate&&!duplicateAccepted)} onClick={async()=>{const saved=await mutate('record_rent_cash',{p_agreement_id:agreement.id,p_amount:draft.amount,p_received_on:draft.date,p_collector:draft.collector});if(saved){const report=fromReport;resetCash();const resolved=report&&typeof saved==='string'?await mutate('resolve_payment_report',{p_report_id:report.id,p_action:'recorded',p_cash_id:saved,p_note:null},false):true;setError('');setMessage(resolved===false?tr('The cash was saved and is waiting for confirmation, but the renter\'s report could not be marked as recorded. Do not record this cash again: reload this screen and check the report.','Na-save ang cash at naghihintay ng kumpirmasyon, pero hindi namarkahang naitala ang ulat ng umuupa. Huwag itala ulit ang cash na ito: i-reload ang screen at suriin ang ulat.'):tr('Saved to the database. Cash recorded and waiting for confirmation; the balance is unchanged.','Na-save sa database. Naitala ang cash at naghihintay ng kumpirmasyon; hindi nabago ang balanse.'))}}}>{busy?tr('Saving…','Sine-save…'):tr('Save pending cash','I-save bilang nakabinbing cash')}</Button><Button disabled={busy} variant="secondary" onClick={()=>{setEntry(draft);setDraft(null);setError('')}}>{tr('Edit payment','Baguhin ang bayad')}</Button></div>
 </section>}

 {agreement&&!working&&accountReports.length>0&&<section className="card renter-reports-card" aria-labelledby="renter-reports-heading">
  <div className="pending-cash-heading"><div><span className="status status--pending">{tr('Renter report · not cash yet','Ulat ng umuupa · hindi pa cash')}</span><h3 id="renter-reports-heading">{tr('The renter says they paid','Sinasabi ng umuupa na nagbayad')}</h3></div><p>{tr('Check with the collector first. Recording it saves pending cash; a clerk still confirms it.','Tanungin muna ang kolektor. Kapag itinala, mase-save bilang nakabinbing cash; kukumpirmahin pa rin ng clerk.')}</p></div>
  {accountReports.map(r=><article className="cash-row pending-cash-row" key={r.id}><div className="pending-cash-details"><strong className="pending-cash-amount">{decimalPesos(r.amount)}</strong><div><span>{tr('Paid to','Binayaran kay')}</span><strong>{paidToText(r)}</strong></div><div><span>{tr('Date paid','Petsa ng bayad')}</span><strong>{dateText(r.paid_on)}</strong></div>{r.note&&<div><span>{tr('Note','Tala')}</span><strong>{r.note}</strong></div>}</div>
   <div className="person-actions"><Button className="secondary-button" disabled={busy} onClick={()=>{resetCash();setMessage('');setFromReport(r);setEntry({amount:r.amount,date:r.paid_on,collector:r.paid_to==='James'?'James':'Bob'})}}>{tr('Record this cash','Itala ang cash na ito')}</Button></div>
   <details className="report-dismiss"><summary>{tr('Not received','Hindi natanggap')}</summary><form className="rent-setup" onSubmit={e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')).trim();void mutate('resolve_payment_report',{p_report_id:r.id,p_action:'dismissed',p_cash_id:null,p_note:reason},false).then(saved=>{if(saved)setMessage(tr('Marked not received. The renter sees your reason.','Minarkahang hindi natanggap. Makikita ng umuupa ang iyong dahilan.'))})}}><label htmlFor={`dismiss-${r.id}`}>{tr('Reason the renter will see (required)','Dahilang makikita ng umuupa (kailangan)')}</label><input id={`dismiss-${r.id}`} name="reason" required maxLength={300} pattern=".*\S.*" placeholder={tr('Example: no cash received on that day','Halimbawa: walang cash na natanggap noong araw na iyon')} /><Button disabled={busy} variant="danger">{tr('Mark not received','Markahang hindi natanggap')}</Button></form></details>
  </article>)}
 </section>}

 {agreement&&confirmCard}
 {agreement&&!working&&accountPending.length>0&&<section className="card pending-cash-card" aria-labelledby="pending-cash-heading">
  <div className="pending-cash-heading"><div><span className="status status--pending">{tr('Pending · not confirmed','Nakabinbin · hindi pa kumpirmado')}</span><h3 id="pending-cash-heading">{tr('Waiting for confirmation','Naghihintay ng kumpirmasyon')}</h3></div><p>{tr('These reports do not reduce the rent balance.','Hindi mababawasan ng mga ulat na ito ang balanse ng upa.')}</p></div>
  {accountPending.map(c=><article className="cash-row pending-cash-row" key={c.id}><div className="pending-cash-details"><strong className="pending-cash-amount">{decimalPesos(c.amount)}</strong><div><span>{tr('Collected by','Tinanggap ni')}</span><strong>{c.collector}</strong></div><div><span>{tr('Date received','Petsa ng pagkatanggap')}</span><strong>{dateText(c.received_on)}</strong></div></div>{verifier?<Button variant="approve" disabled={busy} onClick={()=>{setError('');setMessage('');setReview(c)}}>{tr('Review cash','Suriin ang cash')}</Button>:<p className="field-help">{tr('Only a clerk can confirm cash.','Ang clerk lang ang makakakumpirma ng cash.')}</p>}</article>)}
 </section>}

 {agreement&&!working&&<>
 <div className="account-tabs" role="tablist" aria-label={tr('Account details','Detalye ng account')}>{accountTabs.map(([key,label],index)=><button key={key} type="button" role="tab" id={`account-tab-${key}`} aria-controls={`account-panel-${key}`} aria-selected={accountTab===key} tabIndex={accountTab===key?0:-1} className="account-tab" onClick={()=>setAccountTab(key)} onKeyDown={tabKeys(accountTabs,index,setAccountTab,'account-tab')}>{label}</button>)}</div>
 <section className="card rent-month-card account-panel" role="tabpanel" id="account-panel-months" aria-labelledby="account-tab-months" hidden={accountTab!=='months'}>
  {!accountCharges.length&&<p>{tr('No rent months added yet. Add the first month below.','Wala pang buwan ng upa. Idagdag ang unang buwan sa ibaba.')}</p>}
  <div className="rent-month-list">{[...accountCharges].sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(c=>{const paid=toCents(c.remaining)===0n;return <article className="rent-month-row" key={c.id}><div className="rent-month-date"><strong>{monthText(c.rental_month)}</strong><span>{tr('Due date','Petsa ng singil')}: {dateText(c.due_date)}</span></div><div className="rent-month-amounts"><div><span>{tr('Rent charged','Siningil na upa')}</span><strong>{decimalPesos(c.amount)}</strong></div><div className={`rent-month-remaining${paid?' rent-month-remaining--paid':''}`}><span>{tr('Still to pay','Natitirang singil')}</span><strong>{paid?tr('Paid','Bayad na'):decimalPesos(c.remaining)}</strong></div></div></article>})}</div>
  <form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('add_rent_month',{p_agreement_id:agreement.id,p_month:String(f.get('month'))+'-01'})}}><label htmlFor="saved-month">{tr('Month to add','Buwang idadagdag')}</label><input id="saved-month" name="month" type="month" defaultValue={today.slice(0,7)} required /><p className="field-help">{tr('Adds','Idagdag ang')} {decimalPesos(agreement.rent)} {tr('due on the move-in day of that month. Each month is added once.','na babayaran sa araw ng paglipat sa buwang iyon. Isang beses lang maidaragdag ang bawat buwan.')}</p><Button disabled={busy}>{tr('Add agreed monthly rent','Idagdag ang napagkasunduang upa sa buwan')}</Button></form>
  <p className="field-help">{tr('Late payment does not move the next due date. No late fees are added.','Hindi mababago ang susunod na petsa ng bayad kung mahuli. Walang multang idinadagdag.')}</p>
  <NotebookMonths key={agreement.id} propertyId={propertyId} agreementId={agreement.id} moveIn={agreement.move_in} endedOn={agreement.ended_on??null} chargedMonths={accountCharges.map(c=>c.rental_month.slice(0,7))} userId={userId} onChanged={()=>void refresh()} language={language} />
 </section>
 <div role="tabpanel" id="account-panel-history" aria-labelledby="account-tab-history" className="account-panel" hidden={accountTab!=='history'}>
  <AccountStatement tenantName={agreementTenant?.display_name??tr('Tenant record unavailable','Hindi makita ang talaan ng umuupa')} rentalSpace={`${agreementBuilding?.label??tr('Building unavailable','Hindi makita ang gusali')} / ${agreementUnit?.label??tr('Room unavailable','Hindi makita ang kuwarto')}`} charges={accountCharges} cash={data.cash.filter(c=>c.agreement_id===agreement.id)} openAcknowledgment={setReceipt} owner={owner} busy={busy} reverse={(cashId,reason)=>mutate('reverse_rent_cash',{p_cash_id:cashId,p_reason:reason})} language={language} />
 </div>
 <section className="card room-rent-setup-card account-panel" role="tabpanel" id="account-panel-setup" aria-labelledby="account-tab-setup" hidden={accountTab!=='setup'}>
  <div className="current-room-rent"><div><span>{tr('Monthly room rent','Buwanang upa sa kuwarto')}</span><strong>{decimalPesos(agreement.rent)}</strong></div><p>{tr('Moved in','Lumipat noong')} {dateText(agreement.move_in)}. {tr('Rent is due on that day each month (the last day in shorter months).','Babayaran ang upa sa araw na iyon bawat buwan (huling araw sa maikling buwan).')}</p></div>
  <p className="field-help">{tr('The move-in date and monthly rent stay as agreed. Changing the rent amount is not available in the app yet.','Ang petsa ng paglipat at buwanang upa ay mananatili ayon sa kasunduan. Hindi pa mababago ang halaga ng upa sa app.')}</p>
  {!agreement.ended_on&&<details className="card change-room"><summary>{tr('Change room (still renting)','Palitan ang kuwarto (umuupa pa rin)')}</summary><p>{tr('Moves this tenant to another vacant room from the date you choose. The same account, monthly rent, due day and balance continue; the room history is kept.','Ilipat ang umuupang ito sa ibang bakanteng kuwarto simula sa petsang pipiliin mo. Pareho pa rin ang account, buwanang upa, araw ng singil at balanse; nakatala ang kasaysayan ng kuwarto.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('change_agreement_room',{p_agreement_id:agreement.id,p_unit_id:String(f.get('unit')),p_effective:String(f.get('date')),p_reason:String(f.get('reason')).trim()}).then(saved=>{if(saved)setMessage(tr('Room changed. Rent and balance continue on the same account.','Napalitan ang kuwarto. Tuloy ang upa at balanse sa parehong account.'))})}}><label htmlFor="change-room-unit">{tr('New room','Bagong kuwarto')}</label><select id="change-room-unit" name="unit" required><option value="">{tr('Choose a vacant room','Pumili ng bakanteng kuwarto')}</option>{data.units.filter(u=>u.id!==agreement.unit_id&&!data.agreements.some(a=>a.unit_id===u.id&&(!a.ended_on||a.ended_on>=today))).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="change-room-date">{tr('Moved on','Petsa ng paglipat ng kuwarto')}</label><input id="change-room-date" name="date" type="date" defaultValue={today} min={agreement.move_in} max={today} required /><label htmlFor="change-room-reason">{tr('Reason (required)','Dahilan (kailangan)')}</label><input id="change-room-reason" name="reason" required maxLength={500} pattern=".*\S.*" placeholder={tr('Example: moved to a bigger room','Halimbawa: lumipat sa mas malaking kuwarto')} /><Button disabled={busy} className="primary">{tr('Save room change','I-save ang paglipat ng kuwarto')}</Button></form></details>}
  {!agreement.ended_on&&owner&&<details className="card move-out"><summary>{tr('Record move-out','Itala ang pag-alis')}</summary><p>{tr('Full months only: the move-out month is charged in full and no rent is added after it. Unpaid rent stays owed. The room becomes free for a new agreement starting the day after.','Buong buwan lamang: babayaran nang buo ang buwan ng pag-alis at walang upang maidaragdag pagkatapos. Utang pa rin ang hindi nabayaran. Maaaring maging bagong kasunduan ang kuwarto simula sa susunod na araw.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('end_rental_agreement',{p_agreement_id:agreement.id,p_end_date:String(f.get('end')),p_reason:String(f.get('reason')).trim()})}}><label htmlFor="move-out-date">{tr('Move-out date','Petsa ng paglipat ng kuwarto')}</label><input id="move-out-date" name="end" type="date" min={agreement.move_in} required /><label htmlFor="move-out-reason">{tr('Reason (required)','Dahilan (kailangan)')}</label><input id="move-out-reason" name="reason" required maxLength={500} pattern=".*\S.*" /><Button disabled={busy} variant="danger">{tr('Save move-out','I-save ang pag-alis')}</Button></form></details>}
 </section>
 </>}
 </div>
 </div>}

 {view==='tools'&&<>
 <div className="account-tabs pay-tabs" role="tablist" aria-label={tr('More payment tools','Iba pang gamit sa bayad')}>{tools.map(([key,label],index)=><button key={key} type="button" role="tab" id={`pay-tab-${key}`} aria-controls={`pay-panel-${key}`} aria-selected={tool===key} tabIndex={tool===key?0:-1} className="account-tab" onClick={()=>setTool(key)} onKeyDown={tabKeys(tools,index,setTool,'pay-tab')}>{label}</button>)}</div>
 <div role="tabpanel" id="pay-panel-confirm" aria-labelledby="pay-tab-confirm" className="pay-panel" hidden={tool!=='confirm'}>
 <section className="card cash-verification-queue" aria-labelledby="cash-queue-heading">
  <div className="section-heading"><div><h3 id="cash-queue-heading">{tr('Cash awaiting confirmation','Cash na naghihintay ng kumpirmasyon')}</h3><p>{pendingCash.length} {tr('pending records across this property','nakabinbing talaan sa property na ito')}</p></div></div>
  {!pendingCash.length?<p role="status">{tr('No cash is awaiting confirmation.','Walang cash na naghihintay ng kumpirmasyon.')}</p>:pendingCash.map(c=>{
   const row=rows.find(r=>r.agreementId===c.agreement_id)
   return <article className="cash-queue-row" key={c.id}>
    <div><strong>{row?.tenant??tr('Tenant record unavailable','Hindi makita ang talaan ng umuupa')}</strong><p>{row?.location.replace(' · ',' / ')??tr('Room unavailable','Hindi makita ang kuwarto')}</p></div>
    <div><strong>{decimalPesos(c.amount)}</strong><p>{tr('Received','Natanggap')} {c.received_on} {tr('by','ni')} {c.collector}</p></div>
    <p className="status status--pending">{tr('Pending verification','Naghihintay ng kumpirmasyon')}</p>
    {verifier?<Button variant="approve" disabled={busy} onClick={()=>setReview(c)}>{tr('Review confirmation','Suriin ang kumpirmasyon')}</Button>:<p className="field-help">{tr('Only a clerk can confirm cash.','Ang clerk lang ang makakakumpirma ng cash.')}</p>}
   </article>
  })}
 </section>
 {confirmCard}
 </div>
 <div role="tabpanel" id="pay-panel-checks" aria-labelledby="pay-tab-checks" className="pay-panel" hidden={tool!=='checks'}>
 <CheckHandoverRegister propertyId={propertyId} data={data} tenants={tenants.filter(tenant=>tenant.property_id===propertyId)} owner={owner} canRecordCheck={data.clerks.some(clerk=>clerk.user_id===userId)} busy={busy} mutate={mutate} language={language} />
 </div>
 <div role="tabpanel" id="pay-panel-monthly" aria-labelledby="pay-tab-monthly" className="pay-panel" hidden={tool!=='monthly'}>
 <section className={`auto-listing auto-rent ${autoRent?'auto-listing--on':''}`} aria-labelledby="auto-rent-heading"><div><h3 id="auto-rent-heading">{tr('Add monthly rent automatically','Awtomatikong idagdag ang buwanang upa')}</h3><p>{autoRent?tr('On: on the 1st of each month (Philippine time), every current tenant gets that month\'s rent at their agreed amount, due on their usual day. Nothing is added after a move-out, and a month is never added twice.','On: tuwing ika-1 ng buwan, bawat umuupa ay makakatanggap ng upa sa buwang iyon sa napagkasunduang halaga, babayaran sa nakasanayang araw. Walang maidaragdag pagkatapos ng pag-alis, at hindi madodoble.'):autoRent===false?tr('Off: rent is added only when staff add it below. When turned on, this month\'s rent is added now for every current tenant who does not have it yet.','Off: madaragdag lang ang upa kapag idinagdag ng staff sa ibaba. Kapag in-on, idaragdag ngayon ang upa ngayong buwan sa bawat umuupang wala pa nito.'):tr('Automatic rent needs the latest database update.','Kailangan ang bagong database update para sa awtomatikong upa.')}</p></div>{owner&&autoRent!==null?<Button className={autoRent?'secondary-button':'primary'} disabled={busy} aria-pressed={autoRent} onClick={async()=>{const result=await mutate('set_auto_rent',{p_enabled:!autoRent},false);if(result!==false){setAutoRent(!autoRent);setMessage(autoRent?tr('Automatic monthly rent is off.','Naka-off na ang awtomatikong upa.'):tr(`Automatic monthly rent is on. ${typeof result==='number'?result:0} charge(s) added for this month.`,`Naka-on na ang awtomatikong upa. ${typeof result==='number'?result:0} singil ang naidagdag ngayong buwan.`))}}}>{autoRent?tr('Turn off','I-off'):tr('Turn on','I-on')}</Button>:<span className={`status ${autoRent?'status--ready':''}`}>{autoRent?tr('On','On'):tr('Off','Off')}</span>}</section>
 <MonthlyRentBatch data={data} tenants={tenants} busy={busy} addMonth={(agreementId,month)=>mutate('add_rent_month',{p_agreement_id:agreementId,p_month:`${month}-01`})} language={language} />
 </div>
 <div role="tabpanel" id="pay-panel-setup" aria-labelledby="pay-tab-setup" className="pay-panel" hidden={tool!=='setup'}>
 <section className="card saved-readiness" aria-labelledby="saved-readiness-heading">
  <h3 id="saved-readiness-heading">{tr('Saved workflow readiness','Handa na ba ang pagtatala?')}</h3>
  <p>{t.pending}</p>
  <ul>
   <li><span className={verifierAssigned?'readiness-state readiness-state--ready':'readiness-state'}>{verifierAssigned?tr('Ready','Handa'):tr('Needs setup','Kailangang i-set up')}</span><div><strong>{tr('Cash confirmation','Pagkumpirma ng cash')}</strong><p>{verifierAssigned?tr('Clerks confirm cash.','Ang mga clerk ang magkukumpirma ng cash.'):tr('No clerk has access yet, so pending cash cannot be confirmed.','Walang clerk na may access pa, kaya hindi pa makukumpirma ang nakabinbing cash.')}</p></div></li>
   <li><span className={data.agreements.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.agreements.length?`${data.agreements.length} ${tr('saved','na-save')}`:tr('Needs setup','Kailangang i-set up')}</span><div><strong>{tr('Room agreements','Mga kasunduan sa kuwarto')}</strong><p>{data.agreements.length?tr('Tenants with a room appear in Record and confirm.','Ang mga umuupang may kuwarto ay makikita sa Itala at kumpirmahin.'):tr('No agreements yet. Add a tenant with a room to start.','Wala pang kasunduan. Magdagdag ng umuupa kasama ang kuwarto para magsimula.')}</p></div></li>
   <li><span className={data.charges.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.charges.length?`${data.charges.length} ${tr('saved','na-save')}`:tr('Needs setup','Kailangang i-set up')}</span><div><strong>{tr('Monthly rent charges','Mga buwanang singil sa upa')}</strong><p>{data.charges.length?tr('Only saved charges appear in rent balances.','Ang mga naka-save na singil lang ang makikita sa balanse ng upa.'):tr('No charges are saved; no rent is assumed or generated automatically.','Walang naka-save na singil; walang upang hinuhulaan o awtomatikong ginagawa.')}</p></div></li>
   <li><span className="readiness-state">{pendingCash.length+confirmedCount} {tr('records','talaan')}</span><div><strong>{tr('Cash status','Katayuan ng cash')}</strong><p>{pendingCash.length} {tr('awaiting confirmation','naghihintay ng kumpirmasyon')} · {confirmedCount} {tr('confirmed','nakumpirma')}</p></div></li>
  </ul>
 </section>
 <details className="card create-agreement"><summary>{tr('Give an existing tenant a room','Bigyan ng kuwarto ang dating umuupa')}</summary><p>{tr('For tenants already in the directory. New tenants get their room in Add tenant. One responsible tenant per room; the move-in day sets monthly due dates.','Para sa mga nasa listahan na. Ang bagong umuupa ay makakakuha ng kuwarto sa Magdagdag ng umuupa. Isang responsable bawat kuwarto; ang araw ng paglipat ang batayan ng petsa ng singil.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!String(f.get('tenant'))){setError(tr('Choose the responsible tenant first.','Piliin muna ang responsableng umuupa.'));return};void mutate('create_rental_agreement',{p_tenant_id:String(f.get('tenant')),p_unit_id:String(f.get('unit')),p_move_in:String(f.get('start')),p_rent:String(f.get('rent'))})}}><TenantPicker label={tr('Responsible tenant','Responsableng umuupa')} name="tenant" tenants={tenants.filter(t=>!t.archived_at&&!t.removed_at&&!data.agreements.some(a=>a.tenant_id===t.id&&(!a.ended_on||a.ended_on>=today)))} value={newAgreementTenant} onChange={setNewAgreementTenant} language={language} /><label htmlFor="agreement-unit">{tr('Room','Kuwarto')}</label><select id="agreement-unit" name="unit" required><option value="">{tr('Choose room','Pumili ng kuwarto')}</option>{data.units.filter(u=>!data.agreements.some(a=>a.unit_id===u.id&&!a.ended_on)).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="agreement-start">{tr('Move-in date','Petsa ng paglipat')}</label><input id="agreement-start" name="start" type="date" required /><label htmlFor="agreement-rent">{tr('Monthly room rent (PHP)','Buwanang upa ng kuwarto (PHP)')}</label><input id="agreement-rent" name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required /><Button disabled={busy}>{tr('Save agreement','I-save ang kasunduan')}</Button></form></details>
 <details className="card term-help"><summary>{t.simpleWords}</summary><p>{t.simpleWordsHelp}</p>
  <dl className="term-help-list">
   <div><dt>{tr('Balance','Balanse')}</dt><dd>{tr('Rent recorded here that has not been paid yet.','Magkano pa sa naitalang upa ang hindi nababayaran.')}</dd></div>
   <div><dt>{tr('Pending cash','Nakabinbing cash')}</dt><dd>{tr('Cash was reported, but not confirmed yet. It does not lower the balance.','Sinabing natanggap na ang cash, pero hindi pa kinukumpirma. Hindi pa nito binababa ang balanse.')}</dd></div>
   <div><dt>{tr('Check received','Natanggap na tseke')}</dt><dd>{tr('It is not counted as paid until the bank confirms it.','Hindi pa ituturing na bayad hanggang kumpirmahin ng bangko.')}</dd></div>
   <div><dt>{tr('Reversal','Pagbawi')}</dt><dd>{tr('A clerk or the owner cancels an earlier confirmation and must give a reason.','Binawi ng clerk o may-ari ang nakaraang kumpirmasyon at kailangang magbigay ng dahilan.')}</dd></div>
   <div><dt>{tr('Handover','Turnover')}</dt><dd>{tr('The clerk gives the collected cash and checks to the owner.','Ibinigay ng clerk sa may-ari ang nakolektang cash at mga tseke.')}</dd></div>
  </dl>
 </details>
 </div>
 </>}
 {view==='report'&&<SavedPaidRentReport propertyId={propertyId} data={data} tenants={tenants.filter(tenant=>tenant.property_id===propertyId)} openAcknowledgment={setReceipt} propertyName={propertyName} language={language} />}
 </>}
 {receipt&&<CashAcknowledgment data={receipt} close={()=>setReceipt(null)} language={language} />}
 </section>
}
