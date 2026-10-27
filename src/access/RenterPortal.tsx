import { useCallback, useEffect, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { CashAcknowledgment, decimalPesos, type CashAcknowledgmentData } from './CashAcknowledgment'
import { chargeStatus, parseRenterAccount, summarizeAgreement, type RenterAccount, type RenterAgreement, type RenterTenant } from './renter-account-model.ts'
import { supabase } from './client'
import { text, type Language } from '../i18n'

const monthName = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 7)}-01T00:00:00Z`))
const dayName = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))

function AgreementView({ agreement, language, preview, openAcknowledgment, credit }: { agreement: RenterAgreement; language: Language; preview: boolean; openAcknowledgment: (data: CashAcknowledgmentData) => void; credit?: string }) {
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
  </article>
}

function TenantView({ tenant, language, preview, openAcknowledgment, credits }: { tenant: RenterTenant; language: Language; preview: boolean; openAcknowledgment: (data: CashAcknowledgmentData) => void; credits: Record<string, string> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return <section className="renter-tenant" aria-labelledby={`renter-tenant-${tenant.id}`}>
    <div className="dashboard-welcome renter-hero">
      <p className="eyebrow">{tenant.property}</p>
      <h2 id={`renter-tenant-${tenant.id}`}>{tr('Hello', 'Kumusta')}, {tenant.display_name}</h2>
      <p className="dashboard-identity">{tenant.kind === 'business' ? tr('Business renter', 'Negosyong nag-abang') : tr('Renter', 'Nag-abang')} · {tr('Here is your rent and payment record.', 'Ania ang rekord sa imong abang ug bayad.')}</p>
    </div>
    {tenant.agreements.length
      ? tenant.agreements.map(agreement => <AgreementView key={agreement.id} agreement={agreement} language={language} preview={preview} openAcknowledgment={openAcknowledgment} credit={credits[agreement.id]} />)
      : <div className="card empty-state"><h3>{tr('Your room is not set up yet', 'Wala pa ma-set up ang imong kwarto')}</h3><p>{tr('The property has not recorded a room and rent for you yet. Ask the owner if you expected to see it.', 'Wala pa marekord sa propiedad ang imong kwarto ug abang. Pangutana sa tag-iya kon gilauman nimo kini makita.')}</p></div>}
  </section>
}

export function RenterAccountView({ account, language = 'en', preview = false, credits = {} }: { account: RenterAccount; language?: Language; preview?: boolean; credits?: Record<string, string> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [receipt, setReceipt] = useState<CashAcknowledgmentData | null>(null)
  return <div className="renter-portal">
    {account.tenants.length
      ? account.tenants.map(tenant => <TenantView key={tenant.id} tenant={tenant} language={language} preview={preview} openAcknowledgment={setReceipt} credits={credits} />)
      : <div className="card empty-state"><h3>{tr('No rental record is shared with this account yet', 'Wala pay rekord sa abang nga gi-share niining account')}</h3><p>{tr('Your account works, but the owner has not linked it to your rental yet. Ask the owner to confirm the right renter record.', 'Molihok ang imong account, apan wala pa kini i-link sa tag-iya sa imong abang. Pangayo sa tag-iya nga kumpirmahon ang husto nga rekord.')}</p></div>}
    <p className="field-help renter-footnote">{tr('This page is for viewing only. Pay your collector in person as usual; payments are not made on this website. Questions about a record? Contact the property owner.', 'Para tan-awon lang kini nga panid. Bayri ang imong kolektor sama sa naandan; walay bayad nga himoon sa website. May pangutana bahin sa rekord? Kontaka ang tag-iya sa propiedad.')}</p>
    {receipt && <CashAcknowledgment data={receipt} close={() => setReceipt(null)} preview={preview} language={language} />}
  </div>
}

// Loads the signed-in renter's own record through the read-only database function.
export function RenterPortal({ language = 'en' }: { language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [account, setAccount] = useState<RenterAccount | null>(null)
  const [failed, setFailed] = useState(false)
  const [credits, setCredits] = useState<Record<string, string>>({})
  const load = useCallback(async () => {
    setFailed(false)
    if (!supabase) { setFailed(true); return }
    // Advance credit (202610270010) is optional: missing or failing, the page still shows the rent record.
    void supabase.rpc('read_renter_credits').then(({ data: credit, error: creditError }) => setCredits(!creditError && credit && typeof credit === 'object' ? credit as Record<string, string> : {}))
    const { data, error } = await supabase.rpc('read_renter_account')
    if (error) { setFailed(true); return }
    try { setAccount(parseRenterAccount(data)) } catch { setFailed(true) }
  }, [])
  useEffect(() => { void load() }, [load])
  if (failed) return <div className="notice notice--error" role="alert">
    <p>{tr('Your rent record could not be loaded. Nothing was changed. Check your connection and try again.', 'Wala ma-load ang rekord sa imong abang. Walay nausab. Susiha ang koneksyon ug sulayi pag-usab.')}</p>
    <Button onClick={() => { setAccount(null); void load() }}>{tr('Try again', 'Sulayi pag-usab')}</Button>
  </div>
  if (!account) return <LoadingSkeleton label={tr('Loading your rent record…', 'Gikarga ang rekord sa imong abang…')} rows={4} />
  return <RenterAccountView account={account} language={language} credits={credits} />
}
