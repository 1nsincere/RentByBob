import { useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { decimalPesos } from './CashAcknowledgment'
import { buildCollectionsOverview, type CollectionsOverview as Overview } from './collections-overview-model.ts'
import { buildRentFollowUp, reminderText, type LateRow, type RentFollowUp } from './rent-followup-model.ts'
import { parsePaymentReports } from './payment-reports-model.ts'
import { parseRentWorkspaceSnapshot } from './saved-payments-model.ts'
import { philippineToday } from './payment-preview-model.ts'
import { supabase, type Tenant } from './client'
import { text, type Language } from '../i18n'

const monthName = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`))
const shortMonth = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`))
const dayName = (date: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
const positive = (value: string) => /[1-9]/.test(value)

// Read-only staff dashboard figures from the authorized rent workspace snapshot (staff MFA enforced by the database).
export function CollectionsOverview({ propertyId, tenants, openPayments, language = 'en' }: { propertyId: string; tenants: Tenant[]; openPayments: (tenantId?: string) => void; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [followUp, setFollowUp] = useState<RentFollowUp | null>(null)
  const [renterReports, setRenterReports] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [copied, setCopied] = useState('')
  const tenantsRef = useRef(tenants)
  useEffect(() => { tenantsRef.current = tenants }, [tenants])
  useEffect(() => {
    let alive = true
    setState('loading')
    // Renter payment reports (202610270012) are optional: missing or failing, the count stays 0.
    void supabase!.rpc('read_payment_reports', { p_property_id: propertyId }).then(({ data, error }) => {
      try { if (alive && !error) setRenterReports(parsePaymentReports(data).filter(report => report.status === 'new').length) } catch { /* hidden */ }
    }, () => undefined)
    void (async () => {
      try {
        const { data, error } = await supabase!.rpc('read_rent_workspace', { p_property_id: propertyId })
        if (error) throw error
        const snapshot = parseRentWorkspaceSnapshot(data, tenantsRef.current)
        const today = philippineToday()
        if (alive) {
          setOverview(buildCollectionsOverview(snapshot, tenantsRef.current, today.slice(0, 7)))
          setFollowUp(buildRentFollowUp(snapshot, tenantsRef.current, today))
          setState('ready')
        }
      } catch {
        if (alive) setState('unavailable')
      }
    })()
    return () => { alive = false }
  }, [propertyId])

  if (state === 'unavailable') return <p className="notice collections-unavailable" role="status">{tr('Collection figures are unavailable right now. Open Payments and balances to check saved records.', 'Hindi makita ngayon ang mga numero ng koleksiyon. Buksan ang Mga bayad at balanse para suriin ang mga talaan.')}</p>
  if (state === 'loading' || !overview || !followUp) return <LoadingSkeleton label={tr('Loading collection figures…', 'Nilo-load ang mga numero ng koleksiyon…')} rows={3} shape="stats" />
  const month = monthName(overview.month)
  const waiting = overview.pendingCash.count + overview.unclearedChecks.count
  const reminder = (row: LateRow) => reminderText(row, language, decimalPesos, monthName, dayName)
  async function copyReminder(row: LateRow) {
    try { await navigator.clipboard.writeText(reminder(row)); setCopied(row.agreementId) }
    catch { setCopied(`failed:${row.agreementId}`) }
  }
  return <>
    {renterReports > 0 && <div className="notice report-alert" role="status"><p><strong>{renterReports} {tr(renterReports === 1 ? 'renter says they paid.' : 'renters say they paid.', 'umuupa ang nagsabing nagbayad sila.')}</strong> {tr('Check with the collector, then record the cash or mark it not received.', 'Tanungin ang kolektor, saka itala ang cash o markahang hindi natanggap.')}</p><Button className="primary" onClick={() => openPayments()}>{tr('Check reports', 'Suriin ang mga ulat')}</Button></div>}
    <section className="collections-overview" aria-labelledby="collections-heading">
      <div className="collections-heading"><div><p className="eyebrow">{tr('COLLECTIONS', 'KOLEKSIYON')}</p><h3 id="collections-heading">{month}</h3></div>
        <Button className="secondary-button" onClick={() => openPayments()}>{tr('Open payments', 'Buksan ang mga bayad')}</Button></div>
      <div className="collections-grid">
        <article className="stat-card">
          <span className="stat-icon tone-teal" aria-hidden="true"><WorkspaceIcon kind="payments" /></span>
          <span className="stat-label">{tr('Confirmed cash received', 'Kumpirmadong cash na natanggap')}</span>
          <strong>{decimalPesos(overview.confirmedCash)}</strong>
          <small>{overview.confirmedPayments} {tr(overview.confirmedPayments === 1 ? 'payment' : 'payments', 'bayad')} · {tr('by date received', 'ayon sa petsa ng pagkatanggap')}</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-amber" aria-hidden="true"><WorkspaceIcon kind="calendar" /></span>
          <span className="stat-label">{tr('Waiting for confirmation', 'Naghihintay ng kumpirmasyon')}</span>
          <strong>{waiting}</strong>
          <small>{overview.pendingCash.count} {tr('cash', 'cash')} ({decimalPesos(overview.pendingCash.total)}) · {overview.unclearedChecks.count} {tr(overview.unclearedChecks.count === 1 ? 'check not cleared' : 'checks not cleared', 'tsekeng hindi pa na-clear')} ({decimalPesos(overview.unclearedChecks.total)}). {tr('Not counted as paid.', 'Hindi binilang na bayad.')}</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-blue" aria-hidden="true"><WorkspaceIcon kind="home" /></span>
          <span className="stat-label">{tr('Rent still due this month', 'Upang babayaran pa ngayong buwan')}</span>
          <strong>{decimalPesos(overview.dueThisMonth.total)}</strong>
          <small>{overview.dueThisMonth.renters} {tr(overview.dueThisMonth.renters === 1 ? 'renter' : 'renters', 'umuupa')} · {tr('recorded charges only', 'naitalang singil lamang')}</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-violet" aria-hidden="true"><WorkspaceIcon kind="people" /></span>
          <span className="stat-label">{tr('Rent left in 2+ months', 'May natitira sa 2+ buwan')}</span>
          <strong>{overview.multipleMonthsRenters}</strong>
          <small>{tr(overview.multipleMonthsRenters === 1 ? 'renter' : 'renters', 'umuupa')} · {tr('across recorded months', 'sa mga naitalang buwan')}</small>
        </article>
      </div>
    </section>

    <section className="card followup-card" aria-labelledby="late-rent-heading">
      <h3 id="late-rent-heading">{tr('Late rent', 'Huling upa')} ({followUp.late.length})</h3>
      <p className="field-help">{tr('Due date passed and not fully covered by confirmed payments. Pending cash is shown but not subtracted. No late fees are added.', 'Lampas na ang takdang araw at hindi pa natatakpan ng kumpirmadong bayad. Ipinapakita ang nakabinbing cash pero hindi ibinabawas. Walang multang idinadagdag.')}</p>
      {followUp.late.length ? <ul className="followup-list">{followUp.late.map(row => <li key={row.agreementId}>
        <div className="followup-who"><strong>{row.tenant}</strong><span>{row.room}{row.ended ? ` · ${tr('Moved out', 'Lumipat na')}` : ''}</span><span>{row.months.map(shortMonth).join(', ')}</span></div>
        <div className="followup-figures"><strong>{decimalPesos(row.overdue)}</strong>
          <span className="status status--pending">{row.daysLate} {tr(row.daysLate === 1 ? 'day late' : 'days late', 'ka adlaw nalangan')}</span>
          {positive(row.pending) && <small>{decimalPesos(row.pending)} {tr('cash waiting for confirmation. Check before reminding.', 'na cash ang naghihintay ng kumpirmasyon. Suriin muna bago magpaalala.')}</small>}</div>
        <div className="person-actions">
          <Button onClick={() => void copyReminder(row)} aria-label={`${tr('Copy reminder for', 'Kopyahin ang paalala para kay')} ${row.tenant}`}>{tr('Copy reminder', 'Kopyahin ang paalala')}</Button>
          <Button className="secondary-button" onClick={() => openPayments(row.tenantId)} aria-label={`${tr('Open account for', 'Buksan ang account ni')} ${row.tenant}`}>{tr('Open account', 'Buksan ang account')}</Button>
        </div>
        {copied === row.agreementId && <p className="field-help followup-copied" role="status">{tr('Reminder copied. Paste it into SMS or Messenger.', 'Nakopya ang paalala. I-paste sa SMS o Messenger.')}</p>}
        {copied === `failed:${row.agreementId}` && <div className="followup-copied"><label htmlFor={`reminder-${row.agreementId}`}>{tr('Copying is blocked here. Select the text and copy it:', 'Hindi makakopya rito. Piliin ang teksto at kopyahin:')}</label><textarea id={`reminder-${row.agreementId}`} readOnly rows={4} value={reminder(row)} onFocus={event => event.currentTarget.select()} /></div>}
      </li>)}</ul> : <p className="empty-state">{tr('No late rent. Every recorded month due before today is paid.', 'Walang huling upa. Bayad na ang lahat ng naitalang buwan na ang takdang araw ay bago ngayon.')}</p>}

      <h4>{tr('Due in the next 7 days', 'Mga singil sa loob ng 7 araw')} ({followUp.dueSoon.length})</h4>
      {followUp.dueSoon.length ? <ul className="followup-soon">{followUp.dueSoon.map(row => <li key={`${row.agreementId}:${row.month}`}>
        <span><strong>{row.tenant}</strong> · {row.room}</span><span>{decimalPesos(row.amount)} · {tr('due', 'takdang')} {dayName(row.dueDate)}</span>
      </li>)}</ul> : <p className="field-help">{tr('Nothing recorded is due in the next 7 days.', 'Walang naitalang singil sa loob ng 7 araw.')}</p>}
    </section>
  </>
}
