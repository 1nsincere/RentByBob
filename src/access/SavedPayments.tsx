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
import { CheckHandoverRegister } from './CheckHandoverRegister'
import { TenantPicker } from './TenantPicker'
import { parsePaymentReports, type PaymentReport } from './payment-reports-model'
import { copy, text, type Language } from '../i18n'

type CashDraft = { amount: string; date: string; collector: string }
const dateText = (date: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'))
const monthText = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month.slice(0, 7) + '-01T00:00:00Z'))

// Same flow as the preview: pick an account (or open one from "What needs attention?"), record cash, check which
// months it covers, save it as pending; the designated verifier confirms it. Less frequent work lives in More tools.
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
 const verifierSetup = useRef<HTMLDetailsElement>(null), accountCard = useRef<HTMLElement>(null), stepHeading = useRef<HTMLHeadingElement>(null)
 const request = useRef<{key:string;id:string}|null>(null), sending = useRef(false)
 const [autoRent,setAutoRent] = useState<boolean|null>(null)
 const [newAgreementTenant,setNewAgreementTenant] = useState('')
 const [verifierEmail,setVerifierEmail] = useState(''), [verifierMatch,setVerifierMatch] = useState<{id:string;email:string}|null>(null)
 // Unused advance credit per agreement (202610270010); empty when none or before the update is applied.
 const [credits,setCredits] = useState<Record<string,string>>({})
 // Renter payment reports (202610270012): notices only. "Record this cash" pre-fills the entry and links the saved cash.
 const [reports,setReports] = useState<PaymentReport[]>([]), [fromReport,setFromReport] = useState<PaymentReport|null>(null)
 const refresh = useCallback(async () => {
  let result
  try {
   void supabase!.rpc('read_payment_reports',{p_property_id:propertyId}).then(({data:list,error:listError})=>{try{setReports(listError?[]:parsePaymentReports(list))}catch{setReports([])}})
   await supabase!.rpc('post_due_rent_now',{p_property_id:propertyId}).then(()=>undefined,()=>undefined)
   void supabase!.from('properties').select('auto_rent').eq('id',propertyId).maybeSingle().then(({data:row,error:rowError})=>setAutoRent(rowError||!row?null:Boolean((row as {auto_rent:boolean}).auto_rent)))
   void supabase!.rpc('read_agreement_credits',{p_property_id:propertyId}).then(({data:credit,error:creditError})=>setCredits(creditError||!credit?{}:credit as Record<string,string>))
   result = await supabase!.rpc('read_rent_workspace',{p_property_id:propertyId})
  } catch {
   setData(null); setError(text(languageRef.current,'Saved rent records could not be loaded. Check your connection and refresh; nothing was changed.','Wala makarga ang mga rekord sa abang. Susiha ang koneksyon ug i-refresh; walay nausab.')); return
  }
  if(result.error) { setData(null); setError(text(languageRef.current,'Saved rent records are unavailable. The cash migration must be applied and your staff MFA session must be active. Nothing has been saved by this screen.','Dili makita ang mga rekord sa abang. Kinahanglan ma-apply ang cash migration ug aktibo ang MFA session sa staff. Walay na-save niini nga screen.')); return }
  try {
   setData(parseRentWorkspaceSnapshot(result.data, tenantsRef.current))
   setError('')
  } catch {
   setData(null)
   setError(text(languageRef.current,'Saved rent records could not be validated, so financial details are hidden. Contact the system administrator; nothing was changed.','Wala makapasa sa pagsusi ang mga rekord sa abang, busa gitago ang detalye sa kwarta. Kontaka ang administrator; walay nausab.'))
  }
 },[propertyId])
 useEffect(()=>{setData(null);setSelected('');setReview(null);setReceipt(null);setEntry(null);setDraft(null);setError('');void refresh()},[refresh])
 async function mutate(name:string, args:Record<string,unknown>, idempotent=true) {
  if(sending.current) return false
  const key=JSON.stringify({name,args}); if(idempotent && request.current && request.current.key!==key) { setError(tr('An earlier request has an uncertain outcome. Retry it unchanged or reload to check the saved records before entering a different request.','Wala masiguro ang resulta sa miaging hangyo. Sulayi pag-usab nga walay kausaban o i-reload aron susihon ang rekord una magsulod og laing hangyo.')); return false }
  if(idempotent && !request.current) request.current={key,id:crypto.randomUUID()}
  sending.current=true;setBusy(true);setError('');setMessage('')
  try {
   const result=await supabase!.rpc(name,{p_property_id:propertyId,...args,...(idempotent?{p_id:request.current!.id}:{})})
   if(result.error) { const messages={
    unauthorized:tr('Your account is not authorized for this action, or MFA needs renewing.','Wala gitugotan ang imong account niining aksyon, o kinahanglan i-renew ang MFA.'),
    handover:tr('Check the clerk, date, amounts and any required difference reason.','Susiha ang clerk, petsa, kantidad ug gikinahanglang rason sa kalainan.'),
    transition:tr('This check cannot move to that status. Check its current status, bank confirmation and unpaid rent balance.','Dili mausab ang kahimtang sa tseke. Susiha ang kahimtang niini, kumpirmasyon sa bangko ug nabilin nga abang.'),
    check:tr('Check the tenant, amount, receipt date and collector.','Susiha ang nag-abang, kantidad, petsa nga nadawat ug tigkolekta.'),
    duplicate:tr('This room agreement or monthly rent already exists. Refresh and check the records.','Aduna na niini nga kasabotan sa kwarto o bayranan sa bulan. I-refresh ug susiha ang mga rekord.'),
    amount:tr('Check the dates, amount and selected records. Confirmation cannot exceed unpaid rent.','Susiha ang mga petsa, kantidad ug napiling rekord. Dili molapas sa wala mabayring abang ang kumpirmasyon.'),
    reverse:tr('This payment could not be reversed. Only a confirmed payment that is not already reversed can be reversed, and a reason is required.','Dili mabawi kini nga bayad. Ang kumpirmado lang nga bayad nga wala pa mabawi ang mabawi, ug kinahanglan og rason.'),
    moveOut:tr('The move-out could not be saved. Choose a date on or after move-in (within one year) and give a reason. It cannot be earlier than a month that already has rent recorded.','Wala ma-save ang pagbalhin. Pagpili og petsa human sa pagsulod (sulod sa usa ka tuig) ug hatagi og rason. Dili kini mauna sa bulan nga naa nay narekord nga abang.'),
    report:tr('This renter report was already handled, or the cash is for another room. Refresh and check.','Nahuman na kini nga report, o ang kwarta para sa laing kwarto. I-refresh ug susiha.'),
    month:tr('This month\'s rent could not be added. The month must be on or after move-in and not after a move-out date.','Dili madugang ang abang niining bulana. Ang bulan kinahanglan human sa pagsulod ug dili human sa pagbalhin.'),
    save:tr('Save could not be confirmed. Retry unchanged to avoid duplicates.','Wala makumpirma ang pag-save. Sulayi pag-usab nga walay kausaban aron malikayan ang doble nga rekord.'),
   }; setError(result.error.code==='42501'?messages.unauthorized:name==='record_collection_handover'&&result.error.code==='22023'?messages.handover:name==='transition_rent_check'&&result.error.code==='22023'?messages.transition:name==='record_rent_check'&&result.error.code==='22023'?messages.check:name==='reverse_rent_cash'&&result.error.code==='22023'?messages.reverse:name==='end_rental_agreement'&&result.error.code==='22023'?messages.moveOut:name==='add_rent_month'&&result.error.code==='22023'?messages.month:name==='resolve_payment_report'&&result.error.code==='22023'?messages.report:result.error.code==='23505'?messages.duplicate:result.error.code==='22023'?messages.amount:messages.save); if(['42501','23505','22023'].includes(result.error.code??''))request.current=null; return false }
   request.current=null;setMessage(tr('Saved to the database.','Na-save sa database.'));await refresh();return result.data ?? true
  }catch{setError(tr('Connection interrupted. Retry the same request to check its result safely.','Naputol ang koneksyon. Sulayi pag-usab ang mao nga hangyo aron masusi ang resulta.'));return false}
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
 const verifier=data?.verifiers.some(v=>v.user_id===userId)??false
 const verifierAssigned=(data?.verifiers.length??0)>0
 const pendingCash=data?.cash.filter(c=>!c.confirmed_at)??[]
 const confirmedCount=(data?.cash.length??0)-pendingCash.length
 const accountCharges=agreement?data!.charges.filter(c=>c.agreement_id===agreement.id):[]
 const accountPending=agreement?pendingCash.filter(c=>c.agreement_id===agreement.id):[]
 const newReports=reports.filter(r=>r.status==='new'&&data?.agreements.some(a=>a.id===r.agreement_id))
 const accountReports=agreement?newReports.filter(r=>r.agreement_id===agreement.id):[]
 const paidToText=(r:PaymentReport)=>r.paid_to==='Other'?tr('someone else','laing tawo'):r.paid_to
 const moneyText=(items:{amount:string}[])=>items.reduce((sum,item)=>sum+toCents(item.amount),0n)
 const pesosOf=(items:{amount:string}[])=>{const total=moneyText(items);return decimalPesos(`${total/100n}.${(total%100n).toString().padStart(2,'0')}`)}
 const today=philippineToday()
 let plan:ReturnType<typeof planOldestFirst>={covered:[],credit:'0.00'}, planError=''
 if(draft) { try { plan=planOldestFirst(accountCharges,draft.amount) } catch(e) { planError=(e as Error).message } }
 const possibleDuplicate=!!draft&&!!agreement&&data!.cash.some(c=>c.agreement_id===agreement.id&&c.received_on===draft.date&&toCents(c.amount)===toCents(draft.amount))
 const rows=data?worklistRows(data,tenants):[]
 const shown=filterWorklist(rows,filter,search)
 const working=!!(entry||draft||review)
 const accountTabs=[['months',tr('Rent by month','Abang kada bulan')],['history',tr('Payment history','Kasaysayan sa bayad')],['setup',tr('Room rent setup','Pagbutang sa abang sa kwarto')]] as const
 const tools=[['confirm',`${tr('Cash to confirm','Kwarta nga kumpirmahon')}${pendingCash.length?` (${pendingCash.length})`:''}`],['checks',tr('Checks & handovers','Tseke ug pagtugyan')],['monthly',tr('Monthly rent for everyone','Binulan nga abang sa tanan')],['setup',tr('Setup','Setup')]] as const
 const tabKeys=<K extends string>(all:readonly (readonly [K,string])[],index:number,set:(key:K)=>void,prefix:string)=>(event:KeyboardEvent)=>{if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;const next=all[(index+(event.key==='ArrowRight'?1:all.length-1))%all.length][0];set(next);document.getElementById(`${prefix}-${next}`)?.focus()}

 const confirmCard=review&&<section className="card cash-confirmation-review" aria-labelledby="cash-confirm-heading"><h3 id="cash-confirm-heading" ref={stepHeading} tabIndex={-1}>{tr('Confirm cash received?','Kumpirmaha ang nadawat nga kwarta?')}</h3><p><strong>{decimalPesos(review.amount)}</strong> {tr('received by','gidawat ni')} {review.collector} {tr('on','niadtong')} {dateText(review.received_on)}.</p><p>{tr('Confirm only after checking that the cash was received. It will cover the oldest unpaid rent first and issue a permanent acknowledgment.','Kumpirmaha lang human masusi nga nadawat ang kwarta. Ibutang kini una sa pinakadaan nga wala mabayring abang ug maghimo og permanenteng resibo.')}</p><div className="person-actions"><Button disabled={busy} className="primary" onClick={async()=>{const result=await mutate('confirm_rent_cash',{p_cash_id:review.id},false);if(result){setReview(null);setMessage(tr('Cash confirmed. The balance is updated.','Nakumpirma ang kwarta. Na-update ang balanse.'));setReceipt(result as CashAcknowledgmentData)}}}>{tr('Confirm and issue acknowledgment','Kumpirmaha ug paghimo og resibo')}</Button><Button disabled={busy} onClick={()=>setReview(null)}>{tr('Cancel','Kansela')}</Button></div></section>

 return <section className="payments-preview simple-payments" aria-labelledby="payments-heading">
 <div className="section-heading"><div><p className="eyebrow">{tr('RENT RECORDS','REKORD SA ABANG')}</p><h2 id="payments-heading">{t.paymentRecords}</h2><p>{tr('Find a tenant, record cash, then confirm it.','Pangitaa ang nag-abang, irekord ang kwarta, unya kumpirmaha.')}</p></div></div>
 {error&&<p className="notice notice--error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 {!data&&!error&&<LoadingSkeleton label={tr('Loading saved records…','Gikarga ang mga rekord…')} rows={4} />}
 {data&&<>
 <div className="segmented-control" role="group" aria-label={tr('Payment views','Mga tan-aw sa bayad')}><Button aria-pressed={view==='records'} onClick={()=>setView('records')}>{tr('Record and confirm','Irekord ug kumpirmaha')}</Button><Button aria-pressed={view==='report'} onClick={()=>setView('report')}>{t.paidReport}</Button><Button aria-pressed={view==='tools'} onClick={()=>setView('tools')}>{tr('More tools','Uban pang gamit')}</Button></div>

 {view==='records'&&<div className={`payment-record-view${working?'':' payment-record-view--with-worklist'}`}>
 {!working&&<section className="card payment-overview" aria-labelledby="cash-worklist-heading">
  <h3 id="cash-worklist-heading">{tr('What needs attention?','Unsa ang naghulat buhaton?')}</h3>
  <p>{pendingCash.length?`${pendingCash.length} ${tr(pendingCash.length===1?'cash record is waiting for confirmation.':'cash records are waiting for confirmation.','ka rekord sa kwarta naghulat og kumpirmasyon.')}`:tr('No cash records waiting for confirmation.','Walay rekord sa kwarta nga naghulat og kumpirmasyon.')}</p>
  {newReports.length>0&&<div className="renter-reports-inbox"><h4>{tr('Renters say they paid','Nag-ingon ang nag-abang nga nibayad sila')} ({newReports.length})</h4><p className="field-help">{tr('Check that the cash was received, then record it, or mark it not received. Reports do not change balances.','Susiha nga nadawat ang kwarta, unya irekord, o markahi nga wala madawat. Dili mausab ang balanse sa report.')}</p>
   {newReports.map(r=>{const a=data.agreements.find(x=>x.id===r.agreement_id)!;const who=tenants.find(t=>t.id===a.tenant_id)?.display_name??tr('Tenant','Nag-abang');return <article className="cash-row worklist-row" key={r.id}><div><strong>{who}</strong><p>{roomName(data,a.unit_id)}</p><p>{decimalPesos(r.amount)} {tr('paid to','gibayad kang')} {paidToText(r)} · {dateText(r.paid_on)}</p><span className="status status--pending">{tr('Renter report · not cash yet','Report sa nag-abang · dili pa kwarta')}</span></div><Button className="secondary-button" onClick={()=>openAccount(a.id)} aria-label={`${tr('Check report from','Susiha ang report ni')} ${who}`}>{tr('Check report','Susiha ang report')}</Button></article>})}
  </div>}
  <div className="payment-worklist-filters">
   <div><label htmlFor="cash-search">{tr('Find tenant or room','Pangitaa ang nag-abang o kwarto')}</label><input id="cash-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('Name, room or building','Ngalan, kwarto o bilding')} /></div>
   <div><label htmlFor="cash-filter">{tr('Show','Ipakita')}</label><select id="cash-filter" value={filter} onChange={e=>setFilter(e.target.value as WorklistFilter)}><option value="all">{tr('All tenant accounts','Tanang account sa nag-abang')}</option><option value="pending">{tr('Waiting for confirmation','Naghulat og kumpirmasyon')}</option><option value="unpaid">{tr('Unpaid rent','Wala mabayri nga abang')}</option><option value="setup">{tr('Rent not added yet','Wala pa madugang ang abang')}</option></select></div>
  </div>
  <p role="status" className="field-help">{shown.length} {tr(shown.length===1?'account shown':'accounts shown','ka account gipakita')}</p>
  {shown.map(r=><article className="cash-row worklist-row" key={r.agreementId} aria-current={r.agreementId===selected?'true':undefined}><div><strong>{r.tenant}</strong><p>{r.location}</p><p>{r.charges?`${decimalPesos(r.balance)} ${tr('left to pay','pa bayran')}`:tr('No rent months added yet','Wala pay bulan sa abang')}{r.ended?` · ${tr('Moved out','Nibalhin na')}`:''}</p>{r.pending>0&&<span className="status status--pending">{r.pending} {tr('waiting for confirmation','naghulat og kumpirmasyon')}</span>}</div><Button className="secondary-button" onClick={()=>openAccount(r.agreementId)} aria-label={`${tr('Open account for','Ablihi ang account ni')} ${r.tenant}, ${r.location}`}>{tr('Open account','Ablihi ang account')}</Button></article>)}
  {!shown.length&&<p className="empty-state">{rows.length?tr('No matching accounts. Choose another filter or clear your search.','Walay nakit-an nga account. Pilia ang laing filter o tangtanga ang gipangita.'):tr('No tenant has a room yet. Add a tenant and choose their room first.','Wala pay nag-abang nga naay kwarto. Idugang una ang nag-abang ug ang ilang kwarto.')}</p>}
 </section>}

 <div className="account-workspace">
 <section className="card account-header" ref={accountCard} tabIndex={-1} aria-label={tr('Selected account','Napiling account')}>
  <label htmlFor="saved-agreement">{tr('Tenant / room agreement','Kasabotan sa nag-abang / kwarto')}</label>
  <select id="saved-agreement" value={selected} disabled={busy||working} onChange={e=>{setSelected(e.target.value);resetCash();setMessage('')}}><option value="">{tr('Choose a tenant','Pagpili og nag-abang')}</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??'Tenant'} / {roomName(data,a.unit_id)}{a.ended_on?` (${tr('moved out','nibalhin na')} ${a.ended_on})`:''}</option>)}</select>
  {agreement?<>
  <p>{agreementBuilding?.label??tr('Building unavailable','Wala makita ang bilding')} / {agreementUnit?.label??tr('Room unavailable','Wala makita ang kwarto')}</p>
  <div className="account-summary"><div className="simple-balance"><span>{tr('Rent left to pay','Nabilin nga abang')}</span><strong>{decimalPesos(agreement.balance)}</strong><span>{accountCharges.length?tr('After confirmed payments only','Human sa kumpirmadong bayad lang'):tr('No rent months added yet','Wala pay bulan sa abang')}</span></div>
   <div className="account-summary__stat"><span>{tr('Waiting for confirmation','Naghulat og kumpirmasyon')}</span><strong>{pesosOf(accountPending)}</strong><span>{accountPending.length} {tr('cash report(s) · not counted yet','ka report · wala pa maihap')}</span></div>
   <div className="account-summary__stat"><span>{tr('Monthly room rent','Binulan nga abang sa kwarto')}</span><strong>{decimalPesos(agreement.rent)}</strong><span>{tr('Moved in','Misulod')} {dateText(agreement.move_in)}</span></div>
   {credits[agreement.id]&&<div className="account-summary__stat advance-credit"><span>{tr('Advance credit','Abante nga bayad')}</span><strong>{decimalPesos(credits[agreement.id])}</strong><span>{tr('Pays the next rent months automatically','Awtomatikong ibayad sa sunod nga mga bulan')}</span></div>}
  </div>
  {agreement.ended_on&&<p className="notice" role="note"><strong>{tr('Moved out','Nibalhin na')} {agreement.ended_on}.</strong> {agreement.end_reason} · {tr('No rent can be added for later months. Any unpaid rent above is still owed.','Wala nay abang nga madugang sa sunod nga mga bulan. Utang gihapon ang bisan unsang wala mabayri sa taas.')}</p>}
  {!working&&(!agreement.ended_on||hasPositiveSavedBalance(agreement.balance))&&<>
   {!hasPositiveSavedBalance(agreement.balance)&&<p className="field-help">{tr('Nothing is owed right now. A payment now is kept as advance credit for the next months.','Walay utang karon. Ang bayad karon itipig isip abante para sa sunod nga mga bulan.')}</p>}
   <Button className="primary" onClick={()=>{resetCash();setMessage('');setEntry({amount:(hasPositiveSavedBalance(agreement.balance)&&toCents(agreement.balance)<toCents(agreement.rent)?agreement.balance:agreement.rent),date:today,collector:'Bob'})}}>{tr('Record cash payment','Irekord ang bayad nga kwarta')}</Button>
  </>}
  </>:<p className="field-help">{tr('Choose a tenant here or open one from the list to see their balance and record cash.','Pagpili og nag-abang dinhi o ablihi gikan sa lista aron makita ang balanse ug makarekord og kwarta.')}</p>}
 </section>

 {agreement&&entry&&!draft&&<section className="card payment-entry" aria-labelledby="cash-entry-heading"><h3 id="cash-entry-heading" ref={stepHeading} tabIndex={-1}>{tr('Enter cash received','Isulod ang nadawat nga kwarta')}</h3>
  {fromReport&&<p className="field-help">{tr('Filled in from the renter’s report. Change anything that does not match the cash you received; saving links the report to this cash.','Gikan sa report sa nag-abang. Usba kon dili motugma sa kwarta nga nadawat; ang pag-save mo-link sa report niini nga kwarta.')}</p>}
  <form className="rent-setup" onSubmit={e=>{e.preventDefault()
   if(!/^\d{1,12}(\.\d{1,2})?$/.test(entry.amount.trim())||toCents(entry.amount)<=0n){setError(tr('Enter a positive amount like 3500 or 3500.50. No cash report was saved.','Isulod ang kantidad nga labaw sa sero, pananglitan 3500 o 3500.50. Walay report nga na-save.'));return}
   if(!validBusinessDate(entry.date)||entry.date>today){setError(tr('Choose the actual date the cash was received, no later than today.','Pilia ang tinuod nga petsa nga nadawat ang kwarta, dili lapas karon.'));return}
   setError('');setDuplicateAccepted(false);setDraft({...entry,amount:entry.amount.trim()})}}>
   <label htmlFor="saved-amount">{tr('Amount (PHP)','Kantidad (PHP)')}</label><input id="saved-amount" inputMode="decimal" value={entry.amount} onChange={e=>setEntry({...entry,amount:e.target.value})} aria-describedby="saved-amount-help" placeholder="2500.00" required />
   <p id="saved-amount-help" className="field-help">{tr('Rent still owed:','Nabilin nga abang:')} {decimalPesos(agreement.balance)}. {tr('Filled in with the agreed monthly rent; change it to what was actually paid. If more is paid, the extra is kept as advance credit and pays the next months automatically.','Gisudlan sa gikasabutang abang; usba sumala sa tinuod nga nabayad. Kon sobra, itipig ang sobra isip abante ug awtomatikong ibayad sa sunod nga mga bulan.')}</p>
   <label htmlFor="saved-date">{tr('Actual payment date','Tinuod nga petsa sa bayad')}</label><input id="saved-date" type="date" value={entry.date} max={today} onChange={e=>setEntry({...entry,date:e.target.value})} required />
   <label htmlFor="saved-collector">{tr('Received by','Gidawat ni')}</label><select id="saved-collector" value={entry.collector} onChange={e=>setEntry({...entry,collector:e.target.value})}><option>Bob</option><option>James</option></select>
   <div className="person-actions"><Button className="primary">{tr('Review payment','Susiha ang bayad')}</Button><Button type="button" onClick={resetCash}>{tr('Cancel','Kanselahon')}</Button></div>
  </form></section>}

 {agreement&&draft&&<section className="card payment-review" aria-labelledby="cash-review-heading"><h3 id="cash-review-heading" ref={stepHeading} tabIndex={-1}>{tr('Check the payment','Susiha ang bayad')}</h3>
  <p><strong>{decimalPesos(draft.amount)}</strong> {tr('received by','gidawat ni')} {draft.collector} {tr('on','niadtong')} {dateText(draft.date)}</p>
  {planError?<p role="alert" className="notice notice--error">{planError}</p>:<><p>{tr('When confirmed, it pays the oldest unpaid rent first:','Kon makumpirma, bayran una ang pinakadaan nga wala mabayring abang:')}</p><ul className="cash-plan">{plan.covered.map(p=><li key={p.month}>{monthText(p.month)}: <strong>{decimalPesos(p.amount)}</strong> {p.settles?tr('(fully paid)','(bayad na tanan)'):tr('(part)','(bahin)')}</li>)}{toCents(plan.credit)>0n&&<li className="cash-plan-credit">{tr('Advance credit for the next months','Abante para sa sunod nga mga bulan')}: <strong>{decimalPesos(plan.credit)}</strong></li>}</ul>{accountPending.length>0&&<p className="field-help">{tr('Other cash for this tenant is still waiting. If it is confirmed first, the months covered move later.','Naay laing kwarta nga naghulat pa. Kon kini mauna makumpirma, mausab ang mga bulan nga matabonan.')}</p>}</>}
  <p>{tr('This is saved as pending. The balance does not change until the cash verifier confirms it.','I-save kini isip pending. Dili mausab ang balanse hangtod kumpirmahon sa tigkumpirma.')}</p>
  {possibleDuplicate&&<label className="duplicate-warning"><input type="checkbox" checked={duplicateAccepted} onChange={e=>setDuplicateAccepted(e.target.checked)} /> {tr('A payment with the same amount and date already exists for this tenant. I checked that this is a separate payment.','Adunay bayad nga pareho og kantidad ug petsa niini nga nag-abang. Gisusi nako nga lahi kini nga bayad.')}</label>}
  <div className="person-actions"><Button className="primary" disabled={busy||!!planError||(possibleDuplicate&&!duplicateAccepted)} onClick={async()=>{const saved=await mutate('record_rent_cash',{p_agreement_id:agreement.id,p_amount:draft.amount,p_received_on:draft.date,p_collector:draft.collector});if(saved){const report=fromReport;resetCash();if(report&&typeof saved==='string')await mutate('resolve_payment_report',{p_report_id:report.id,p_action:'recorded',p_cash_id:saved,p_note:null},false);setMessage(tr('Saved to the database. Cash recorded and waiting for confirmation; the balance is unchanged.','Na-save sa database. Narekord ang kwarta ug naghulat og kumpirmasyon; wala mausab ang balanse.'))}}}>{busy?tr('Saving…','Gi-save…'):tr('Save pending cash','I-save isip pending nga kwarta')}</Button><Button disabled={busy} onClick={()=>{setEntry(draft);setDraft(null);setError('')}}>{tr('Edit payment','Usba ang bayad')}</Button></div>
 </section>}

 {agreement&&!working&&accountReports.length>0&&<section className="card renter-reports-card" aria-labelledby="renter-reports-heading">
  <div className="pending-cash-heading"><div><span className="status status--pending">{tr('Renter report · not cash yet','Report sa nag-abang · dili pa kwarta')}</span><h3 id="renter-reports-heading">{tr('The renter says they paid','Nag-ingon ang nag-abang nga nibayad')}</h3></div><p>{tr('Check with the collector first. Recording it saves pending cash; the verifier still confirms it.','Susiha una sa tigkolekta. Kon irekord, ma-save isip pending nga kwarta; kumpirmahon gihapon sa tigkumpirma.')}</p></div>
  {accountReports.map(r=><article className="cash-row pending-cash-row" key={r.id}><div className="pending-cash-details"><strong className="pending-cash-amount">{decimalPesos(r.amount)}</strong><div><span>{tr('Paid to','Gibayad kang')}</span><strong>{paidToText(r)}</strong></div><div><span>{tr('Date paid','Petsa sa bayad')}</span><strong>{dateText(r.paid_on)}</strong></div>{r.note&&<div><span>{tr('Note','Nota')}</span><strong>{r.note}</strong></div>}</div>
   <div className="person-actions"><Button className="secondary-button" disabled={busy} onClick={()=>{resetCash();setMessage('');setFromReport(r);setEntry({amount:r.amount,date:r.paid_on,collector:r.paid_to==='James'?'James':'Bob'})}}>{tr('Record this cash','Irekord kini nga kwarta')}</Button></div>
   <details className="report-dismiss"><summary>{tr('Not received','Wala madawat')}</summary><form className="rent-setup" onSubmit={e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')).trim();void mutate('resolve_payment_report',{p_report_id:r.id,p_action:'dismissed',p_cash_id:null,p_note:reason},false).then(saved=>{if(saved)setMessage(tr('Marked not received. The renter sees your reason.','Gimarkahan nga wala madawat. Makita sa nag-abang ang imong rason.'))})}}><label htmlFor={`dismiss-${r.id}`}>{tr('Reason the renter will see (required)','Rason nga makita sa nag-abang (kinahanglan)')}</label><input id={`dismiss-${r.id}`} name="reason" required maxLength={300} pattern=".*\S.*" placeholder={tr('Example: no cash received on that day','Pananglitan: walay kwarta nga nadawat niana nga adlaw')} /><Button disabled={busy}>{tr('Mark not received','Markahi nga wala madawat')}</Button></form></details>
  </article>)}
 </section>}

 {agreement&&confirmCard}
 {agreement&&!working&&accountPending.length>0&&<section className="card pending-cash-card" aria-labelledby="pending-cash-heading">
  <div className="pending-cash-heading"><div><span className="status status--pending">{tr('Pending · not confirmed','Pending · wala pa makumpirma')}</span><h3 id="pending-cash-heading">{tr('Waiting for confirmation','Naghulat og kumpirmasyon')}</h3></div><p>{tr('These reports do not reduce the rent balance.','Kini nga mga report dili makapakunhod sa balanse sa abang.')}</p></div>
  {accountPending.map(c=><article className="cash-row pending-cash-row" key={c.id}><div className="pending-cash-details"><strong className="pending-cash-amount">{decimalPesos(c.amount)}</strong><div><span>{tr('Collected by','Gidawat ni')}</span><strong>{c.collector}</strong></div><div><span>{tr('Date received','Petsa nga nadawat')}</span><strong>{dateText(c.received_on)}</strong></div></div>{verifier?<Button className="secondary-button" disabled={busy} onClick={()=>{setError('');setMessage('');setReview(c)}}>{tr('Review cash','Susiha ang kwarta')}</Button>:<p className="field-help">{tr('Only the designated cash verifier can confirm.','Ang gi-assign nga tigkumpirma lang ang makakumpirma.')}</p>}</article>)}
 </section>}

 {agreement&&!working&&<>
 <div className="account-tabs" role="tablist" aria-label={tr('Account details','Detalye sa account')}>{accountTabs.map(([key,label],index)=><button key={key} type="button" role="tab" id={`account-tab-${key}`} aria-controls={`account-panel-${key}`} aria-selected={accountTab===key} tabIndex={accountTab===key?0:-1} className="account-tab" onClick={()=>setAccountTab(key)} onKeyDown={tabKeys(accountTabs,index,setAccountTab,'account-tab')}>{label}</button>)}</div>
 <section className="card rent-month-card account-panel" role="tabpanel" id="account-panel-months" aria-labelledby="account-tab-months" hidden={accountTab!=='months'}>
  {!accountCharges.length&&<p>{tr('No rent months added yet. Add the first month below.','Wala pay bulan sa abang. Idugang ang unang bulan sa ubos.')}</p>}
  <div className="rent-month-list">{[...accountCharges].sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(c=>{const paid=toCents(c.remaining)===0n;return <article className="rent-month-row" key={c.id}><div className="rent-month-date"><strong>{monthText(c.rental_month)}</strong><span>{tr('Due date','Petsa sa bayranan')}: {dateText(c.due_date)}</span></div><div className="rent-month-amounts"><div><span>{tr('Rent charged','Abang nga gisingil')}</span><strong>{decimalPesos(c.amount)}</strong></div><div className={`rent-month-remaining${paid?' rent-month-remaining--paid':''}`}><span>{tr('Still to pay','Nabilin nga bayranan')}</span><strong>{paid?tr('Paid','Bayad na'):decimalPesos(c.remaining)}</strong></div></div></article>})}</div>
  <form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('add_rent_month',{p_agreement_id:agreement.id,p_month:String(f.get('month'))+'-01'})}}><label htmlFor="saved-month">{tr('Month to add','Bulan nga idugang')}</label><input id="saved-month" name="month" type="month" defaultValue={today.slice(0,7)} required /><p className="field-help">{tr('Adds','Idugang ang')} {decimalPesos(agreement.rent)} {tr('due on the move-in day of that month. Each month is added once.','nga bayran sa adlaw sa pagsulod niana nga bulan. Kausa ra madugang ang matag bulan.')}</p><Button disabled={busy}>{tr('Add agreed monthly rent','Idugang ang gisabotang abang sa bulan')}</Button></form>
  <p className="field-help">{tr('Late payment does not move the next due date. No late fees are added.','Dili mausab ang sunod petsa sa bayad kon maulahi. Walay multa nga idugang.')}</p>
 </section>
 <div role="tabpanel" id="account-panel-history" aria-labelledby="account-tab-history" className="account-panel" hidden={accountTab!=='history'}>
  <AccountStatement tenantName={agreementTenant?.display_name??tr('Tenant record unavailable','Wala makita ang rekord sa nag-abang')} rentalSpace={`${agreementBuilding?.label??tr('Building unavailable','Wala makita ang bilding')} / ${agreementUnit?.label??tr('Room unavailable','Wala makita ang kwarto')}`} charges={accountCharges} cash={data.cash.filter(c=>c.agreement_id===agreement.id)} openAcknowledgment={setReceipt} owner={owner} busy={busy} reverse={(cashId,reason)=>mutate('reverse_rent_cash',{p_cash_id:cashId,p_reason:reason})} language={language} />
 </div>
 <section className="card room-rent-setup-card account-panel" role="tabpanel" id="account-panel-setup" aria-labelledby="account-tab-setup" hidden={accountTab!=='setup'}>
  <div className="current-room-rent"><div><span>{tr('Monthly room rent','Binulan nga abang sa kwarto')}</span><strong>{decimalPesos(agreement.rent)}</strong></div><p>{tr('Moved in','Misulod')} {dateText(agreement.move_in)}. {tr('Rent is due on that day each month (the last day in shorter months).','Bayran ang abang niana nga adlaw matag bulan (kataposang adlaw sa mubo nga bulan).')}</p></div>
  <p className="field-help">{tr('The move-in date and monthly rent stay as agreed. Changing the rent amount is not available in the app yet.','Ang petsa sa pagsulod ug binulan nga abang magpabilin sumala sa kasabutan. Dili pa mausab ang kantidad sa abang sa app.')}</p>
  {!agreement.ended_on&&<details className="card change-room"><summary>{tr('Change room (still renting)','Usba ang kwarto (nag-abang gihapon)')}</summary><p>{tr('Moves this tenant to another vacant room from the date you choose. The same account, monthly rent, due day and balance continue; the room history is kept.','Ibalhin kini nga nag-abang sa laing bakante nga kwarto sugod sa petsa nga imong pilion. Pareho gihapon ang account, binulan nga abang, adlaw sa bayranan ug balanse; gitipigan ang kasaysayan sa kwarto.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('change_agreement_room',{p_agreement_id:agreement.id,p_unit_id:String(f.get('unit')),p_effective:String(f.get('date')),p_reason:String(f.get('reason')).trim()}).then(saved=>{if(saved)setMessage(tr('Room changed. Rent and balance continue on the same account.','Nausab ang kwarto. Padayon ang abang ug balanse sa parehas nga account.'))})}}><label htmlFor="change-room-unit">{tr('New room','Bag-ong kwarto')}</label><select id="change-room-unit" name="unit" required><option value="">{tr('Choose a vacant room','Pagpili og bakante nga kwarto')}</option>{data.units.filter(u=>u.id!==agreement.unit_id&&!data.agreements.some(a=>a.unit_id===u.id&&(!a.ended_on||a.ended_on>=today))).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="change-room-date">{tr('Moved on','Petsa sa pagbalhin')}</label><input id="change-room-date" name="date" type="date" defaultValue={today} min={agreement.move_in} max={today} required /><label htmlFor="change-room-reason">{tr('Reason (required)','Rason (kinahanglan)')}</label><input id="change-room-reason" name="reason" required maxLength={500} pattern=".*\S.*" placeholder={tr('Example: moved to a bigger room','Pananglitan: nibalhin sa mas dako nga kwarto')} /><Button disabled={busy} className="primary">{tr('Save room change','I-save ang pagbalhin og kwarto')}</Button></form></details>}
  {!agreement.ended_on&&owner&&<details className="card move-out"><summary>{tr('Record move-out','Irekord ang pagbalhin')}</summary><p>{tr('Full months only: the move-out month is charged in full and no rent is added after it. Unpaid rent stays owed. The room becomes free for a new agreement starting the day after.','Tibuok bulan lamang: bayran sa tibuok ang bulan sa pagbalhin ug walay abang nga madugang human niini. Utang gihapon ang wala mabayri. Mahimong bag-ong kasabotan ang kwarto sugod sa sunod nga adlaw.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('end_rental_agreement',{p_agreement_id:agreement.id,p_end_date:String(f.get('end')),p_reason:String(f.get('reason')).trim()})}}><label htmlFor="move-out-date">{tr('Move-out date','Petsa sa pagbalhin')}</label><input id="move-out-date" name="end" type="date" min={agreement.move_in} required /><label htmlFor="move-out-reason">{tr('Reason (required)','Rason (kinahanglan)')}</label><input id="move-out-reason" name="reason" required maxLength={500} pattern=".*\S.*" /><Button disabled={busy} className="primary">{tr('Save move-out','I-save ang pagbalhin')}</Button></form></details>}
 </section>
 </>}
 </div>
 </div>}

 {view==='tools'&&<>
 <div className="account-tabs pay-tabs" role="tablist" aria-label={tr('More payment tools','Uban pang gamit sa bayad')}>{tools.map(([key,label],index)=><button key={key} type="button" role="tab" id={`pay-tab-${key}`} aria-controls={`pay-panel-${key}`} aria-selected={tool===key} tabIndex={tool===key?0:-1} className="account-tab" onClick={()=>setTool(key)} onKeyDown={tabKeys(tools,index,setTool,'pay-tab')}>{label}</button>)}</div>
 <div role="tabpanel" id="pay-panel-confirm" aria-labelledby="pay-tab-confirm" className="pay-panel" hidden={tool!=='confirm'}>
 <section className="card cash-verification-queue" aria-labelledby="cash-queue-heading">
  <div className="section-heading"><div><h3 id="cash-queue-heading">{tr('Cash awaiting confirmation','Kwarta nga naghulat og kumpirmasyon')}</h3><p>{pendingCash.length} {tr('pending records across this property','pending nga rekord niini nga propiedad')}</p></div></div>
  {!pendingCash.length?<p role="status">{tr('No cash is awaiting confirmation.','Walay kwarta nga naghulat og kumpirmasyon.')}</p>:pendingCash.map(c=>{
   const row=rows.find(r=>r.agreementId===c.agreement_id)
   return <article className="cash-queue-row" key={c.id}>
    <div><strong>{row?.tenant??tr('Tenant record unavailable','Wala makita ang rekord sa nag-abang')}</strong><p>{row?.location.replace(' · ',' / ')??tr('Room unavailable','Wala makita ang kwarto')}</p></div>
    <div><strong>{decimalPesos(c.amount)}</strong><p>{tr('Received','Nadawat')} {c.received_on} {tr('by','ni')} {c.collector}</p></div>
    <p className="status status--pending">{tr('Pending verification','Naghulat og kumpirmasyon')}</p>
    {verifier?<Button disabled={busy} onClick={()=>setReview(c)}>{tr('Review confirmation','Susiha ang kumpirmasyon')}</Button>:<p className="field-help">{tr('Only the designated cash verifier can confirm.','Ang gi-assign nga tigkumpirma lang ang makakumpirma.')}</p>}
   </article>
  })}
 </section>
 {confirmCard}
 </div>
 <div role="tabpanel" id="pay-panel-checks" aria-labelledby="pay-tab-checks" className="pay-panel" hidden={tool!=='checks'}>
 <CheckHandoverRegister data={data} tenants={tenants.filter(tenant=>tenant.property_id===propertyId)} owner={owner} canRecordCheck={data.clerks.some(clerk=>clerk.user_id===userId)} busy={busy} mutate={mutate} language={language} />
 </div>
 <div role="tabpanel" id="pay-panel-monthly" aria-labelledby="pay-tab-monthly" className="pay-panel" hidden={tool!=='monthly'}>
 <section className={`auto-listing auto-rent ${autoRent?'auto-listing--on':''}`} aria-labelledby="auto-rent-heading"><div><h3 id="auto-rent-heading">{tr('Add monthly rent automatically','Awtomatikong idugang ang binulan nga abang')}</h3><p>{autoRent?tr('On: on the 1st of each month (Philippine time), every current tenant gets that month\'s rent at their agreed amount, due on their usual day. Nothing is added after a move-out, and a month is never added twice.','On: matag 1 sa bulan, ang matag nag-abang makadawat sa abang niana nga bulan sa gikasabutang kantidad, bayran sa naandan nga adlaw. Walay madugang human sa pagbalhin, ug dili madoble.'):autoRent===false?tr('Off: rent is added only when staff add it below. When turned on, this month\'s rent is added now for every current tenant who does not have it yet.','Off: madugang lang ang abang kon idugang sa staff sa ubos. Kon i-on, idugang karon ang abang niining bulana sa matag nag-abang nga wala pa.'):tr('Automatic rent needs the latest database update.','Kinahanglan ang bag-ong database update alang sa awtomatikong abang.')}</p></div>{owner&&autoRent!==null?<Button className={autoRent?'secondary-button':'primary'} disabled={busy} aria-pressed={autoRent} onClick={async()=>{const result=await mutate('set_auto_rent',{p_enabled:!autoRent},false);if(result!==false){setAutoRent(!autoRent);setMessage(autoRent?tr('Automatic monthly rent is off.','Off na ang awtomatikong abang.'):tr(`Automatic monthly rent is on. ${typeof result==='number'?result:0} charge(s) added for this month.`,`On na ang awtomatikong abang. ${typeof result==='number'?result:0} ka bayranan ang nadugang karong bulana.`))}}}>{autoRent?tr('Turn off','I-off'):tr('Turn on','I-on')}</Button>:<span className={`status ${autoRent?'status--ready':''}`}>{autoRent?tr('On','On'):tr('Off','Off')}</span>}</section>
 <MonthlyRentBatch data={data} tenants={tenants} busy={busy} addMonth={(agreementId,month)=>mutate('add_rent_month',{p_agreement_id:agreementId,p_month:`${month}-01`})} language={language} />
 </div>
 <div role="tabpanel" id="pay-panel-setup" aria-labelledby="pay-tab-setup" className="pay-panel" hidden={tool!=='setup'}>
 <section className="card saved-readiness" aria-labelledby="saved-readiness-heading">
  <h3 id="saved-readiness-heading">{tr('Saved workflow readiness','Andam ba ang pagrekord?')}</h3>
  <p>{t.pending}</p>
  <ul>
   <li><span className={verifierAssigned?'readiness-state readiness-state--ready':'readiness-state'}>{verifierAssigned?tr('Ready','Andam'):tr('Needs setup','Kinahanglan i-set up')}</span><div><strong>{tr('Cash verifier','Tigkumpirma sa kwarta')}</strong><p>{verifierAssigned?tr('An owner-designated verifier is assigned.','Gi-assign sa tag-iya ang tigkumpirma.'):tr('No verifier is assigned, so pending cash cannot be confirmed yet.','Walay tigkumpirma nga gi-assign, busa dili pa makumpirma ang pending nga kwarta.')}</p></div>{owner&&!verifierAssigned&&<Button onClick={openVerifierSetup}>{tr('Open verifier setup','Ablihi ang setup sa tigkumpirma')}</Button>}</li>
   <li><span className={data.agreements.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.agreements.length?`${data.agreements.length} ${tr('saved','na-save')}`:tr('Needs setup','Kinahanglan i-set up')}</span><div><strong>{tr('Room agreements','Mga kasabotan sa kwarto')}</strong><p>{data.agreements.length?tr('Tenants with a room appear in Record and confirm.','Ang mga nag-abang nga naay kwarto makita sa Irekord ug kumpirmaha.'):tr('No agreements yet. Add a tenant with a room to start.','Wala pay kasabotan. Idugang ang nag-abang uban ang kwarto aron magsugod.')}</p></div></li>
   <li><span className={data.charges.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.charges.length?`${data.charges.length} ${tr('saved','na-save')}`:tr('Needs setup','Kinahanglan i-set up')}</span><div><strong>{tr('Monthly rent charges','Mga bayranan sa abang matag bulan')}</strong><p>{data.charges.length?tr('Only saved charges appear in rent balances.','Ang mga bayranan nga na-save lang ang makita sa balanse sa abang.'):tr('No charges are saved; no rent is assumed or generated automatically.','Walay bayranan nga na-save; walay abang nga gihunahuna o awtomatikong gihimo.')}</p></div></li>
   <li><span className="readiness-state">{pendingCash.length+confirmedCount} {tr('records','ka rekord')}</span><div><strong>{tr('Cash status','Kahimtang sa kwarta')}</strong><p>{pendingCash.length} {tr('awaiting confirmation','naghulat og kumpirmasyon')} · {confirmedCount} {tr('confirmed','nakumpirma')}</p></div></li>
  </ul>
  {!verifierAssigned&&<p className="field-help">{tr('Before assigning a verifier, confirm the clerk’s email with them in person. Do not guess from a display name.','Sa dili pa mo-assign og tigkumpirma, kumpirmaha una ang email sa clerk diha kaniya. Ayaw pagtag-an base sa display name.')}</p>}
 </section>
 <details className="card create-agreement"><summary>{tr('Give an existing tenant a room','Hatagi og kwarto ang naa nang nag-abang')}</summary><p>{tr('For tenants already in the directory. New tenants get their room in Add tenant. One responsible tenant per room; the move-in day sets monthly due dates.','Para sa mga naa na sa lista. Ang bag-ong nag-abang makakuha og kwarto sa Idugang ang nag-abang. Usa ka responsable matag kwarto; ang adlaw sa pagsulod maoy basihan sa petsa sa bayranan.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(!String(f.get('tenant'))){setError(tr('Choose the responsible tenant first.','Pilia una ang responsableng nag-abang.'));return};void mutate('create_rental_agreement',{p_tenant_id:String(f.get('tenant')),p_unit_id:String(f.get('unit')),p_move_in:String(f.get('start')),p_rent:String(f.get('rent'))})}}><TenantPicker label={tr('Responsible tenant','Responsableng nag-abang')} name="tenant" tenants={tenants.filter(t=>!t.archived_at&&!t.removed_at&&!data.agreements.some(a=>a.tenant_id===t.id&&(!a.ended_on||a.ended_on>=today)))} value={newAgreementTenant} onChange={setNewAgreementTenant} language={language} /><label htmlFor="agreement-unit">{tr('Room','Kwarto')}</label><select id="agreement-unit" name="unit" required><option value="">{tr('Choose room','Pagpili og kwarto')}</option>{data.units.filter(u=>!data.agreements.some(a=>a.unit_id===u.id&&!a.ended_on)).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="agreement-start">{tr('Move-in date','Petsa sa pagsulod')}</label><input id="agreement-start" name="start" type="date" required /><label htmlFor="agreement-rent">{tr('Monthly room rent (PHP)','Abang sa kwarto matag bulan (PHP)')}</label><input id="agreement-rent" name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required /><Button disabled={busy}>{tr('Save agreement','I-save ang kasabotan')}</Button></form></details>
 {owner&&<details ref={verifierSetup} className="card verifier-setup"><summary>{tr('Designate an existing clerk as cash verifier','Pagpili og clerk nga mahimong tigkumpirma sa kwarta')}</summary><p>{tr('Type the clerk\'s email (confirm it with them first). The app finds their account; check it is the right person, then assign. This does not create an account or send email.','Isulat ang email sa clerk (kumpirmaha una kaniya). Pangitaon sa app ang ilang account; susiha nga husto ang tawo, dayon i-assign. Dili kini mohimo og account o mopadala og email.')}</p>
  <form className="rent-setup" onSubmit={async e=>{e.preventDefault();setVerifierMatch(null);setError('');const {data:found,error:findError}=await supabase!.rpc('find_account_for_assignment',{p_property_id:propertyId,p_email:verifierEmail.trim()});if(findError){setError(tr('The account could not be looked up. Owner access with the authenticator is required.','Wala makita ang account. Kinahanglan ang access sa tag-iya uban ang authenticator.'));return}const match=found as {id:string;email:string;accepted:boolean;staff_role:string|null}|null;if(!match){setError(tr('No account has this exact email. Check the spelling or invite the clerk first.','Walay account nga ingon ani nga email. Susiha ang spelling o dapita una ang clerk.'));return}if(match.staff_role!=='clerk'||!match.accepted){setError(tr('This account is not an active clerk yet. Give it Clerk access in Accounts & security first.','Dili pa aktibo nga clerk kini nga account. Hatagi una og Clerk nga access sa Account ug kaluwasan.'));return}setVerifierMatch({id:match.id,email:match.email})}}>
   <label htmlFor="verifier-email">{tr('Clerk\'s email','Email sa clerk')}</label><input id="verifier-email" type="email" required value={verifierEmail} onChange={e=>{setVerifierEmail(e.target.value);setVerifierMatch(null)}} />
   <Button className="secondary-button" disabled={busy}>{tr('Find clerk','Pangitaa ang clerk')}</Button>
  </form>
  {verifierMatch&&<div className="notice" role="status"><p><strong>{verifierMatch.email}</strong> · {tr('active clerk account','aktibo nga clerk')}</p><Button className="primary" disabled={busy} onClick={async()=>{const done=await mutate('assign_cash_verifier',{p_user_id:verifierMatch.id,p_email:verifierMatch.email},false);if(done!==false){setVerifierMatch(null);setMessage(tr('Cash verifier assigned. This clerk can now confirm cash.','Na-assign ang tigkumpirma. Makakumpirma na kini nga clerk sa kwarta.'))}}}>{tr('Assign as cash verifier','I-assign isip tigkumpirma')}</Button></div>}
 </details>}
 <details className="card term-help"><summary>{t.simpleWords}</summary><p>{t.simpleWordsHelp}</p>
  <dl className="term-help-list">
   <div><dt>{tr('Balance','Balanse')}</dt><dd>{tr('Rent recorded here that has not been paid yet.','Pila pa sa gi-record nga abang ang wala mabayri.')}</dd></div>
   <div><dt>{tr('Pending cash','Kwarta nga pending')}</dt><dd>{tr('Cash was reported, but not confirmed yet. It does not lower the balance.','Giingon nga nadawat na ang kwarta, pero wala pa kumpirmahi. Dili pa kini moubos sa balanse.')}</dd></div>
   <div><dt>{tr('Check received','Tseke nga nadawat')}</dt><dd>{tr('It is not counted as paid until the bank confirms it.','Dili pa isipon nga bayad hangtod mokumpirma ang bangko.')}</dd></div>
   <div><dt>{tr('Reversal','Pagbawi')}</dt><dd>{tr('The owner cancels an earlier confirmation and must give a reason.','Gibawi sa tag-iya ang miaging kumpirmasyon ug kinahanglan mohatag og rason.')}</dd></div>
   <div><dt>{tr('Handover','Pagtugyan')}</dt><dd>{tr('The clerk gives the collected cash and checks to the owner.','Gitugyan sa clerk ngadto sa tag-iya ang nakolektang kwarta ug mga tseke.')}</dd></div>
  </dl>
 </details>
 </div>
 </>}
 {view==='report'&&<SavedPaidRentReport data={data} tenants={tenants.filter(tenant=>tenant.property_id===propertyId)} openAcknowledgment={setReceipt} propertyName={propertyName} language={language} />}
 </>}
 {receipt&&<CashAcknowledgment data={receipt} close={()=>setReceipt(null)} language={language} />}
 </section>
}
