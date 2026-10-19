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
 function reset() { setEntry(false); setDraft(null); setVerify(null); setError(''); setNotice(''); setDuplicateAccepted(false) }
 function openAccount(id: string) { setSelected(id); reset(); requestAnimationFrame(() => { accountHeading.current?.focus(); accountHeading.current?.scrollIntoView({ block: 'start' }) }) }
 return <section className="payments-preview simple-payments" aria-labelledby="payments-heading">
 <div><p className="eyebrow">{tr('RENT RECORDS','REKORD SA ABANG')}</p><h2 id="payments-heading">{t.paymentRecords}</h2><p>{tr('Find a tenant, record cash, then confirm it.','Pangitaa ang nag-abang, irekord ang kwarta, unya kumpirmaha.')}</p></div>
 <p className="field-help">{tr('Practice only / Fictional amounts / Resets on reload. Confirmation below simulates James; it does not grant account permissions.','Pangpraktis lang / Hinimo-himong kantidad / Mawala inig abli pag-usab. Pagsundog lang ang kumpirmasyon ni James; dili kini mohatag og katungod sa account.')}</p>
 <div className="segmented-control" role="group" aria-label={tr('Payment views','Mga tan-aw sa bayad')}><Button aria-pressed={paymentView === 'records'} onClick={() => setPaymentView('records')}>{tr('Record and confirm','Irekord ug kumpirmaha')}</Button><Button aria-pressed={paymentView === 'paid'} onClick={() => setPaymentView('paid')}>{t.paidReport}</Button></div>
 <div hidden={paymentView !== 'paid'}><PaidRentPreview acknowledgments={acknowledgments} charges={charges} receipts={receipts} rentTerms={terms} addRentMonth={addRentMonth} language={language} /></div>
 <div hidden={paymentView !== 'records'} className="payment-record-view">
 {!entry && !verify && <PaymentOverview charges={charges} receipts={receipts} reports={reports} open={openAccount} language={language} />}
 <div className="card" ref={accountHeading} tabIndex={-1}><label htmlFor="payment-tenant">{tr('1. Choose tenant','1. Pilia ang nag-abang')}</label><select id="payment-tenant" disabled={entry || !!verify} value={tenant.id} onChange={e => { setSelected(e.target.value); reset() }}>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ` (${tr('archived','gi-archive')})`}</option>)}</select><p>{building?.name ?? tr('No building','Walay bilding')} / {room?.label ?? tr('No room assigned','Walay napiling kwarto')}</p>
 <div className="simple-balance"><span>{tr('Rent left to pay','Abang nga bayran pa')}</span><strong>{pesos(balance)}</strong><span>{list.length ? tr('After confirmed cash payments','Human kumpirmahon ang bayad nga kwarta') : tr('No rent charges recorded yet','Wala pay narekord nga abang')}</span></div>
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
 if (possibleDuplicate && !duplicateAccepted) throw new Error('Check the possible duplicate first.')
 if (verify) {
 if (reports.find(r => r.id === verify.id)?.confirmed) throw new Error('This payment is already confirmed.')
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
 {!entry && !verify && pending.length > 0 && <section className="card"><h3>{tr('Waiting for James','Naghulat kang James')}</h3>{pending.map(r => <div className="cash-row" key={r.id}><div><strong>{pesos(r.cents)}</strong><p>{r.collector} /  {dateText(r.date)}</p></div><Button className="secondary-button" onClick={() => { setDuplicateAccepted(false); setVerify(r); setError(''); setNotice('') }}>{tr('Review cash','Susiha ang kwarta')}</Button></div>)}</section>}
 <details className="card"><summary>{tr('Rent by month','Abang kada bulan')}</summary><p>{tr('Room total across accounts:','Kinatibuk-ang abang sa kwarto sa tanang account:')} <strong>{pesos(charges.filter(c => c.room === tenant.room).reduce((sum,c) => sum + remaining(c,receipts),0n))}</strong>. {tr('This is a combined total, not an extra charge.','Kinatibuk-ang kantidad kini, dili dugang nga bayranan.')}</p>{!list.length && <p>{tr('No rent charges yet. Set up rent below.','Wala pay bayranan sa abang. Ibutang ang abang sa ubos.')}</p>}{[...list].sort((a,b) => a.due.localeCompare(b.due)).map(c => <div className="cash-row" key={c.id}><div><strong>{monthText(c.period)}</strong><p>{tr('Due','Bayran sa')} {dateText(c.due)} / {tr('Rent','Abang')} {pesos(c.cents)}</p></div><strong>{remaining(c,receipts) === 0n ? tr('Paid','Bayran na') : pesos(remaining(c,receipts))+' '+tr('left','nahibilin')}</strong></div>)}<p className="field-help">{tr('Late payment does not move the next due date. No late fees are added.','Dili mausab ang sunod petsa sa bayad kon maulahi. Walay multa nga idugang.')}</p></details>
 <details className="card"><summary>{tr('Payment history','Kasaysayan sa bayad')}</summary>{reports.filter(r => r.tenant === tenant.id).map(r => <div className="cash-row" key={r.id}><div><strong>{pesos(r.cents)}</strong><p>{dateText(r.date)} / {tr('Received by','Gidawat ni')} {r.collector}</p></div><span>{r.confirmed ? tr('Confirmed by James','Gikumpirma ni James') : tr('Waiting for James','Naghulat kang James')}</span></div>)}{receipts.filter(r => list.some(c => c.id === r.charge) && r.id === 'cash').map(r => <p key={r.id}>{pesos(r.cents)} / {dateText(r.date)} / {tr('Confirmed example payment','Bayad nga sample, gikumpirma')}</p>)}<p className="field-help">{tr('Checks are not supported in this cash workflow; an uncleared check must never be recorded as confirmed cash.','Dili apil ang tseke niining pagrekord sa kwarta. Ayaw irekord ang tseke nga wala pa kumpirmado sa bangko isip bayad na.')}</p></details>
 <details className="card"><summary>{tr('Room rent setup','Pagbutang sa abang sa kwarto')}</summary><p>{tr('Rent is per room. Keep the original move-in date: months with fewer days use their last day.','Ang abang para sa matag kwarto. Gamita ang unang petsa sa pagsulod. Sa bulan nga mubo, gamiton ang kataposang adlaw.')}</p><form className="rent-setup" key={tenant.id} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); try { if (!tenant.room) throw new Error(tr('Assign a room first.','Pilia una ang kwarto.')); const start = String(data.get('start')), month = String(data.get('month')), cents = parseAmount(String(data.get('rent'))); const due = anniversaryDue(start, month); if (charges.some(c => c.room === tenant.room && c.period === month)) throw new Error(tr('Rent for this room and month is already recorded.','Narekord na ang abang niining kwarto ug bulan.')); if (terms[tenant.id] && terms[tenant.id].start !== start) throw new Error(tr('Keep the existing move-in date. Changes to an agreement need a separate correction workflow.','Ayaw usba ang petsa sa pagsulod. Kinahanglan lahi nga proseso ang pag-usab sa kasabutan.')); setTerms(old => ({ ...old, [tenant.id]: { start, cents } })); setCharges(old => [...old, { id: crypto.randomUUID(), tenant: tenant.id, room: tenant.room, period: month, due, cents }]); setError(''); setNotice(tr('Monthly rent added in preview. Due ','Nadugang ang abang sa sample. Bayran sa ')+dateText(due)+'.') } catch(e) { setError((e as Error).message) } }}>
 <label htmlFor="rent-start">{tr('Move-in date','Petsa sa pagsulod')}</label><input id="rent-start" name="start" type="date" defaultValue={terms[tenant.id]?.start} readOnly={!!terms[tenant.id]} required />
 <label htmlFor="monthly-rent">{tr('Room rent (PHP)','Abang sa kwarto (PHP)')}</label><input id="monthly-rent" name="rent" inputMode="decimal" defaultValue={terms[tenant.id] ? (terms[tenant.id].cents / 100n).toString()+'.'+(terms[tenant.id].cents % 100n).toString().padStart(2,'0') : ''} required />
 <label htmlFor="rent-month">{tr('Month to add','Bulan nga idugang')}</label><input id="rent-month" name="month" type="month" required /><Button className="secondary-button">{tr("Add this month's rent","Idugang ang abang niining bulana")}</Button></form><p className="field-help">{tr('Existing charges keep their original amounts. Advance payments and automatic monthly posting are not enabled.','Magpabilin ang daang kantidad sa bayranan. Wala pa ang daan nga bayad ug automatic nga pagrekord kada bulan.')}</p></details>
 </div>
 </section>
}
