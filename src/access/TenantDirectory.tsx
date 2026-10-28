import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase, type Tenant } from './client'
import { philippineToday } from './payment-preview-model'
import { currentTenantRooms, filterTenantDirectory, type TenantKindFilter, type TenantRoom, type TenantStatusFilter } from './tenant-directory-model'
import { copy, text, type Language } from '../i18n'

// Real tenant directory with the preview's tools: search by name or room, filters (status, type, building), sorting,
// and card actions. Rooms come from staff-authorized agreement data; archiving is owner-only and needs a reason.
export function TenantDirectory({ propertyId, tenants: allTenants, renterLinks, owner, active, addTenant, openPayments, locateRoom, assignRoom, refresh, language = 'en' }: {
  propertyId: string; tenants: Tenant[]; renterLinks: string[]; owner: boolean; active: boolean
  addTenant: () => void; openPayments: (tenantId: string, tab?: 'months' | 'history' | 'setup') => void; locateRoom: (unitId: string) => void
  assignRoom: (tenant: Tenant) => void; refresh: () => Promise<void> | void; language?: Language
}) {
  const t = copy[language]
  // Removed tenants are hidden from every list; their records stay for reports and the audit log.
  const tenants = allTenants.filter(tenant => !tenant.removed_at)
  const [mode, setMode] = useState<'archive' | 'remove'>('archive')
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TenantStatusFilter>('active')
  const [kind, setKind] = useState<TenantKindFilter>('all')
  const [building, setBuilding] = useState('all')
  const [sort, setSort] = useState<'name' | 'room'>('name')
  const [rooms, setRooms] = useState<Record<string, TenantRoom> | 'unavailable' | null>(null)
  const [buildings, setBuildings] = useState<{ id: string; label: string }[]>([])
  const [archiving, setArchiving] = useState<string | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  const loadRooms = useCallback(async () => {
    try {
      const { data, error } = await supabase!.rpc('read_rent_workspace', { p_property_id: propertyId })
      if (error) throw error
      setRooms(currentTenantRooms(data, philippineToday()))
      setBuildings([...(data.buildings as { id: string; label: string }[])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })))
    } catch { setRooms('unavailable') }
  }, [propertyId])
  // Reload whenever the directory is opened, so rooms assigned elsewhere show without a page reload.
  useEffect(() => { if (active) void loadRooms() }, [active, loadRooms, tenants.length])
  useEffect(() => { if (notice) noticeRef.current?.focus() }, [notice])

  const roomMap = rooms && rooms !== 'unavailable' ? rooms : undefined
  const visible = filterTenantDirectory(tenants, search, status, kind, { rooms: roomMap, building: roomMap ? building : 'all', sort })
  const clear = () => { setSearch(''); setStatus('all'); setKind('all'); setBuilding('all') }

  async function archive(tenant: Tenant) {
    if (!reason.trim()) { setNotice({ text: mode === 'remove' ? tr('Give a reason for removing.', 'Hatagi og rason ang pagtangtang.') : tr('Give a reason for archiving.', 'Hatagi og rason ang pag-archive.'), error: true }); return }
    setBusy(true)
    const { error } = await supabase!.rpc(mode === 'remove' ? 'remove_tenant_with_room' : 'archive_tenant', { p_tenant_id: tenant.id, p_reason: reason.trim() })
    setBusy(false)
    if (error) {
      setNotice({ error: true, text: /move-out/.test(error.message) ? tr('This tenant still has a room. Record the move-out in Payments → Room rent setup first; it can be archived from the day after.', 'Naa pay kwarto kini nga nag-abang. Irekord una ang pagbalhin sa Payments → Pagbutang sa abang; ma-archive kini sugod sa sunod nga adlaw.')
        : error.code === '42501' ? tr('Only the owner (with the authenticator code) can archive or remove tenants. Nothing changed.', 'Ang tag-iya lang (uban ang authenticator code) ang maka-archive. Walay nausab.')
        : mode === 'remove' ? tr('The tenant could not be removed. Nothing changed. Only the owner (with the authenticator code) can remove tenants; if the update was only just installed, reload and try again.', 'Wala matangtang ang nag-abang. Walay nausab. Ang tag-iya lang (uban ang authenticator code) ang makatangtang; kung bag-o lang na-install ang update, i-reload ug sulayi pag-usab.') : tr('The tenant could not be archived. Nothing changed; try again.', 'Wala ma-archive. Walay nausab; sulayi pag-usab.') })
      return
    }
    setArchiving(null); setReason('')
    setNotice({ error: false, text: mode === 'remove' ? `${tenant.display_name} ${tr('was removed from the lists. Their payment history stays in reports.', 'natangtang na sa lista. Magpabilin ang ilang kasaysayan sa bayad sa mga report.')}` : `${tenant.display_name} ${tr('was archived. Their payment history is kept.', 'na-archive na. Gitipigan ang ilang kasaysayan sa bayad.')}` })
    await refresh()
  }

  return <section className="card directory-card" aria-labelledby="tenant-records-heading">
    <div className="section-heading">
      <div><p className="eyebrow">{tr('PEOPLE AND BUSINESSES', 'MGA TAWO UG NEGOSYO')}</p><h2 id="tenant-records-heading">{t.tenantDirectory}</h2></div>
      <div className="directory-heading-actions"><span className="record-count">{tenants.length} {tr(tenants.length === 1 ? 'record' : 'records', 'ka rekord')}</span><Button className="primary" onClick={addTenant}>{tr('Add tenant', 'Idugang ang nag-abang')}</Button></div>
    </div>
    <p>{tr('Find tenants, see their room, and open their payments.', 'Pangitaa ang nag-abang, tan-awa ang ilang kwarto, ug ablihi ang ilang bayad.')}</p>
    <div ref={noticeRef} tabIndex={-1}>{notice && <p role={notice.error ? 'alert' : 'status'} className={`notice${notice.error ? ' notice--error' : ''}`}>{notice.text}</p>}</div>
    <label htmlFor="tenant-search">{tr('Search name, building or room', 'Pangitaa ang ngalan, bilding o kwarto')}</label>
    <input id="tenant-search" value={search} onChange={event => setSearch(event.target.value)} type="search" autoComplete="off" aria-describedby="tenant-search-help" />
    <p className="field-help" id="tenant-search-help">{tr('Results update as you type.', 'Ma-update ang resulta samtang magsulat ka.')}</p>
    {tenants.length > 0 && <>
      <div className="tenant-directory-filters">
        <div><label htmlFor="tenant-status-filter">{tr('Tenant status', 'Kahimtang sa nag-abang')}</label>
          <select id="tenant-status-filter" value={status} onChange={event => setStatus(event.target.value as TenantStatusFilter)}><option value="all">{tr('All tenants', 'Tanang nag-abang')}</option><option value="active">{tr('Active tenants', 'Aktibo nga nag-abang')}</option><option value="archived">{tr('Archived tenants', 'Gi-archive nga nag-abang')}</option></select></div>
        <div><label htmlFor="tenant-kind-filter">{tr('Record type', 'Klase sa rekord')}</label>
          <select id="tenant-kind-filter" value={kind} onChange={event => setKind(event.target.value as TenantKindFilter)}><option value="all">{tr('All types', 'Tanang klase')}</option><option value="individual">{t.individualTenant}</option><option value="business">{t.businessTenant}</option></select></div>
        {roomMap && <div><label htmlFor="tenant-building-filter">{tr('Building', 'Bilding')}</label>
          <select id="tenant-building-filter" value={building} onChange={event => setBuilding(event.target.value)}><option value="all">{tr('All buildings', 'Tanang bilding')}</option>{buildings.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="none">{tr('No room yet', 'Wala pay kwarto')}</option></select></div>}
        <div><label htmlFor="tenant-sort">{tr('Sort by', 'Han-ay pinaagi sa')}</label>
          <select id="tenant-sort" value={sort} onChange={event => setSort(event.target.value === 'room' ? 'room' : 'name')}><option value="name">{tr('Name A–Z', 'Ngalan A–Z')}</option><option value="room">{tr('Building and room', 'Bilding ug kwarto')}</option></select></div>
      </div>
      <p className="field-help" aria-live="polite">{tr('Showing', 'Nagpakita og')} {visible.length} {tr('of', 'gikan sa')} {tenants.length} {tr(tenants.length === 1 ? 'record' : 'records', 'ka rekord')}.</p>
    </>}
    {visible.length > 0 && <ul className="records tenant-records tenant-records--cards">
      {visible.map(tenant => {
        const room = roomMap?.[tenant.id]
        const linked = renterLinks.includes(tenant.id)
        return <li key={tenant.id} className="tenant-record">
          <span className="record-initial" aria-hidden="true">{tenant.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span>
          <div className="tenant-record-copy">
            <strong>{tenant.display_name}</strong>
            <p>{tenant.kind === 'business' ? t.businessTenant : t.individualTenant}</p>
            <small className="tenant-room">{rooms === 'unavailable' ? tr('Room details unavailable', 'Wala makita ang detalye sa kwarto') : room?.label ?? (rooms ? tr('No current room', 'Walay kwarto karon') : tr('Loading room…', 'Gikarga ang kwarto…'))}</small>
            {!tenant.archived_at && <small className={`renter-link ${linked ? 'renter-link--linked' : ''}`}>{linked ? tr('Renter can sign in', 'Makasulod ang nag-abang') : tr('No renter login yet', 'Wala pay login ang nag-abang')}</small>}
            <div className="tenant-card-actions">
              {room && <Button className="secondary-button tenant-card-action" aria-label={`${tr('View rent and payments for', 'Tan-awa ang abang ug bayad ni')} ${tenant.display_name}`} onClick={() => openPayments(tenant.id)}>{tr('View rent and payments', 'Tan-awa ang abang ug bayad')}</Button>}
              {room && <Button className="secondary-button tenant-card-action" aria-label={`${tr('Locate room for', 'Pangitaa ang kwarto ni')} ${tenant.display_name}`} onClick={() => locateRoom(room.unitId)}>{tr('Locate room', 'Pangitaa ang kwarto')}</Button>}
              {room && <Button className="secondary-button tenant-card-action" aria-label={`${tr('Change room for', 'Usba ang kwarto ni')} ${tenant.display_name}`} onClick={() => openPayments(tenant.id, 'setup')}>{tr('Change room', 'Usba ang kwarto')}</Button>}
              {roomMap && !room && !tenant.archived_at && <Button className="secondary-button tenant-card-action" aria-label={`${tr('Assign a room to', 'Hatagi og kwarto si')} ${tenant.display_name}`} onClick={() => assignRoom(tenant)}>{tr('Assign a room', 'Hatagi og kwarto')}</Button>}
              {owner && roomMap && !room && !tenant.archived_at && archiving !== tenant.id && <Button className="quiet-button tenant-card-action" aria-label={`${tr('Archive', 'I-archive')} ${tenant.display_name}`} onClick={() => { setMode('archive'); setArchiving(tenant.id); setReason(''); setNotice(null) }}>{tr('Archive', 'I-archive')}</Button>}
              {owner && roomMap && archiving !== tenant.id && <Button className="quiet-button tenant-card-action" aria-label={`${tr('Remove', 'Tangtanga')} ${tenant.display_name}`} onClick={() => { setMode('remove'); setArchiving(tenant.id); setReason(''); setNotice(null) }}>{tr('Remove', 'Tangtanga')}</Button>}
            </div>
            {archiving === tenant.id && <form className="archive-tenant-form" onSubmit={event => { event.preventDefault(); void archive(tenant) }}>
              <label htmlFor={`archive-reason-${tenant.id}`}>{mode === 'remove' ? tr('Reason for removing (required)', 'Rason sa pagtangtang (kinahanglan)') : tr('Reason for archiving (required)', 'Rason sa pag-archive (kinahanglan)')}</label>
              <input id={`archive-reason-${tenant.id}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} autoFocus />
              <p className="field-help">{mode === 'remove' ? (room ? tr('This tenant still has a room. Removing ends their room agreement (today, or on the move-in date if nothing was ever recorded) so the room can be given to someone else, and hides them from every list. Rent, payments and the audit log stay in the records; any unpaid rent stays on record but they will no longer appear in the lists.', 'Naa pay kwarto kini nga nag-abang. Ang pagtangtang mo-human sa ilang kasabutan sa kwarto (karon, o sa petsa sa pagsulod kung walay narekord) aron mahatag ang kwarto sa lain, ug itago sila sa tanang lista. Magpabilin ang abang, bayad ug audit log sa mga rekord; ang wala mabayri nga abang magpabilin sa rekord apan dili na sila makita sa lista.') : tr('Removed tenants disappear from every list. Their payment history stays in reports and the audit log.', 'Ang natangtang dili na makita sa bisan unsang lista. Magpabilin ang kasaysayan sa bayad sa mga report.')) : tr('Archived tenants are hidden from active lists. Their records and payment history are kept.', 'Ang gi-archive dili makita sa aktibo nga lista. Gitipigan ang ilang rekord ug kasaysayan sa bayad.')}</p>
              <div className="person-actions"><Button className="primary" disabled={busy}>{busy ? tr('Saving…', 'Gi-save…') : mode === 'remove' ? tr('Remove tenant', 'Tangtanga ang nag-abang') : tr('Archive tenant', 'I-archive ang nag-abang')}</Button><Button type="button" disabled={busy} onClick={() => setArchiving(null)}>{tr('Cancel', 'Kanselahon')}</Button></div>
            </form>}
          </div>
          <span className={`status status--${tenant.archived_at ? 'archived' : 'ready'}`}>{tenant.archived_at ? t.archived : t.active}</span>
        </li>
      })}
    </ul>}
    {tenants.length === 0 && <div className="empty-state"><h3>{t.noRecordsYet}</h3><p>{tr('Start by adding a tenant and their room.', 'Sugdi pinaagi sa pagdugang sa nag-abang ug ilang kwarto.')}</p></div>}
    {tenants.length > 0 && visible.length === 0 && <div className="empty-state">
      <h3>{tr('No matches found', 'Walay nakit-an nga katugbang')}</h3>
      <p>{search.trim() ? <>{tr('No tenant records match', 'Walay rekord sa nag-abang nga katugbang sa')} “{search.trim()}”. {tr('Try changing your search or filters.', 'Sulayi usbon ang pangita o mga filter.')}</> : tr('No tenant records match the selected filters.', 'Walay rekord sa nag-abang nga katugbang sa gipiling mga filter.')}</p>
      <Button className="secondary-button" onClick={clear}>{tr('Clear search and filters', 'Hawani ang pangita ug mga filter')}</Button>
    </div>}
  </section>
}
