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
        const reversal = event.reversal
        return <li className={`statement-event ${reversal ? 'statement-event--reversed' : ''}`} key={`payment:${event.id}`}>
          <div className="statement-event-heading"><strong>{reversal ? tr('Reversed cash', 'Gibawi nga kwarta') : tr('Confirmed cash', 'Kumpirmadong kwarta')}</strong><span>{tr('Received', 'Nadawat')} {displayDate(event.date)}</span></div>
          <p>{decimalPesos(event.amount)} {tr('received by', 'gidawat ni')} {event.collector}</p>
          {reversal ? <p className="status status--error">{tr('Reversed', 'Gibawi')} {displayDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(reversal.reversed_at)))}: {reversal.reason}. {tr('It no longer pays any rent.', 'Dili na kini bayad sa bisan unsang abang.')}</p>
            : event.allocations.length
            ? <p>{tr('Applied to', 'Gigamit sa')} {event.allocations.map(allocation => `${displayMonth(allocation.month)} (${decimalPesos(allocation.amount)})`).join(', ')}</p>
            : <p>{tr('Rent allocation details are unavailable in this snapshot.', 'Wala makita ang detalye sa pagbahin sa bayad sa abang.')}</p>}
          {acknowledgment && <Button onClick={() => openAcknowledgment(acknowledgment)}>{tr('Open acknowledgment', 'Ablihi ang resibo')}</Button>}
          {owner && reverse && !reversal && (reversing !== event.id
            ? <Button variant="danger-quiet" size="sm" disabled={busy} onClick={() => setReversing(event.id)}>{tr('Reverse payment', 'Bawia ang bayad')}</Button>
            : <form className="statement-reverse" onSubmit={async e => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason')).trim(); if (!reason) return; if (await reverse(event.id, reason)) setReversing('') }}>
              <p><strong>{tr('Reverse this confirmed payment?', 'Bawion kining kumpirmadong bayad?')}</strong> {tr('The rent it paid will be owed again. The payment, its acknowledgment and this reason stay in the history.', 'Mabayran na usab ang abang nga gibayran niini. Magpabilin sa kasaysayan ang bayad, ang resibo ug kining rason.')}</p>
              <label htmlFor={`reverse-reason-${event.id}`}>{tr('Reason (required)', 'Rason (kinahanglan)')}</label>
              <textarea id={`reverse-reason-${event.id}`} name="reason" required maxLength={500} />
              <div className="person-actions"><Button variant="danger" disabled={busy}>{tr('Reverse payment', 'Bawia ang bayad')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setReversing('')}>{tr('Keep payment', 'Ayaw bawia')}</Button></div>
            </form>)}
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
