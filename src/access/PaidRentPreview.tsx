import { CashAcknowledgment, type CashAcknowledgmentData } from './CashAcknowledgment'
import { Button } from '../components/atoms'
import { useState } from 'react'
import { useProperty } from './property-preview-store'
import { anniversaryDue, confirmedPayments, pesos, remaining, philippineToday, validBusinessDate, type Charge, type Receipt } from './payment-preview-model'
import { type Language } from '../i18n'

type RentTerms = Record<string, { start: string; cents: bigint }>

export function PaidRentPreview({ charges, receipts, acknowledgments = {}, rentTerms = {}, addRentMonth, language = 'en' }: {
  charges: Charge[]
  receipts: Receipt[]
  acknowledgments?: Record<string,CashAcknowledgmentData>
  rentTerms?: RentTerms
  addRentMonth: (tenantId: string, month: string) => string
  language?: Language
}) {
  const bi = language === 'fil'
  const tr = (en: string, ceb: string) => bi ? ceb : en
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
    const summary = arrearsByTenant.get(renter.id) ?? { tenant: renter, building: property?.name ?? tr('Building unavailable','Walang talaan ng gusali'), room: rentedSpace?.label ?? tr('Room unavailable','Walang talaan ng kuwarto'), months: new Set<string>(), total: 0n }
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
    return `${property?.name ?? tr('Building unavailable', 'Walang talaan ng gusali')} / ${rentedSpace?.label ?? tr('Room unavailable', 'Walang talaan ng kuwarto')}`
  }
  return <section className="paid-rent-summary" aria-labelledby="paid-rent-heading">
    <div className="paid-report-heading"><div><p className="eyebrow">{tr('MONTHLY COLLECTION REPORT','BUWANANG ULAT NG KOLEKSIYON')}</p><h3 id="paid-rent-heading">{tr('Paid rent','Bayad sa upa')}</h3><p>{tr('Confirmed rent payments with outstanding rent listed below.','Mga kumpirmadong bayad sa upa at ang natitirang singil sa ibaba.')}</p></div><span className="preview-pill">{tr('Fictional preview · Resets on reload','Halimbawa lang · Mawawala kapag binuksan ulit')}</span></div>
    <section className="card paid-report-sheet" aria-label={tr('Confirmed rent payments report','Ulat ng kumpirmadong bayad sa upa')}>
      <div className="paid-report-toolbar"><div><label htmlFor="paid-month">{tr('Cash received during','Cash na natanggap sa panahong ito')}</label><input id="paid-month" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div><span className="paid-report-period">{validBusinessDate(month + '-01') ? formatMonth(month) : tr('Select a valid month','Piliin ang tamang buwan')}</span></div>
      <div className="paid-report-metrics" aria-live="polite">
        <article><span>{tr('Confirmed cash received','Kumpirmadong natanggap na cash')}</span><strong>{pesos(total)}</strong></article>
        <article><span>{tr('Renters who paid','Mga umuupang nagbayad')}</span><strong>{paidRenterCount}</strong></article>
        <article><span>{tr('Confirmed payments','Mga kumpirmadong bayad')}</span><strong>{payments.length}</strong></article>
      </div>
      <p className="field-help">{tr('Receipt month means when cash was received, not when it was confirmed. Pending reports and uncleared checks are excluded.','Ang buwan sa resibo ay ang buwang natanggap ang cash, hindi ang buwang kinumpirma. Hindi kasama ang hindi pa kumpirmado at tsekeng hindi pa nababayaran ng bangko.')}</p>
      {!paidRows.length ? <div className="paid-report-empty"><h4>{tr('No confirmed payments for this month','Walang kumpirmadong bayad ngayong buwan')}</h4><p>{tr('Choose another month, or confirm a pending cash record after checking receipt.','Pumili ng ibang buwan o kumpirmahin ang talaan ng cash pagkatapos itong suriin.')}</p></div> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Confirmed payments table','Talahanayan ng kumpirmadong bayad')} tabIndex={0}>
          <table className="paid-report-table">
            <caption>{tr('Confirmed rent payments received in','Kumpirmadong bayad sa upa na natanggap noong')} {validBusinessDate(month + '-01') ? formatMonth(month) : tr('the selected month','napiling buwan')}</caption>
            <thead><tr><th scope="col">{tr('Renter','Umuupa')}</th><th scope="col">{tr('Rental space','Lugar na inuupahan')}</th><th scope="col">{tr('Date received','Petsa ng pagkatanggap')}</th><th scope="col">{tr('Amount','Halaga')}</th><th scope="col">{tr('Rent months covered','Mga buwan ng upa na nabayaran')}</th><th scope="col">{tr('Receipt','Resibo')}</th></tr></thead>
            <tbody>{paidRows.map(({ payment, tenant, building, room, rentMonths }) => <tr key={payment.id}>
              <td data-label={tr('Renter','Umuupa')}>{tenant?.name ?? tr('Tenant unavailable','Walang talaan ng umuupa')}</td>
              <td data-label={tr('Rental space','Lugar na inuupahan')}>{building?.name ?? tr('Building unavailable','Walang talaan ng gusali')} / {room?.label ?? tr('Room unavailable','Walang talaan ng kuwarto')}</td>
              <td data-label={tr('Date received','Petsa ng pagkatanggap')}>{formatDate(payment.date)}</td>
              <td data-label={tr('Amount','Halaga')} className="paid-table-amount">{pesos(payment.cents)}</td>
              <td data-label={tr('Rent months covered','Mga buwan ng upa na nabayaran')}>{rentMonths.length ? rentMonths.map(formatMonth).join(', ') : tr('Unavailable','Wala')}</td>
              <td data-label={tr('Receipt','Resibo')}>{acknowledgments[payment.id] ? <Button className="quiet-button" onClick={() => setReceipt(acknowledgments[payment.id])}>{tr('Open acknowledgment','Buksan ang resibo')}</Button> : '—'}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={3}>{tr('Total confirmed cash received','Kabuuang kumpirmadong natanggap na cash')}</th><td className="paid-table-amount">{pesos(total)}</td><td colSpan={2}>{payments.length} {payments.length === 1 ? 'payment' : 'payments'} · {paidRenterCount} {paidRenterCount === 1 ? 'renter' : 'renters'}</td></tr></tfoot>
          </table>
        </div>}
    </section>
    <section className="card unpaid-report-sheet" aria-labelledby="unpaid-report-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('OUTSTANDING RENT','UPANG HINDI PA NABABAYARAN')}</p><h4 id="unpaid-report-heading">{tr('Renters with rent still due','Mga umuupang may singil pa')}</h4><p>{tr('Only recorded rent charges for the selected rent month are included.','Kasama lang ang mga singil na naitala sa napiling buwan.')}</p></div><div><label htmlFor="unpaid-month">{tr('Rent month','Buwan ng upa')}</label><input id="unpaid-month" type="month" value={rentMonth} onChange={event => { setRentMonth(event.target.value); setConfirmingTenant(''); setActionMessage('') }} /></div></div>
      <div className="unpaid-report-total"><span>{unpaidRenterCount} {tr(unpaidRenterCount === 1 ? 'renter with a remaining balance' : 'renters with a remaining balance',unpaidRenterCount === 1 ? 'umuupang may balanse pa' : 'mga umuupang may balanse pa')}</span><strong>{pesos(unpaidTotal)}</strong></div>
      {!unpaidRows.length ? <p className="paid-report-empty">{charges.some(charge => charge.period === rentMonth) ? tr('No remaining rent for this month.','Walang natitirang upa ngayong buwan.') : tr('No rent charges are recorded for this month. Missing setup does not mean rent is unpaid.','Walang naitalang singil sa upa ngayong buwan. Ang hindi na-set up ay hindi nangangahulugang hindi nabayaran ang upa.')}</p> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Outstanding rent table','Talahanayan ng hindi pa nababayarang upa')} tabIndex={0}>
          <table className="paid-report-table unpaid-report-table">
            <caption>{tr('Rent charges with a remaining balance for','Mga singil sa upa na may balanse pa noong')} {validBusinessDate(rentMonth + '-01') ? formatMonth(rentMonth) : tr('the selected month','napiling buwan')}</caption>
            <thead><tr><th scope="col">{tr('Renter','Umuupa')}</th><th scope="col">{tr('Rental space','Lugar na inuupahan')}</th><th scope="col">{tr('Due date','Petsa ng bayad')}</th><th scope="col">{tr('Rent charged','Singil sa upa')}</th><th scope="col">{tr('Still due','Babayaran pa')}</th></tr></thead>
            <tbody>{unpaidRows.map(({ charge, tenant, building, room, due }) => <tr key={charge.id}>
              <td data-label={tr('Renter','Umuupa')}>{tenant?.name ?? tr('Tenant unavailable','Walang talaan ng umuupa')}</td>
              <td data-label={tr('Rental space','Lugar na inuupahan')}>{building?.name ?? tr('Building unavailable','Walang talaan ng gusali')} / {room?.label ?? tr('Room unavailable','Walang talaan ng kuwarto')}</td>
              <td data-label={tr('Due date','Takdang petsa')}>{formatDate(charge.due)}</td>
              <td data-label={tr('Rent charged','Singil sa upa')}>{pesos(charge.cents)}</td>
              <td data-label={tr('Still due','Babayaran pa')} className="paid-table-amount">{pesos(due)}</td>
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={4}>{tr('Total still due','Kabuuang babayaran pa')}</th><td className="paid-table-amount">{pesos(unpaidTotal)}</td></tr></tfoot>
          </table>
        </div>}
      <p className="field-help">{tr('Partial confirmed cash reduces the remaining balance. Pending reports and uncleared checks do not.','Ang kumpirmadong bahagyang bayad ay nagpapababa ng balanse. Hindi ito binababa ng hindi pa kumpirmado o tsekeng hindi pa nababayaran ng bangko.')}</p>
    </section>
    <section className={`card arrears-report-sheet${arrearsRows.length ? ' has-arrears' : ''}`} aria-labelledby="arrears-report-heading">
      <div className="unpaid-report-heading"><div><p className="eyebrow">{tr('MULTIPLE MONTHS OUTSTANDING','MARAMING BUWANG MAY BALANSE')}</p><h4 id="arrears-report-heading">{tr('Renters with 2 or more unpaid rent months','Mga umuupang may balanse sa 2 o higit pang buwan')}</h4><p>{tr('Counts distinct recorded rent months with a remaining balance.','Bilang ng magkakaibang buwang naitala at may balanse pa.')}</p></div><span className="preview-pill">{arrearsRows.length} {tr(arrearsRows.length === 1 ? 'renter flagged' : 'renters flagged',arrearsRows.length === 1 ? 'umuupang minarkahan' : 'mga umuupang minarkahan')}</span></div>
      {!arrearsRows.length ? <p className="paid-report-empty">{tr('No renter currently has balances in 2 or more recorded rent months.','Walang umuupang may balanse sa 2 o higit pang naitalang buwan.')}</p> :
        <div className="paid-table-scroll" role="region" aria-label={tr('Renters with multiple unpaid rent months','Mga umuupang may balanse sa maraming buwan')} tabIndex={0}>
          <table className="paid-report-table arrears-report-table">
            <caption>{tr('Renters with balances in at least two distinct rent months','Mga umuupang may balanse sa hindi bababa sa dalawang magkakaibang buwan')}</caption>
            <thead><tr><th scope="col">{tr('Renter','Umuupa')}</th><th scope="col">{tr('Rental space','Lugar na inuupahan')}</th><th scope="col">{tr('Unpaid months','Mga buwang hindi pa nababayaran')}</th><th scope="col">{tr('Rent months','Mga buwan ng upa')}</th><th scope="col">{tr('Total still due','Kabuuang babayaran pa')}</th></tr></thead>
            <tbody>{arrearsRows.map(row => <tr key={row.tenant.id}>
              <td data-label={tr('Renter','Umuupa')}>{row.tenant.name}</td>
              <td data-label={tr('Rental space','Lugar na inuupahan')}>{row.building} / {row.room}</td>
              <td data-label={tr('Unpaid months','Mga buwang hindi pa nababayaran')}>{row.periods.length}</td>
              <td data-label={tr('Rent months','Mga buwan ng upa')}>{row.periods.map(formatMonth).join(', ')}</td>
              <td data-label={tr('Total still due','Kabuuang babayaran pa')} className="paid-table-amount">{pesos(row.total)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      <p className="field-help">{tr('This is based on rent charges recorded in the preview; it does not identify months without a recorded charge.','Batay ito sa mga halimbawang singil. Hindi nito ipinapakita ang mga buwang walang naitalang singil.')}</p>
    </section>
    <section className="card add-missed-month-sheet" aria-labelledby="add-missed-month-heading">
      <div><p className="eyebrow">{tr('PREVIEW RENT SETUP','HALIMBAWANG PAGTATAKDA NG UPA')}</p><h4 id="add-missed-month-heading">{tr('Add a missed rent month','Idagdag ang buwan ng upa na wala pa')}</h4><p>{tr('Choose the rent month above. Add one charge using that renter’s saved rent amount and move-in-based due date.','Piliin ang buwan ng upa sa itaas. Magdagdag ng isang singil gamit ang naka-save na halaga at takdang petsa batay sa petsa ng paglipat.')}</p></div>
      {!addableTenants.length ? <p className="paid-report-empty">{tr('No renter with saved rent setup is missing a charge for','Walang umuupang may setup ng upa na kulang ng singil noong')} {validBusinessDate(rentMonth + '-01') ? formatMonth(rentMonth) : tr('the selected month','napiling buwan')}. {tr('Set up rent first in Record and confirm, or choose a month without a recorded charge.','Itakda muna ang upa sa Record and confirm, o pumili ng buwang walang naitalang singil.')}</p> :
        <div className="add-missed-month-list">{addableTenants.map(renter => {
          const setup = rentTerms[renter.id]
          const dueDate = anniversaryDue(setup.start, rentMonth)
          const confirming = confirmingTenant === renter.id
          return <article className="add-missed-month-row" key={renter.id}>
            <div><strong>{renter.name}</strong><span>{getLocation(renter.room)} · {pesos(setup.cents)} · {tr('Due','Babayaran sa')} {formatDate(dueDate)}</span></div>
            {!confirming ? <Button className="secondary-button" onClick={() => { setConfirmingTenant(renter.id); setActionMessage('') }}>{tr('Add','Idagdag')} {formatMonth(rentMonth)} {tr('charge','na singil')}</Button> :
              <div className="add-missed-month-confirm"><p>{tr('This adds a','Magdadagdag ito ng')} {pesos(setup.cents)} {tr('rent charge for','na singil sa upa para sa')} {formatMonth(rentMonth)}, {tr('due','babayaran sa')} {formatDate(dueDate)}. {tr('It will appear as unpaid until confirmed cash is allocated. This preview change resets on reload.','Makikita ito bilang hindi pa nababayaran hanggang may kumpirmadong cash na ilalaan dito. Mawawala ang pagbabagong ito sa halimbawa kapag binuksan ulit.')}</p><Button className="primary" onClick={() => {
                const error = addRentMonth(renter.id, rentMonth)
                if (error) { setActionMessage(error); return }
                setConfirmingTenant('')
                setActionMessage(`${formatMonth(rentMonth)} ${tr('rent charge added for','na singil sa upa idinagdag para kay')} ${renter.name}.`)
              }}>{tr('Confirm add rent month','Kumpirmahin ang pagdagdag ng buwan')}</Button><Button className="secondary-button" onClick={() => setConfirmingTenant('')}>{tr('Cancel','Kanselahin')}</Button></div>}
          </article>
        })}</div>}
      <p className="field-help" role="status" aria-live="polite">{actionMessage}</p>
    </section>
    {receipt && <CashAcknowledgment data={receipt} close={() => setReceipt(null)} preview language={language} />}
  </section>
}
