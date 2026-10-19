import { useMemo, useState } from 'react'
import { Button } from '../components/atoms'
import type { Tenant } from './client'
import { decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import type { RentWorkspaceSnapshot, SavedCharge } from './saved-payments-model'

function currentPhilippineMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year')?.value ?? '2026'
  const month = parts.find(part => part.type === 'month')?.value ?? '01'
  return `${year}-${month}`
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function moneyMinor(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

function moneyFromMinor(value: bigint) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`
}

export function SavedPaidRentReport({ data, tenants, openAcknowledgment }: { data: RentWorkspaceSnapshot; tenants: Tenant[]; openAcknowledgment: (acknowledgment: CashAcknowledgmentData) => void }) {
  const [receiptMonth, setReceiptMonth] = useState(currentPhilippineMonth)
  const [rentMonth, setRentMonth] = useState(currentPhilippineMonth)
  const report = useMemo(() => {
    const agreementById = new Map(data.agreements.map(agreement => [agreement.id, agreement]))
    const unitById = new Map(data.units.map(unit => [unit.id, unit]))
    const buildingById = new Map(data.buildings.map(building => [building.id, building]))
    const tenantById = new Map(tenants.map(tenant => [tenant.id, tenant]))
    const confirmed = data.cash.filter(payment => payment.confirmed_at !== null && payment.received_on.slice(0, 7) === receiptMonth)
    const cashTotal = confirmed.reduce((sum, payment) => sum + moneyMinor(payment.amount), 0n)
    const paidTenantIds = new Set(confirmed.flatMap(payment => {
      const agreement = agreementById.get(payment.agreement_id)
      return agreement ? [agreement.tenant_id] : []
    }))
    const outstanding = data.charges.filter(charge => charge.rental_month.slice(0, 7) === rentMonth && moneyMinor(charge.remaining) > 0n)
      .map(charge => ({ charge, ...locationFor(charge, agreementById, unitById, buildingById, tenantById) }))
      .sort((left, right) => left.charge.due_date.localeCompare(right.charge.due_date) || left.tenant.localeCompare(right.tenant))
    const outstandingTotal = outstanding.reduce((sum, row) => sum + moneyMinor(row.charge.remaining), 0n)
    const byTenant = new Map<string, { tenant: string; location: string; months: Set<string>; total: bigint }>()
    for (const charge of data.charges) {
      if (moneyMinor(charge.remaining) === 0n) continue
      const agreement = agreementById.get(charge.agreement_id)
      if (!agreement) continue
      const unit = unitById.get(agreement.unit_id)
      const building = unit && buildingById.get(unit.building_id)
      const tenant = tenantById.get(agreement.tenant_id)?.display_name ?? 'Tenant unavailable'
      const current = byTenant.get(agreement.tenant_id) ?? {
        tenant,
        location: `${building?.label ?? 'Building unavailable'} / ${unit?.label ?? 'Room unavailable'}`,
        months: new Set<string>(),
        total: 0n,
      }
      current.months.add(charge.rental_month)
      current.total += moneyMinor(charge.remaining)
      byTenant.set(agreement.tenant_id, current)
    }
    const arrears = [...byTenant.entries()].filter(([, row]) => row.months.size >= 2)
      .map(([id, row]) => ({ id, ...row, periods: [...row.months].sort() }))
      .sort((left, right) => right.periods.length - left.periods.length || left.tenant.localeCompare(right.tenant))
    return { agreementById, unitById, buildingById, tenantById, confirmed, cashTotal, paidTenantIds, outstanding, outstandingTotal, arrears }
  }, [data, tenants, receiptMonth, rentMonth])

  return <section className="paid-rent-summary" aria-labelledby="saved-paid-rent-heading">
    <div className="paid-report-heading"><div><p className="eyebrow">SAVED COLLECTION REPORT</p><h3 id="saved-paid-rent-heading">Paid rent</h3><p>Saved records only. Pending cash is not confirmed income.</p></div><span className="status status--ready">Live database report</span></div>
    <section className="card paid-report-sheet" aria-label="Confirmed rent payments report">
      <div className="paid-report-toolbar"><div><label htmlFor="saved-receipt-month">Cash received during</label><input id="saved-receipt-month" type="month" value={receiptMonth} onChange={event => setReceiptMonth(event.target.value)} /></div><span className="paid-report-period">{formatMonth(receiptMonth)}</span></div>
      <div className="paid-report-metrics" aria-live="polite">
        <article><span>Confirmed cash received</span><strong>{decimalPesos(moneyFromMinor(report.cashTotal))}</strong></article>
        <article><span>Renters who paid</span><strong>{report.paidTenantIds.size}</strong></article>
        <article><span>Confirmed payments</span><strong>{report.confirmed.length}</strong></article>
      </div>
      <p className="field-help">Receipt month uses the actual cash receipt date, not the confirmation date. Pending reports and checks are excluded.</p>
      {!report.confirmed.length ? <div className="paid-report-empty"><h4>No confirmed payments for this month</h4><p>Choose another month or refresh saved records after a payment is confirmed.</p></div> :
        <div className="paid-table-scroll" role="region" aria-label="Confirmed payments table" tabIndex={0}>
          <table className="paid-report-table"><caption>Confirmed cash received in {formatMonth(receiptMonth)}</caption>
            <thead><tr><th scope="col">Renter</th><th scope="col">Rental space</th><th scope="col">Date received</th><th scope="col">Amount</th><th scope="col">Rent months covered</th><th scope="col">Receipt</th></tr></thead>
            <tbody>{report.confirmed.map(payment => {
              const agreement = report.agreementById.get(payment.agreement_id)
              const unit = agreement && report.unitById.get(agreement.unit_id)
              const building = unit && report.buildingById.get(unit.building_id)
              const tenant = agreement && report.tenantById.get(agreement.tenant_id)
              const months = [...new Set(payment.acknowledgment?.allocations.map(allocation => allocation.month) ?? [])].sort()
              return <tr key={payment.id}><td data-label="Renter">{tenant?.display_name ?? 'Tenant unavailable'}</td><td data-label="Rental space">{building?.label ?? 'Building unavailable'} / {unit?.label ?? 'Room unavailable'}</td><td data-label="Date received">{formatDate(payment.received_on)}</td><td data-label="Amount" className="paid-table-amount">{decimalPesos(payment.amount)}</td><td data-label="Rent months covered">{months.length ? months.map(formatMonth).join(', ') : 'Unavailable'}</td><td data-label="Receipt">{payment.acknowledgment ? <Button className="quiet-button" onClick={() => openAcknowledgment(payment.acknowledgment!)}>Open acknowledgment</Button> : '—'}</td></tr>
            })}</tbody>
            <tfoot><tr><th scope="row" colSpan={3}>Total confirmed cash received</th><td className="paid-table-amount">{decimalPesos(moneyFromMinor(report.cashTotal))}</td><td>{report.confirmed.length} {report.confirmed.length === 1 ? 'payment' : 'payments'} · {report.paidTenantIds.size} {report.paidTenantIds.size === 1 ? 'renter' : 'renters'}</td><td></td></tr></tfoot>
          </table>
        </div>}
    </section>
    <section className="card unpaid-report-sheet" aria-labelledby="saved-outstanding-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">OUTSTANDING RENT</p><h4 id="saved-outstanding-heading">Renters with rent still due</h4><p>Only rent charges recorded for the selected rent month are included.</p></div><div><label htmlFor="saved-rent-month">Rent month</label><input id="saved-rent-month" type="month" value={rentMonth} onChange={event => setRentMonth(event.target.value)} /></div></div>
      <div className="unpaid-report-total"><span>{report.outstanding.length} recorded charges with a remaining balance</span><strong>{decimalPesos(moneyFromMinor(report.outstandingTotal))}</strong></div>
      {!report.outstanding.length ? <p className="paid-report-empty">{data.charges.some(charge => charge.rental_month.slice(0, 7) === rentMonth) ? 'No remaining rent for this month.' : 'No rent charges are recorded for this month. Missing setup does not mean rent is unpaid.'}</p> :
        <div className="paid-table-scroll" role="region" aria-label="Outstanding rent table" tabIndex={0}>
          <table className="paid-report-table unpaid-report-table"><caption>Rent charges with remaining balances for {formatMonth(rentMonth)}</caption>
            <thead><tr><th scope="col">Renter</th><th scope="col">Rental space</th><th scope="col">Due date</th><th scope="col">Rent charged</th><th scope="col">Still due</th></tr></thead>
            <tbody>{report.outstanding.map(({ charge, tenant, location }) => <tr key={charge.id}><td data-label="Renter">{tenant}</td><td data-label="Rental space">{location}</td><td data-label="Due date">{formatDate(charge.due_date)}</td><td data-label="Rent charged">{decimalPesos(charge.amount)}</td><td data-label="Still due" className="paid-table-amount">{decimalPesos(charge.remaining)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={4}>Total still due</th><td className="paid-table-amount">{decimalPesos(moneyFromMinor(report.outstandingTotal))}</td></tr></tfoot>
          </table>
        </div>}
      <p className="field-help">Only confirmed cash reduces these balances. No charge for a month is not treated as unpaid.</p>
    </section>
    <section className={`card arrears-report-sheet${report.arrears.length ? ' has-arrears' : ''}`} aria-labelledby="saved-arrears-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">MULTIPLE MONTHS OUTSTANDING</p><h4 id="saved-arrears-heading">Renters with 2 or more unpaid rent months</h4><p>Counts distinct recorded rent months with a remaining balance.</p></div><span className="status">{report.arrears.length} {report.arrears.length === 1 ? 'renter' : 'renters'} flagged</span></div>
      {!report.arrears.length ? <p className="paid-report-empty">No renter currently has balances in 2 or more recorded rent months.</p> : <div className="paid-table-scroll" role="region" aria-label="Renters with multiple unpaid rent months" tabIndex={0}>
        <table className="paid-report-table arrears-report-table"><caption>Renters with balances in at least two distinct rent months</caption>
          <thead><tr><th scope="col">Renter</th><th scope="col">Rental space</th><th scope="col">Rent months</th><th scope="col">Total still due</th></tr></thead>
          <tbody>{report.arrears.map(row => <tr key={row.id}><td data-label="Renter">{row.tenant}</td><td data-label="Rental space">{row.location}</td><td data-label="Rent months">{row.periods.map(formatMonth).join(', ')}</td><td data-label="Total still due" className="paid-table-amount">{decimalPesos(moneyFromMinor(row.total))}</td></tr>)}</tbody>
        </table>
      </div>}
      <p className="field-help">This is based only on recorded charges; it cannot identify months without a charge or determine that rent is overdue.</p>
    </section>
  </section>
}

function locationFor(
  charge: SavedCharge,
  agreementById: Map<string, RentWorkspaceSnapshot['agreements'][number]>,
  unitById: Map<string, RentWorkspaceSnapshot['units'][number]>,
  buildingById: Map<string, RentWorkspaceSnapshot['buildings'][number]>,
  tenantById: Map<string, Tenant>,
) {
  const agreement = agreementById.get(charge.agreement_id)
  const unit = agreement && unitById.get(agreement.unit_id)
  const building = unit && buildingById.get(unit.building_id)
  return {
    tenant: agreement ? tenantById.get(agreement.tenant_id)?.display_name ?? 'Tenant unavailable' : 'Tenant unavailable',
    location: `${building?.label ?? 'Building unavailable'} / ${unit?.label ?? 'Room unavailable'}`,
  }
}
