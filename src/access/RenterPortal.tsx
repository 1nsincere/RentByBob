import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { advancePart, chargeStatus, dueStatus, paidPercent, parseRenterAccount, summarizeAgreement, toCentavos, type RenterAccount, type RenterAgreement, type RenterTenant } from './renter-account-model.ts'
import { earliestReportDate, parsePaymentReports, reportDraftError, type PaidTo, type PaymentReport, type ReportDraft } from './payment-reports-model.ts'
import { manilaDate } from '../domain/payment-report'
import { Facade, SITE } from '../landing/street'
import { supabase } from './client'
import { text, type Language } from '../i18n'

const monthName = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`))
const dayName = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
type ReportInput = { id: string; agreementId: string; draft: ReportDraft }
// Sends a report; resolves to an error message, or null when saved. The preview passes a local, fictional sender.
export type ReportSender = (input: ReportInput) => Promise<string | null>
// Withdraws a report the property has not checked yet (202610270013); resolves to an error message, or null when done.
export type ReportWithdrawer = (reportId: string) => Promise<string | null>

function AgreementView({ agreement, language, preview, openAcknowledgment, credit, reports, sendReport, withdrawReport }: { agreement: RenterAgreement; language: Language; preview: boolean; openAcknowledgment: (data: CashAcknowledgmentData) => void; credit?: string; reports: PaymentReport[] | null; sendReport: ReportSender | null; withdrawReport: ReportWithdrawer | null }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const summary = summarizeAgreement(agreement)
  const due = dueStatus(agreement, manilaDate())
  const [startReport, setStartReport] = useState(0)
  const site = SITE.find(item => item.label === agreement.building)
  const statusLabel = { paid: tr('Paid', 'Bayad na'), 'partly-paid': tr('Partly paid', 'Bahin pa ang nabayad'), unpaid: tr('Not paid yet', 'Wala pa mabayri') }
  const dueLine = due.kind === 'clear' ? tr('All recorded rent is paid. Thank you!', 'Bayad na ang tanang narekord nga abang. Salamat!')
    : due.kind === 'upcoming' ? `${tr('Next due', 'Sunod nga bayranan')} ${dayName(due.dueDate)} · ${tr('in', 'sulod sa')} ${due.days} ${tr(due.days === 1 ? 'day' : 'days', 'ka adlaw')}`
      : due.kind === 'today' ? `${tr('Due today', 'Bayranan karon')}, ${dayName(due.dueDate)}`
        : `${monthName(due.month)} ${tr('was due', 'takdang adlaw')} ${dayName(due.dueDate)} · ${due.days} ${tr(due.days === 1 ? 'day ago' : 'days ago', 'ka adlaw na ang milabay')}`
  return <article className="renter-agreement" aria-labelledby={`renter-room-${agreement.id}`}>
    <section className={`renter-statement renter-statement--${due.kind}`} aria-label={tr('Your rent at a glance', 'Imong abang sa usa ka tan-aw')}>
      <div className="renter-statement-main">
        <p className="renter-statement-place">{tr('Your rental space', 'Imong giabangan')}</p>
        <h3 id={`renter-room-${agreement.id}`}>{agreement.building} · {agreement.room}</h3>
        <p className="renter-statement-since">{tr('Moved in', 'Misulod')} {dayName(agreement.move_in)}{agreement.ended_on && <> · <span className="status status--archived">{tr('Moved out', 'Nibalhin na')} {dayName(agreement.ended_on)}</span></>}</p>
        <div className="renter-balance-card">
          <span className="renter-balance-label">{tr('Rent left to pay', 'Nabilin nga abang')}</span>
          <strong>{decimalPesos(agreement.balance)}</strong>
          <small>{tr('Counts confirmed payments only.', 'Ang kumpirmadong bayad lang ang giihap.')}</small>
        </div>
        <p className="renter-due"><span className="renter-due-dot" aria-hidden="true" />{dueLine}</p>
        <div className="renter-statement-actions">
          {sendReport && <Button className="renter-cta" onClick={() => setStartReport(count => count + 1)}><WorkspaceIcon kind="payments" /> {tr('Report a payment', 'Ireport ang bayad')}</Button>}
          <a className="renter-link-button" href={`#renter-months-${agreement.id}`}>{tr('See rent by month', 'Tan-awa ang abang matag bulan')}</a>
        </div>
      </div>
      {site && <figure className="renter-statement-art">
        <div className="renter-building"><Facade site={site} open={[agreement.room]} width={100} /></div>
        <figcaption>{tr('Your room is the one lit up.', 'Ang imong kwarto ang nagsiga.')}</figcaption>
      </figure>}
    </section>

    <div className="renter-facts">
      <div><span>{tr('Monthly rent', 'Binulan nga abang')}</span><strong>{decimalPesos(agreement.rent)}</strong><small>{tr('As recorded by the property.', 'Sumala sa rekord sa propiedad.')}</small></div>
      {credit && <div className="renter-credit-card"><span>{tr('Advance credit', 'Abante nga bayad')}</span><strong>{decimalPesos(credit)}</strong><small>{tr('Paid ahead. It is used automatically for your next rent.', 'Abante nga nabayad. Awtomatikong gamiton sa sunod nimong abang.')}</small></div>}
      <div><span>{tr('Oldest month with rent left', 'Pinakaunang bulan nga may nabilin')}</span>
        {summary.oldestUnpaid ? <><strong className="renter-stat-text">{monthName(summary.oldestUnpaid.rental_month)}</strong><small>{decimalPesos(summary.oldestUnpaid.remaining)} {tr('left · due', 'nabilin · takdang adlaw')} {dayName(summary.oldestUnpaid.due_date)}</small></>
          : <><strong className="renter-stat-text">{tr('None', 'Wala')}</strong><small>{tr('All recorded rent is paid.', 'Bayad na ang tanang narekord nga abang.')}</small></>}
      </div>
    </div>

    {agreement.unconfirmed.length > 0 && <div className="notice renter-unconfirmed" role="note">
      <p><strong>{decimalPesos(summary.unconfirmedTotal)} {tr('is waiting for confirmation.', 'naghulat pa og kumpirmasyon.')}</strong> {tr('It is not taken off your rent until the property confirms it. Checks count only after the bank confirms them.', 'Dili pa kini ikuha sa imong abang hangtod makumpirma sa propiedad. Ang tseke maihap lang human makumpirma sa bangko.')}</p>
      <ul className="renter-pending-list">{agreement.unconfirmed.map(item => <li key={item.id}>
        <span>{item.kind === 'cash' ? tr('Cash', 'Kwarta') : `${tr('Check', 'Tseke')} ${item.reference}`} · {dayName(item.received_on)}</span>
        <strong>{decimalPesos(item.amount)}</strong>
        <span className="status status--pending">{item.kind === 'check' && item.status === 'deposited' ? tr('Deposited · awaiting bank', 'Gideposito · naghulat sa bangko') : tr('Not yet confirmed', 'Wala pa makumpirma')}</span>
      </li>)}</ul>
    </div>}

    <div className="renter-columns">
      <div className="renter-main">
        <section className="card renter-section" aria-labelledby={`renter-months-${agreement.id}`}>
          <h4 id={`renter-months-${agreement.id}`} tabIndex={-1}>{tr('Rent by month', 'Abang matag bulan')}</h4>
          {agreement.charges.length ? <ul className="renter-month-list">{[...agreement.charges].reverse().map(charge => {
            const status = chargeStatus(charge)
            const percent = paidPercent(charge)
            return <li key={charge.id} className={`renter-month renter-month--${status}`}>
              <div><strong>{monthName(charge.rental_month)}</strong><small>{tr('Due', 'Takdang adlaw')} {dayName(charge.due_date)}</small>
                <span className="renter-month-bar" aria-hidden="true"><i style={{ width: `${percent}%` } as CSSProperties} /></span></div>
              <dl><div><dt>{tr('Rent', 'Abang')}</dt><dd>{decimalPesos(charge.amount)}</dd></div><div><dt>{tr('Still to pay', 'Bayranan pa')}</dt><dd>{decimalPesos(charge.remaining)}</dd></div></dl>
              <span className={`status ${status === 'paid' ? 'status--ready' : 'status--pending'}`}>{statusLabel[status]}</span>
            </li>
          })}</ul> : <p className="field-help">{tr('No monthly rent has been recorded yet.', 'Wala pay binulan nga abang nga narekord.')}</p>}
        </section>

        <section className="card renter-section" aria-labelledby={`renter-payments-${agreement.id}`}>
          <h4 id={`renter-payments-${agreement.id}`}>{tr('Confirmed payments', 'Kumpirmadong mga bayad')}</h4>
          {summary.payments.length ? <ul className="renter-payment-list">{summary.payments.map(payment => <li key={payment.id}>
            <span className="renter-payment-stamp" aria-hidden="true">✓</span>
            <div className="renter-payment-copy">
              <strong>{decimalPesos(payment.amount)}</strong>
              <span>{payment.kind === 'cash' ? tr('Cash', 'Kwarta') : `${tr('Check', 'Tseke')} ${payment.reference}`} · {tr('received', 'nadawat')} {dayName(payment.received_on)}</span>
              <small>{payment.months.length > 0 && <>{tr('For', 'Para sa')} {payment.months.map(month => monthName(month.month)).join(', ')}</>}{advancePart(payment) && <>{payment.months.length > 0 && ' · '}{decimalPesos(advancePart(payment)!)} {tr('paid ahead (advance credit)', 'abante nga bayad')}</>}</small>
            </div>
            {payment.kind === 'cash' && <Button className="secondary-button" onClick={() => openAcknowledgment(payment.acknowledgment)}>{tr('View acknowledgment', 'Tan-awa ang pamatuod')}</Button>}
          </li>)}</ul> : <p className="field-help">{tr('No confirmed payments yet.', 'Wala pay kumpirmadong bayad.')}</p>}
          {preview && <p className="field-help">{tr('Sample acknowledgments are not proof of payment.', 'Ang sample nga pamatuod dili pamatuod sa bayad.')}</p>}
        </section>
      </div>
      {reports && sendReport && <aside className="renter-aside">
        <ReportPayment agreement={agreement} language={language} preview={preview} reports={reports.filter(report => report.agreement_id === agreement.id)} send={sendReport} withdraw={withdrawReport} start={startReport} />
      </aside>}
    </div>
  </article>
}

