import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/atoms'
import type { Tenant } from './client'
import { decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import type { RentWorkspaceSnapshot } from './saved-payments-model'
import { buildSavedPaidRentReport, moneyFromMinor } from './saved-paid-rent-report-model'
import { PaidRentDocument, type PaidRentDocumentData } from './PaidRentDocument'
import { supabase } from './client'
import { maintenanceTotal, netAfterMaintenance, parseMaintenance, type MaintenanceExpense } from './maintenance-model.ts'
import { text, type Language } from '../i18n'

function currentPhilippineMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const year = parts.find(part => part.type === 'year')?.value ?? '2026'
  const month = parts.find(part => part.type === 'month')?.value ?? '01'
  return `${year}-${month}`
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export function SavedPaidRentReport({ data, tenants, openAcknowledgment, propertyId, propertyName = 'RentByBob property', language = 'en' }: { propertyId?: string; data: RentWorkspaceSnapshot; tenants: Tenant[]; openAcknowledgment: (acknowledgment: CashAcknowledgmentData) => void; propertyName?: string; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [receiptMonth, setReceiptMonth] = useState(currentPhilippineMonth)
  const [rentMonth, setRentMonth] = useState(currentPhilippineMonth)
  // Maintenance recorded for the receipt month; 'unavailable' (not installed or no access) leaves it out of the PDF.
  const [maintenance, setMaintenance] = useState<MaintenanceExpense[] | 'loading' | 'unavailable'>('loading')
  useEffect(() => {
    let current = true
    setMaintenance('loading')
    if (!propertyId) { setMaintenance('unavailable'); return }
    void supabase!.rpc('read_maintenance_expenses', { p_property_id: propertyId, p_from: receiptMonth + '-01', p_to: receiptMonth + '-01' }).then(({ data: rows, error }) => {
      if (!current) return
      try { setMaintenance(error ? 'unavailable' : parseMaintenance(rows)) } catch { setMaintenance('unavailable') }
    }, () => { if (current) setMaintenance('unavailable') })
    return () => { current = false }
  }, [propertyId, receiptMonth])
  const report = useMemo(() => buildSavedPaidRentReport(data, tenants, receiptMonth, rentMonth, {
    tenantUnavailable: tr('Tenant unavailable', 'Walang talaan ng umuupa'),
    buildingUnavailable: tr('Building unavailable', 'Walang talaan ng gusali'),
    roomUnavailable: tr('Room unavailable', 'Walang talaan ng kuwarto'),
  }), [data, tenants, receiptMonth, rentMonth, language])

  const location = (unitId: string | undefined) => {
    const unit = unitId ? report.unitById.get(unitId) : undefined
    const building = unit && report.buildingById.get(unit.building_id)
    return `${building?.label ?? tr('Building unavailable', 'Walang talaan ng gusali')} · ${unit?.label ?? tr('Room unavailable', 'Walang talaan ng kuwarto')}`
  }
  // Optional bottom line: confirmed cash received minus maintenance (exact, in centavos); only when maintenance loaded.
  const net = Array.isArray(maintenance) ? netAfterMaintenance(report.cashTotal, maintenance.map(item => item.amount)) : undefined
  const netText = net && { received: decimalPesos(moneyFromMinor(report.cashTotal)), maintenance: decimalPesos(net.maintenance), net: decimalPesos(net.net), negative: net.negative }
  // The PDF document gets exactly the figures shown on screen.
  const documentData: PaidRentDocumentData = {
    propertyName,
    receiptMonth: formatMonth(receiptMonth),
    rentMonth: formatMonth(rentMonth),
    preparedAt: new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date()),
    summary: { confirmedTotal: decimalPesos(moneyFromMinor(report.cashTotal)), payments: report.confirmed.length, renters: report.paidTenantIds.size, outstandingTotal: decimalPesos(moneyFromMinor(report.outstandingTotal)), outstandingCount: report.outstanding.length, arrearsCount: report.arrears.length },
    confirmed: report.confirmed.map(payment => {
      const agreement = report.agreementById.get(payment.agreement_id)
      const months = [...new Set(payment.acknowledgment?.allocations.map(allocation => allocation.month) ?? [])].sort()
      return { id: payment.id, renter: (agreement && report.tenantById.get(agreement.tenant_id)?.display_name) ?? tr('Tenant unavailable', 'Walang talaan ng umuupa'), space: location(agreement?.unit_id), received: formatDate(payment.received_on), amount: decimalPesos(payment.amount), months: months.length ? months.map(formatMonth).join(', ') : '—', receipt: payment.acknowledgment?.number ?? '—' }
    }),
    outstanding: report.outstanding.map(({ charge, tenant, location: space }) => ({ id: charge.id, renter: tenant, space: space.replace(' / ', ' · '), due: formatDate(charge.due_date), charged: decimalPesos(charge.amount), remaining: decimalPesos(charge.remaining) })),
    maintenance: Array.isArray(maintenance) ? { items: maintenance.map(item => ({ id: item.id, description: item.description, place: item.place ?? '', amount: decimalPesos(item.amount) })), total: decimalPesos(maintenanceTotal(maintenance)) } : undefined,
    net: netText,
    arrears: report.arrears.map(row => ({ id: row.id, renter: row.tenant, space: row.location.replace(' / ', ' · '), months: row.periods.map(formatMonth).join(', '), total: decimalPesos(moneyFromMinor(row.total)) })),
  }
  // Show only the report document while printing; the browser's "Save as PDF" names the file from the title.
  function savePdf() {
    const root = document.documentElement, title = document.title
    root.classList.add('print-paid-report')
    document.title = `RentByBob paid rent ${receiptMonth} (rent ${rentMonth})`
    const restore = () => { root.classList.remove('print-paid-report'); document.title = title; window.removeEventListener('afterprint', restore) }
    window.addEventListener('afterprint', restore)
    window.print()
  }

  return <section className="paid-rent-summary" aria-labelledby="saved-paid-rent-heading">
    <div className="report-export"><Button className="primary" onClick={savePdf}>{tr('Save as PDF', 'I-save bilang PDF')}</Button><span className="field-help">{tr('Creates a formatted report of the tables below for the selected months. In the print window, choose "Save as PDF" as the printer. Contains renter names; store it privately.', 'Gagawa ng maayos na ulat mula sa mga talahanayan sa ibaba. Sa print window, piliin ang "Save as PDF". May pangalan ng mga umuupa; panatilihin itong pribado.')}</span></div>
    <PaidRentDocument data={documentData} language={language} />
    <div className="paid-report-heading"><div><p className="eyebrow">{tr('SAVED COLLECTION REPORT', 'NAKA-SAVE NA ULAT NG KOLEKSIYON')}</p><h3 id="saved-paid-rent-heading">{tr('Paid rent', 'Bayad sa upa')}</h3><p>{tr('Saved records only. Pending cash is not confirmed income.', 'Mga naka-save na talaan lang. Hindi pa kumpirmadong kita ang nakabinbing cash.')}</p></div><span className="status status--ready">{tr('Live database report', 'Ulat mula sa database')}</span></div>
    <section className="card paid-report-sheet" aria-label={tr('Confirmed rent payments report', 'Ulat ng kumpirmadong bayad sa upa')}>
      <div className="paid-report-toolbar"><div><label htmlFor="saved-receipt-month">{tr('Cash received during', 'Cash na natanggap noong')}</label><input id="saved-receipt-month" type="month" value={receiptMonth} onChange={event => event.target.value && setReceiptMonth(event.target.value)} /></div><span className="paid-report-period">{formatMonth(receiptMonth)}</span></div>
      <div className="paid-report-metrics" aria-live="polite">
        <article><span>{tr('Confirmed cash received', 'Kumpirmadong cash na natanggap')}</span><strong>{decimalPesos(moneyFromMinor(report.cashTotal))}</strong></article>
        <article><span>{tr('Renters who paid', 'Mga umuupang nagbayad')}</span><strong>{report.paidTenantIds.size}</strong></article>
        <article><span>{tr('Confirmed payments', 'Mga kumpirmadong bayad')}</span><strong>{report.confirmed.length}</strong></article>
      </div>
      <p className="field-help">{tr('Receipt month uses the actual cash receipt date, not the confirmation date. Pending reports and checks are excluded.', 'Ang buwan ng ulat ay gumagamit ng tunay na petsang natanggap ang cash, hindi ng petsa ng kumpirmasyon. Hindi kasama ang nakabinbing ulat at tseke.')}</p>
      {!report.confirmed.length ? <div className="paid-report-empty"><h4>{tr('No confirmed payments for this month', 'Walang kumpirmadong bayad ngayong buwan')}</h4><p>{tr('Choose another month or refresh saved records after a payment is confirmed.', 'Pumili ng ibang buwan o i-refresh ang mga talaan pagkatapos makumpirma ang bayad.')}</p></div> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Confirmed payments table', 'Talahanayan ng kumpirmadong bayad')} tabIndex={0}>
          <table className="paid-report-table"><caption>{tr('Confirmed cash received in', 'Kumpirmadong cash na natanggap noong')} {formatMonth(receiptMonth)}</caption>
            <thead><tr><th scope="col">{tr('Renter', 'Umuupa')}</th><th scope="col">{tr('Rental space', 'Lugar na inuupahan')}</th><th scope="col">{tr('Date received', 'Petsa ng pagkatanggap')}</th><th scope="col">{tr('Amount', 'Halaga')}</th><th scope="col">{tr('Rent months covered', 'Mga buwan ng upa na nabayaran')}</th><th scope="col">{tr('Receipt', 'Resibo')}</th></tr></thead>
            <tbody>{report.confirmed.map(payment => {
              const agreement = report.agreementById.get(payment.agreement_id)
              const unit = agreement && report.unitById.get(agreement.unit_id)
              const building = unit && report.buildingById.get(unit.building_id)
              const tenant = agreement && report.tenantById.get(agreement.tenant_id)
              const months = [...new Set(payment.acknowledgment?.allocations.map(allocation => allocation.month) ?? [])].sort()
              return <tr key={payment.id}><td data-label={tr('Renter', 'Umuupa')}>{tenant?.display_name ?? tr('Tenant unavailable', 'Walang talaan ng umuupa')}</td><td data-label={tr('Rental space', 'Lugar na inuupahan')}>{building?.label ?? tr('Building unavailable', 'Walang talaan ng gusali')} / {unit?.label ?? tr('Room unavailable', 'Walang talaan ng kuwarto')}</td><td data-label={tr('Date received', 'Petsa ng pagkatanggap')}>{formatDate(payment.received_on)}</td><td data-label={tr('Amount', 'Halaga')} className="paid-table-amount">{decimalPesos(payment.amount)}</td><td data-label={tr('Rent months covered', 'Mga buwan ng upa na nabayaran')}>{months.length ? months.map(formatMonth).join(', ') : tr('Unavailable', 'Hindi makita')}</td><td data-label={tr('Receipt', 'Resibo')}>{payment.acknowledgment ? <Button className="quiet-button" onClick={() => openAcknowledgment(payment.acknowledgment!)}>{tr('Open acknowledgment', 'Buksan ang resibo')}</Button> : '—'}</td></tr>
            })}</tbody>
            <tfoot><tr><th scope="row" colSpan={3}>{tr('Total confirmed cash received', 'Kabuuang kumpirmadong cash')}</th><td className="paid-table-amount">{decimalPesos(moneyFromMinor(report.cashTotal))}</td><td>{report.confirmed.length} {tr('payments', 'bayad')} · {report.paidTenantIds.size} {tr('renters', 'umuupa')}</td><td></td></tr></tfoot>
          </table>
        </div>}
    </section>
    <section className="card unpaid-report-sheet" aria-labelledby="saved-outstanding-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('OUTSTANDING RENT', 'MAY SINGIL PA SA UPA')}</p><h4 id="saved-outstanding-heading">{tr('Renters with rent still due', 'Mga umuupang may balanse pa')}</h4><p>{tr('Only rent charges recorded for the selected rent month are included.', 'Kasama lang ang singil na naitala sa napiling buwan ng upa.')}</p></div><div><label htmlFor="saved-rent-month">{tr('Rent month', 'Buwan ng upa')}</label><input id="saved-rent-month" type="month" value={rentMonth} onChange={event => event.target.value && setRentMonth(event.target.value)} /></div></div>
      <div className="unpaid-report-total"><span>{report.outstanding.length} {tr('recorded charges with a remaining balance', 'naitalang singil na may balanse pa')}</span><strong>{decimalPesos(moneyFromMinor(report.outstandingTotal))}</strong></div>
      {!report.outstanding.length ? <p className="paid-report-empty">{data.charges.some(charge => charge.rental_month.slice(0, 7) === rentMonth) ? tr('No remaining rent for this month.', 'Walang natitirang upa ngayong buwan.') : tr('No rent charges are recorded for this month. Missing setup does not mean rent is unpaid.', 'Walang naitalang singil sa upa ngayong buwan. Ang walang talaan ay hindi nangangahulugang hindi nabayaran ang upa.')}</p> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Outstanding rent table', 'Talahanayan ng natitirang upa')} tabIndex={0}>
          <table className="paid-report-table unpaid-report-table"><caption>{tr('Rent charges with remaining balances for', 'Mga singil sa upa na may balanse pa noong')} {formatMonth(rentMonth)}</caption>
            <thead><tr><th scope="col">{tr('Renter', 'Umuupa')}</th><th scope="col">{tr('Rental space', 'Lugar na inuupahan')}</th><th scope="col">{tr('Due date', 'Takdang petsa')}</th><th scope="col">{tr('Rent charged', 'Singil sa upa')}</th><th scope="col">{tr('Still due', 'Natitira')}</th></tr></thead>
            <tbody>{report.outstanding.map(({ charge, tenant, location }) => <tr key={charge.id}><td data-label={tr('Renter', 'Umuupa')}>{tenant}</td><td data-label={tr('Rental space', 'Lugar na inuupahan')}>{location}</td><td data-label={tr('Due date', 'Takdang petsa')}>{formatDate(charge.due_date)}</td><td data-label={tr('Rent charged', 'Singil sa upa')}>{decimalPesos(charge.amount)}</td><td data-label={tr('Still due', 'Natitira')} className="paid-table-amount">{decimalPesos(charge.remaining)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={4}>{tr('Total still due', 'Kabuuang natitira')}</th><td className="paid-table-amount">{decimalPesos(moneyFromMinor(report.outstandingTotal))}</td></tr></tfoot>
          </table>
        </div>}
      <p className="field-help">{tr('Only confirmed cash reduces these balances. No charge for a month is not treated as unpaid.', 'Kumpirmadong cash lang ang nagpapababa sa balanseng ito. Hindi ituturing na hindi nabayaran ang buwang walang naitalang singil.')}</p>
    </section>
    <section className={`card arrears-report-sheet${report.arrears.length ? ' has-arrears' : ''}`} aria-labelledby="saved-arrears-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('MULTIPLE MONTHS OUTSTANDING', 'MARAMING BUWANG MAY BALANSE')}</p><h4 id="saved-arrears-heading">{tr('Renters with 2 or more unpaid rent months', 'Mga umuupang may 2 o higit pang buwang hindi pa tapos')}</h4><p>{tr('Counts distinct recorded rent months with a remaining balance.', 'Bilang ng magkakaibang buwang naitala at may balanse pa.')}</p></div><span className="status">{report.arrears.length} {tr('renters flagged', 'umuupang minarkahan')}</span></div>
      {!report.arrears.length ? <p className="paid-report-empty">{tr('No renter currently has balances in 2 or more recorded rent months.', 'Walang umuupang may balanse sa 2 o higit pang naitalang buwan.')}</p> : <div className="paid-table-scroll" role="region" aria-label={tr('Renters with multiple unpaid rent months', 'Mga umuupang may balanse sa maraming buwan')} tabIndex={0}>
        <table className="paid-report-table arrears-report-table"><caption>{tr('Renters with balances in at least two distinct rent months', 'Mga umuupang may balanse sa hindi bababa sa dalawang magkakaibang buwan')}</caption>
          <thead><tr><th scope="col">{tr('Renter', 'Umuupa')}</th><th scope="col">{tr('Rental space', 'Lugar na inuupahan')}</th><th scope="col">{tr('Rent months', 'Mga buwan ng upa')}</th><th scope="col">{tr('Total still due', 'Kabuuang natitira')}</th></tr></thead>
          <tbody>{report.arrears.map(row => <tr key={row.id}><td data-label={tr('Renter', 'Umuupa')}>{row.tenant}</td><td data-label={tr('Rental space', 'Lugar na inuupahan')}>{row.location}</td><td data-label={tr('Rent months', 'Mga buwan ng upa')}>{row.periods.map(formatMonth).join(', ')}</td><td data-label={tr('Total still due', 'Kabuuang natitira')} className="paid-table-amount">{decimalPesos(moneyFromMinor(row.total))}</td></tr>)}</tbody>
        </table>
      </div>}
      <p className="field-help">{tr('This is based only on recorded charges; it cannot identify months without a charge or determine that rent is overdue.', 'Mga naitalang singil lang ang batayan; hindi nito ipinapakita ang buwang walang singil o tinitiyak na overdue na ang upa.')}</p>
    </section>
    <section className="card maintenance-report-sheet" aria-labelledby="saved-maintenance-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('UPKEEP', 'PAG-AASIKASO')}</p><h4 id="saved-maintenance-heading">{tr('Maintenance spending in', 'Gastos sa maintenance noong')} {formatMonth(receiptMonth)}</h4></div></div>
      {maintenance === 'loading' ? <p role="status">{tr('Loading maintenance…', 'Nilo-load ang maintenance…')}</p>
        : maintenance === 'unavailable' ? <p className="notice notice--warning" role="status">{tr('Maintenance could not be loaded, so the PDF will not include it. Check your connection and staff session, then reopen this report.', 'Hindi ma-load ang maintenance, kaya hindi ito kasama sa PDF. Suriin ang koneksyon at staff session, saka buksan ulit ang ulat na ito.')}</p>
        : !maintenance.length ? <p className="paid-report-empty">{tr('No maintenance was recorded for this month. Add it from Maintenance in the menu.', 'Walang naitalang maintenance ngayong buwan. Idagdag mula sa Maintenance sa menu.')}</p>
        : <div className="paid-table-scroll" role="region" aria-label={tr('Maintenance table', 'Talahanayan ng maintenance')} tabIndex={0}>
          <table className="paid-report-table"><caption>{tr('Maintenance recorded for', 'Maintenance na naitala para sa')} {formatMonth(receiptMonth)}</caption>
            <thead><tr><th scope="col">{tr('What it was for', 'Para saan')}</th><th scope="col">{tr('Where', 'Saan')}</th><th scope="col">{tr('Amount', 'Halaga')}</th></tr></thead>
            <tbody>{maintenance.map(item => <tr key={item.id}><td data-label={tr('What it was for', 'Para saan')}>{item.description}</td><td data-label={tr('Where', 'Saan')}>{item.place ?? '—'}</td><td data-label={tr('Amount', 'Halaga')} className="paid-table-amount">{decimalPesos(item.amount)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={2}>{tr('Total maintenance', 'Kabuuang maintenance')}</th><td className="paid-table-amount">{decimalPesos(maintenanceTotal(maintenance))}</td></tr></tfoot>
          </table>
        </div>}
      <p className="field-help">{tr("Expenses only; they do not change any renter's balance. The PDF includes this table.", 'Gastos lang ito; hindi nito babaguhin ang balanse ng umuupa. Kasama ang talahanayang ito sa PDF.')}</p>
    </section>
    {netText && <section className="card net-report-sheet" aria-labelledby="saved-net-heading">
      <p className="eyebrow">{tr('OPTIONAL SUMMARY', 'OPSYONAL NA BUOD')}</p>
      <h4 id="saved-net-heading">{tr('Paid rent minus maintenance', 'Bayad sa upa bawas maintenance')} · {formatMonth(receiptMonth)}</h4>
      <dl className="net-report-lines">
        <div><dt>{tr('Confirmed cash received', 'Kumpirmadong cash na natanggap')}</dt><dd>{netText.received}</dd></div>
        <div><dt>{tr('Less: maintenance spending', 'Bawas: gastos sa maintenance')}</dt><dd>{netText.maintenance}</dd></div>
        <div className="net-report-total"><dt>{tr('Paid rent minus maintenance', 'Bayad sa upa bawas maintenance')}</dt><dd>{netText.negative ? '−' : ''}{netText.net}</dd></div>
      </dl>
      <p className="field-help">{tr('For information only. Cash received is not profit and this is not an accounting statement; rent still due and other costs are not included. It is also in the PDF.', 'Para sa impormasyon lang. Ang natanggap na cash ay hindi kita at hindi ito accounting statement; hindi kasama ang natitirang upa at iba pang gastos. Kasama rin ito sa PDF.')}</p>
    </section>}
  </section>
}
