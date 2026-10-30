import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase, type Tenant } from './client'
import { philippineToday } from './payment-preview-model'
import { currentTenantRooms, filterTenantDirectory, type TenantKindFilter, type TenantRoom, type TenantStatusFilter } from './tenant-directory-model'
import { copy, text, type Language } from '../i18n'

// Real tenant directory with the preview's tools: search by name or room, filters (status, type, building), sorting,
// and card actions. Rooms come from staff-authorized agreement data; archiving and removing need a reason and any signed-in staff member may do them.
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
    if (!reason.trim()) { setNotice({ text: mode === 'remove' ? tr('Give a reason for removing.', 'Magbigay ng dahilan sa pagtanggal.') : tr('Give a reason for archiving.', 'Magbigay ng dahilan sa pag-archive.'), error: true }); return }
    setBusy(true)
    let error: { code?: string; message: string } | null
    try { error = (await supabase!.rpc(mode === 'remove' ? 'remove_tenant_with_room' : 'archive_tenant', { p_tenant_id: tenant.id, p_reason: reason.trim() })).error }
    catch { error = { message: 'network' } }
    finally { setBusy(false) }
    if (error) {
      setNotice({ error: true, text: /move-out/.test(error.message) ? tr('This tenant still has a room. Record the move-out in Payments → Room rent setup first; it can be archived from the day after.', 'May kuwarto pa ang umuupang ito. Itala muna ang pag-alis sa Payments → Pagtatakda ng upa; maaari itong i-archive simula sa susunod na araw.')
        : error.code === '42501' ? tr('Only signed-in staff (with the authenticator code) can archive or remove tenants. Nothing changed.', 'Ang naka-sign in na staff lang (may authenticator code) ang makakapag-archive o makakapagtanggal. Walang nabago.')
        : mode === 'remove' ? tr('The tenant could not be removed. Nothing changed. Your staff session may need the authenticator code again; if the update was only just installed, reload and try again.', 'Hindi natanggal ang umuupa. Walang nabago. Maaaring kailangan ulit ang authenticator code sa iyong staff session; kung bagong install lang ang update, i-reload at subukan ulit.') : tr('The tenant could not be archived. Nothing changed; try again.', 'Hindi na-archive. Walang nabago; subukan ulit.') })
      return
    }
    setArchiving(null); setReason('')
    setNotice({ error: false, text: mode === 'remove' ? `${tenant.display_name} ${tr('was removed from the lists. Their payment history stays in reports.', 'ay natanggal na sa listahan. Mananatili ang kanilang kasaysayan ng bayad sa mga ulat.')}` : `${tenant.display_name} ${tr('was archived. Their payment history is kept.', 'ay na-archive na. Nakatala ang kanilang kasaysayan ng bayad.')}` })
    await refresh()
  }

  return <section className="card directory-card" aria-labelledby="tenant-records-heading">
    <div className="section-heading">
      <div><p className="eyebrow">{tr('PEOPLE AND BUSINESSES', 'MGA TAO AT NEGOSYO')}</p><h2 id="tenant-records-heading">{t.tenantDirectory}</h2></div>
      <div className="directory-heading-actions"><span className="record-count">{tenants.length} {tr(tenants.length === 1 ? 'record' : 'records', 'ka rekord')}</span><Button className="primary" onClick={addTenant}>{tr('Add tenant', 'Magdagdag ng umuupa')}</Button></div>
    </div>
    <p>{tr('Find tenants, see their room, and open their payments.', 'Hanapin ang umuupa, tingnan ang kanilang kuwarto, at buksan ang kanilang bayad.')}</p>
    <div ref={noticeRef} tabIndex={-1}>{notice && <p role={notice.error ? 'alert' : 'status'} className={`notice${notice.error ? ' notice--error' : ''}`}>{notice.text}</p>}</div>
    <label htmlFor="tenant-search">{tr('Search name, building or room', 'Hanapin ang pangalan, gusali o kuwarto')}</label>
    <input id="tenant-search" value={search} onChange={event => setSearch(event.target.value)} type="search" autoComplete="off" aria-describedby="tenant-search-help" />
    <p className="field-help" id="tenant-search-help">{tr('Results update as you type.', 'Maa-update ang resulta habang nagsusulat ka.')}</p>
    {tenants.length > 0 && <>
      <div className="tenant-directory-filters">
        <div><label htmlFor="tenant-status-filter">{tr('Tenant status', 'Katayuan ng umuupa')}</label>
          <select id="tenant-status-filter" value={status} onChange={event => setStatus(event.target.value as TenantStatusFilter)}><option value="all">{tr('All tenants', 'Lahat ng umuupa')}</option><option value="active">{tr('Active tenants', 'Aktibong umuupa')}</option><option value="archived">{tr('Archived tenants', 'Naka-archive na umuupa')}</option></select></div>
        <div><label htmlFor="tenant-kind-filter">{tr('Record type', 'Uri ng talaan')}</label>
          <select id="tenant-kind-filter" value={kind} onChange={event => setKind(event.target.value as TenantKindFilter)}><option value="all">{tr('All types', 'Lahat ng uri')}</option><option value="individual">{t.individualTenant}</option><option value="business">{t.businessTenant}</option></select></div>
        {roomMap && <div><label htmlFor="tenant-building-filter">{tr('Building', 'Gusali')}</label>
          <select id="tenant-building-filter" value={building} onChange={event => setBuilding(event.target.value)}><option value="all">{tr('All buildings', 'Lahat ng gusali')}</option>{buildings.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}<option value="none">{tr('No room yet', 'Wala pang kuwarto')}</option></select></div>}
        <div><label htmlFor="tenant-sort">{tr('Sort by', 'Ayusin ayon sa')}</label>
          <select id="tenant-sort" value={sort} onChange={event => setSort(event.target.value === 'room' ? 'room' : 'name')}><option value="name">{tr('Name A–Z', 'Pangalan A–Z')}</option><option value="room">{tr('Building and room', 'Gusali at kuwarto')}</option></select></div>
      </div>
      <p className="field-help" aria-live="polite">{tr('Showing', 'Ipinapakita ang')} {visible.length} {tr('of', 'mula sa')} {tenants.length} {tr(tenants.length === 1 ? 'record' : 'records', 'ka rekord')}.</p>
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
            <small className="tenant-room">{rooms === 'unavailable' ? tr('Room details unavailable', 'Hindi makita ang detalye ng kuwarto') : room?.label ?? (rooms ? tr('No current room', 'Walang kuwarto ngayon') : tr('Loading room…', 'Nilo-load ang kuwarto…'))}</small>
            {!tenant.archived_at && <small className={`renter-link ${linked ? 'renter-link--linked' : ''}`}>{linked ? tr('Renter can sign in', 'Makakapag-sign in ang umuupa') : tr('No renter login yet', 'Wala pang login ang umuupa')}</small>}
            <div className="tenant-card-actions">
              {room && <Button className="secondary-button tenant-card-action" aria-label={`${tr('View rent and payments for', 'Tingnan ang upa at bayad ni')} ${tenant.display_name}`} onClick={() => openPayments(tenant.id)}>{tr('View rent and payments', 'Tingnan ang upa at bayad')}</Button>}
              {room && <Button className="secondary-button tenant-card-action" aria-label={`${tr('Locate room for', 'Hanapin ang kuwarto ni')} ${tenant.display_name}`} onClick={() => locateRoom(room.unitId)}>{tr('Locate room', 'Hanapin ang kuwarto')}</Button>}
              {room && <Button className="secondary-button tenant-card-action" aria-label={`${tr('Change room for', 'Palitan ang kuwarto ni')} ${tenant.display_name}`} onClick={() => openPayments(tenant.id, 'setup')}>{tr('Change room', 'Palitan ang kuwarto')}</Button>}
              {roomMap && !room && !tenant.archived_at && <Button className="secondary-button tenant-card-action" aria-label={`${tr('Assign a room to', 'Bigyan ng kuwarto si')} ${tenant.display_name}`} onClick={() => assignRoom(tenant)}>{tr('Assign a room', 'Bigyan ng kuwarto')}</Button>}
              {owner && roomMap && !room && !tenant.archived_at && archiving !== tenant.id && <Button variant="secondary" size="sm" className="tenant-card-action" aria-label={`${tr('Archive', 'I-archive')} ${tenant.display_name}`} onClick={() => { setMode('archive'); setArchiving(tenant.id); setReason(''); setNotice(null) }}>{tr('Archive', 'I-archive')}</Button>}
              {owner && roomMap && archiving !== tenant.id && <Button variant="danger-quiet" size="sm" className="tenant-card-action" aria-label={`${tr('Remove', 'Tanggalin')} ${tenant.display_name}`} onClick={() => { setMode('remove'); setArchiving(tenant.id); setReason(''); setNotice(null) }}>{tr('Remove', 'Tanggalin')}</Button>}
            </div>
            {archiving === tenant.id && <form className="archive-tenant-form" onSubmit={event => { event.preventDefault(); void archive(tenant) }}>
              <label htmlFor={`archive-reason-${tenant.id}`}>{mode === 'remove' ? tr('Reason for removing (required)', 'Dahilan ng pagtanggal (kailangan)') : tr('Reason for archiving (required)', 'Dahilan ng pag-archive (kailangan)')}</label>
              <input id={`archive-reason-${tenant.id}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} autoFocus />
              <p className="field-help">{mode === 'remove' ? (room ? tr('This tenant still has a room. Removing ends their room agreement (today, or on the move-in date if nothing was ever recorded) so the room can be given to someone else, and hides them from every list. Rent, payments and the audit log stay in the records; any unpaid rent stays on record but they will no longer appear in the lists.', 'May kuwarto pa ang umuupang ito. Tatapusin ng pagtanggal ang kanilang kasunduan sa kuwarto (ngayon, o sa petsa ng paglipat kung walang naitala) para maibigay ang kuwarto sa iba, at itatago sila sa lahat ng listahan. Mananatili ang upa, bayad at audit log sa mga talaan; mananatili sa talaan ang hindi nabayarang upa pero hindi na sila makikita sa listahan.') : tr('Removed tenants disappear from every list. Their payment history stays in reports and the audit log.', 'Ang natanggal ay hindi na makikita sa anumang listahan. Mananatili ang kasaysayan ng bayad sa mga ulat.')) : tr('Archived tenants are hidden from active lists. Their records and payment history are kept.', 'Ang naka-archive ay hindi makikita sa aktibong listahan. Nakatala ang kanilang talaan at kasaysayan ng bayad.')}</p>
              <div className="person-actions"><Button variant={mode === 'remove' ? 'danger' : 'primary'} disabled={busy}>{busy ? tr('Saving…', 'Sine-save…') : mode === 'remove' ? tr('Remove tenant', 'Tanggalin ang umuupa') : tr('Archive tenant', 'I-archive ang umuupa')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setArchiving(null)}>{tr('Cancel', 'Kanselahin')}</Button></div>
            </form>}
          </div>
          <span className={`status status--${tenant.archived_at ? 'archived' : 'ready'}`}>{tenant.archived_at ? t.archived : t.active}</span>
        </li>
      })}
    </ul>}
    {tenants.length === 0 && <div className="empty-state"><h3>{t.noRecordsYet}</h3><p>{tr('Start by adding a tenant and their room.', 'Magsimula sa pagdagdag ng umuupa at kanilang kuwarto.')}</p></div>}
    {tenants.length > 0 && visible.length === 0 && <div className="empty-state">
      <h3>{tr('No matches found', 'Walang nakitang tugma')}</h3>
      <p>{search.trim() ? <>{tr('No tenant records match', 'Walang talaan ng umuupa na tugma sa')} “{search.trim()}”. {tr('Try changing your search or filters.', 'Subukang baguhin ang hinahanap o mga filter.')}</> : tr('No tenant records match the selected filters.', 'Walang talaan ng umuupa na tugma sa napiling mga filter.')}</p>
      <Button className="secondary-button" onClick={clear}>{tr('Clear search and filters', 'Burahin ang hinahanap at mga filter')}</Button>
    </div>}
  </section>
}
