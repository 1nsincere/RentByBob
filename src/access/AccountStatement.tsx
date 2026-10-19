import { Button } from '../components/atoms'
import { decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { buildStatementEvents, type StatementCash, type StatementCharge } from './saved-payments-model'
import { text, type Language } from '../i18n'

function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function displayMonth(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`))
}

export function AccountStatement({
  tenantName,
  rentalSpace,
  charges,
  cash,
  openAcknowledgment,
  language = 'en',
}: {
  tenantName: string
  rentalSpace: string
  charges: StatementCharge[]
  cash: StatementCash[]
  openAcknowledgment: (acknowledgment: CashAcknowledgmentData) => void
  language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const events = buildStatementEvents(charges, cash)
  const pending = cash.filter(payment => payment.confirmed_at === null)

  return <section className="card account-statement" aria-labelledby="account-statement-heading">
    <h3 id="account-statement-heading">{tr('Account statement', 'Rekord sa account')}</h3>
    <p><strong>{tenantName}</strong> · {rentalSpace}</p>
    <p>{tr('Recorded rent charges and confirmed cash, in date order. Each charge shows its current remaining amount after confirmed payments only.', 'Mga narekord nga bayranan sa abang ug kwarta nga gikumpirma, sumala sa petsa. Ang nabilin sa matag bayranan naglakip lang sa kumpirmadong bayad.')}</p>
    {events.length ? <ol className="statement-events">
      {events.map(event => {
        if (event.kind === 'charge') return <li className="statement-event" key={`charge:${event.id}`}>
          <div className="statement-event-heading"><strong>{tr('Rent charge ·', 'Bayranan sa abang ·')} {displayMonth(event.month)}</strong><span>{displayDate(event.date)} {tr('due', 'takdang petsa')}</span></div>
          <p>{tr('Charge:', 'Bayranan:')} {decimalPesos(event.amount)}</p>
          <p>{tr('Rent remaining:', 'Nabilin nga abang:')} <strong>{decimalPesos(event.remaining)}</strong></p>
        </li>
        const acknowledgment = event.acknowledgment
        return <li className="statement-event" key={`payment:${event.id}`}>
          <div className="statement-event-heading"><strong>{tr('Confirmed cash', 'Kumpirmadong kwarta')}</strong><span>{tr('Received', 'Nadawat')} {displayDate(event.date)}</span></div>
          <p>{decimalPesos(event.amount)} {tr('received by', 'gidawat ni')} {event.collector}</p>
          {event.allocations.length
            ? <p>{tr('Applied to', 'Gigamit sa')} {event.allocations.map(allocation => `${displayMonth(allocation.month)} (${decimalPesos(allocation.amount)})`).join(', ')}</p>
            : <p>{tr('Rent allocation details are unavailable in this snapshot.', 'Wala makita ang detalye sa pagbahin sa bayad sa abang.')}</p>}
          {acknowledgment && <Button onClick={() => openAcknowledgment(acknowledgment)}>{tr('Open acknowledgment', 'Ablihi ang resibo')}</Button>}
        </li>
      })}
    </ol> : <p>{tr('No saved rent charges or confirmed cash appear in this account yet.', 'Wala pay narekord nga bayranan sa abang o kumpirmadong kwarta niini nga account.')}</p>}
    <section className="statement-pending" aria-labelledby="statement-pending-heading">
      <h4 id="statement-pending-heading">{tr('Cash reports awaiting confirmation', 'Mga report sa kwarta nga wala pa makumpirma')}</h4>
      <p>{tr('These reports are not confirmed payments and are not included in the rent balance.', 'Wala pa makumpirma kining mga report sa bayad ug wala maapil sa balanse sa abang.')}</p>
      {pending.length ? <ul>
        {pending.map(payment => <li key={payment.id}>
          <strong>{decimalPesos(payment.amount)}</strong> {tr('reported for', 'gi-report para sa')} {displayDate(payment.received_on)} · {tr('received by', 'gidawat ni')} {payment.collector} · {tr('Pending verification', 'Naghulat og kumpirmasyon')}
        </li>)}
      </ul> : <p>{tr('No pending cash reports for this agreement.', 'Walay pending nga report sa kwarta niini nga kasabotan.')}</p>}
    </section>
  </section>
}
