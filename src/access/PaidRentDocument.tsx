import { createPortal } from 'react-dom'
import { text, type Language } from '../i18n'

export type PaidRentDocumentData = {
  propertyName: string
  receiptMonth: string
  rentMonth: string
  preparedAt: string
  summary: { confirmedTotal: string; payments: number; renters: number; outstandingTotal: string; outstandingCount: number; arrearsCount: number }
  confirmed: { id: string; renter: string; space: string; received: string; amount: string; months: string; receipt: string }[]
  outstanding: { id: string; renter: string; space: string; due: string; charged: string; remaining: string }[]
  arrears: { id: string; renter: string; space: string; months: string; total: string }[]
  // Maintenance spending recorded for the report month (202610280003); absent when it could not be loaded.
  maintenance?: { items: { id: string; description: string; place: string; amount: string }[]; total: string }
  // Optional last block: confirmed cash received minus maintenance (information only); absent when maintenance is unavailable.
  net?: { received: string; maintenance: string; net: string; negative: boolean }
}

// Print-only document for "Save as PDF": a formal report layout (serif headings, sans-serif body, tabular figures)
// that the browser saves as a PDF. It is rendered outside the app and shown only while printing this report, so
// the figures are exactly the ones on screen. No data leaves the browser.
export function PaidRentDocument({ data, language = 'en' }: { data: PaidRentDocumentData; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return createPortal(<article className="print-document paid-rent-document" lang={language === 'fil' ? 'fil' : 'en'}>
    <header className="doc-header">
      <div className="doc-brand"><span className="doc-mark" aria-hidden="true">R</span><span>RentByBob</span></div>
      <div className="doc-confidential">{tr('Confidential · contains renter names', 'Kumpidensyal · may pangalan ng umuupa')}</div>
    </header>
    <section className="doc-title">
      <p className="doc-kicker">{tr('Collection report', 'Ulat ng koleksiyon')}</p>
      <h1>{tr('Paid Rent Report', 'Ulat ng Bayad sa Upa')}</h1>
      <p className="doc-property">{data.propertyName}</p>
      <dl className="doc-meta">
        <div><dt>{tr('Cash received in', 'Cash na natanggap noong')}</dt><dd>{data.receiptMonth}</dd></div>
        <div><dt>{tr('Rent month (still due)', 'Buwan ng upa (natitira)')}</dt><dd>{data.rentMonth}</dd></div>
        <div><dt>{tr('Prepared', 'Inihanda')}</dt><dd>{data.preparedAt}</dd></div>
      </dl>
    </section>

    <section className="doc-summary" aria-label={tr('Summary', 'Buod')}>
      <div className="doc-figure doc-figure--lead"><span>{tr('Confirmed cash received', 'Kumpirmadong cash na natanggap')}</span><strong>{data.summary.confirmedTotal}</strong><small>{data.summary.payments} {tr(data.summary.payments === 1 ? 'payment' : 'payments', 'bayad')} · {data.summary.renters} {tr(data.summary.renters === 1 ? 'renter' : 'renters', 'umuupa')}</small></div>
      <div className="doc-figure"><span>{tr('Rent still due', 'Natitirang upa')}</span><strong>{data.summary.outstandingTotal}</strong><small>{data.summary.outstandingCount} {tr(data.summary.outstandingCount === 1 ? 'recorded charge' : 'recorded charges', 'naitalang singil')}</small></div>
      <div className="doc-figure"><span>{tr('Renters with 2+ unpaid months', 'Mga umuupang may 2+ buwang hindi nabayaran')}</span><strong>{data.summary.arrearsCount}</strong><small>{tr('Recorded months only', 'Naitalang buwan lang')}</small></div>
    </section>

    <section className="doc-section">
      <h2><span className="doc-number">1</span>{tr('Confirmed payments', 'Mga kumpirmadong bayad')}</h2>
      <p className="doc-note">{tr('Cash confirmed by a clerk, by the date it was received. Pending cash and uncleared checks are not included.', 'Cash na kinumpirma ng clerk, ayon sa petsa ng pagkatanggap. Hindi kasama ang nakabinbing cash at tsekeng hindi pa na-clear.')}</p>
      {data.confirmed.length ? <table className="doc-table">
        <thead><tr><th>{tr('Renter', 'Umuupa')}</th><th>{tr('Rental space', 'Lugar')}</th><th>{tr('Received', 'Natanggap')}</th><th>{tr('Rent months', 'Mga buwan')}</th><th>{tr('Receipt no.', 'Resibo')}</th><th className="doc-money">{tr('Amount', 'Halaga')}</th></tr></thead>
        <tbody>{data.confirmed.map(row => <tr key={row.id}><td>{row.renter}</td><td>{row.space}</td><td className="doc-date">{row.received}</td><td>{row.months}</td><td className="doc-code">{row.receipt}</td><td className="doc-money">{row.amount}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={5}>{tr('Total confirmed cash received', 'Kabuuang kumpirmadong cash')}</th><td className="doc-money">{data.summary.confirmedTotal}</td></tr></tfoot>
      </table> : <p className="doc-empty">{tr('No confirmed payments were received in this month.', 'Walang kumpirmadong bayad na natanggap ngayong buwan.')}</p>}
    </section>

    <section className="doc-section">
      <h2><span className="doc-number">2</span>{tr('Rent still due', 'Natitirang upa')}</h2>
      <p className="doc-note">{tr('Recorded rent charges for the rent month that still have a balance. A month without a recorded charge is not listed and is not treated as unpaid.', 'Mga naitalang singil sa buwan na may balanse pa. Ang buwang walang naitalang singil ay hindi ilalista at hindi ituturing na hindi nabayaran.')}</p>
      {data.outstanding.length ? <table className="doc-table">
        <thead><tr><th>{tr('Renter', 'Umuupa')}</th><th>{tr('Rental space', 'Lugar')}</th><th>{tr('Due date', 'Takdang petsa')}</th><th className="doc-money">{tr('Rent charged', 'Siningil')}</th><th className="doc-money">{tr('Still due', 'Natitira')}</th></tr></thead>
        <tbody>{data.outstanding.map(row => <tr key={row.id}><td>{row.renter}</td><td>{row.space}</td><td className="doc-date">{row.due}</td><td className="doc-money">{row.charged}</td><td className="doc-money">{row.remaining}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={4}>{tr('Total still due', 'Kabuuang natitira')}</th><td className="doc-money">{data.summary.outstandingTotal}</td></tr></tfoot>
      </table> : <p className="doc-empty">{tr('No recorded rent is still due for this month.', 'Walang naitalang natitirang upa ngayong buwan.')}</p>}
    </section>

    {data.arrears.length > 0 && <section className="doc-section">
      <h2><span className="doc-number">3</span>{tr('Renters with 2 or more unpaid months', 'Mga umuupang may 2 o higit pang buwang hindi nabayaran')}</h2>
      <table className="doc-table">
        <thead><tr><th>{tr('Renter', 'Umuupa')}</th><th>{tr('Rental space', 'Lugar')}</th><th>{tr('Rent months', 'Mga buwan')}</th><th className="doc-money">{tr('Total still due', 'Kabuuang natitira')}</th></tr></thead>
        <tbody>{data.arrears.map(row => <tr key={row.id}><td>{row.renter}</td><td>{row.space}</td><td>{row.months}</td><td className="doc-money">{row.total}</td></tr>)}</tbody>
      </table>
    </section>}

    {data.maintenance && <section className="doc-section">
      <h2><span className="doc-number">{data.arrears.length > 0 ? 4 : 3}</span>{tr('Maintenance spending', 'Gastos sa maintenance')}</h2>
      <p className="doc-note">{tr('Repairs and upkeep recorded for', 'Mga pagkukumpuni at pag-aasikasong naitala para sa')} {data.receiptMonth}. {tr("These are expenses only and do not change any renter's balance.", 'Gastos lang ito at hindi nito babaguhin ang balanse ng umuupa.')}</p>
      {data.maintenance.items.length ? <table className="doc-table">
        <thead><tr><th>{tr('What it was for', 'Para saan')}</th><th>{tr('Where', 'Saan')}</th><th className="doc-money">{tr('Amount', 'Halaga')}</th></tr></thead>
        <tbody>{data.maintenance.items.map(row => <tr key={row.id}><td>{row.description}</td><td>{row.place || '—'}</td><td className="doc-money">{row.amount}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={2}>{tr('Total maintenance', 'Kabuuang maintenance')}</th><td className="doc-money">{data.maintenance.total}</td></tr></tfoot>
      </table> : <p className="doc-empty">{tr('No maintenance was recorded for this month.', 'Walang naitalang maintenance ngayong buwan.')}</p>}
    </section>}

    {data.net && <section className="doc-section doc-optional" aria-label={tr('Optional summary', 'Opsyonal na buod')}>
      <h2>{tr('Optional summary: paid rent minus maintenance', 'Opsyonal na buod: bayad sa upa bawas maintenance')}</h2>
      <table className="doc-table doc-net">
        <tbody>
          <tr><th scope="row">{tr('Confirmed cash received', 'Kumpirmadong cash na natanggap')} · {data.receiptMonth}</th><td className="doc-money">{data.net.received}</td></tr>
          <tr><th scope="row">{tr('Less: maintenance spending', 'Bawas: gastos sa maintenance')}</th><td className="doc-money">{data.net.maintenance}</td></tr>
        </tbody>
        <tfoot><tr><th scope="row">{tr('Paid rent minus maintenance', 'Bayad sa upa bawas maintenance')}</th><td className="doc-money">{data.net.negative ? '−' : ''}{data.net.net}</td></tr></tfoot>
      </table>
      <p className="doc-note">{tr('For information only. Cash received is not profit and this is not an accounting statement; rent still due and other costs are not included.', 'Para sa impormasyon lang. Ang natanggap na cash ay hindi kita at hindi ito accounting statement; hindi kasama ang natitirang upa at iba pang gastos.')}</p>
    </section>}

    <footer className="doc-footer">
      <span>{tr('From saved records in RentByBob. Amounts in Philippine pesos. Dates in Philippine time.', 'Mula sa naka-save na talaan ng RentByBob. Halaga sa piso. Petsa sa oras ng Pilipinas.')}</span>
      <span>{data.propertyName} · {data.receiptMonth}</span>
    </footer>
  </article>, document.body)
}
