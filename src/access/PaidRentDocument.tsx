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
}

// Print-only document for "Save as PDF": a formal report layout (serif headings, sans-serif body, tabular figures)
// that the browser saves as a PDF. It is rendered outside the app and shown only while printing this report, so
// the figures are exactly the ones on screen. No data leaves the browser.
export function PaidRentDocument({ data, language = 'en' }: { data: PaidRentDocumentData; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return createPortal(<article className="print-document paid-rent-document" lang={language === 'ceb' ? 'ceb' : 'en'}>
    <header className="doc-header">
      <div className="doc-brand"><span className="doc-mark" aria-hidden="true">R</span><span>RentByBob</span></div>
      <div className="doc-confidential">{tr('Confidential · contains renter names', 'Kompidensyal · naay ngalan sa nag-abang')}</div>
    </header>
    <section className="doc-title">
      <p className="doc-kicker">{tr('Collection report', 'Report sa koleksiyon')}</p>
      <h1>{tr('Paid Rent Report', 'Report sa Bayad sa Abang')}</h1>
      <p className="doc-property">{data.propertyName}</p>
      <dl className="doc-meta">
        <div><dt>{tr('Cash received in', 'Kwarta nga nadawat sa')}</dt><dd>{data.receiptMonth}</dd></div>
        <div><dt>{tr('Rent month (still due)', 'Bulan sa abang (nabilin)')}</dt><dd>{data.rentMonth}</dd></div>
        <div><dt>{tr('Prepared', 'Giandam')}</dt><dd>{data.preparedAt}</dd></div>
      </dl>
    </section>

    <section className="doc-summary" aria-label={tr('Summary', 'Sumaryo')}>
      <div className="doc-figure doc-figure--lead"><span>{tr('Confirmed cash received', 'Kumpirmadong kwarta nga nadawat')}</span><strong>{data.summary.confirmedTotal}</strong><small>{data.summary.payments} {tr(data.summary.payments === 1 ? 'payment' : 'payments', 'ka bayad')} · {data.summary.renters} {tr(data.summary.renters === 1 ? 'renter' : 'renters', 'ka nag-abang')}</small></div>
      <div className="doc-figure"><span>{tr('Rent still due', 'Abang nga nabilin')}</span><strong>{data.summary.outstandingTotal}</strong><small>{data.summary.outstandingCount} {tr(data.summary.outstandingCount === 1 ? 'recorded charge' : 'recorded charges', 'ka narekord nga bayranan')}</small></div>
      <div className="doc-figure"><span>{tr('Renters with 2+ unpaid months', 'Nag-abang nga 2+ ka bulan nga wala mabayri')}</span><strong>{data.summary.arrearsCount}</strong><small>{tr('Recorded months only', 'Narekord nga bulan lang')}</small></div>
    </section>

    <section className="doc-section">
      <h2><span className="doc-number">1</span>{tr('Confirmed payments', 'Kumpirmadong mga bayad')}</h2>
      <p className="doc-note">{tr('Cash confirmed by the designated verifier, by the date it was received. Pending cash and uncleared checks are not included.', 'Kwarta nga gikumpirma sa tigkumpirma, sumala sa petsa nga nadawat. Dili apil ang pending nga kwarta ug tseke nga wala pa ma-clear.')}</p>
      {data.confirmed.length ? <table className="doc-table">
        <thead><tr><th>{tr('Renter', 'Nag-abang')}</th><th>{tr('Rental space', 'Lugar')}</th><th>{tr('Received', 'Nadawat')}</th><th>{tr('Rent months', 'Mga bulan')}</th><th>{tr('Receipt no.', 'Resibo')}</th><th className="doc-money">{tr('Amount', 'Kantidad')}</th></tr></thead>
        <tbody>{data.confirmed.map(row => <tr key={row.id}><td>{row.renter}</td><td>{row.space}</td><td className="doc-date">{row.received}</td><td>{row.months}</td><td className="doc-code">{row.receipt}</td><td className="doc-money">{row.amount}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={5}>{tr('Total confirmed cash received', 'Kinatibuk-ang kumpirmadong kwarta')}</th><td className="doc-money">{data.summary.confirmedTotal}</td></tr></tfoot>
      </table> : <p className="doc-empty">{tr('No confirmed payments were received in this month.', 'Walay kumpirmadong bayad nga nadawat niining bulana.')}</p>}
    </section>

    <section className="doc-section">
      <h2><span className="doc-number">2</span>{tr('Rent still due', 'Abang nga nabilin')}</h2>
      <p className="doc-note">{tr('Recorded rent charges for the rent month that still have a balance. A month without a recorded charge is not listed and is not treated as unpaid.', 'Narekord nga bayranan sa bulan nga naa pay balanse. Ang bulan nga walay narekord nga bayranan dili ilista ug dili isipon nga wala mabayri.')}</p>
      {data.outstanding.length ? <table className="doc-table">
        <thead><tr><th>{tr('Renter', 'Nag-abang')}</th><th>{tr('Rental space', 'Lugar')}</th><th>{tr('Due date', 'Takdang petsa')}</th><th className="doc-money">{tr('Rent charged', 'Gisingil')}</th><th className="doc-money">{tr('Still due', 'Nabilin')}</th></tr></thead>
        <tbody>{data.outstanding.map(row => <tr key={row.id}><td>{row.renter}</td><td>{row.space}</td><td className="doc-date">{row.due}</td><td className="doc-money">{row.charged}</td><td className="doc-money">{row.remaining}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={4}>{tr('Total still due', 'Kinatibuk-ang nabilin')}</th><td className="doc-money">{data.summary.outstandingTotal}</td></tr></tfoot>
      </table> : <p className="doc-empty">{tr('No recorded rent is still due for this month.', 'Walay narekord nga abang nga nabilin niining bulana.')}</p>}
    </section>

    {data.arrears.length > 0 && <section className="doc-section">
      <h2><span className="doc-number">3</span>{tr('Renters with 2 or more unpaid months', 'Nag-abang nga naay 2 o daghang bulan nga wala mabayri')}</h2>
      <table className="doc-table">
        <thead><tr><th>{tr('Renter', 'Nag-abang')}</th><th>{tr('Rental space', 'Lugar')}</th><th>{tr('Rent months', 'Mga bulan')}</th><th className="doc-money">{tr('Total still due', 'Kinatibuk-ang nabilin')}</th></tr></thead>
        <tbody>{data.arrears.map(row => <tr key={row.id}><td>{row.renter}</td><td>{row.space}</td><td>{row.months}</td><td className="doc-money">{row.total}</td></tr>)}</tbody>
      </table>
    </section>}

    {data.maintenance && <section className="doc-section">
      <h2><span className="doc-number">{data.arrears.length > 0 ? 4 : 3}</span>{tr('Maintenance spending', 'Gasto sa maintenance')}</h2>
      <p className="doc-note">{tr('Repairs and upkeep recorded for', 'Mga pag-ayo ug upkeep nga narekord para sa')} {data.receiptMonth}. {tr("These are expenses only and do not change any renter's balance.", 'Gasto lang kini ug dili mo-usab sa balanse sa nag-abang.')}</p>
      {data.maintenance.items.length ? <table className="doc-table">
        <thead><tr><th>{tr('What it was for', 'Para saan')}</th><th>{tr('Where', 'Asa')}</th><th className="doc-money">{tr('Amount', 'Kantidad')}</th></tr></thead>
        <tbody>{data.maintenance.items.map(row => <tr key={row.id}><td>{row.description}</td><td>{row.place || '—'}</td><td className="doc-money">{row.amount}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={2}>{tr('Total maintenance', 'Kinatibuk-ang maintenance')}</th><td className="doc-money">{data.maintenance.total}</td></tr></tfoot>
      </table> : <p className="doc-empty">{tr('No maintenance was recorded for this month.', 'Walay maintenance nga narekord niining bulana.')}</p>}
    </section>}

    <footer className="doc-footer">
      <span>{tr('From saved records in RentByBob. Amounts in Philippine pesos. Dates in Philippine time.', 'Gikan sa natipig nga rekord sa RentByBob. Kantidad sa piso. Petsa sa oras sa Pilipinas.')}</span>
      <span>{data.propertyName} · {data.receiptMonth}</span>
    </footer>
  </article>, document.body)
}
