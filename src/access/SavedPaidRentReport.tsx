import { useMemo, useState } from 'react'
import { Button } from '../components/atoms'
import type { Tenant } from './client'
import { decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import type { RentWorkspaceSnapshot } from './saved-payments-model'
import { buildSavedPaidRentReport, moneyFromMinor } from './saved-paid-rent-report-model'
import { text, type Language } from '../i18n'

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

export function SavedPaidRentReport({ data, tenants, openAcknowledgment, language = 'en' }: { data: RentWorkspaceSnapshot; tenants: Tenant[]; openAcknowledgment: (acknowledgment: CashAcknowledgmentData) => void; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [receiptMonth, setReceiptMonth] = useState(currentPhilippineMonth)
  const [rentMonth, setRentMonth] = useState(currentPhilippineMonth)
  const report = useMemo(() => buildSavedPaidRentReport(data, tenants, receiptMonth, rentMonth, {
    tenantUnavailable: tr('Tenant unavailable', 'Walay rekord sa nag-abang'),
    buildingUnavailable: tr('Building unavailable', 'Walay rekord sa bilding'),
    roomUnavailable: tr('Room unavailable', 'Walay rekord sa kwarto'),
  }), [data, tenants, receiptMonth, rentMonth, language])

  return <section className="paid-rent-summary" aria-labelledby="saved-paid-rent-heading">
    <div className="paid-report-heading"><div><p className="eyebrow">{tr('SAVED COLLECTION REPORT', 'GITIPIG NGA REPORT SA KOLEKSIYON')}</p><h3 id="saved-paid-rent-heading">{tr('Paid rent', 'Bayad sa abang')}</h3><p>{tr('Saved records only. Pending cash is not confirmed income.', 'Mga natipig nga rekord lang. Dili pa kumpirmadong kita ang pending nga kwarta.')}</p></div><span className="status status--ready">{tr('Live database report', 'Report gikan sa database')}</span></div>
    <section className="card paid-report-sheet" aria-label={tr('Confirmed rent payments report', 'Report sa kumpirmadong bayad sa abang')}>
      <div className="paid-report-toolbar"><div><label htmlFor="saved-receipt-month">{tr('Cash received during', 'Kwarta nga nadawat niadtong')}</label><input id="saved-receipt-month" type="month" value={receiptMonth} onChange={event => setReceiptMonth(event.target.value)} /></div><span className="paid-report-period">{formatMonth(receiptMonth)}</span></div>
      <div className="paid-report-metrics" aria-live="polite">
        <article><span>{tr('Confirmed cash received', 'Kumpirmadong kwarta nga nadawat')}</span><strong>{decimalPesos(moneyFromMinor(report.cashTotal))}</strong></article>
        <article><span>{tr('Renters who paid', 'Mga nag-abang nga mibayad')}</span><strong>{report.paidTenantIds.size}</strong></article>
        <article><span>{tr('Confirmed payments', 'Kumpirmadong mga bayad')}</span><strong>{report.confirmed.length}</strong></article>
      </div>
      <p className="field-help">{tr('Receipt month uses the actual cash receipt date, not the confirmation date. Pending reports and checks are excluded.', 'Ang bulan sa report mogamit sa tinuod nga petsa nga nadawat ang kwarta, dili petsa sa kumpirmasyon. Dili apil ang pending nga report ug tseke.')}</p>
      {!report.confirmed.length ? <div className="paid-report-empty"><h4>{tr('No confirmed payments for this month', 'Walay kumpirmadong bayad niining bulana')}</h4><p>{tr('Choose another month or refresh saved records after a payment is confirmed.', 'Pagpili og laing bulan o i-refresh ang mga rekord human makumpirma ang bayad.')}</p></div> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Confirmed payments table', 'Lamesa sa kumpirmadong bayad')} tabIndex={0}>
          <table className="paid-report-table"><caption>{tr('Confirmed cash received in', 'Kumpirmadong kwarta nga nadawat niadtong')} {formatMonth(receiptMonth)}</caption>
            <thead><tr><th scope="col">{tr('Renter', 'Nag-abang')}</th><th scope="col">{tr('Rental space', 'Lugar nga giabangan')}</th><th scope="col">{tr('Date received', 'Petsa nga nadawat')}</th><th scope="col">{tr('Amount', 'Kantidad')}</th><th scope="col">{tr('Rent months covered', 'Mga bulan sa abang nga gibayran')}</th><th scope="col">{tr('Receipt', 'Resibo')}</th></tr></thead>
            <tbody>{report.confirmed.map(payment => {
              const agreement = report.agreementById.get(payment.agreement_id)
              const unit = agreement && report.unitById.get(agreement.unit_id)
              const building = unit && report.buildingById.get(unit.building_id)
              const tenant = agreement && report.tenantById.get(agreement.tenant_id)
              const months = [...new Set(payment.acknowledgment?.allocations.map(allocation => allocation.month) ?? [])].sort()
              return <tr key={payment.id}><td data-label={tr('Renter', 'Nag-abang')}>{tenant?.display_name ?? tr('Tenant unavailable', 'Walay rekord sa nag-abang')}</td><td data-label={tr('Rental space', 'Lugar nga giabangan')}>{building?.label ?? tr('Building unavailable', 'Walay rekord sa bilding')} / {unit?.label ?? tr('Room unavailable', 'Walay rekord sa kwarto')}</td><td data-label={tr('Date received', 'Petsa nga nadawat')}>{formatDate(payment.received_on)}</td><td data-label={tr('Amount', 'Kantidad')} className="paid-table-amount">{decimalPesos(payment.amount)}</td><td data-label={tr('Rent months covered', 'Mga bulan sa abang nga gibayran')}>{months.length ? months.map(formatMonth).join(', ') : tr('Unavailable', 'Wala makita')}</td><td data-label={tr('Receipt', 'Resibo')}>{payment.acknowledgment ? <Button className="quiet-button" onClick={() => openAcknowledgment(payment.acknowledgment!)}>{tr('Open acknowledgment', 'Ablihi ang resibo')}</Button> : '—'}</td></tr>
            })}</tbody>
            <tfoot><tr><th scope="row" colSpan={3}>{tr('Total confirmed cash received', 'Kinatibuk-ang kumpirmadong kwarta')}</th><td className="paid-table-amount">{decimalPesos(moneyFromMinor(report.cashTotal))}</td><td>{report.confirmed.length} {tr('payments', 'ka bayad')} · {report.paidTenantIds.size} {tr('renters', 'ka nag-abang')}</td><td></td></tr></tfoot>
          </table>
        </div>}
    </section>
    <section className="card unpaid-report-sheet" aria-labelledby="saved-outstanding-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('OUTSTANDING RENT', 'NAA PAY BAYRANAN SA ABANG')}</p><h4 id="saved-outstanding-heading">{tr('Renters with rent still due', 'Mga nag-abang nga naa pay balanse')}</h4><p>{tr('Only rent charges recorded for the selected rent month are included.', 'Apil lang ang bayranan nga narekord sa gipiling bulan sa abang.')}</p></div><div><label htmlFor="saved-rent-month">{tr('Rent month', 'Bulan sa abang')}</label><input id="saved-rent-month" type="month" value={rentMonth} onChange={event => setRentMonth(event.target.value)} /></div></div>
      <div className="unpaid-report-total"><span>{report.outstanding.length} {tr('recorded charges with a remaining balance', 'ka narekord nga bayranan nga naa pay balanse')}</span><strong>{decimalPesos(moneyFromMinor(report.outstandingTotal))}</strong></div>
      {!report.outstanding.length ? <p className="paid-report-empty">{data.charges.some(charge => charge.rental_month.slice(0, 7) === rentMonth) ? tr('No remaining rent for this month.', 'Walay nabilin nga abang niining bulana.') : tr('No rent charges are recorded for this month. Missing setup does not mean rent is unpaid.', 'Walay bayranan sa abang nga narekord niining bulana. Ang walay rekord dili pasabot nga wala mabayri ang abang.')}</p> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Outstanding rent table', 'Lamesa sa nabilin nga abang')} tabIndex={0}>
          <table className="paid-report-table unpaid-report-table"><caption>{tr('Rent charges with remaining balances for', 'Mga bayranan sa abang nga naa pay balanse sa')} {formatMonth(rentMonth)}</caption>
            <thead><tr><th scope="col">{tr('Renter', 'Nag-abang')}</th><th scope="col">{tr('Rental space', 'Lugar nga giabangan')}</th><th scope="col">{tr('Due date', 'Takdang petsa')}</th><th scope="col">{tr('Rent charged', 'Bayranan sa abang')}</th><th scope="col">{tr('Still due', 'Nabilin')}</th></tr></thead>
            <tbody>{report.outstanding.map(({ charge, tenant, location }) => <tr key={charge.id}><td data-label={tr('Renter', 'Nag-abang')}>{tenant}</td><td data-label={tr('Rental space', 'Lugar nga giabangan')}>{location}</td><td data-label={tr('Due date', 'Takdang petsa')}>{formatDate(charge.due_date)}</td><td data-label={tr('Rent charged', 'Bayranan sa abang')}>{decimalPesos(charge.amount)}</td><td data-label={tr('Still due', 'Nabilin')} className="paid-table-amount">{decimalPesos(charge.remaining)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={4}>{tr('Total still due', 'Kinatibuk-ang nabilin')}</th><td className="paid-table-amount">{decimalPesos(moneyFromMinor(report.outstandingTotal))}</td></tr></tfoot>
          </table>
        </div>}
      <p className="field-help">{tr('Only confirmed cash reduces these balances. No charge for a month is not treated as unpaid.', 'Kumpirmadong kwarta lang ang moubos niini nga balanse. Dili isipon nga wala mabayri ang bulan nga walay na-rekord nga bayranan.')}</p>
    </section>
    <section className={`card arrears-report-sheet${report.arrears.length ? ' has-arrears' : ''}`} aria-labelledby="saved-arrears-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('MULTIPLE MONTHS OUTSTANDING', 'DAGHANG BULAN NGA NAAY BALANSE')}</p><h4 id="saved-arrears-heading">{tr('Renters with 2 or more unpaid rent months', 'Mga nag-abang nga naay 2 o daghang bulan nga wala pa mahuman')}</h4><p>{tr('Counts distinct recorded rent months with a remaining balance.', 'Ihap sa lain-laing bulan nga narekord ug naa pay balanse.')}</p></div><span className="status">{report.arrears.length} {tr('renters flagged', 'ka nag-abang nga gimarkahan')}</span></div>
      {!report.arrears.length ? <p className="paid-report-empty">{tr('No renter currently has balances in 2 or more recorded rent months.', 'Walay nag-abang nga adunay balanse sa 2 o daghang bulan nga narekord.')}</p> : <div className="paid-table-scroll" role="region" aria-label={tr('Renters with multiple unpaid rent months', 'Mga nag-abang nga naay daghang bulan nga balanse')} tabIndex={0}>
        <table className="paid-report-table arrears-report-table"><caption>{tr('Renters with balances in at least two distinct rent months', 'Mga nag-abang nga naay balanse sa labing menos duha ka lain-laing bulan')}</caption>
          <thead><tr><th scope="col">{tr('Renter', 'Nag-abang')}</th><th scope="col">{tr('Rental space', 'Lugar nga giabangan')}</th><th scope="col">{tr('Rent months', 'Mga bulan sa abang')}</th><th scope="col">{tr('Total still due', 'Kinatibuk-ang nabilin')}</th></tr></thead>
          <tbody>{report.arrears.map(row => <tr key={row.id}><td data-label={tr('Renter', 'Nag-abang')}>{row.tenant}</td><td data-label={tr('Rental space', 'Lugar nga giabangan')}>{row.location}</td><td data-label={tr('Rent months', 'Mga bulan sa abang')}>{row.periods.map(formatMonth).join(', ')}</td><td data-label={tr('Total still due', 'Kinatibuk-ang nabilin')} className="paid-table-amount">{decimalPesos(moneyFromMinor(row.total))}</td></tr>)}</tbody>
        </table>
      </div>}
      <p className="field-help">{tr('This is based only on recorded charges; it cannot identify months without a charge or determine that rent is overdue.', 'Mga narekord nga bayranan lang ang basihan; dili niini makita ang bulan nga walay bayranan o matino nga overdue na ang abang.')}</p>
    </section>
  </section>
}
