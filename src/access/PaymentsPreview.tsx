import type { CashAcknowledgmentData } from './CashAcknowledgment'
import { PaidRentPreview } from './PaidRentPreview'
import { copy, type Language } from '../i18n'
﻿import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { useProperty, change } from './property-preview-store'
import { PaymentOverview } from './PaymentOverview'
import { validBusinessDate, parseAmount, pesos, remaining, oldestFirst, anniversaryDue, philippineToday, type Charge, type Receipt } from './payment-preview-model'
type Report = { id: string; tenant: string; cents: bigint; date: string; collector: string; confirmed: boolean }
type Terms = { start: string; cents: bigint }
type RentChangeReview = { month: string; cents: bigint; due: string; previousCents: bigint }
const examples: Charge[] = [
 { id: 'sep', tenant: 'alex', room: 'bob-1', period: '2026-09', due: '2026-09-01', cents: 500000n },
 { id: 'oct', tenant: 'alex', room: 'bob-1', period: '2026-10', due: '2026-10-01', cents: 500000n },
 { id: 'mara-oct', tenant: 'mara', room: 'bob-3', period: '2026-10', due: '2026-10-15', cents: 450000n },
]
export function PaymentsPreview({ language = 'en' }: { language?: Language }) {
 const t = copy[language]
 const bi = language === 'ceb'
 const tr = (en: string, ceb: string) => bi ? ceb : en
 const { tenants, buildings, paymentTenant } = useProperty()
 const [charges, setCharges] = useState(examples)
 const [receipts, setReceipts] = useState<Receipt[]>([{ id: 'cash', charge: 'sep', date: '2026-10-02', cents: 300000n, status: 'Settled cash', reference: 'Fictional receipt' }])
 const [reports, setReports] = useState<Report[]>([{ id: 'bob-note', tenant: 'alex', cents: 100000n, date: '2026-10-10', collector: 'Bob', confirmed: false }])
 const [terms, setTerms] = useState<Record<string, Terms>>({ alex: { start: '2026-09-01', cents: 500000n }, mara: { start: '2026-08-15', cents: 450000n } })
 const [selected, setSelected] = useState('alex'), [entry, setEntry] = useState(false), [draft, setDraft] = useState<Report | null>(null), [verify, setVerify] = useState<Report | null>(null)
 const [acknowledgments, setAcknowledgments] = useState<Record<string,CashAcknowledgmentData>>({})
 const [paymentView, setPaymentView] = useState('records')
 // One account panel visible at a time instead of three stacked expandable boxes.
 const [accountTab, setAccountTab] = useState<'months' | 'history' | 'setup'>('months')
 const [editingRent, setEditingRent] = useState(false)
 const [rentAmountInput, setRentAmountInput] = useState('')
 const [rentChangeReview, setRentChangeReview] = useState<RentChangeReview | null>(null)
 const [rentFormVersion, setRentFormVersion] = useState(0)
 const processed = useRef(new Set<string>())
 const accountHeading = useRef<HTMLDivElement>(null)
 const [duplicateAccepted, setDuplicateAccepted] = useState(false)
 const [error, setError] = useState(''), [notice, setNotice] = useState('')
 const tenant = tenants.find(t => t.id === selected) ?? tenants[0]
 useEffect(() => { if (paymentTenant) { setPaymentView('records'); setSelected(paymentTenant); setEntry(false); setDraft(null); setVerify(null); setError(''); setNotice(''); change({ paymentTenant: '' }); requestAnimationFrame(() => accountHeading.current?.focus()) } }, [paymentTenant])
 const list = charges.filter(c => c.tenant === tenant.id)
 const balance = list.reduce((sum,c) => sum + remaining(c, receipts), 0n)
 const pending = reports.filter(r => r.tenant === tenant.id && !r.confirmed)
 const building = buildings.find(b => b.id === tenant.building)
 const room = building?.floors.flatMap(f => f.rooms).find(r => r.id === tenant.room)
 const today = philippineToday()
 function addRentMonth(tenantId: string, month: string) {
  const renter = tenants.find(item => item.id === tenantId)
  const setup = terms[tenantId]
  if (!renter?.active || !renter.room || !setup) return 'A current renter, room and saved rent setup are required.'
  if (charges.some(charge => charge.room === renter.room && charge.period === month)) return 'A rent charge already exists for this room and month.'
  try {
   const due = anniversaryDue(setup.start, month)
   setCharges(old => [...old, { id: crypto.randomUUID(), tenant: tenantId, room: renter.room, period: month, due, cents: setup.cents }])
   return ''
  } catch (cause) {
   return cause instanceof Error ? cause.message : 'Could not add this rent month.'
  }
 }
 const review = verify ?? draft
 const possibleDuplicate = review && reports.some(r => r.id !== review.id && r.tenant === review.tenant && r.date === review.date && r.cents === review.cents)
 let allocations: ReturnType<typeof oldestFirst> = []
 let reviewError = ''
 if (review) { try { allocations = oldestFirst(list, receipts, review.cents) } catch (e) { reviewError = (e as Error).message } }
 const dateText = (date: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date+'T00:00:00Z'))
 const monthText = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month+'-01T00:00:00Z'))
 const formatRentAmount = (cents: bigint) => `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, '0')}`
 useEffect(() => {
  if (!tenant) return
  setRentAmountInput(terms[tenant.id] ? formatRentAmount(terms[tenant.id].cents) : '')
 }, [tenant.id])
 useEffect(() => {
  if (!tenant) return
  const current = terms[tenant.id] ? formatRentAmount(terms[tenant.id].cents) : ''
  if (!editingRent) {
   setRentAmountInput(current)
  }
 }, [tenant, terms, editingRent, rentChangeReview])
 function reset() { setEntry(false); setDraft(null); setVerify(null); setError(''); setNotice(''); setDuplicateAccepted(false) }
 function openAccount(id: string) { setSelected(id); reset(); requestAnimationFrame(() => { accountHeading.current?.focus(); accountHeading.current?.scrollIntoView({ block: 'start' }) }) }
 return <section className="payments-preview simple-payments" aria-labelledby="payments-heading">
 <div><p className="eyebrow">{tr('RENT RECORDS','REKORD SA ABANG')}</p><h2 id="payments-heading">{t.paymentRecords}</h2><p>{tr('Find a tenant, record cash, then confirm it.','Pangitaa ang nag-abang, irekord ang kwarta, unya kumpirmaha.')}</p></div>
 <p className="field-help">{tr('Practice only / Fictional amounts / Resets on reload. Confirmation below simulates James; it does not grant account permissions.','Pangpraktis lang / Hinimo-himong kantidad / Mawala inig abli pag-usab. Pagsundog lang ang kumpirmasyon ni James; dili kini mohatag og katungod sa account.')}</p>
 <div className="segmented-control" role="group" aria-label={tr('Payment views','Mga tan-aw sa bayad')}><Button aria-pressed={paymentView === 'records'} onClick={() => setPaymentView('records')}>{tr('Record and confirm','Irekord ug kumpirmaha')}</Button><Button aria-pressed={paymentView === 'paid'} onClick={() => setPaymentView('paid')}>{t.paidReport}</Button></div>
 <div hidden={paymentView !== 'paid'}><PaidRentPreview acknowledgments={acknowledgments} charges={charges} receipts={receipts} rentTerms={terms} addRentMonth={addRentMonth} language={language} /></div>
 <div hidden={paymentView !== 'records'} className={`payment-record-view${!entry && !verify ? ' payment-record-view--with-worklist' : ''}`}>
 {!entry && !verify && <PaymentOverview charges={charges} receipts={receipts} reports={reports} open={openAccount} language={language} />}
 <div className="account-workspace">
 <div className="card" ref={accountHeading} tabIndex={-1}><label htmlFor="payment-tenant">{tr('1. Choose tenant','1. Pilia ang nag-abang')}</label><select id="payment-tenant" disabled={entry || !!verify} value={tenant.id} onChange={e => { setSelected(e.target.value); setEditingRent(false); setRentChangeReview(null); reset() }}>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ` (${tr('archived','gi-archive')})`}</option>)}</select><p>{building?.name ?? tr('No building','Walay bilding')} / {room?.label ?? tr('No room assigned','Walay napiling kwarto')}</p>
 <div className="account-summary">
 <div className="simple-balance"><span>{tr('Rent left to pay','Abang nga bayran pa')}</span><strong>{pesos(balance)}</strong><span>{list.length ? tr('After confirmed cash payments','Human kumpirmahon ang bayad nga kwarta') : tr('No rent charges recorded yet','Wala pay narekord nga abang')}</span></div>
 <div className="account-summary__stat"><span>{tr('Waiting for confirmation','Naghulat og kumpirmasyon')}</span><strong>{pesos(pending.reduce((sum, r) => sum + r.cents, 0n))}</strong><span>{pending.length} {tr(pending.length === 1 ? 'report · not counted yet' : 'reports · not counted yet','ka report · wala pa maihap')}</span></div>
 <div className="account-summary__stat"><span>{tr('Monthly room rent','Binulan nga abang sa kwarto')}</span><strong>{terms[tenant.id] ? pesos(terms[tenant.id].cents) : tr('Not set','Wala pa')}</strong><span>{list.length} {tr(list.length === 1 ? 'month recorded' : 'months recorded','ka bulan narekord')}</span></div>
 </div>
 {pending.length > 0 && <p>{tr(`${pending.length} cash record needs James's confirmation. Balance has not been reduced.`,`${pending.length} ka rekord sa kwarta naghulat sa kumpirmasyon ni James. Wala pa moubos ang balanse.`)}</p>}
 {!entry && !verify && <Button className="primary" disabled={balance === 0n} onClick={() => { reset(); setEntry(true) }}>{tr('Record cash payment','Irekord ang bayad nga kwarta')}</Button>}
 </div>
 {error && <p role="alert" className="notice">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
 {entry && <div className="card payment-entry"><h3>{tr('2. Enter cash received','2. Isulod ang nadawat nga kwarta')}</h3><form hidden={!!draft} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); try { const cents = parseAmount(String(data.get('amount'))); oldestFirst(list, receipts, cents); const date = String(data.get('date')); if (!validBusinessDate(date) || date > today) throw new Error(tr('Choose the actual date, no later than today.','Pilia ang tinuod nga petsa karon o sa miagi.')); setDuplicateAccepted(false); setDraft({ id: crypto.randomUUID(), tenant: tenant.id, cents, date, collector: String(data.get('collector')), confirmed: false }); setError('') } catch(e) { setError((e as Error).message) } }}>
 <label htmlFor="payment-amount">{tr('How much was received? (PHP)','Pila ang nadawat? (PHP)')}</label><input id="payment-amount" name="amount" inputMode="decimal" required placeholder="e.g. 2500.00" />
 <label htmlFor="payment-date">{tr('When was it received?','Kanus-a kini nadawat?')}</label><input id="payment-date" name="date" type="date" defaultValue={today} max={today} required />
 <label htmlFor="payment-collector">{tr('Who received the cash?','Kinsa ang midawat sa kwarta?')}</label><select id="payment-collector" name="collector"><option>Bob</option><option>James</option></select>
 <div className="person-actions"><Button className="primary">{tr('Review payment','Susiha ang bayad')}</Button><Button type="button" onClick={reset}>{tr('Cancel','Kanselahon')}</Button></div></form></div>}
 {review && <div className="card payment-review"><h3>{verify ? tr('Confirm cash received','Kumpirmaha ang nadawat nga kwarta') : tr('3. Check the payment','3. Susiha ang bayad')}</h3><p><strong>{pesos(review.cents)}</strong> {tr('received by','gidawat ni')} {review.collector} {tr('on','niadtong')} {dateText(review.date)}</p><p>{tr('Oldest unpaid rent is covered first:','Ang labing karaan nga wala mabayring abang maoy bayran una:')}</p>{reviewError ? <p role="alert">{reviewError}</p> : <ul>{allocations.map(a => <li key={a.charge}>{monthText(charges.find(c => c.id === a.charge)!.period)}: <strong>{pesos(a.cents)}</strong></li>)}</ul>}<p>{verify ? tr('Confirm only after checking that the cash was received. This action is reserved for James in the planned saved workflow.','Kumpirmaha lang kon nasusi na nga nadawat ang kwarta. Si James ra ang gitugotan niini sa tinuod nga workflow.') : tr('This will wait for James to confirm. The balance stays unchanged for now.','Maghulat kini sa kumpirmasyon ni James. Dili mausab ang balanse karon.')}</p><div>{possibleDuplicate && <label className="duplicate-warning"><input type="checkbox" checked={duplicateAccepted} onChange={e => setDuplicateAccepted(e.target.checked)} /> {tr('A payment for the same amount and date already exists. I checked that this is a separate payment.','Adunay bayad nga pareho og kantidad ug petsa. Gisusi nako nga lahi kini nga bayad.')}</label>}</div><div className="person-actions"><Button className="primary" disabled={!!reviewError || (!!possibleDuplicate && !duplicateAccepted)} onClick={() => {
 try {
 if (processed.current.has(review.id + (verify ? ':confirm' : ':record'))) return
 if (possibleDuplicate && !duplicateAccepted) throw new Error(tr('Check the possible duplicate first.','Susiha una ang posibleng parehas nga bayad.'))
 if (verify) {
 if (reports.find(r => r.id === verify.id)?.confirmed) throw new Error(tr('This payment is already confirmed.','Kumpirmado na kini nga bayad.'))
 const parts = oldestFirst(list, receipts, verify.cents)
 processed.current.add(verify.id + ':confirm')
 const decimal = (c: bigint) => (c/100n).toString()+'.'+(c%100n).toString().padStart(2,'0')
 const acknowledgment: CashAcknowledgmentData = { number:'SAMPLE-'+verify.id, tenant:tenant.name, building:building?.name??'Building', room:room?.label??'Room', property:'Fictional RentByBob property', amount:decimal(verify.cents), received_on:verify.date, collector:verify.collector, issued_at:new Date().toISOString(), balance_at_issuance:decimal(balance-verify.cents), allocations:parts.map(a=>({month:charges.find(c=>c.id===a.charge)!.period+'-01',amount:decimal(a.cents)})) }
 setAcknowledgments(old=>({...old,[verify.id]:acknowledgment}))
 setReceipts(old => [...old, ...parts.map((a,i): Receipt => ({ id: verify.id+'-'+i, paymentId: verify.id, charge: a.charge, date: verify.date, cents: a.cents, status: 'Settled cash', reference: 'Confirmed by James (preview)' }))])
 setReports(old => old.map(r => r.id === verify.id ? { ...r, confirmed: true } : r))
 reset(); setNotice(tr('Cash confirmed in preview. The remaining balance is updated.','Gikumpirma ang sample nga bayad. Nausab ang nahibiling balanse.'))
 } else { processed.current.add(review.id + ':record'); setReports(old => old.some(r => r.id === review.id) ? old : [...old, review]); reset(); setNotice(tr('Cash recorded. Waiting for James to confirm.','Narekord ang kwarta. Naghulat sa kumpirmasyon ni James.')) }
 } catch(e) { setError((e as Error).message) }
 }}>{verify ? tr('Confirm as James (preview)','Kumpirmaha isip si James (preview)') : tr('Save pending record','I-save nga naghulat og kumpirmasyon')}</Button><Button onClick={() => { setVerify(null); setDraft(null); setError('') }}>{verify ? tr('Cancel','Kanselahon') : tr('Edit payment','Usba ang bayad')}</Button></div></div>}
 {!entry && !verify && pending.length > 0 && <section className="card pending-cash-card" aria-labelledby="pending-cash-heading">
  <div className="pending-cash-heading"><div><span className="status status--pending">{tr('Pending · not confirmed','Pending · wala pa makumpirma')}</span><h3 id="pending-cash-heading">{tr('Waiting for James','Naghulat kang James')}</h3></div><p>{tr('This report does not reduce the rent balance.','Kini nga report dili makapakunhod sa balanse sa abang.')}</p></div>
  {pending.map(r => <article className="cash-row pending-cash-row" key={r.id}><div className="pending-cash-details"><strong className="pending-cash-amount">{pesos(r.cents)}</strong><div><span>{tr('Collected by','Gidawat ni')}</span><strong>{r.collector}</strong></div><div><span>{tr('Date received','Petsa nga nadawat')}</span><strong>{dateText(r.date)}</strong></div></div><Button className="secondary-button" onClick={() => { setDuplicateAccepted(false); setVerify(r); setError(''); setNotice('') }}>{tr('Review cash','Susiha ang kwarta')}</Button></article>)}
 </section>}
 <div className="account-tabs" role="tablist" aria-label={tr('Account details','Detalye sa account')}>{([['months', tr('Rent by month','Abang kada bulan')], ['history', tr('Payment history','Kasaysayan sa bayad')], ['setup', tr('Room rent setup','Pagbutang sa abang sa kwarto')]] as const).map(([key, label], index, all) =>
  <button key={key} type="button" role="tab" id={`account-tab-${key}`} aria-controls={`account-panel-${key}`} aria-selected={accountTab === key} tabIndex={accountTab === key ? 0 : -1} className="account-tab"
   onClick={() => setAccountTab(key)}
   onKeyDown={event => { if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return; const next = all[(index + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length][0]; setAccountTab(next); document.getElementById(`account-tab-${next}`)?.focus() }}>{label}</button>)}
 </div>
 <section className="card rent-month-card account-panel" role="tabpanel" id="account-panel-months" aria-labelledby="account-tab-months" hidden={accountTab !== 'months'}>
 <p className="room-total-note"><span>{tr('Combined room balance · all accounts','Kinatibuk-ang balanse sa kwarto · tanang account')}</span><strong>{pesos(charges.filter(c => c.room === tenant.room).reduce((sum,c) => sum + remaining(c,receipts),0n))}</strong><small>{tr('Combined total, not an extra charge.','Kinatibuk-ang kantidad kini, dili dugang nga bayranan.')}</small></p>
 {!list.length && <p>{tr('No rent charges yet. Set up rent below.','Wala pay bayranan sa abang. Ibutang ang abang sa ubos.')}</p>}
 <div className="rent-month-list">{[...list].sort((a,b) => a.due.localeCompare(b.due)).map(c => {
  const left = remaining(c,receipts)
  return <article className="rent-month-row" key={c.id}><div className="rent-month-date"><strong>{monthText(c.period)}</strong><span>{tr('Due date','Petsa sa bayranan')}: {dateText(c.due)}</span></div><div className="rent-month-amounts"><div><span>{tr('Rent charged','Abang nga gisingil')}</span><strong>{pesos(c.cents)}</strong></div><div className={`rent-month-remaining${left === 0n ? ' rent-month-remaining--paid' : ''}`}><span>{tr('Still to pay','Nabilin nga bayranan')}</span><strong>{left === 0n ? tr('Paid','Bayran na') : pesos(left)}</strong></div></div></article>
 })}</div>
 <p className="field-help">{tr('Late payment does not move the next due date. No late fees are added.','Dili mausab ang sunod petsa sa bayad kon maulahi. Walay multa nga idugang.')}</p></section>
 <section className="card payment-history-card account-panel" role="tabpanel" id="account-panel-history" aria-labelledby="account-tab-history" hidden={accountTab !== 'history'}>
  <p className="field-help">{tr('Pending reports are not confirmed payments and do not reduce the rent balance.','Ang mga pending nga report wala pa makumpirma ug dili makapakunhod sa balanse sa abang.')}</p>
  <div className="payment-history-list">
   {reports.filter(r => r.tenant === tenant.id).map(r => <article className={`payment-history-row${r.confirmed ? ' payment-history-row--confirmed' : ' payment-history-row--pending'}`} key={r.id}>
    <div className="payment-history-top"><span className={`status ${r.confirmed ? 'status--ready' : 'status--pending'}`}>{r.confirmed ? tr('Confirmed by James','Gikumpirma ni James') : tr('Pending · not confirmed','Pending · wala pa makumpirma')}</span><strong className="payment-history-amount">{pesos(r.cents)}</strong></div>
    <dl><div><dt>{tr('Date received','Petsa nga nadawat')}</dt><dd>{dateText(r.date)}</dd></div><div><dt>{tr('Received by','Gidawat ni')}</dt><dd>{r.collector}</dd></div></dl>
   </article>)}
   {receipts.filter(r => list.some(c => c.id === r.charge) && r.id === 'cash').map(r => <article className="payment-history-row payment-history-row--confirmed" key={r.id}>
    <div className="payment-history-top"><span className="status status--ready">{tr('Confirmed example payment','Bayad nga sample, gikumpirma')}</span><strong className="payment-history-amount">{pesos(r.cents)}</strong></div>
    <dl><div><dt>{tr('Date received','Petsa nga nadawat')}</dt><dd>{dateText(r.date)}</dd></div></dl>
   </article>)}
   {!reports.some(r => r.tenant === tenant.id) && !receipts.some(r => list.some(c => c.id === r.charge) && r.id === 'cash') && <div className="empty-state"><h4>{tr('No payment records yet','Wala pay rekord sa bayad')}</h4><p>{tr('Confirmed payments and pending reports will appear here.','Dinhi makita ang nakumpirmang bayad ug pending nga report.')}</p></div>}
  </div>
  <p className="field-help">{tr('Checks are not supported in this cash workflow; an uncleared check must never be recorded as confirmed cash.','Dili apil ang tseke niining pagrekord sa kwarta. Ayaw irekord ang tseke nga wala pa kumpirmado sa bangko isip bayad na.')}</p>
 </section>
 <section className="card room-rent-setup-card account-panel" role="tabpanel" id="account-panel-setup" aria-labelledby="account-tab-setup" hidden={accountTab !== 'setup'}>
 <p>{tr('Rent is set per room. The original move-in date stays fixed; in shorter months, the due date uses the last day.','Ang abang gitakda matag kwarto. Dili mausab ang orihinal nga petsa sa pagsulod; sa mubong bulan, ang kataposang adlaw maoy petsa sa bayranan.')}</p>
 {terms[tenant.id] && <div className="current-room-rent"><div><span>{tr('Current monthly room rent','Kasamtangang abang sa kwarto matag bulan')}</span><strong>{pesos(terms[tenant.id].cents)}</strong></div><p>{tr('This is the rate used when you add a new monthly charge.','Kini ang kantidad nga gamiton sa pagdugang og bag-ong bayranan sa bulan.')}</p></div>}
 <form className="rent-setup room-rent-form" key={`${tenant.id}:${rentFormVersion}`} onSubmit={e => {
  e.preventDefault()
  const data = new FormData(e.currentTarget)
  try {
   const roomId = tenant.room
   if (!roomId) throw new Error(tr('Assign a room first.','Pilia una ang kwarto.'))
   const start = String(data.get('start')), month = String(data.get('month')), cents = parseAmount(String(data.get('rent')))
   const due = anniversaryDue(start, month)
   if (charges.some(c => c.room === roomId && c.period === month)) throw new Error(tr('Rent for this room and month is already recorded.','Narekord na ang abang niining kwarto ug bulan.'))
   if (terms[tenant.id] && terms[tenant.id].start !== start) throw new Error(tr('Keep the existing move-in date. Changes to an agreement need a separate correction workflow.','Ayaw usba ang petsa sa pagsulod. Kinahanglan lahi nga proseso ang pag-usab sa kasabutan.'))
   if (terms[tenant.id] && editingRent) {
    setRentChangeReview({ month, cents, due, previousCents: terms[tenant.id].cents })
    setError('')
    return
   }
   setTerms(old => ({ ...old, [tenant.id]: { start, cents } }))
   setCharges(old => [...old, { id: crypto.randomUUID(), tenant: tenant.id, room: roomId, period: month, due, cents }])
   setRentFormVersion(version => version + 1)
   setError('')
   setNotice(tr('Monthly rent added in preview. Due ','Nadugang ang abang sa sample. Bayran sa ')+dateText(due)+'.')
  } catch(e) { setError(e instanceof Error ? e.message : tr('Could not update room rent.','Wala ma-update ang abang sa kwarto.')) }
 }}>
 <label htmlFor="rent-start">{tr('Move-in date','Petsa sa pagsulod')} {terms[tenant.id] && <span className="fixed-field-badge">{tr('Fixed','Naka-fix')}</span>}</label><input id="rent-start" name="start" type="date" defaultValue={terms[tenant.id]?.start} readOnly={!!terms[tenant.id]} disabled={!!rentChangeReview} required />
 <label htmlFor="monthly-rent">{tr('Room rent (PHP)','Abang sa kwarto (PHP)')} {terms[tenant.id] && !editingRent && <span className="fixed-field-badge">{tr('Fixed','Naka-fix')}</span>}</label><input id="monthly-rent" name="rent" inputMode="decimal" value={rentAmountInput} onChange={e => setRentAmountInput(e.target.value)} readOnly={!!terms[tenant.id] && !editingRent} disabled={!!rentChangeReview} aria-describedby={editingRent ? 'rent-change-help' : undefined} required />
 {terms[tenant.id] && <label className="rent-edit-toggle"><input type="checkbox" checked={editingRent} disabled={!!rentChangeReview} onChange={e => {
   const next = e.target.checked
   setEditingRent(next)
   setRentChangeReview(null)
   setError('')
   if (!next) {
    setRentAmountInput(formatRentAmount(terms[tenant.id].cents))
    setRentFormVersion(version => version + 1)
   }
 }} />{tr('Change room rent','Usba ang abang sa kwarto')}</label>}
 {editingRent && <p className="field-help" id="rent-change-help">{tr('The new rate starts with the month selected below. Existing recorded charges will not change.','Magsugod ang bag-ong kantidad sa bulan nga pilion sa ubos. Dili mausab ang mga daang narekord nga bayranan.')}</p>}
 <label htmlFor="rent-month">{tr('Month to add','Bulan nga idugang')}</label><input id="rent-month" name="month" type="month" disabled={!!rentChangeReview} required />
 <Button className="secondary-button" disabled={!!rentChangeReview}>{tr("Add this month's rent","Idugang ang abang niining bulana")}</Button>
 </form>
 {rentChangeReview && <section className="rent-change-review" aria-labelledby="rent-change-review-heading">
  <h4 id="rent-change-review-heading">{tr('Review room rent change','Susiha ang kausaban sa abang sa kwarto')}</h4>
  <p>{tr('Check the new rate and first month before applying it.','Susiha ang bag-ong kantidad ug unang bulan sa dili pa i-save.')}</p>
  <dl><div><dt>{tr('Current room rent','Kasamtangang abang sa kwarto')}</dt><dd>{pesos(rentChangeReview.previousCents)}</dd></div><div><dt>{tr('New room rent','Bag-ong abang sa kwarto')}</dt><dd>{pesos(rentChangeReview.cents)}</dd></div><div><dt>{tr('Starts with rent month','Magsugod sa bulan sa abang')}</dt><dd>{monthText(rentChangeReview.month)}</dd></div><div><dt>{tr('Due date','Petsa sa bayranan')}</dt><dd>{dateText(rentChangeReview.due)}</dd></div></dl>
  <p className="field-help">{tr('Confirming adds this month’s charge and uses the new room rent for charges added later. Existing recorded charges stay unchanged.','Kon kumpirmahon, idugang ang bayranan niining bulana ug gamiton ang bag-ong kantidad sa sunod nga idugang nga bayranan. Dili mausab ang daang narekord nga bayranan.')}</p>
  <div className="person-actions"><Button className="primary" onClick={() => {
   const review = rentChangeReview, current = terms[tenant.id], roomId = tenant.room
   if (!review || !current || !roomId) return
   setTerms(old => ({ ...old, [tenant.id]: { start: current.start, cents: review.cents } }))
   setCharges(old => [...old, { id: crypto.randomUUID(), tenant: tenant.id, room: roomId, period: review.month, due: review.due, cents: review.cents }])
   setNotice(tr('Room rent updated from ','Na-update ang abang sa kwarto sugod sa ')+monthText(review.month)+'. '+tr('Earlier charges stay unchanged.','Dili mausab ang daang bayranan.'))
   setEditingRent(false)
   setRentChangeReview(null)
   setRentFormVersion(version => version + 1)
   setError('')
  }}>{tr('Confirm rent change and add month','Kumpirmaha ang kausaban ug idugang ang bulan')}</Button><Button onClick={() => setRentChangeReview(null)}>{tr('Edit details','Usba ang detalye')}</Button></div>
 </section>}
 <p className="field-help">{tr('Existing charges keep their original amounts. Advance payments and automatic monthly posting are not enabled.','Magpabilin ang daang kantidad sa bayranan. Wala pa ang daan nga bayad ug automatic nga pagrekord kada bulan.')}</p></section>
 </div>
 </div>
 </section>
}
