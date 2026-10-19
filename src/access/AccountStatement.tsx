import { Button } from '../components/atoms'
import { decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { buildStatementEvents, type StatementCash, type StatementCharge } from './saved-payments-model'

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
}: {
  tenantName: string
  rentalSpace: string
  charges: StatementCharge[]
  cash: StatementCash[]
  openAcknowledgment: (acknowledgment: CashAcknowledgmentData) => void
}) {
  const events = buildStatementEvents(charges, cash)
  const pending = cash.filter(payment => payment.confirmed_at === null)

  return <section className="card account-statement" aria-labelledby="account-statement-heading">
    <h3 id="account-statement-heading">Account statement</h3>
    <p><strong>{tenantName}</strong> · {rentalSpace}</p>
    <p>Recorded rent charges and confirmed cash, in date order. Each charge shows its current remaining amount after confirmed payments only.</p>
    {events.length ? <ol className="statement-events">
      {events.map(event => {
        if (event.kind === 'charge') return <li className="statement-event" key={`charge:${event.id}`}>
          <div className="statement-event-heading"><strong>Rent charge · {displayMonth(event.month)}</strong><span>{displayDate(event.date)} due</span></div>
          <p>Charge: {decimalPesos(event.amount)}</p>
          <p>Rent remaining: <strong>{decimalPesos(event.remaining)}</strong></p>
        </li>
        const acknowledgment = event.acknowledgment
        return <li className="statement-event" key={`payment:${event.id}`}>
          <div className="statement-event-heading"><strong>Confirmed cash</strong><span>Received {displayDate(event.date)}</span></div>
          <p>{decimalPesos(event.amount)} received by {event.collector}</p>
          {event.allocations.length
            ? <p>Applied to {event.allocations.map(allocation => `${displayMonth(allocation.month)} (${decimalPesos(allocation.amount)})`).join(', ')}</p>
            : <p>Rent allocation details are unavailable in this snapshot.</p>}
          {acknowledgment && <Button onClick={() => openAcknowledgment(acknowledgment)}>Open acknowledgment</Button>}
        </li>
      })}
    </ol> : <p>No saved rent charges or confirmed cash appear in this account yet.</p>}
    <section className="statement-pending" aria-labelledby="statement-pending-heading">
      <h4 id="statement-pending-heading">Cash reports awaiting confirmation</h4>
      <p>These reports are not confirmed payments and are not included in the rent balance.</p>
      {pending.length ? <ul>
        {pending.map(payment => <li key={payment.id}>
          <strong>{decimalPesos(payment.amount)}</strong> reported for {displayDate(payment.received_on)} · received by {payment.collector} · Pending verification
        </li>)}
      </ul> : <p>No pending cash reports for this agreement.</p>}
    </section>
  </section>
}
