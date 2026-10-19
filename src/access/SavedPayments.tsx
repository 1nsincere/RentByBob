import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { supabase, type Tenant } from './client'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { AccountStatement } from './AccountStatement'
import { hasPositiveSavedBalance, parseRentWorkspaceSnapshot, savedCashFitsBalance, type RentWorkspaceSnapshot, type SavedCashRecord } from './saved-payments-model'
import { SavedPaidRentReport } from './SavedPaidRentReport'
import { CheckHandoverRegister } from './CheckHandoverRegister'
import { copy, text, type Language } from '../i18n'

export function SavedPayments({ propertyId, tenants, owner, userId, language = 'en' }: { propertyId:string; tenants:Tenant[]; owner:boolean; userId:string; language?:Language }) {
 const t = copy[language]
 const tr = (english:string,bisaya:string) => text(language,english,bisaya)
 const [data,setData] = useState<RentWorkspaceSnapshot|null>(null), [error,setError] = useState(''), [message,setMessage] = useState('')
 const [selected,setSelected] = useState(''), [receipt,setReceipt] = useState<CashAcknowledgmentData|null>(null)
 const [view,setView] = useState<'records'|'report'>('records')
 const bisayaHelp = language === 'ceb'
 const languageRef = useRef(language)
 useEffect(()=>{languageRef.current=language},[language])
 const [review,setReview] = useState<SavedCashRecord|null>(null), [busy,setBusy] = useState(false)
 const verifierSetup = useRef<HTMLDetailsElement>(null)
 const request = useRef<{key:string;id:string}|null>(null), sending = useRef(false)
 const refresh = useCallback(async () => {
  let result
  try {
   result = await supabase!.rpc('read_rent_workspace',{p_property_id:propertyId})
  } catch {
   setData(null); setError(text(languageRef.current,'Saved rent records could not be loaded. Check your connection and refresh; nothing was changed.','Wala makarga ang mga rekord sa abang. Susiha ang koneksyon ug i-refresh; walay nausab.')); return
  }
  if(result.error) { setData(null); setError(text(languageRef.current,'Saved rent records are unavailable. The cash migration must be applied and your staff MFA session must be active. Nothing has been saved by this screen.','Dili makita ang mga rekord sa abang. Kinahanglan ma-apply ang cash migration ug aktibo ang MFA session sa staff. Walay na-save niini nga screen.')); return }
  try {
   setData(parseRentWorkspaceSnapshot(result.data, tenants))
   setError('')
  } catch {
   setData(null)
   setError(text(languageRef.current,'Saved rent records could not be validated, so financial details are hidden. Contact the system administrator; nothing was changed.','Wala makapasa sa pagsusi ang mga rekord sa abang, busa gitago ang detalye sa kwarta. Kontaka ang administrator; walay nausab.'))
  }
 },[propertyId,tenants])
 useEffect(()=>{setData(null);setSelected('');setReview(null);setReceipt(null);setError('');void refresh()},[refresh])
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
    save:tr('Save could not be confirmed. Retry unchanged to avoid duplicates.','Wala makumpirma ang pag-save. Sulayi pag-usab nga walay kausaban aron malikayan ang doble nga rekord.'),
   }; setError(result.error.code==='42501'?messages.unauthorized:name==='record_collection_handover'&&result.error.code==='22023'?messages.handover:name==='transition_rent_check'&&result.error.code==='22023'?messages.transition:name==='record_rent_check'&&result.error.code==='22023'?messages.check:result.error.code==='23505'?messages.duplicate:result.error.code==='22023'?messages.amount:messages.save); if(['42501','23505','22023'].includes(result.error.code??''))request.current=null; return false }
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
 const agreement=data?.agreements.find(a=>a.id===selected)
 const agreementUnit=agreement&&data?.units.find(u=>u.id===agreement.unit_id)
 const agreementBuilding=agreementUnit&&data?.buildings.find(b=>b.id===agreementUnit.building_id)
 const agreementTenant=agreement&&tenants.find(t=>t.id===agreement.tenant_id)
 const verifier=data?.verifiers.some(v=>v.user_id===userId)??false
 const verifierAssigned=(data?.verifiers.length??0)>0
 const pendingCount=data?.cash.filter(c=>!c.confirmed_at).length??0
 const confirmedCount=(data?.cash.length??0)-pendingCount
 const pendingCash=data?.cash.filter(c=>!c.confirmed_at)??[]
 return <section className="payments-preview simple-payments"><h2>{t.savedRent}</h2><p>{t.pending}</p>
 <section className="card term-help" aria-labelledby="term-help-heading" aria-live="polite">
  <div className="section-heading"><div><h3 id="term-help-heading">{t.simpleWords}</h3><p>{t.simpleWordsHelp}</p></div></div>
  <dl className="term-help-list">
   <div><dt>{bisayaHelp?'Balanse (Balance)':'Balance'}</dt><dd>{bisayaHelp?'Pila pa sa gi-record nga abang ang wala mabayri.':'Rent recorded here that has not been paid yet.'}</dd></div>
   <div><dt>{bisayaHelp?'Kwarta nga pending (Pending cash)':'Pending cash'}</dt><dd>{bisayaHelp?'Giingon nga nadawat na ang kwarta, pero wala pa kini kumpirmahi. Dili pa kini moubos sa balanse.':'Cash was reported, but staff have not confirmed it. It does not lower the balance yet.'}</dd></div>
   <div><dt>{bisayaHelp?'Tseke nga nadawat (Check received)':'Check received'}</dt><dd>{bisayaHelp?'Nadawat na ang tseke. Dili pa kini isipon nga bayad hangtod mokumpirma ang bangko.':'The check was received. It is not counted as paid until the bank confirms it.'}</dd></div>
   <div><dt>{bisayaHelp?'Bayad na (Cleared)':'Cleared'}</dt><dd>{bisayaHelp?'Gikumpirma sa bangko nga nabayran ang tseke.':'The bank confirmed the check was paid.'}</dd></div>
   <div><dt>{bisayaHelp?'Gibalik (Returned)':'Returned'}</dt><dd>{bisayaHelp?'Wala gibayri sa bangko ang tseke. Idugang pag-usab sa balanse ang abang.':'The bank did not pay the check. The rent is added back to the balance.'}</dd></div>
   <div><dt>{bisayaHelp?'Pagbalik sa kumpirmasyon (Reversal)':'Reversal'}</dt><dd>{bisayaHelp?'Gibawi sa tag-iya ang miaging kumpirmasyon ug kinahanglan mohatag og rason.':'The owner cancels an earlier confirmation and must give a reason.'}</dd></div>
   <div><dt>{bisayaHelp?'Pagtugyan (Handover)':'Handover'}</dt><dd>{bisayaHelp?'Gitugyan sa clerk ngadto sa tag-iya ang nakolektang kwarta ug mga tseke.':'The clerk gives the collected cash and checks to the owner.'}</dd></div>
  </dl>
 </section>
 {error&&<p className="notice" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
 <Button disabled={busy} onClick={()=>void refresh()}>{tr('Refresh saved records','I-refresh ang mga rekord')}</Button>
 {!data&&!error&&<LoadingSkeleton label={tr('Loading saved records…','Gikarga ang mga rekord…')} rows={4} />}
  {data&&<>
  <div className="segmented-control" role="group" aria-label={bisayaHelp?'Mga rekord sa bayad':'Payment records view'}><Button aria-pressed={view==='records'} onClick={()=>setView('records')}>{t.savedView}</Button><Button aria-pressed={view==='report'} onClick={()=>setView('report')}>{t.paidReport}</Button></div>
  {view==='records'&&<>
 <section className="card saved-readiness" aria-labelledby="saved-readiness-heading">
  <h3 id="saved-readiness-heading">{tr('Saved workflow readiness','Andam ba ang pagrekord?')}</h3>
  <p>{tr('These are live database records. Review the real tenant, room and agreed rent terms before saving anything.','Mga tinuod kining rekord sa database. Susiha una ang nag-abang, kwarto ug gisabotang abang sa dili pa magrekord.')}</p>
  <ul>
   <li><span className={verifierAssigned?'readiness-state readiness-state--ready':'readiness-state'}>{verifierAssigned?tr('Ready','Andam'):tr('Needs setup','Kinahanglan i-set up')}</span><div><strong>{tr('Cash verifier','Tigkumpirma sa kwarta')}</strong><p>{verifierAssigned?tr('An owner-designated verifier is assigned.','Gi-assign sa tag-iya ang tigkumpirma.'):tr('No verifier is assigned, so pending cash cannot be confirmed yet.','Walay tigkumpirma nga gi-assign, busa dili pa makumpirma ang pending nga kwarta.')}</p></div>{owner&&!verifierAssigned&&<Button onClick={openVerifierSetup}>{tr('Open verifier setup','Ablihi ang setup sa tigkumpirma')}</Button>}</li>
   <li><span className={data.agreements.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.agreements.length?`${data.agreements.length} ${tr('saved','na-save')}`:tr('Needs setup','Kinahanglan i-set up')}</span><div><strong>{tr('Room agreements','Mga kasabotan sa kwarto')}</strong><p>{data.agreements.length?tr('Saved agreements are listed below.','Naa sa ubos ang mga kasabotan nga na-save.'):data.units.length?tr('No agreements are saved. Add one only after the actual rent terms are reviewed.','Walay kasabotan nga na-save. Idugang lang human masusi ang tinuod nga kasabotan sa abang.'):tr('No active rental spaces are available for an agreement.','Walay aktibong lugar nga paabangan nga mahimo og kasabotan.')}</p></div></li>
   <li><span className={data.charges.length?'readiness-state readiness-state--ready':'readiness-state'}>{data.charges.length?`${data.charges.length} ${tr('saved','na-save')}`:tr('Needs setup','Kinahanglan i-set up')}</span><div><strong>{tr('Monthly rent charges','Mga bayranan sa abang matag bulan')}</strong><p>{data.charges.length?tr('Only saved charges appear in rent balances.','Ang mga bayranan nga na-save lang ang makita sa balanse sa abang.'):tr('No charges are saved; no rent is assumed or generated automatically.','Walay bayranan nga na-save; walay abang nga gihunahuna o awtomatikong gihimo.')}</p></div></li>
   <li><span className="readiness-state">{pendingCount+confirmedCount} {tr('records','ka rekord')}</span><div><strong>{tr('Cash status','Kahimtang sa kwarta')}</strong><p>{pendingCount} {tr('awaiting confirmation','naghulat og kumpirmasyon')} · {confirmedCount} {tr('confirmed','nakumpirma')}</p></div></li>
  </ul>
  {!verifierAssigned&&<p className="field-help">{tr('Before assigning a verifier, the owner must independently confirm the existing clerk account ID and confirmed email. Do not guess from a display name.','Sa dili pa mo-assign og tigkumpirma, kumpirmahon una sa tag-iya ang account ID ug kumpirmadong email sa clerk. Ayaw pagtag-an base sa display name.')}</p>}
 </section>
 <section className="card cash-verification-queue" aria-labelledby="cash-queue-heading">
  <div className="section-heading"><div><h3 id="cash-queue-heading">{tr('Cash awaiting confirmation','Kwarta nga naghulat og kumpirmasyon')}</h3><p>{pendingCash.length} {tr('pending records across this property','pending nga rekord niini nga propiedad')}</p></div></div>
  {!pendingCash.length?<p role="status">{tr('No cash is awaiting confirmation.','Walay kwarta nga naghulat og kumpirmasyon.')}</p>:pendingCash.map(c=>{
   const linkedAgreement=data.agreements.find(a=>a.id===c.agreement_id)
   const tenant=linkedAgreement&&tenants.find(t=>t.id===linkedAgreement.tenant_id)
   const unit=linkedAgreement&&data.units.find(u=>u.id===linkedAgreement.unit_id)
   const building=unit&&data.buildings.find(b=>b.id===unit.building_id)
   return <article className="cash-queue-row" key={c.id}>
    <div><strong>{tenant?.display_name??tr('Tenant record unavailable','Wala makita ang rekord sa nag-abang')}</strong><p>{building?.label??tr('Building unavailable','Wala makita ang bilding')} / {unit?.label??tr('Room unavailable','Wala makita ang kwarto')}</p></div>
    <div><strong>{decimalPesos(c.amount)}</strong><p>{tr('Received','Nadawat')} {c.received_on} {tr('by','ni')} {c.collector}</p></div>
    <p className="status status--pending">{tr('Pending verification','Naghulat og kumpirmasyon')}</p>
    {verifier?<Button disabled={busy} onClick={()=>setReview(c)}>{tr('Review confirmation','Susiha ang kumpirmasyon')}</Button>:<p className="field-help">{tr('Only the designated cash verifier can confirm.','Ang gi-assign nga tigkumpirma lang ang makakumpirma.')}</p>}
   </article>
  })}
 </section>
 {review&&<section className="card cash-confirmation-review" aria-labelledby="cash-confirm-heading"><h3 id="cash-confirm-heading">{tr('Confirm cash received?','Kumpirmaha ang nadawat nga kwarta?')}</h3><p>{decimalPesos(review.amount)} {tr('received by','gidawat ni')} {review.collector} {tr('on','niadtong')} {review.received_on}.</p><p>{tr('Confirm only after checking receipt of the cash. It will cover the oldest unpaid rent first and issue a permanent acknowledgment.','Kumpirmaha lang human masusi nga nadawat ang kwarta. Ibutang kini una sa pinakadaan nga wala mabayring abang ug maghimo og permanenteng resibo.')}</p><div className="person-actions"><Button disabled={busy} className="primary" onClick={async()=>{const result=await mutate('confirm_rent_cash',{p_cash_id:review.id},false);if(result){setReview(null);setReceipt(result as CashAcknowledgmentData)}}}>{tr('Confirm and issue acknowledgment','Kumpirmaha ug paghimo og resibo')}</Button><Button disabled={busy} onClick={()=>setReview(null)}>{tr('Cancel','Kansela')}</Button></div></section>}
 <CheckHandoverRegister data={data} tenants={tenants.filter(tenant=>tenant.property_id===propertyId)} owner={owner} canRecordCheck={data.clerks.some(clerk=>clerk.user_id===userId)} busy={busy} mutate={mutate} language={language} />
 <div className="card"><label htmlFor="saved-agreement">{tr('Tenant / room agreement','Kasabotan sa nag-abang / kwarto')}</label><select id="saved-agreement" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setReview(null)}}><option value="">{tr('Choose an agreement','Pagpili og kasabotan')}</option>{data.agreements.map(a=><option key={a.id} value={a.id}>{tenants.find(t=>t.id===a.tenant_id)?.display_name??'Tenant'} / {data.units.find(u=>u.id===a.unit_id)?.label??'Room'}</option>)}</select></div>
 {agreement&&<><div className="card simple-balance"><span>{tr('Rent left to pay','Nabilin nga abang')}</span><strong>{decimalPesos(agreement.balance)}</strong><span>{tr('After confirmed cash only','Human sa kumpirmadong kwarta lang')}</span></div>
 {hasPositiveSavedBalance(agreement.balance)?<form className="card rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const amount=String(f.get('amount'));if(!savedCashFitsBalance(amount,agreement.balance)){setError(tr('Enter a positive amount no greater than the recorded rent balance. Advance payments are not configured, so no cash report was saved.','Isulod ang kantidad nga labaw sa sero ug dili molapas sa narekord nga balanse sa abang. Wala pa ma-set up ang advance nga bayad, busa walay report nga na-save.'));return}void mutate('record_rent_cash',{p_agreement_id:agreement.id,p_amount:amount,p_received_on:String(f.get('date')),p_collector:String(f.get('collector'))})}}><h3>{tr('Record cash received','Irekord ang nadawat nga kwarta')}</h3><p>{tr('Report money already handed to an authorized collector. The balance will not change until the designated verifier confirms it.','Ireport ang kwarta nga gitugyan na sa gitugot nga tigkolekta. Dili mausab ang balanse hangtod kumpirmahon sa gi-assign nga tigkumpirma.')}</p><label htmlFor="saved-amount">{tr('Amount (PHP)','Kantidad (PHP)')}</label><input id="saved-amount" name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" aria-describedby="saved-amount-help" required /><p id="saved-amount-help" className="field-help">{tr('Must not exceed the current rent balance of','Dili molapas sa kasamtangang balanse sa abang nga')} {decimalPesos(agreement.balance)}. {tr('Advance payments are not configured.','Wala pa ma-set up ang advance nga bayad.')}</p><label htmlFor="saved-date">{tr('Actual payment date','Tinuod nga petsa sa bayad')}</label><input id="saved-date" name="date" type="date" required /><label htmlFor="saved-collector">{tr('Received by','Gidawat ni')}</label><select id="saved-collector" name="collector"><option>Bob</option><option>James</option></select><Button disabled={busy} className="primary">{tr('Save pending cash','I-save isip pending nga kwarta')}</Button></form>:<div className="card"><h3>{tr('Cash report unavailable','Dili magamit ang report sa kwarta')}</h3><p>{tr('There is no recorded rent balance for this agreement. Add only an owner-approved monthly rent charge before recording cash; this screen will not accept advance payments.','Walay narekord nga balanse sa abang niini nga kasabotan. Idugang lang ang bayranan sa bulan nga giuyonan sa tag-iya una magrekord og kwarta; dili modawat og advance nga bayad kini nga screen.')}</p></div>}
 <AccountStatement tenantName={agreementTenant?.display_name??tr('Tenant record unavailable','Wala makita ang rekord sa nag-abang')} rentalSpace={`${agreementBuilding?.label??tr('Building unavailable','Wala makita ang bilding')} / ${agreementUnit?.label??tr('Room unavailable','Wala makita ang kwarto')}`} charges={data.charges.filter(c=>c.agreement_id===agreement.id)} cash={data.cash.filter(c=>c.agreement_id===agreement.id)} openAcknowledgment={setReceipt} language={language} />
 <details className="card"><summary>{tr('Monthly rent','Abang matag bulan')}</summary>{data.charges.filter(c=>c.agreement_id===agreement.id).map(c=><p key={c.id}>{c.rental_month.slice(0,7)} / {tr('Due','Takdang petsa')} {c.due_date} / {decimalPesos(c.amount)} / {tr('Remaining','Nabilin')} {decimalPesos(c.remaining)}</p>)}<form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('add_rent_month',{p_agreement_id:agreement.id,p_month:String(f.get('month'))+'-01'})}}><label htmlFor="saved-month">{tr('Month to add','Bulan nga idugang')}</label><input id="saved-month" name="month" type="month" required /><Button disabled={busy}>{tr('Add agreed monthly rent','Idugang ang gisabotang abang sa bulan')}</Button></form></details>
  </>}
 <details className="card"><summary>{tr('Create room rental agreement','Paghimo og kasabotan sa abang sa kwarto')}</summary><p>{tr('One responsible tenant per room. Other occupants are not separately charged. Move-in day sets monthly due dates.','Usa ka responsable nga nag-abang matag kwarto. Dili bulag nga paninglon ang ubang nagpuyo. Ang adlaw sa pagsulod maoy basihan sa takdang petsa matag bulan.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('create_rental_agreement',{p_tenant_id:String(f.get('tenant')),p_unit_id:String(f.get('unit')),p_move_in:String(f.get('start')),p_rent:String(f.get('rent'))})}}><label htmlFor="agreement-tenant">{tr('Responsible tenant','Responsableng nag-abang')}</label><select id="agreement-tenant" name="tenant" required><option value="">{tr('Choose tenant','Pagpili og nag-abang')}</option>{tenants.filter(t=>!t.archived_at).map(t=><option key={t.id} value={t.id}>{t.display_name}</option>)}</select><label htmlFor="agreement-unit">{tr('Room','Kwarto')}</label><select id="agreement-unit" name="unit" required><option value="">{tr('Choose room','Pagpili og kwarto')}</option>{data.units.filter(u=>!data.agreements.some(a=>a.unit_id===u.id)).map(u=><option key={u.id} value={u.id}>{data.buildings.find(b=>b.id===u.building_id)?.label} / {u.label}</option>)}</select><label htmlFor="agreement-start">{tr('Move-in date','Petsa sa pagsulod')}</label><input id="agreement-start" name="start" type="date" required /><label htmlFor="agreement-rent">{tr('Monthly room rent (PHP)','Abang sa kwarto matag bulan (PHP)')}</label><input id="agreement-rent" name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required /><Button disabled={busy}>{tr('Save agreement','I-save ang kasabotan')}</Button></form></details>
 {owner&&<details ref={verifierSetup} className="card"><summary>{tr('Designate an existing clerk as cash verifier','Pagpili og clerk nga mahimong tigkumpirma sa kwarta')}</summary><p>{tr('Select the approved clerk account by its account ID and exact confirmed email. Verify both through trusted account management first. This does not create an account or send email.','Pilia ang giuyonan nga account sa clerk pinaagi sa account ID ug eksaktong kumpirmadong email. Susiha una kini pinaagi sa kasaligan nga pagdumala sa account. Dili kini mohimo og account o mopadala og email.')}</p><form className="rent-setup" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('assign_cash_verifier',{p_user_id:String(f.get('id')),p_email:String(f.get('email'))},false)}}><label htmlFor="verifier-id">{tr('Existing clerk account ID','Account ID sa clerk')}</label><input id="verifier-id" name="id" required /><label htmlFor="verifier-email">{tr('Confirmed email','Kumpirmadong email')}</label><input id="verifier-email" name="email" type="email" required /><Button disabled={busy}>{tr('Assign cash verifier','I-assign ang tigkumpirma sa kwarta')}</Button></form></details>}
  </>}
  {view==='report'&&<SavedPaidRentReport data={data} tenants={tenants.filter(tenant=>tenant.property_id===propertyId)} openAcknowledgment={setReceipt} language={language} />}
 </>}
 {receipt&&<CashAcknowledgment data={receipt} close={()=>setReceipt(null)} language={language} />}
 </section>
}
