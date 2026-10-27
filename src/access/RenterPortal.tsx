import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { chargeStatus, parseRenterAccount, summarizeAgreement, toCentavos, type RenterAccount, type RenterAgreement, type RenterTenant } from './renter-account-model.ts'
import { earliestReportDate, parsePaymentReports, reportDraftError, type PaidTo, type PaymentReport, type ReportDraft } from './payment-reports-model.ts'
import { manilaDate } from '../domain/payment-report'
import { supabase } from './client'
import { text, type Language } from '../i18n'

const monthName = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`))
const dayName = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

function AgreementView({ agreement, language, preview, openAcknowledgment, credit, reports, onReported }: { agreement: RenterAgreement; language: Language; preview: boolean; openAcknowledgment: (data: CashAcknowledgmentData) => void; credit?: string; reports?: PaymentReport[] | null; onReported?: () => Promise<void> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const summary = summarizeAgreement(agreement)
  const statusLabel = { paid: tr('Paid', 'Bayad na'), 'partly-paid': tr('Partly paid', 'Bahin pa ang nabayad'), unpaid: tr('Not paid yet', 'Wala pa mabayri') }
  return <article className="renter-agreement" aria-labelledby={`renter-room-${agreement.id}`}>
    <div className="renter-room-heading">
      <span className="stat-icon tone-violet" aria-hidden="true"><WorkspaceIcon kind="building" /></span>
      <div><p className="eyebrow">{tr('YOUR RENTAL SPACE', 'IMONG GIABANGAN')}</p><h3 id={`renter-room-${agreement.id}`}>{agreement.building} · {agreement.room}</h3>
        <p className="field-help">{tr('Moved in', 'Misulod')} {dayName(agreement.move_in)}{agreement.ended_on && <> · <span className="status status--archived">{tr('Moved out', 'Nibalhin na')} {dayName(agreement.ended_on)}</span></>}</p></div>
    </div>

    <div className="workspace-overview renter-overview">
      <article className="stat-card renter-balance-card">
        <span className="stat-icon tone-blue" aria-hidden="true"><WorkspaceIcon kind="payments" /></span>
        <span className="stat-label">{tr('Rent left to pay', 'Nabilin nga abang')}</span>
        <strong>{decimalPesos(agreement.balance)}</strong>
        <small>{tr('Counts confirmed payments only.', 'Ang kumpirmadong bayad lang ang giihap.')}</small>
      </article>
      <article className="stat-card">
        <span className="stat-icon tone-teal" aria-hidden="true"><WorkspaceIcon kind="home" /></span>
        <span className="stat-label">{tr('Monthly rent', 'Binulan nga abang')}</span>
        <strong>{decimalPesos(agreement.rent)}</strong>
        <small>{tr('As recorded by the property.', 'Sumala sa rekord sa propiedad.')}</small>
      </article>
      {credit && <article className="stat-card renter-credit-card">
        <span className="stat-icon tone-teal" aria-hidden="true"><WorkspaceIcon kind="payments" /></span>
        <span className="stat-label">{tr('Advance credit', 'Abante nga bayad')}</span>
        <strong>{decimalPesos(credit)}</strong>
        <small>{tr('Paid ahead. It is used automatically for your next rent.', 'Abante nga nabayad. Awtomatikong gamiton sa sunod nimong abang.')}</small>
      </article>}
      <article className="stat-card">
        <span className="stat-icon tone-amber" aria-hidden="true"><WorkspaceIcon kind="calendar" /></span>
        <span className="stat-label">{tr('Oldest month with rent left', 'Pinakaunang bulan nga may nabilin')}</span>
        {summary.oldestUnpaid ? <>
          <strong className="renter-stat-text">{monthName(summary.oldestUnpaid.rental_month)}</strong>
          <small>{decimalPesos(summary.oldestUnpaid.remaining)} {tr('left · due', 'nabilin · takdang adlaw')} {dayName(summary.oldestUnpaid.due_date)}</small>
        </> : <>
          <strong className="renter-stat-text">{tr('None', 'Wala')}</strong>
          <small>{tr('All recorded rent is paid.', 'Bayad na ang tanang narekord nga abang.')}</small>
        </>}
      </article>
    </div>

    {agreement.unconfirmed.length > 0 && <div className="notice renter-unconfirmed" role="note">
      <p><strong>{decimalPesos(summary.unconfirmedTotal)} {tr('is waiting for confirmation.', 'naghulat pa og kumpirmasyon.')}</strong> {tr('It is not taken off your rent until the property confirms it. Checks count only after the bank confirms them.', 'Dili pa kini ikuha sa imong abang hangtod makumpirma sa propiedad. Ang tseke maihap lang human makumpirma sa bangko.')}</p>
      <ul className="renter-pending-list">{agreement.unconfirmed.map(item => <li key={item.id}>
        <span>{item.kind === 'cash' ? tr('Cash', 'Kwarta') : `${tr('Check', 'Tseke')} ${item.reference}`} · {dayName(item.received_on)}</span>
        <strong>{decimalPesos(item.amount)}</strong>
        <span className="status status--pending">{item.kind === 'check' && item.status === 'deposited' ? tr('Deposited · awaiting bank', 'Gideposito · naghulat sa bangko') : tr('Not yet confirmed', 'Wala pa makumpirma')}</span>
      </li>)}</ul>
    </div>}

    <section className="card renter-section" aria-labelledby={`renter-months-${agreement.id}`}>
      <h4 id={`renter-months-${agreement.id}`}>{tr('Rent by month', 'Abang matag bulan')}</h4>
      {agreement.charges.length ? <ul className="renter-month-list">{[...agreement.charges].reverse().map(charge => {
        const status = chargeStatus(charge)
        return <li key={charge.id} className={`renter-month renter-month--${status}`}>
          <div><strong>{monthName(charge.rental_month)}</strong><small>{tr('Due', 'Takdang adlaw')} {dayName(charge.due_date)}</small></div>
          <dl><div><dt>{tr('Rent', 'Abang')}</dt><dd>{decimalPesos(charge.amount)}</dd></div><div><dt>{tr('Still to pay', 'Bayranan pa')}</dt><dd>{decimalPesos(charge.remaining)}</dd></div></dl>
          <span className={`status ${status === 'paid' ? 'status--ready' : 'status--pending'}`}>{statusLabel[status]}</span>
        </li>
      })}</ul> : <p className="field-help">{tr('No monthly rent has been recorded yet.', 'Wala pay binulan nga abang nga narekord.')}</p>}
    </section>

    <section className="card renter-section" aria-labelledby={`renter-payments-${agreement.id}`}>
      <h4 id={`renter-payments-${agreement.id}`}>{tr('Confirmed payments', 'Kumpirmadong mga bayad')}</h4>
      {summary.payments.length ? <ul className="renter-payment-list">{summary.payments.map(payment => <li key={payment.id}>
        <span className="dashboard-action-icon tone-blue" aria-hidden="true"><WorkspaceIcon kind="payments" /></span>
        <div className="renter-payment-copy">
          <strong>{decimalPesos(payment.amount)}</strong>
          <span>{payment.kind === 'cash' ? tr('Cash', 'Kwarta') : `${tr('Check', 'Tseke')} ${payment.reference}`} · {tr('received', 'nadawat')} {dayName(payment.received_on)}</span>
          <small>{tr('For', 'Para sa')} {payment.months.map(month => monthName(month.month)).join(', ')}</small>
        </div>
        {payment.kind === 'cash' && <Button className="secondary-button" onClick={() => openAcknowledgment(payment.acknowledgment)}>{tr('View acknowledgment', 'Tan-awa ang pamatuod')}</Button>}
      </li>)}</ul> : <p className="field-help">{tr('No confirmed payments yet.', 'Wala pay kumpirmadong bayad.')}</p>}
      {preview && <p className="field-help">{tr('Sample acknowledgments are not proof of payment.', 'Ang sample nga pamatuod dili pamatuod sa bayad.')}</p>}
    </section>

    {reports && onReported && <ReportPayment agreement={agreement} language={language} reports={reports.filter(report => report.agreement_id === agreement.id)} onReported={onReported} />}
  </article>
}

// Tells the property "I paid my collector". Saved as a notice only: the balance changes only after staff
// record the cash and the verifier confirms it. The request id stays the same on retries, so nothing is doubled.
function ReportPayment({ agreement, language, reports, onReported }: { agreement: RenterAgreement; language: Language; reports: PaymentReport[]; onReported: () => Promise<void> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const today = manilaDate()
  const blank = (): ReportDraft => ({ amount: toCentavos(agreement.balance) ? agreement.balance : agreement.rent, paidOn: today, paidTo: 'Bob', note: '' })
  const [draft, setDraft] = useState<ReportDraft | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestId = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (draft) heading.current?.focus() }, [draft === null, reviewing])
  const collector = (value: PaidTo) => value === 'Other' ? tr('Someone else', 'Laing tawo') : value
  const errors = { amount: tr('Enter the amount you paid, like 3500 or 3500.50.', 'Isulod ang kantidad nga imong gibayad, pananglitan 3500 o 3500.50.'), date: tr('Choose the day you paid: today or within the last 90 days.', 'Pilia ang adlaw nga nibayad ka: karon o sulod sa milabay nga 90 ka adlaw.'), note: tr('Keep the note to 300 characters or fewer.', 'Ang nota kinahanglan 300 ka letra o mas mubo.') }
  const statusOf = (report: PaymentReport) => report.status === 'new'
    ? <span className="status status--pending">{tr('Waiting for the property to check', 'Naghulat nga susihon sa propiedad')}</span>
    : report.status === 'recorded'
      ? <span className="status status--ready">{tr('Recorded by the property · counts once confirmed', 'Narekord sa propiedad · maihap kon makumpirma')}</span>
      : <span className="status status--archived">{tr('Not received', 'Wala madawat')}{report.handled_note ? `: ${report.handled_note}` : ''}</span>

  async function send() {
    if (!draft || !supabase || busy) return
    requestId.current ??= crypto.randomUUID()
    setBusy(true); setError('')
    try {
      const { error: sendError } = await supabase.rpc('report_rent_payment', { p_id: requestId.current, p_agreement_id: agreement.id, p_amount: draft.amount.trim(), p_paid_on: draft.paidOn, p_paid_to: draft.paidTo, p_note: draft.note.trim() })
      if (sendError) {
        if (sendError.code === '22023' || sendError.code === '42501') requestId.current = null
        setError(sendError.code === '42501'
          ? tr('This account cannot report payments for this room. Ask the owner to check your renter link.', 'Dili makareport og bayad kini nga account para niini nga kwarto. Pangayo sa tag-iya nga susihon ang imong link.')
          : sendError.message.startsWith('Too many') ? tr('Several reports are already waiting. Please wait for the property to check them.', 'Daghan na ang report nga naghulat. Palihug hulat nga susihon kini sa propiedad.')
          : sendError.code === '22023' ? tr('Check the amount and date, then try again. Nothing was sent.', 'Susiha ang kantidad ug petsa, unya sulayi pag-usab. Walay napadala.')
          : tr('The report could not be confirmed. Press Send again; it will not be sent twice.', 'Wala makumpirma ang report. Pindota pag-usab ang Ipadala; dili kini madoble.'))
        return
      }
      requestId.current = null
      setDraft(null); setReviewing(false)
      setMessage(tr('Report sent. The property will check it. Your balance changes only after they confirm the cash.', 'Napadala ang report. Susihon kini sa propiedad. Mausab ang imong balanse kon makumpirma na nila ang kwarta.'))
      await onReported()
    } catch {
      setError(tr('Connection interrupted. Press Send again; it will not be sent twice.', 'Naputol ang koneksyon. Pindota pag-usab ang Ipadala; dili kini madoble.'))
    } finally { setBusy(false) }
  }

  return <section className="card renter-section renter-report" aria-labelledby={`renter-report-${agreement.id}`}>
    <h4 id={`renter-report-${agreement.id}`}>{tr('Report a payment', 'Ireport ang bayad')}</h4>
    <p className="field-help">{tr('Paid Bob or James in person? Tell the property here. This is only a notice: your balance changes after they confirm the cash.', 'Nibayad ka kang Bob o James? Isulti sa propiedad dinhi. Pahibalo lang kini: mausab ang imong balanse kon makumpirma na nila ang kwarta.')}</p>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    {!draft && <Button className="primary" onClick={() => { setMessage(''); setError(''); requestId.current = null; setDraft(blank()) }}>{tr('Report a payment', 'Ireport ang bayad')}</Button>}
    {draft && !reviewing && <form className="rent-setup renter-report-form" noValidate onSubmit={event => {
      event.preventDefault()
      const problem = reportDraftError(draft, today)
      if (problem) { setError(errors[problem]); return }
      setError(''); setReviewing(true)
    }}>
      <h5 ref={heading} tabIndex={-1}>{tr('What did you pay?', 'Unsa imong gibayad?')}</h5>
      <label htmlFor={`report-amount-${agreement.id}`}>{tr('Amount paid (PHP)', 'Kantidad nga gibayad (PHP)')}</label>
      <input id={`report-amount-${agreement.id}`} inputMode="decimal" autoComplete="off" value={draft.amount} onChange={event => { requestId.current = null; setDraft({ ...draft, amount: event.target.value }) }} required />
      <label htmlFor={`report-date-${agreement.id}`}>{tr('Date you paid', 'Petsa nga nibayad ka')}</label>
      <input id={`report-date-${agreement.id}`} type="date" min={earliestReportDate(today)} max={today} value={draft.paidOn} onChange={event => { requestId.current = null; setDraft({ ...draft, paidOn: event.target.value }) }} required />
      <label htmlFor={`report-to-${agreement.id}`}>{tr('Who received it?', 'Kinsa ang nidawat?')}</label>
      <select id={`report-to-${agreement.id}`} value={draft.paidTo} onChange={event => { requestId.current = null; setDraft({ ...draft, paidTo: event.target.value as PaidTo }) }}>
        <option value="Bob">Bob</option><option value="James">James</option><option value="Other">{tr('Someone else', 'Laing tawo')}</option>
      </select>
      <label htmlFor={`report-note-${agreement.id}`}>{tr('Note (optional)', 'Nota (dili kinahanglan)')}</label>
      <input id={`report-note-${agreement.id}`} maxLength={300} value={draft.note} aria-describedby={`report-note-help-${agreement.id}`} onChange={event => { requestId.current = null; setDraft({ ...draft, note: event.target.value }) }} />
      <p id={`report-note-help-${agreement.id}`} className="field-help">{tr('For example: paid at the gate, for October.', 'Pananglitan: gibayad sa gate, para sa Oktubre.')}</p>
      <div className="person-actions"><Button className="primary">{tr('Review report', 'Susiha ang report')}</Button><Button type="button" onClick={() => { setDraft(null); setError('') }}>{tr('Cancel', 'Kanselahon')}</Button></div>
    </form>}
    {draft && reviewing && <div className="renter-report-review">
      <h5 ref={heading} tabIndex={-1}>{tr('Send this report?', 'Ipadala kini nga report?')}</h5>
      <p><strong>{decimalPesos(draft.amount.trim())}</strong> {tr('paid to', 'gibayad kang')} {collector(draft.paidTo)} {tr('on', 'niadtong')} {dayName(draft.paidOn)}.{draft.note.trim() && <> “{draft.note.trim()}”</>}</p>
      <p className="field-help">{tr('Your balance does not change yet. The property checks the cash first.', 'Dili pa mausab ang imong balanse. Susihon una sa propiedad ang kwarta.')}</p>
      <div className="person-actions"><Button className="primary" disabled={busy} onClick={() => void send()}>{busy ? tr('Sending…', 'Gipadala…') : tr('Send report', 'Ipadala ang report')}</Button><Button disabled={busy} onClick={() => { setReviewing(false); setError('') }}>{tr('Edit', 'Usba')}</Button></div>
    </div>}
    {reports.length > 0 && <>
      <h5>{tr('Your reports', 'Imong mga report')}</h5>
      <ul className="renter-report-list">{reports.map(report => <li key={report.id}>
        <div><strong>{decimalPesos(report.amount)}</strong><span>{tr('Paid to', 'Gibayad kang')} {collector(report.paid_to)} · {dayName(report.paid_on)}</span>{report.note && <small>{report.note}</small>}</div>
        {statusOf(report)}
      </li>)}</ul>
    </>}
  </section>
}

function TenantView({ tenant, language, preview, openAcknowledgment, credits, reports, onReported }: { tenant: RenterTenant; language: Language; preview: boolean; openAcknowledgment: (data: CashAcknowledgmentData) => void; credits: Record<string, string>; reports?: PaymentReport[] | null; onReported?: () => Promise<void> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return <section className="renter-tenant" aria-labelledby={`renter-tenant-${tenant.id}`}>
    <div className="dashboard-welcome renter-hero">
      <p className="eyebrow">{tenant.property}</p>
      <h2 id={`renter-tenant-${tenant.id}`}>{tr('Hello', 'Kumusta')}, {tenant.display_name}</h2>
      <p className="dashboard-identity">{tenant.kind === 'business' ? tr('Business renter', 'Negosyong nag-abang') : tr('Renter', 'Nag-abang')} · {tr('Here is your rent and payment record.', 'Ania ang rekord sa imong abang ug bayad.')}</p>
    </div>
    {tenant.agreements.length
      ? tenant.agreements.map(agreement => <AgreementView key={agreement.id} agreement={agreement} language={language} preview={preview} openAcknowledgment={openAcknowledgment} credit={credits[agreement.id]} reports={reports} onReported={onReported} />)
      : <div className="card empty-state"><h3>{tr('Your room is not set up yet', 'Wala pa ma-set up ang imong kwarto')}</h3><p>{tr('The property has not recorded a room and rent for you yet. Ask the owner if you expected to see it.', 'Wala pa marekord sa propiedad ang imong kwarto ug abang. Pangutana sa tag-iya kon gilauman nimo kini makita.')}</p></div>}
  </section>
}

export function RenterAccountView({ account, language = 'en', preview = false, credits = {}, reports, onReported }: { account: RenterAccount; language?: Language; preview?: boolean; credits?: Record<string, string>; reports?: PaymentReport[] | null; onReported?: () => Promise<void> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [receipt, setReceipt] = useState<CashAcknowledgmentData | null>(null)
  // The staff preview never offers reporting: it has no renter session.
  const reportsShown = preview ? null : reports
  return <div className="renter-portal">
    {account.tenants.length
      ? account.tenants.map(tenant => <TenantView key={tenant.id} tenant={tenant} language={language} preview={preview} openAcknowledgment={setReceipt} credits={credits} reports={reportsShown} onReported={onReported} />)
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
  if (failed) return <div className="notice notice--error" role="alert">
    <p>{tr('Your rent record could not be loaded. Nothing was changed. Check your connection and try again.', 'Wala ma-load ang rekord sa imong abang. Walay nausab. Susiha ang koneksyon ug sulayi pag-usab.')}</p>
    <Button onClick={() => { setAccount(null); void load() }}>{tr('Try again', 'Sulayi pag-usab')}</Button>
  </div>
  if (!account) return <LoadingSkeleton label={tr('Loading your rent record…', 'Gikarga ang rekord sa imong abang…')} rows={4} />
  return <RenterAccountView account={account} language={language} credits={credits} reports={reports} onReported={loadReports} />
}
