import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { decimalPesos } from './CashAcknowledgment'
import { buildCollectionsOverview, type CollectionsOverview as Overview } from './collections-overview-model.ts'
import { parseRentWorkspaceSnapshot } from './saved-payments-model.ts'
import { philippineToday } from './payment-preview-model.ts'
import { supabase, type Tenant } from './client'
import { text, type Language } from '../i18n'

const monthName = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))

// Read-only staff dashboard figures from the authorized rent workspace snapshot (staff MFA enforced by the database).
export function CollectionsOverview({ propertyId, tenants, openPayments, language = 'en' }: { propertyId: string; tenants: Tenant[]; openPayments: () => void; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const tenantsRef = useRef(tenants)
  useEffect(() => { tenantsRef.current = tenants }, [tenants])
  useEffect(() => {
    let alive = true
    setState('loading')
    void (async () => {
      try {
        const { data, error } = await supabase!.rpc('read_rent_workspace', { p_property_id: propertyId })
        if (error) throw error
        const snapshot = parseRentWorkspaceSnapshot(data, tenantsRef.current)
        if (alive) { setOverview(buildCollectionsOverview(snapshot, tenantsRef.current, philippineToday().slice(0, 7))); setState('ready') }
      } catch {
        if (alive) setState('unavailable')
      }
    })()
    return () => { alive = false }
  }, [propertyId])

  if (state === 'unavailable') return <p className="notice collections-unavailable" role="status">{tr('Collection figures are unavailable right now. Open Payments and balances to check saved records.', 'Dili makita karon ang mga numero sa koleksiyon. Ablihi ang Mga bayad ug balanse aron masusi ang mga rekord.')}</p>
  if (state === 'loading' || !overview) return <p className="field-help collections-loading" role="status">{tr('Loading collection figures…', 'Gikarga ang mga numero sa koleksiyon…')}</p>
  const month = monthName(overview.month)
  const waiting = overview.pendingCash.count + overview.unclearedChecks.count
  return <section className="collections-overview" aria-labelledby="collections-heading">
    <div className="collections-heading"><div><p className="eyebrow">{tr('COLLECTIONS', 'KOLEKSIYON')}</p><h3 id="collections-heading">{month}</h3></div>
      <Button className="secondary-button" onClick={openPayments}>{tr('Open payments', 'Ablihi ang mga bayad')}</Button></div>
    <div className="collections-grid">
      <article className="stat-card">
        <span className="stat-icon tone-teal" aria-hidden="true"><WorkspaceIcon kind="payments" /></span>
        <span className="stat-label">{tr('Confirmed cash received', 'Kumpirmadong kwarta nga nadawat')}</span>
        <strong>{decimalPesos(overview.confirmedCash)}</strong>
        <small>{overview.confirmedPayments} {tr(overview.confirmedPayments === 1 ? 'payment' : 'payments', 'ka bayad')} · {tr('by date received', 'sumala sa petsa nga nadawat')}</small>
      </article>
      <article className="stat-card">
        <span className="stat-icon tone-amber" aria-hidden="true"><WorkspaceIcon kind="calendar" /></span>
        <span className="stat-label">{tr('Waiting for confirmation', 'Naghulat og kumpirmasyon')}</span>
        <strong>{waiting}</strong>
        <small>{overview.pendingCash.count} {tr('cash', 'kwarta')} ({decimalPesos(overview.pendingCash.total)}) · {overview.unclearedChecks.count} {tr(overview.unclearedChecks.count === 1 ? 'check not cleared' : 'checks not cleared', 'tseke nga wala pa ma-clear')} ({decimalPesos(overview.unclearedChecks.total)}). {tr('Not counted as paid.', 'Wala giihap nga bayad.')}</small>
      </article>
      <article className="stat-card">
        <span className="stat-icon tone-blue" aria-hidden="true"><WorkspaceIcon kind="home" /></span>
        <span className="stat-label">{tr('Rent still due this month', 'Abang nga bayranan pa karong bulana')}</span>
        <strong>{decimalPesos(overview.dueThisMonth.total)}</strong>
        <small>{overview.dueThisMonth.renters} {tr(overview.dueThisMonth.renters === 1 ? 'renter' : 'renters', 'ka nag-abang')} · {tr('recorded charges only', 'narekord nga bayranan lamang')}</small>
      </article>
      <article className="stat-card">
        <span className="stat-icon tone-violet" aria-hidden="true"><WorkspaceIcon kind="people" /></span>
        <span className="stat-label">{tr('Rent left in 2+ months', 'May nabilin sa 2+ ka bulan')}</span>
        <strong>{overview.multipleMonthsRenters}</strong>
        <small>{tr(overview.multipleMonthsRenters === 1 ? 'renter' : 'renters', 'ka nag-abang')} · {tr('across recorded months', 'sa narekord nga mga bulan')}</small>
      </article>
    </div>
  </section>
}
