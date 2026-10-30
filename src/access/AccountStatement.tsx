import { useState } from 'react'
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
  owner = false,
  busy = false,
  reverse,
  language = 'en',
}: {
  tenantName: string
  rentalSpace: string
  charges: StatementCharge[]
  cash: StatementCash[]
  openAcknowledgment: (acknowledgment: CashAcknowledgmentData) => void
  owner?: boolean
  busy?: boolean
  reverse?: (cashId: string, reason: string) => Promise<unknown>
  language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const events = buildStatementEvents(charges, cash)
  const pending = cash.filter(payment => payment.confirmed_at === null)
  const [reversing, setReversing] = useState('')

  return <section className="card account-statement" aria-labelledby="account-statement-heading">
    <h3 id="account-statement-heading">{tr('Account statement', 'Talaan ng account')}</h3>
    <p><strong>{tenantName}</strong> · {rentalSpace}</p>
    <p>{tr('Recorded rent charges and confirmed cash, in date order. Each charge shows its current remaining amount after confirmed payments only.', 'Mga naitalang singil sa upa at kumpirmadong cash, ayon sa petsa. Ang natitira sa bawat singil ay kumpirmadong bayad lang ang ibinabawas.')}</p>
    {events.length ? <ol className="statement-events">
      {events.map(event => {
        if (event.kind === 'charge') return <li className="statement-event" key={`charge:${event.id}`}>
          <div className="statement-event-heading"><strong>{tr('Rent charge ·', 'Singil sa upa ·')} {displayMonth(event.month)}</strong><span>{displayDate(event.date)} {tr('due', 'takdang petsa')}</span></div>
          <p>{tr('Charge:', 'Singil:')} {decimalPesos(event.amount)}</p>
          <p>{tr('Rent remaining:', 'Natitirang upa:')} <strong>{decimalPesos(event.remaining)}</strong></p>
        </li>
        const acknowledgment = event.acknowledgment
        const reversal = event.reversal
        return <li className={`statement-event ${reversal ? 'statement-event--reversed' : ''}`} key={`payment:${event.id}`}>
          <div className="statement-event-heading"><strong>{reversal ? tr('Reversed cash', 'Binawing cash') : tr('Confirmed cash', 'Kumpirmadong cash')}</strong><span>{tr('Received', 'Natanggap')} {displayDate(event.date)}</span></div>
          <p>{decimalPesos(event.amount)} {tr('received by', 'tinanggap ni')} {event.collector}</p>
          {reversal ? <p className="status status--error">{tr('Reversed', 'Binawi')} {displayDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(reversal.reversed_at)))}: {reversal.reason}. {tr('It no longer pays any rent.', 'Hindi na ito bayad sa anumang upa.')}</p>
            : event.allocations.length
            ? <p>{tr('Applied to', 'Ginamit sa')} {event.allocations.map(allocation => `${displayMonth(allocation.month)} (${decimalPesos(allocation.amount)})`).join(', ')}</p>
            : <p>{tr('Rent allocation details are unavailable in this snapshot.', 'Hindi makita ang detalye ng pagbabahagi ng bayad sa upa.')}</p>}
          {acknowledgment && <Button onClick={() => openAcknowledgment(acknowledgment)}>{tr('Open acknowledgment', 'Buksan ang resibo')}</Button>}
          {owner && reverse && !reversal && (reversing !== event.id
            ? <Button variant="danger-quiet" size="sm" disabled={busy} onClick={() => setReversing(event.id)}>{tr('Reverse payment', 'Bawiin ang bayad')}</Button>
            : <form className="statement-reverse" onSubmit={async e => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason')).trim(); if (!reason) return; if (await reverse(event.id, reason)) setReversing('') }}>
              <p><strong>{tr('Reverse this confirmed payment?', 'Bawiin ang kumpirmadong bayad na ito?')}</strong> {tr('The rent it paid will be owed again. The payment, its acknowledgment and this reason stay in the history.', 'Babayaran ulit ang upang binayaran nito. Mananatili sa kasaysayan ang bayad, ang resibo at ang dahilang ito.')}</p>
              <label htmlFor={`reverse-reason-${event.id}`}>{tr('Reason (required)', 'Dahilan (kailangan)')}</label>
              <textarea id={`reverse-reason-${event.id}`} name="reason" required maxLength={500} />
              <div className="person-actions"><Button variant="danger" disabled={busy}>{tr('Reverse payment', 'Bawiin ang bayad')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setReversing('')}>{tr('Keep payment', 'Huwag bawiin')}</Button></div>
            </form>)}
        </li>
      })}
    </ol> : <p>{tr('No saved rent charges or confirmed cash appear in this account yet.', 'Wala pang naitalang singil sa upa o kumpirmadong cash sa account na ito.')}</p>}
    <section className="statement-pending" aria-labelledby="statement-pending-heading">
      <h4 id="statement-pending-heading">{tr('Cash reports awaiting confirmation', 'Mga ulat ng cash na hindi pa nakukumpirma')}</h4>
      <p>{tr('These reports are not confirmed payments and are not included in the rent balance.', 'Hindi pa nakukumpirma ang mga ulat ng bayad na ito at hindi kasama sa balanse ng upa.')}</p>
      {pending.length ? <ul>
        {pending.map(payment => <li key={payment.id}>
          <strong>{decimalPesos(payment.amount)}</strong> {tr('reported for', 'iniulat para sa')} {displayDate(payment.received_on)} · {tr('received by', 'tinanggap ni')} {payment.collector} · {tr('Pending verification', 'Naghihintay ng kumpirmasyon')}
        </li>)}
      </ul> : <p>{tr('No pending cash reports for this agreement.', 'Walang nakabinbing ulat ng cash sa kasunduang ito.')}</p>}
    </section>
  </section>
}