// Tells the property "I paid my collector". Saved as a notice only: the balance changes only after staff
// record the cash and the verifier confirms it. The request id stays the same on retries, so nothing is doubled.
function ReportPayment({ agreement, language, preview, reports, send: sendReport, withdraw, start }: { agreement: RenterAgreement; language: Language; preview: boolean; reports: PaymentReport[]; send: ReportSender; withdraw: ReportWithdrawer | null; start: number }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const today = manilaDate()
  const balance = toCentavos(agreement.balance) ? agreement.balance : null
  const blank = (): ReportDraft => ({ amount: balance ?? agreement.rent, paidOn: today, paidTo: 'Bob', note: '' })
  const [draft, setDraft] = useState<ReportDraft | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestId = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const card = useRef<HTMLElement>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  async function withdrawNow(reportId: string) {
    if (!withdraw || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const problem = await withdraw(reportId)
      if (problem) setError(problem)
      else { setConfirming(null); setMessage(tr('Report withdrawn. The property will not check it.', 'Gibawi ang report. Dili na kini susihon sa propiedad.')) }
    } catch {
      setError(tr('Connection interrupted. Try again; withdrawing twice is safe.', 'Naputol ang koneksyon. Sulayi pag-usab; luwas ang pagbawi og kaduha.'))
    } finally { setBusy(false) }
  }
  useEffect(() => { if (draft) heading.current?.focus() }, [draft === null, reviewing])
  // The "Report a payment" button at the top opens this form and brings it into view.
  useEffect(() => {
    if (!start) return
    if (!draft) { setMessage(''); setError(''); requestId.current = null; setReviewing(false); setDraft(blank()) }
    card.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [start])
  const edit = (change: Partial<ReportDraft>) => { requestId.current = null; setDraft(current => current && { ...current, ...change }) }
  const collector = (value: PaidTo) => value === 'Other' ? tr('Someone else', 'Laing tawo') : value
  const errors = { amount: tr('Enter the amount you paid, like 3500 or 3500.50.', 'Isulod ang kantidad nga imong gibayad, pananglitan 3500 o 3500.50.'), date: tr('Choose the day you paid: today or within the last 90 days.', 'Pilia ang adlaw nga nibayad ka: karon o sulod sa milabay nga 90 ka adlaw.'), note: tr('Keep the note to 300 characters or fewer.', 'Ang nota kinahanglan 300 ka letra o mas mubo.') }
  const step = !draft ? (message ? 3 : 0) : reviewing ? 2 : 1
  const steps = [tr('Details', 'Detalye'), tr('Review', 'Susiha'), tr('Sent', 'Napadala')]

  async function send() {
    if (!draft || busy) return
    requestId.current ??= crypto.randomUUID()
    setBusy(true); setError('')
    try {
      const problem = await sendReport({ id: requestId.current, agreementId: agreement.id, draft })
      if (problem) { setError(problem); return }
      requestId.current = null
      setDraft(null); setReviewing(false)
      setMessage(preview ? tr('Sample report added below. Nothing was sent.', 'Gidugang sa ubos ang sample nga report. Walay napadala.') : tr('Report sent. The property will check it. Your balance changes only after they confirm the cash.', 'Napadala ang report. Susihon kini sa propiedad. Mausab ang imong balanse kon makumpirma na nila ang kwarta.'))
    } catch {
      setError(tr('Connection interrupted. Press Send again; it will not be sent twice.', 'Naputol ang koneksyon. Pindota pag-usab ang Ipadala; dili kini madoble.'))
    } finally { setBusy(false) }
  }

  return <section ref={card} className="card renter-section renter-report" aria-labelledby={`renter-report-${agreement.id}`}>
    <div className="renter-report-head">
      <span className="renter-report-icon" aria-hidden="true"><WorkspaceIcon kind="payments" /></span>
      <div><h4 id={`renter-report-${agreement.id}`}>{tr('Report a payment', 'Ireport ang bayad')}</h4>
        <p className="field-help">{tr('Paid Bob or James in person? Tell the property here. This is only a notice: your balance changes after they confirm the cash.', 'Nibayad ka kang Bob o James? Isulti sa propiedad dinhi. Pahibalo lang kini: mausab ang imong balanse kon makumpirma na nila ang kwarta.')}</p></div>
    </div>
    {preview && <p className="renter-sample-note">{tr('Sample only: reports in this preview stay on this screen.', 'Sample lang: ang mga report niini nga preview magpabilin dinhi.')}</p>}
    <ol className="renter-steps" aria-label={tr('Report progress', 'Lakang sa report')}>
      {steps.map((label, index) => <li key={label} className={step > index + 1 ? 'is-done' : step === index + 1 ? 'is-current' : ''} aria-current={step === index + 1 ? 'step' : undefined}><span aria-hidden="true">{step > index + 1 ? '✓' : index + 1}</span>{label}</li>)}
    </ol>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    {!draft && <Button className="primary" onClick={() => { setMessage(''); setError(''); requestId.current = null; setDraft(blank()) }}>{tr('Report a payment', 'Ireport ang bayad')}</Button>}
    {draft && !reviewing && <form className="renter-report-form" noValidate onSubmit={event => {
      event.preventDefault()
      const problem = reportDraftError(draft, today)
      if (problem) { setError(errors[problem]); return }
      setError(''); setReviewing(true)
    }}>
      <h5 ref={heading} tabIndex={-1}>{tr('What did you pay?', 'Unsa imong gibayad?')}</h5>
      <label htmlFor={`report-amount-${agreement.id}`}>{tr('Amount paid (PHP)', 'Kantidad nga gibayad (PHP)')}</label>
      <div className="renter-amount"><span aria-hidden="true">₱</span><input id={`report-amount-${agreement.id}`} inputMode="decimal" autoComplete="off" value={draft.amount} onChange={event => edit({ amount: event.target.value })} required /></div>
      <div className="renter-chips" role="group" aria-label={tr('Quick amounts', 'Dali nga kantidad')}>
        {balance && <button type="button" className={draft.amount === balance ? 'is-on' : ''} aria-pressed={draft.amount === balance} onClick={() => edit({ amount: balance })}>{tr('Rent left', 'Nabilin')} {decimalPesos(balance)}</button>}
        <button type="button" className={draft.amount === agreement.rent ? 'is-on' : ''} aria-pressed={draft.amount === agreement.rent} onClick={() => edit({ amount: agreement.rent })}>{tr('Monthly rent', 'Binulan')} {decimalPesos(agreement.rent)}</button>
      </div>
      <label htmlFor={`report-date-${agreement.id}`}>{tr('Date you paid', 'Petsa nga nibayad ka')}</label>
      <input id={`report-date-${agreement.id}`} type="date" min={earliestReportDate(today)} max={today} value={draft.paidOn} onChange={event => edit({ paidOn: event.target.value })} required />
      <fieldset className="renter-collector">
        <legend>{tr('Who received it?', 'Kinsa ang nidawat?')}</legend>
        {(['Bob', 'James', 'Other'] as const).map(value => <label key={value} className={draft.paidTo === value ? 'is-on' : ''}>
          <input type="radio" name={`report-to-${agreement.id}`} value={value} checked={draft.paidTo === value} onChange={() => edit({ paidTo: value })} />
          <span>{collector(value)}</span>
        </label>)}
      </fieldset>
      <label htmlFor={`report-note-${agreement.id}`}>{tr('Note (optional)', 'Nota (dili kinahanglan)')}</label>
      <input id={`report-note-${agreement.id}`} maxLength={300} value={draft.note} aria-describedby={`report-note-help-${agreement.id}`} onChange={event => edit({ note: event.target.value })} />
      <p id={`report-note-help-${agreement.id}`} className="field-help">{tr('For example: paid at the gate, for October.', 'Pananglitan: gibayad sa gate, para sa Oktubre.')}</p>
      <div className="person-actions"><Button className="primary">{tr('Review report', 'Susiha ang report')}</Button><Button type="button" onClick={() => { setDraft(null); setError('') }}>{tr('Cancel', 'Kanselahon')}</Button></div>
    </form>}
    {draft && reviewing && <div className="renter-report-review">
      <h5 ref={heading} tabIndex={-1}>{tr('Send this report?', 'Ipadala kini nga report?')}</h5>
      <p className="renter-review-amount"><strong>{decimalPesos(draft.amount.trim())}</strong> {tr('paid to', 'gibayad kang')} {collector(draft.paidTo)} {tr('on', 'niadtong')} {dayName(draft.paidOn)}.{draft.note.trim() && <> “{draft.note.trim()}”</>}</p>
      <p className="field-help">{tr('Your balance does not change yet. The property checks the cash first.', 'Dili pa mausab ang imong balanse. Susihon una sa propiedad ang kwarta.')}</p>
      <div className="person-actions"><Button className="primary" disabled={busy} onClick={() => void send()}>{busy ? tr('Sending…', 'Gipadala…') : tr('Send report', 'Ipadala ang report')}</Button><Button disabled={busy} onClick={() => { setReviewing(false); setError('') }}>{tr('Edit', 'Usba')}</Button></div>
    </div>}
    {reports.length > 0 && <>
      <h5>{tr('Your reports', 'Imong mga report')}</h5>
      <ul className="renter-report-list">{reports.map(report => {
        const checked = report.status === 'recorded' || report.status === 'dismissed'
        return <li key={report.id} className={`renter-report-item renter-report-item--${report.status}`}>
          <div><strong>{decimalPesos(report.amount)}</strong><span>{tr('Paid to', 'Gibayad kang')} {collector(report.paid_to)} · {dayName(report.paid_on)}</span>{report.note && <small>{report.note}</small>}</div>
          <ol className="renter-track" aria-hidden="true">
            <li className="is-done">{tr('Sent', 'Napadala')}</li>
            <li className={checked ? 'is-done' : report.status === 'new' ? 'is-current' : ''}>{tr('Checked', 'Nasusi')}</li>
            <li className={report.status === 'recorded' ? 'is-done' : report.status === 'dismissed' || report.status === 'withdrawn' ? 'is-stopped' : ''}>{report.status === 'dismissed' ? tr('Not received', 'Wala madawat') : report.status === 'withdrawn' ? tr('Withdrawn', 'Gibawi') : tr('Recorded', 'Narekord')}</li>
          </ol>
          {report.status === 'new' ? <span className="status status--pending">{tr('Waiting for the property to check', 'Naghulat nga susihon sa propiedad')}</span>
            : report.status === 'recorded' ? <span className="status status--ready">{tr('Recorded by the property · counts once confirmed', 'Narekord sa propiedad · maihap kon makumpirma')}</span>
              : report.status === 'withdrawn' ? <span className="status status--archived">{tr('Withdrawn by you', 'Gibawi nimo')}</span>
                : <span className="status status--archived">{tr('Not received', 'Wala madawat')}{report.handled_note ? `: ${report.handled_note}` : ''}</span>}
          {report.status === 'new' && withdraw && (confirming === report.id
            ? <div className="renter-withdraw" role="group" aria-label={tr('Withdraw this report?', 'Bawion kini nga report?')}>
              <p>{tr('Withdraw this report? Do this only if it was a mistake.', 'Bawion kini nga report? Buhata lang kon sayop.')}</p>
              <div className="person-actions"><Button className="secondary-button" disabled={busy} onClick={() => void withdrawNow(report.id)}>{tr('Yes, withdraw', 'Oo, bawia')}</Button><Button disabled={busy} onClick={() => setConfirming(null)}>{tr('Keep it', 'Ayaw')}</Button></div>
            </div>
            : <Button className="renter-withdraw-start" onClick={() => { setConfirming(report.id); setMessage(''); setError('') }}>{tr('Withdraw report', 'Bawia ang report')}</Button>)}
        </li>
      })}</ul>
    </>}
  </section>
}

function TenantView({ tenant, language, preview, openAcknowledgment, credits, reports, sendReport, withdrawReport }: { tenant: RenterTenant; language: Language; preview: boolean; openAcknowledgment: (data: CashAcknowledgmentData) => void; credits: Record<string, string>; reports: PaymentReport[] | null; sendReport: ReportSender | null; withdrawReport: ReportWithdrawer | null }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const hour = Number(new Intl.DateTimeFormat('en-PH', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }).format(new Date())) % 24
  const greeting = hour < 12 ? tr('Good morning', 'Maayong buntag') : hour < 18 ? tr('Good afternoon', 'Maayong hapon') : tr('Good evening', 'Maayong gabii')
  return <section className="renter-tenant" aria-labelledby={`renter-tenant-${tenant.id}`}>
    <div className="renter-hero">
      <p className="eyebrow">{tenant.property} · {greeting}</p>
      <h2 id={`renter-tenant-${tenant.id}`}>{tr('Hello', 'Kumusta')}, {tenant.display_name}</h2>
      <p className="dashboard-identity">{tenant.kind === 'business' ? tr('Business renter', 'Negosyong nag-abang') : tr('Renter', 'Nag-abang')} · {tr('Here is your rent and payment record.', 'Ania ang rekord sa imong abang ug bayad.')}</p>
    </div>
    {tenant.agreements.length
      ? tenant.agreements.map(agreement => <AgreementView key={agreement.id} agreement={agreement} language={language} preview={preview} openAcknowledgment={openAcknowledgment} credit={credits[agreement.id]} reports={reports} sendReport={sendReport} withdrawReport={withdrawReport} />)
      : <div className="card empty-state"><h3>{tr('Your room is not set up yet', 'Wala pa ma-set up ang imong kwarto')}</h3><p>{tr('The property has not recorded a room and rent for you yet. Ask the owner if you expected to see it.', 'Wala pa marekord sa propiedad ang imong kwarto ug abang. Pangutana sa tag-iya kon gilauman nimo kini makita.')}</p></div>}
  </section>
}

