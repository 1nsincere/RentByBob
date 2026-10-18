import { CashAcknowledgment, type CashAcknowledgmentData } from './CashAcknowledgment'
import { Button } from '../components/atoms'
import { useState } from 'react'
import { useProperty } from './property-preview-store'
import { confirmedPayments, pesos, remaining, philippineToday, validBusinessDate, type Charge, type Receipt } from './payment-preview-model'

export function PaidRentPreview({ charges, receipts, acknowledgments = {} }: { charges: Charge[]; receipts: Receipt[]; acknowledgments?: Record<string,CashAcknowledgmentData> }) {
  const [receipt, setReceipt] = useState<CashAcknowledgmentData|null>(null)
  const { tenants, buildings } = useProperty()
  const [month, setMonth] = useState(philippineToday().slice(0, 7))
  const payments = confirmedPayments(receipts, month)
  const total = payments.reduce((sum, p) => sum + p.cents, 0n)
  const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))
  const formatMonth = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T00:00:00Z'))
  return <section className="paid-rent-summary" aria-labelledby="paid-rent-heading">
    <h3 id="paid-rent-heading">Paid rent</h3>
    <p>Confirmed rent payments received during the month. Includes partial payments.</p>
    <div className="card"><label htmlFor="paid-month">Payment month</label><input id="paid-month" type="month" value={month} onChange={e => setMonth(e.target.value)} />
      <div className="simple-balance" aria-live="polite"><span>Confirmed payments received</span><strong>{pesos(total)}</strong><span>{payments.length} {payments.length === 1 ? 'payment' : 'payments'}{validBusinessDate(month + '-01') ? ` in ${formatMonth(month)}` : ''}</span></div>
      <p className="field-help">Based on the date cash was received, not when James confirmed it. Pending records and uncleared checks are excluded.</p>
    </div>
    {!payments.length && <div className="card empty-state"><h4>No confirmed payments for this month</h4><p>Choose another month, or confirm a pending cash record after checking receipt.</p></div>}
    <div className="paid-payment-list">{payments.map(payment => {
      const charge = charges.find(c => c.id === payment.allocations[0].charge)
      const tenant = tenants.find(t => t.id === charge?.tenant)
      const building = buildings.find(b => b.floors.some(f => f.rooms.some(r => r.id === charge?.room)))
      const room = building?.floors.flatMap(f => f.rooms).find(r => r.id === charge?.room)
      return <article className="card" key={payment.id}><div className="cash-row"><div><h4>{tenant?.name ?? 'Tenant unavailable'}</h4><p>{building?.name ?? 'Building unavailable'} / {room?.label ?? 'Room unavailable'}</p><p>Received {formatDate(payment.date)}</p></div><strong className="paid-amount">{pesos(payment.cents)}</strong></div>
        <p><strong>Rent covered by this payment</strong></p>
        <ul className="paid-allocation-list">{payment.allocations.map(a => { const c = charges.find(c => c.id === a.charge); const left = c ? remaining(c, receipts) : null; return <li key={a.id}><span>{c ? formatMonth(c.period) : 'Rent period unavailable'}: {pesos(a.cents)}</span><span className="field-help">{left === 0n ? 'This rent month is fully paid now' : left !== null ? `${pesos(left)} still left for this rent month` : 'Balance unavailable'}</span></li> })}</ul>
        <p className="field-help">Remaining amounts reflect all confirmed payments, including payments received in other months.</p>
        {acknowledgments[payment.id] && <Button onClick={() => setReceipt(acknowledgments[payment.id])}>Open acknowledgment</Button>}
      </article>
    })}</div>
    {receipt && <CashAcknowledgment data={receipt} close={() => setReceipt(null)} preview />}
  </section>
}
