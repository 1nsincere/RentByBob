import { useState } from 'react'
import { Button } from '../components/atoms'
import { useProperty } from './property-preview-store'
import { pesos, remaining, type Charge, type Receipt } from './payment-preview-model'
import { type Language } from '../i18n'

type PendingCash = { id: string; tenant: string; cents: bigint; confirmed: boolean }
export function PaymentOverview({ charges, receipts, reports, open, language = 'en' }: {
  charges: Charge[]; receipts: Receipt[]; reports: PendingCash[]; open: (id: string) => void; language?: Language
}) {
  const bi = language === 'ceb'
  const tr = (en: string, ceb: string) => bi ? ceb : en
  const { tenants, buildings } = useProperty()
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('pending')
  const rows = tenants.map(tenant => {
    const building = buildings.find(b => b.id === tenant.building)
    const room = building?.floors.flatMap(f => f.rooms).find(r => r.id === tenant.room)
    const rent = charges.filter(c => c.tenant === tenant.id)
    const balance = rent.reduce((sum, c) => sum + remaining(c, receipts), 0n)
    const pending = reports.filter(r => r.tenant === tenant.id && !r.confirmed)
    return { tenant, location: `${building?.name ?? 'No building'} / ${room?.label ?? 'No room assigned'}`, balance, pending, rent }
  })
  const waiting = rows.reduce((sum, r) => sum + r.pending.length, 0)
  const shown = rows.filter(r => (filter === 'all' || (filter === 'pending' ? r.pending.length > 0 : filter === 'unpaid' ? r.balance > 0n : !r.rent.length && r.tenant.active)) && `${r.tenant.name} ${r.location}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="card payment-overview" aria-labelledby="cash-worklist-heading">
    <h3 id="cash-worklist-heading">{tr('What needs attention?','Unsa ang naghulat buhaton?')}</h3>
    <p>{waiting ? tr(`${waiting} cash record is waiting for James.`,`${waiting} ka rekord sa kwarta naghulat kang James.`) : tr('No cash records waiting for confirmation.','Walay rekord sa kwarta nga naghulat og kumpirmasyon.')}</p>
    <div className="payment-worklist-filters">
      <div><label htmlFor="cash-search">{tr('Find tenant or room','Pangitaa ang nag-abang o kwarto')}</label><input id="cash-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Name, room or building','Ngalan, kwarto o bilding')} /></div>
      <div><label htmlFor="cash-filter">{tr('Show','Ipakita')}</label><select id="cash-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">{tr('Waiting for James','Naghulat kang James')}</option><option value="unpaid">{tr('Unpaid rent','Wala mabayri nga abang')}</option><option value="setup">{tr('Rent not set up','Wala pa ma-set ang abang')}</option><option value="all">{tr('All tenant accounts','Tanang account sa nag-abang')}</option></select></div>
    </div>
    <p role="status" className="field-help">{shown.length} {tr(shown.length === 1 ? 'account shown' : 'accounts shown',shown.length === 1 ? 'account gipakita' : 'mga account gipakita')}</p>
    {shown.map(r => <article className="cash-row" key={r.tenant.id}><div><strong>{r.tenant.name}</strong><p>{r.location}</p><p>{r.rent.length ? `${pesos(r.balance)} left to pay` : 'No rent charges recorded'}{!r.tenant.active ? ' / Archived' : ''}</p>{r.pending.length > 0 && <span className="status">{r.pending.length} waiting for confirmation</span>}</div><Button className="secondary-button" onClick={() => open(r.tenant.id)} aria-label={`Open payments for ${r.tenant.name}`}>Open account</Button></article>)}
    {!shown.length && <p className="empty-state">{tr('No matching accounts. Choose another filter or clear your search.','Walay nakit-an nga account. Pilia ang laing filter o tangtanga ang gipangita.')}</p>}
  </section>
}