export function RenterAccountView({ account, language = 'en', preview = false, credits = {}, reports, sendReport, withdrawReport }: { account: RenterAccount; language?: Language; preview?: boolean; credits?: Record<string, string>; reports?: PaymentReport[] | null; sendReport?: ReportSender; withdrawReport?: ReportWithdrawer }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [receipt, setReceipt] = useState<CashAcknowledgmentData | null>(null)
  // The fictional preview keeps sample reports on screen only: nothing is sent anywhere.
  const [sampleReports, setSampleReports] = useState<PaymentReport[]>([])
  const sampleSender: ReportSender = async ({ id, agreementId, draft }) => {
    setSampleReports(current => current.some(report => report.id === id) ? current : [{ id, agreement_id: agreementId, amount: draft.amount.trim(), paid_on: draft.paidOn, paid_to: draft.paidTo, note: draft.note.trim(), status: 'new', handled_note: null, created_at: new Date().toISOString() }, ...current])
    return null
  }
  const sampleWithdraw: ReportWithdrawer = async reportId => { setSampleReports(current => current.map(report => report.id === reportId && report.status === 'new' ? { ...report, status: 'withdrawn' } : report)); return null }
  const shownReports = preview ? sampleReports : reports ?? null
  const sender = preview ? sampleSender : sendReport ?? null
  const withdrawer = preview ? sampleWithdraw : withdrawReport ?? null
  return <div className="renter-portal">
    {account.tenants.length
      ? account.tenants.map(tenant => <TenantView key={tenant.id} tenant={tenant} language={language} preview={preview} openAcknowledgment={setReceipt} credits={credits} reports={shownReports} sendReport={sender} withdrawReport={withdrawer} />)
      : <div className="card empty-state"><h3>{tr('No rental record is shared with this account yet', 'Wala pay rekord sa abang nga gi-share niining account')}</h3><p>{tr('Your account works, but the owner has not linked it to your rental yet. Ask the owner to confirm the right renter record.', 'Molihok ang imong account, apan wala pa kini i-link sa tag-iya sa imong abang. Pangayo sa tag-iya nga kumpirmahon ang husto nga rekord.')}</p></div>}
    <p className="field-help renter-footnote">{tr('Pay your collector in person as usual; payments are not made on this website. You can report a payment here so the property knows to check it. Questions about a record? Contact the property owner.', 'Bayri ang imong kolektor sama sa naandan; walay bayad nga himoon sa website. Mahimo nimong ireport ang bayad dinhi aron masusi kini sa propiedad. May pangutana bahin sa rekord? Kontaka ang tag-iya sa propiedad.')}</p>
    {receipt && <CashAcknowledgment data={receipt} close={() => setReceipt(null)} preview={preview} language={language} />}
  </div>
}

