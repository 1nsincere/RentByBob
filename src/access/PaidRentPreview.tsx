import { CashAcknowledgment, type CashAcknowledgmentData } from './CashAcknowledgment'
import { Button } from '../components/atoms'
import { useState } from 'react'
import { useProperty } from './property-preview-store'
import { anniversaryDue, confirmedPayments, pesos, remaining, philippineToday, validBusinessDate, type Charge, type Receipt } from './payment-preview-model'

type RentTerms = Record<string, { start: string; cents: bigint }>

export function PaidRentPreview({ charges, receipts, acknowledgments = {}, rentTerms = {}, addRentMonth }: {
  charges: Charge[]
  receipts: Receipt[]
  acknowledgments?: Record<string,CashAcknowledgmentData>
  rentTerms?: RentTerms
  addRentMonth: (tenantId: string, month: string) => string
}) {
  const [receipt, setReceipt] = useState<CashAcknowledgmentData|null>(null)
  const { tenants, buildings } = useProperty()
  const [month, setMonth] = useState(philippineToday().slice(0, 7))
  const [rentMonth, setRentMonth] = useState(philippineToday().slice(0, 7))
  const [confirmingTenant, setConfirmingTenant] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const payments = confirmedPayments(receipts, month)
  const total = payments.reduce((sum, payment) => sum + payment.cents, 0n)
  const paidRows = payments.map(payment => {
    const allocatedCharges = payment.allocations.map(allocation => charges.find(charge => charge.id === allocation.charge)).filter((charge): charge is Charge => !!charge)
    const firstCharge = allocatedCharges[0]
    const tenant = tenants.find(item => item.id === firstCharge?.tenant)
    const building = buildings.find(item => item.floors.some(floor => floor.rooms.some(room => room.id === firstCharge?.room)))
    const room = building?.floors.flatMap(floor => floor.rooms).find(item => item.id === firstCharge?.room)
    const rentMonths = [...new Set(allocatedCharges.map(charge => charge.period))].sort()
    return { payment, tenant, building, room, rentMonths }
  })
  const paidRenterCount = new Set(paidRows.flatMap(row => row.tenant ? [row.tenant.id] : [])).size
  const unpaidRows = charges.filter(charge => charge.period === rentMonth && remaining(charge, receipts) > 0n).map(charge => {
    const tenant = tenants.find(item => item.id === charge.tenant)
    const building = buildings.find(item => item.floors.some(floor => floor.rooms.some(room => room.id === charge.room)))
    const room = building?.floors.flatMap(floor => floor.rooms).find(item => item.id === charge.room)
    return { charge, tenant, building, room, due: remaining(charge, receipts) }
  }).sort((a, b) => a.charge.due.localeCompare(b.charge.due) || (a.tenant?.name ?? '').localeCompare(b.tenant?.name ?? ''))
  const unpaidTotal = unpaidRows.reduce((sum, row) => sum + row.due, 0n)
  const unpaidRenterCount = new Set(unpaidRows.flatMap(row => row.tenant ? [row.tenant.id] : [])).size
  const arrearsByTenant = new Map<string, { tenant: (typeof tenants)[number]; building: string; room: string; months: Set<string>; total: bigint }>()
  for (const charge of charges) {
    const due = remaining(charge, receipts)
    if (due <= 0n) continue
    const renter = tenants.find(item => item.id === charge.tenant)
    if (!renter) continue
    const property = buildings.find(item => item.floors.some(floor => floor.rooms.some(itemRoom => itemRoom.id === charge.room)))
    const rentedSpace = property?.floors.flatMap(floor => floor.rooms).find(itemRoom => itemRoom.id === charge.room)
    const summary = arrearsByTenant.get(renter.id) ?? { tenant: renter, building: property?.name ?? 'Building unavailable', room: rentedSpace?.label ?? 'Room unavailable', months: new Set<string>(), total: 0n }
    summary.months.add(charge.period)
    summary.total += due
    arrearsByTenant.set(renter.id, summary)
  }
  const arrearsRows = [...arrearsByTenant.values()].filter(row => row.months.size >= 2)
    .map(row => ({ ...row, periods: [...row.months].sort() }))
    .sort((a, b) => b.periods.length - a.periods.length || a.tenant.name.localeCompare(b.tenant.name))
  const addableTenants = tenants.filter(item => item.active && !!item.room && !!rentTerms[item.id] &&
    validBusinessDate(rentMonth + '-01') && rentTerms[item.id].start.slice(0, 7) <= rentMonth &&
    !charges.some(charge => charge.room === item.room && charge.period === rentMonth))
    .sort((a, b) => a.name.localeCompare(b.name))
  const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))
  const formatMonth = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + '-01T00:00:00Z'))
  const getLocation = (roomId: string) => {
    const property = buildings.find(item => item.floors.some(floor => floor.rooms.some(itemRoom => itemRoom.id === roomId)))
    const rentedSpace = property?.floors.flatMap(floor => floor.rooms).find(itemRoom => itemRoom.id === roomId)
    return `${property?.name ?? 'Building unavailable'} / ${rentedSpace?.label ?? 'Room unavailable'}`
  }
  return <section className="paid-rent-summary" aria-labelledby="paid-rent-heading">
    <div className="paid-report-heading"><div><p className="eyebrow">MONTHLY COLLECTION REPORT</p><h3 id="paid-rent-heading">Paid rent</h3><p>Confirmed rent payments with outstanding rent listed below.</p></div><span className="preview-pill">Fictional preview · Resets on reload</span></div>
    <section className="card paid-report-sheet" aria-label="Confirmed rent payments report">
      <div className="paid-report-toolbar"><div><label htmlFor="paid-month">Cash received during</label><input id="paid-month" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div><span className="paid-report-period">{validBusinessDate(month + '-01') ? formatMonth(month) : 'Select a valid month'}</span></div>
      <div className="paid-report-metrics" aria-live="polite">
        <article><span>Confirmed cash received</span><strong>{pesos(total)}</strong></article>
        <article><span>Renters who paid</span><strong>{paidRenterCount}</strong></article>
        <article><span>Confirmed payments</span><strong>{payments.length}</strong></article>
      </div>
      <p className="field-help">Payments are grouped by receipt and dated by when cash was received, not when James confirmed it. Pending records and uncleared checks are excluded.</p>
      {!paidRows.length ? <div className="paid-report-empty"><h4>No confirmed payments for this month</h4><p>Choose another month, or confirm a pending cash record after checking receipt.</p></div> :
        <div className="paid-table-scroll" role="region" aria-label="Confirmed payments table" tabIndex={0}>
          <table className="paid-report-table">
            <caption>Confirmed rent payments received in {validBusinessDate(month + '-01') ? formatMonth(month) : 'the selected month'}</caption>
            <thead><tr><th scope="col">Renter</th><th scope="col">Rental space</th><th scope="col">Date received</th><th scope="col">Amount</th><th scope="col">Rent months covered</th><th scope="col">Receipt</th></tr></thead>
            <tbody>{paidRows.map(({ payment, tenant, building, room, rentMonths }) => <tr key={payment.id}>
              <td data-label="Renter">{tenant?.name ?? 'Tenant unavailable'}</td>
              <td data-label="Rental space">{building?.name ?? 'Building unavailable'} / {room?.label ?? 'Room unavailable'}</td>
              <td data-label="Date received">{formatDate(payment.date)}</td>
              <td data-label="Amount" className="paid-table-amount">{pesos(payment.cents)}</td>
              <td data-label="Rent months covered">{rentMonths.length ? rentMonths.map(formatMonth).join(', ') : 'Unavailable'}</td>
              <td data-label="Receipt">{acknowledgments[payment.id] ? <Button className="quiet-button" onClick={() => setReceipt(acknowledgments[payment.id])}>Open acknowledgment</Button> : '—'}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={3}>Total confirmed cash received</th><td className="paid-table-amount">{pesos(total)}</td><td colSpan={2}>{payments.length} {payments.length === 1 ? 'payment' : 'payments'} · {paidRenterCount} {paidRenterCount === 1 ? 'renter' : 'renters'}</td></tr></tfoot>
          </table>
        </div>}
    </section>
    <section className="card unpaid-report-sheet" aria-labelledby="unpaid-report-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">OUTSTANDING RENT</p><h4 id="unpaid-report-heading">Renters with rent still due</h4><p>Only recorded rent charges for the selected rent month are included.</p></div><div><label htmlFor="unpaid-month">Rent month</label><input id="unpaid-month" type="month" value={rentMonth} onChange={event => { setRentMonth(event.target.value); setConfirmingTenant(''); setActionMessage('') }} /></div></div>
      <div className="unpaid-report-total"><span>{unpaidRenterCount} {unpaidRenterCount === 1 ? 'renter' : 'renters'} with a remaining balance</span><strong>{pesos(unpaidTotal)}</strong></div>
      {!unpaidRows.length ? <p className="paid-report-empty">{charges.some(charge => charge.period === rentMonth) ? 'No remaining rent for this month.' : 'No rent charges are recorded for this month. Missing setup does not mean rent is unpaid.'}</p> :
        <div className="paid-table-scroll" role="region" aria-label="Outstanding rent table" tabIndex={0}>
          <table className="paid-report-table unpaid-report-table">
            <caption>Rent charges with a remaining balance for {validBusinessDate(rentMonth + '-01') ? formatMonth(rentMonth) : 'the selected month'}</caption>
            <thead><tr><th scope="col">Renter</th><th scope="col">Rental space</th><th scope="col">Due date</th><th scope="col">Rent charged</th><th scope="col">Still due</th></tr></thead>
            <tbody>{unpaidRows.map(({ charge, tenant, building, room, due }) => <tr key={charge.id}>
              <td data-label="Renter">{tenant?.name ?? 'Tenant unavailable'}</td>
              <td data-label="Rental space">{building?.name ?? 'Building unavailable'} / {room?.label ?? 'Room unavailable'}</td>
              <td data-label="Due date">{formatDate(charge.due)}</td>
              <td data-label="Rent charged">{pesos(charge.cents)}</td>
              <td data-label="Still due" className="paid-table-amount">{pesos(due)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={4}>Total still due</th><td className="paid-table-amount">{pesos(unpaidTotal)}</td></tr></tfoot>
          </table>
        </div>}
      <p className="field-help">Partial confirmed cash reduces the remaining balance. Pending reports and uncleared checks do not.</p>
    </section>
    <section className="card arrears-report-sheet" aria-labelledby="arrears-report-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">MULTIPLE MONTHS OUTSTANDING</p><h4 id="arrears-report-heading">Renters with 2 or more unpaid rent months</h4><p>Counts distinct recorded rent months with a remaining balance.</p></div><span className="preview-pill">{arrearsRows.length} {arrearsRows.length === 1 ? 'renter' : 'renters'} flagged</span></div>
      {!arrearsRows.length ? <p className="paid-report-empty">No renter currently has balances in 2 or more recorded rent months.</p> :
        <div className="paid-table-scroll" role="region" aria-label="Renters with multiple unpaid rent months" tabIndex={0}>
          <table className="paid-report-table arrears-report-table">
            <caption>Renters with balances in at least two distinct rent months</caption>
            <thead><tr><th scope="col">Renter</th><th scope="col">Rental space</th><th scope="col">Unpaid months</th><th scope="col">Rent months</th><th scope="col">Total still due</th></tr></thead>
            <tbody>{arrearsRows.map(row => <tr key={row.tenant.id}>
              <td data-label="Renter">{row.tenant.name}</td>
              <td data-label="Rental space">{row.building} / {row.room}</td>
              <td data-label="Unpaid months">{row.periods.length}</td>
              <td data-label="Rent months">{row.periods.map(formatMonth).join(', ')}</td>
              <td data-label="Total still due" className="paid-table-amount">{pesos(row.total)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      <p className="field-help">This is based on rent charges recorded in the preview; it does not identify months without a recorded charge.</p>
    </section>
    <section className="card add-missed-month-sheet" aria-labelledby="add-missed-month-heading">
      <div><p className="eyebrow">PREVIEW RENT SETUP</p><h4 id="add-missed-month-heading">Add a missed rent month</h4><p>Choose the rent month above. Add one charge using that renter’s saved rent amount and move-in-based due date.</p></div>
      {!addableTenants.length ? <p className="paid-report-empty">No renter with saved rent setup is missing a charge for {validBusinessDate(rentMonth + '-01') ? formatMonth(rentMonth) : 'the selected month'}. Set up rent first in Record and confirm, or choose a month without a recorded charge.</p> :
        <div className="add-missed-month-list">{addableTenants.map(renter => {
          const setup = rentTerms[renter.id]
          const dueDate = anniversaryDue(setup.start, rentMonth)
          const confirming = confirmingTenant === renter.id
          return <article className="add-missed-month-row" key={renter.id}>
            <div><strong>{renter.name}</strong><span>{getLocation(renter.room)} · {pesos(setup.cents)} · Due {formatDate(dueDate)}</span></div>
            {!confirming ? <Button className="secondary-button" onClick={() => { setConfirmingTenant(renter.id); setActionMessage('') }}>Add {formatMonth(rentMonth)} charge</Button> :
              <div className="add-missed-month-confirm"><p>This adds a {pesos(setup.cents)} rent charge for {formatMonth(rentMonth)}, due {formatDate(dueDate)}. It will appear as unpaid until confirmed cash is allocated. This preview change resets on reload.</p><Button className="primary" onClick={() => {
                const error = addRentMonth(renter.id, rentMonth)
                if (error) { setActionMessage(error); return }
                setConfirmingTenant('')
                setActionMessage(`${formatMonth(rentMonth)} rent charge added for ${renter.name}.`)
              }}>Confirm add rent month</Button><Button className="secondary-button" onClick={() => setConfirmingTenant('')}>Cancel</Button></div>}
          </article>
        })}</div>}
      <p className="field-help" role="status" aria-live="polite">{actionMessage}</p>
    </section>
    {receipt && <CashAcknowledgment data={receipt} close={() => setReceipt(null)} preview />}
  </section>
}
