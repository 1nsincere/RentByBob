import type { CashAcknowledgmentData } from './CashAcknowledgment'
import { PaidRentPreview } from './PaidRentPreview'
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
export function PaymentsPreview() {
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
 <div><p className="eyebrow">RENT RECORDS</p><h2 id="payments-heading">Payments and balances</h2><p>Find a tenant, record cash, then confirm it.</p></div>
 <p className="field-help">Practice only / Fictional amounts / Resets on reload. Confirmation below simulates James; it does not grant account permissions.</p>
 <div className="segmented-control" role="group" aria-label="Payment views"><Button aria-pressed={paymentView === 'records'} onClick={() => setPaymentView('records')}>Record and confirm</Button><Button aria-pressed={paymentView === 'paid'} onClick={() => setPaymentView('paid')}>Paid rent</Button></div>
 <div hidden={paymentView !== 'paid'}><PaidRentPreview acknowledgments={acknowledgments} charges={charges} receipts={receipts} rentTerms={terms} addRentMonth={addRentMonth} /></div>
 <div hidden={paymentView !== 'records'} className="payment-record-view">
 {!entry && !verify && <PaymentOverview charges={charges} receipts={receipts} reports={reports} open={openAccount} />}
 <div className="card" ref={accountHeading} tabIndex={-1}><label htmlFor="payment-tenant">1. Choose tenant</label><select id="payment-tenant" disabled={entry || !!verify} value={tenant.id} onChange={e => { setSelected(e.target.value); reset() }}>{tenants.map(t => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (archived)'}</option>)}</select><p>{building?.name ?? 'No building'} / {room?.label ?? 'No room assigned'}</p>
 <div className="simple-balance"><span>Rent left to pay</span><strong>{pesos(balance)}</strong><span>{list.length ? 'After confirmed cash payments' : 'No rent charges recorded yet'}</span></div>
 {pending.length > 0 && <p>{pending.length} cash {pending.length === 1 ? 'record needs' : 'records need'} James's confirmation. Balance has not been reduced.</p>}
 {!entry && !verify && <Button className="primary" disabled={balance === 0n} onClick={() => { reset(); setEntry(true) }}>Record cash payment</Button>}
 </div>
 {error && <p role="alert" className="notice">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
 {entry && <div className="card payment-entry"><h3>2. Enter cash received</h3><form hidden={!!draft} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); try { const cents = parseAmount(String(data.get('amount'))); oldestFirst(list, receipts, cents); const date = String(data.get('date')); if (!validBusinessDate(date) || date > today) throw new Error('Choose the actual date, no later than today.'); setDuplicateAccepted(false); setDraft({ id: crypto.randomUUID(), tenant: tenant.id, cents, date, collector: String(data.get('collector')), confirmed: false }); setError('') } catch(e) { setError((e as Error).message) } }}>
 <label htmlFor="payment-amount">How much was received? (PHP)</label><input id="payment-amount" name="amount" inputMode="decimal" required placeholder="e.g. 2500.00" />
 <label htmlFor="payment-date">When was it received?</label><input id="payment-date" name="date" type="date" defaultValue={today} max={today} required />
 <label htmlFor="payment-collector">Who received the cash?</label><select id="payment-collector" name="collector"><option>Bob</option><option>James</option></select>
 <div className="person-actions"><Button className="primary">Review payment</Button><Button type="button" onClick={reset}>Cancel</Button></div></form></div>}
 {review && <div className="card payment-review"><h3>{verify ? 'Confirm cash received' : '3. Check the payment'}</h3><p><strong>{pesos(review.cents)}</strong> received by {review.collector} on {dateText(review.date)}</p><p>Oldest unpaid rent is covered first:</p>{reviewError ? <p role="alert">{reviewError}</p> : <ul>{allocations.map(a => <li key={a.charge}>{monthText(charges.find(c => c.id === a.charge)!.period)}: <strong>{pesos(a.cents)}</strong></li>)}</ul>}<p>{verify ? 'Confirm only after checking that the cash was received. This action is reserved for James in the planned saved workflow.' : 'This will wait for James to confirm. The balance stays unchanged for now.'}</p><div>{possibleDuplicate && <label className="duplicate-warning"><input type="checkbox" checked={duplicateAccepted} onChange={e => setDuplicateAccepted(e.target.checked)} /> A payment for the same amount and date already exists. I checked that this is a separate payment.</label>}</div><div className="person-actions"><Button className="primary" disabled={!!reviewError || (!!possibleDuplicate && !duplicateAccepted)} onClick={() => {
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
 reset(); setNotice('Cash confirmed in preview. The remaining balance is updated.')
 } else { processed.current.add(review.id + ':record'); setReports(old => old.some(r => r.id === review.id) ? old : [...old, review]); reset(); setNotice('Cash recorded. Waiting for James to confirm.') }
 } catch(e) { setError((e as Error).message) }
 }}>{verify ? 'Confirm as James (preview)' : 'Save pending record'}</Button><Button onClick={() => { setVerify(null); setDraft(null); setError('') }}>{verify ? 'Cancel' : 'Edit payment'}</Button></div></div>}
 {!entry && !verify && pending.length > 0 && <section className="card"><h3>Waiting for James</h3>{pending.map(r => <div className="cash-row" key={r.id}><div><strong>{pesos(r.cents)}</strong><p>{r.collector} /  {dateText(r.date)}</p></div><Button className="secondary-button" onClick={() => { setDuplicateAccepted(false); setVerify(r); setError(''); setNotice('') }}>Review cash</Button></div>)}</section>}
 <details className="card"><summary>Rent by month</summary><p>Room total across accounts: <strong>{pesos(charges.filter(c => c.room === tenant.room).reduce((sum,c) => sum + remaining(c,receipts),0n))}</strong>. This is a combined total, not an extra charge.</p>{!list.length && <p>No rent charges yet. Set up rent below.</p>}{[...list].sort((a,b) => a.due.localeCompare(b.due)).map(c => <div className="cash-row" key={c.id}><div><strong>{monthText(c.period)}</strong><p>Due {dateText(c.due)} / Rent {pesos(c.cents)}</p></div><strong>{remaining(c,receipts) === 0n ? 'Paid' : pesos(remaining(c,receipts))+' left'}</strong></div>)}<p className="field-help">Late payment does not move the next due date. No late fees are added.</p></details>
 <details className="card"><summary>Payment history</summary>{reports.filter(r => r.tenant === tenant.id).map(r => <div className="cash-row" key={r.id}><div><strong>{pesos(r.cents)}</strong><p>{dateText(r.date)} / Received by {r.collector}</p></div><span>{r.confirmed ? 'Confirmed by James' : 'Waiting for James'}</span></div>)}{receipts.filter(r => list.some(c => c.id === r.charge) && r.id === 'cash').map(r => <p key={r.id}>{pesos(r.cents)} / {dateText(r.date)} / Confirmed example payment</p>)}<p className="field-help">Checks are not supported in this cash workflow; an uncleared check must never be recorded as confirmed cash.</p></details>
 <details className="card"><summary>Room rent setup</summary><p>Rent is per room. Keep the original move-in date: months with fewer days use their last day.</p><form className="rent-setup" key={tenant.id} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); try { if (!tenant.room) throw new Error('Assign a room first.'); const start = String(data.get('start')), month = String(data.get('month')), cents = parseAmount(String(data.get('rent'))); const due = anniversaryDue(start, month); if (charges.some(c => c.room === tenant.room && c.period === month)) throw new Error('Rent for this room and month is already recorded.'); if (terms[tenant.id] && terms[tenant.id].start !== start) throw new Error('Keep the existing move-in date. Changes to an agreement need a separate correction workflow.'); setTerms(old => ({ ...old, [tenant.id]: { start, cents } })); setCharges(old => [...old, { id: crypto.randomUUID(), tenant: tenant.id, room: tenant.room, period: month, due, cents }]); setError(''); setNotice('Monthly rent added in preview. Due '+dateText(due)+'.') } catch(e) { setError((e as Error).message) } }}>
 <label htmlFor="rent-start">Move-in date</label><input id="rent-start" name="start" type="date" defaultValue={terms[tenant.id]?.start} readOnly={!!terms[tenant.id]} required />
 <label htmlFor="monthly-rent">Room rent (PHP)</label><input id="monthly-rent" name="rent" inputMode="decimal" defaultValue={terms[tenant.id] ? (terms[tenant.id].cents / 100n).toString()+'.'+(terms[tenant.id].cents % 100n).toString().padStart(2,'0') : ''} required />
 <label htmlFor="rent-month">Month to add</label><input id="rent-month" name="month" type="month" required /><Button className="secondary-button">Add this month's rent</Button></form><p className="field-help">Existing charges keep their original amounts. Advance payments and automatic monthly posting are not enabled.</p></details>
 </div>
 </section>
}