// Loads the signed-in renter's own record through the read-only database function.
export function RenterPortal({ language = 'en' }: { language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [account, setAccount] = useState<RenterAccount | null>(null)
  const [failed, setFailed] = useState(false)
  const [credits, setCredits] = useState<Record<string, string>>({})
  // null hides reporting (update 202610270012 not applied, or the list failed validation).
  const [reports, setReports] = useState<PaymentReport[] | null>(null)
  const loadReports = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('read_my_payment_reports')
    try { setReports(error ? null : parsePaymentReports(data)) } catch { setReports(null) }
  }, [])
  const load = useCallback(async () => {
    setFailed(false)
    if (!supabase) { setFailed(true); return }
    void loadReports()
    // Advance credit (202610270010) is optional: missing or failing, the page still shows the rent record.
    void supabase.rpc('read_renter_credits').then(({ data: credit, error: creditError }) => setCredits(!creditError && credit && typeof credit === 'object' ? credit as Record<string, string> : {}))
    const { data, error } = await supabase.rpc('read_renter_account')
    if (error) { setFailed(true); return }
    try { setAccount(parseRenterAccount(data)) } catch { setFailed(true) }
  }, [loadReports])
  useEffect(() => { void load() }, [load])
  const sendReport: ReportSender = async ({ id, agreementId, draft }) => {
    const { error } = await supabase!.rpc('report_rent_payment', { p_id: id, p_agreement_id: agreementId, p_amount: draft.amount.trim(), p_paid_on: draft.paidOn, p_paid_to: draft.paidTo, p_note: draft.note.trim() })
    if (!error) { await loadReports(); return null }
    if (error.code === '42501') return tr('This account cannot report payments for this room. Ask the owner to check your renter link.', 'Dili makareport og bayad kini nga account para niini nga kwarto. Pangayo sa tag-iya nga susihon ang imong link.')
    if (error.message.startsWith('Too many')) return tr('Several reports are already waiting. Please wait for the property to check them.', 'Daghan na ang report nga naghulat. Palihug hulat nga susihon kini sa propiedad.')
    if (error.code === '22023') return tr('Check the amount and date, then try again. Nothing was sent.', 'Susiha ang kantidad ug petsa, unya sulayi pag-usab. Walay napadala.')
    throw new Error('Report outcome unknown')
  }
  const withdrawReport: ReportWithdrawer = async reportId => {
    const { error } = await supabase!.rpc('withdraw_payment_report', { p_report_id: reportId })
    if (!error) { await loadReports(); return null }
    if (error.code === '22023') { await loadReports(); return tr('The property already checked this report, so it cannot be withdrawn.', 'Nasusi na sa propiedad kini nga report, busa dili na mabawi.') }
    if (error.code === '42501' || /Could not find the function/.test(error.message)) return tr('This report cannot be withdrawn from this account. Contact the property.', 'Dili mabawi kini nga report gikan niini nga account. Kontaka ang propiedad.')
    throw new Error('Withdraw outcome unknown')
  }
  if (failed) return <div className="notice notice--error" role="alert">
    <p>{tr('Your rent record could not be loaded. Nothing was changed. Check your connection and try again.', 'Wala ma-load ang rekord sa imong abang. Walay nausab. Susiha ang koneksyon ug sulayi pag-usab.')}</p>
    <Button onClick={() => { setAccount(null); void load() }}>{tr('Try again', 'Sulayi pag-usab')}</Button>
  </div>
  if (!account) return <LoadingSkeleton label={tr('Loading your rent record…', 'Gikarga ang rekord sa imong abang…')} rows={4} />
  return <RenterAccountView account={account} language={language} credits={credits} reports={reports} sendReport={reports ? sendReport : undefined} withdrawReport={reports ? withdrawReport : undefined} />
}
