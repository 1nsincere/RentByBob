import { useCallback, useEffect, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { supabase } from './client'
import { decimalPesos } from './CashAcknowledgment'
import { text, type Language } from '../i18n'

type Listing = { unit_id: string; asking_rent: string | null; description: string; listed_at: string; hidden?: boolean; publicly_available: boolean }
type RoomState = { unit_id: string; publicly_available: boolean; occupied: boolean }
type Inquiry = { id: string; unit_id: string; visitor_name: string; contact: string; message: string; created_at: string; handled_at: string | null }
type Unit = { id: string; label: string; building_id: string }
type Building = { id: string; label: string }

const dateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))

// Staff (MFA) manage which rooms appear on the public /rooms page and follow up visitor inquiries.
export function RoomListingsManager({ propertyId, owner = false, language = 'en' }: { propertyId: string; owner?: boolean; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [tab, setTab] = useState<'listings' | 'inquiries'>('listings')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [rooms, setRooms] = useState<RoomState[]>([])
  const [autoList, setAutoList] = useState(false)
  const [activeBuilding, setActiveBuilding] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [b, u, data] = await Promise.all([
        supabase!.from('buildings').select('id,label').eq('property_id', propertyId).is('archived_at', null).order('label'),
        supabase!.from('units').select('id,label,building_id').eq('property_id', propertyId).is('archived_at', null).order('label'),
        supabase!.rpc('read_rental_inquiries', { p_property_id: propertyId }),
      ])
      if (b.error || u.error || data.error) throw b.error || u.error || data.error
      setBuildings(b.data); setUnits(u.data)
      setListings(data.data.listings as Listing[]); setInquiries(data.data.inquiries as Inquiry[])
      setRooms((data.data.rooms ?? []) as RoomState[]); setAutoList(Boolean(data.data.auto_list_vacant))
      // Default to the first building that has listable spaces (commercial spaces are private and never listed).
      const listable = (data.data.rooms ?? []) as RoomState[]
      const firstListable = b.data.find(item => listable.some(room => (u.data as Unit[]).find(unit => unit.id === room.unit_id)?.building_id === item.id))?.id ?? b.data[0]?.id ?? ''
      setActiveBuilding(previous => listable.some(room => (u.data as Unit[]).find(unit => unit.id === room.unit_id)?.building_id === previous) ? previous : firstListable)
      setState('ready')
    } catch { setState('failed') }
  }, [propertyId])
  useEffect(() => { void load() }, [load])

  async function run(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true); setMessage(null)
    const { error } = await supabase!.rpc(name, { p_property_id: propertyId, ...args })
    setBusy(false)
    if (error) { setMessage({ text: error.code === '42501' ? tr('Your staff session needs the authenticator code again.', 'Kinahanglan na usab ang authenticator code sa imong staff session.') : tr('Not saved. Check the rent (a positive amount) and keep the description under 300 characters.', 'Wala na-save. Susiha ang abang (positibo nga kantidad) ug ipamubo ang deskripsyon ubos sa 300 ka letra.'), error: true }); await load(); return }
    setMessage({ text: success, error: false }); await load()
  }

  if (state === 'failed') return <p className="notice notice--error" role="alert">{tr('Room listings could not be loaded. The public listing migration must be applied and your staff authenticator session must be active.', 'Wala ma-load ang lista sa kwarto. Kinahanglan ma-apply ang migration ug aktibo ang imong staff authenticator session.')}</p>
  if (state === 'loading') return <LoadingSkeleton label={tr('Loading room listings…', 'Gikarga ang lista sa kwarto…')} rows={3} />
  const newCount = inquiries.filter(item => !item.handled_at).length
  const unitLabel = (unitId: string) => { const unit = units.find(item => item.id === unitId); return `${buildings.find(item => item.id === unit?.building_id)?.label ?? tr('Building', 'Bilding')} · ${unit?.label ?? tr('Room unavailable', 'Walay kwarto')}` }
  return <section className="card room-listings" aria-labelledby="room-listings-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('PUBLIC PAGE', 'PUBLIKO NGA PANID')}</p><h2 id="room-listings-heading">{tr('Room listings & inquiries', 'Lista sa kwarto ug mga pangutana')}</h2>
      <p>{tr('Choose which rooms prospective renters can see at', 'Pilia kung unsang kwarto ang makita sa gustong mo-abang sa')} <a href="/rooms" target="_blank" rel="noopener">{location.origin}/rooms</a>. {tr('A listed room is hidden automatically while it has a current or upcoming agreement.', 'Awtomatikong matago ang nalista nga kwarto samtang naay kasabotan karon o umaabot.')}</p></div></div>
    {message && <p className={`notice ${message.error ? 'notice--error' : 'notice--success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <div className="segmented-control" role="group" aria-label={tr('Listings or inquiries', 'Lista o pangutana')}>
      <Button aria-pressed={tab === 'listings'} onClick={() => setTab('listings')}>{tr('Listings', 'Lista')}</Button>
      <Button aria-pressed={tab === 'inquiries'} onClick={() => setTab('inquiries')}>{tr('Inquiries', 'Mga pangutana')}{newCount ? ` (${newCount} ${tr('new', 'bag-o')})` : ''}</Button>
    </div>
    {tab === 'listings' ? <>
      {!buildings.length ? <p className="field-help">{tr('Add buildings and rooms under Buildings and units first.', 'Idugang una ang bilding ug kwarto sa Mga bilding ug kwarto.')}</p> : <>
        <section className={`auto-listing ${autoList ? 'auto-listing--on' : ''}`} aria-labelledby="auto-listing-heading">
          <div><h3 id="auto-listing-heading">{tr('List vacant rooms automatically', 'Awtomatikong ilista ang bakante nga kwarto')}</h3>
            <p>{autoList ? tr('On: every vacant room is shown on the public page by itself. A room is hidden as soon as a tenant is assigned (including a future move-in) and comes back after the move-out date. You can still hide any room below.', 'On: ang matag bakante nga kwarto makita sa publiko. Matago dayon kon naay nag-abang (apil umaabot nga pagsulod) ug mobalik human sa pagbalhin. Mahimo gihapon nimong itago ang bisan unsang kwarto sa ubos.')
              : tr('Off: only rooms you tick below are shown. Turn this on only after every current tenant has a room in the app; otherwise occupied rooms would be advertised as vacant.', 'Off: ang gi-tsek lang sa ubos ang makita. I-on lang kini kon ang tanang nag-abang karon naa nay kwarto sa app; kon dili, ang naay nagpuyo makita nga bakante.')}</p></div>
          {owner ? <Button className={autoList ? 'secondary-button' : 'primary'} disabled={busy} aria-pressed={autoList} onClick={() => void run('set_auto_listing', { p_enabled: !autoList }, autoList ? tr('Automatic listing is off. Only rooms ticked below are shown.', 'Off na ang awtomatikong paglista.') : tr('Automatic listing is on. Vacant rooms are now shown on the public page.', 'On na ang awtomatikong paglista. Makita na sa publiko ang bakante nga kwarto.'))}>{autoList ? tr('Turn off', 'I-off') : tr('Turn on', 'I-on')}</Button>
            : <span className={`status ${autoList ? 'status--ready' : ''}`}>{autoList ? tr('On', 'On') : tr('Off', 'Off')}</span>}
        </section>
        <div className="public-building-tabs staff-building-tabs" role="group" aria-label={tr('Buildings', 'Mga bilding')}>
          {buildings.filter(item => rooms.some(room => units.find(unit => unit.id === room.unit_id)?.building_id === item.id)).map(item => { const count = rooms.filter(room => units.find(unit => unit.id === room.unit_id)?.building_id === item.id && room.publicly_available).length
            return <button key={item.id} type="button" className="public-building-tab" aria-pressed={item.id === activeBuilding} onClick={() => setActiveBuilding(item.id)}><strong>{item.label}</strong><span>{count} {tr('shown to the public', 'makita sa publiko')}</span></button> })}
        </div>
        <ul className="listing-rows">{units.filter(unit => unit.building_id === activeBuilding && rooms.some(room => room.unit_id === unit.id)).map(unit => {
          const listing = listings.find(item => item.unit_id === unit.id)
          const room = rooms.find(item => item.unit_id === unit.id)!
          const wanted = listing ? !listing.hidden : autoList
          const [status, tone] = room.occupied ? [tr('Occupied: hidden until the move-out date', 'Giokupahan: natago hangtod sa pagbalhin'), 'status--pending']
            : listing?.hidden ? [tr('Hidden by staff', 'Gitago sa staff'), '']
            : room.publicly_available ? [listing ? tr('Shown on the public page', 'Makita sa publiko') : tr('Shown automatically', 'Awtomatikong makita'), 'status--ready']
            : [tr('Not listed', 'Wala nalista'), '']
          const saved = (listed: boolean) => listed ? tr(`${unit.label} will be shown on the public page whenever it is vacant.`, `Makita ang ${unit.label} sa publiko kon bakante.`) : tr(`${unit.label} is hidden from the public page.`, `Natago ang ${unit.label} sa publiko.`)
          // Compact row: status and an instant show/hide switch; price and description are tucked into "details".
          return <li key={unit.id} className="listing-row">
            <div className="listing-row__head"><strong>{unit.label}</strong><span className={`status ${tone}`}>{status}</span></div>
            <label className="listing-toggle"><input type="checkbox" checked={wanted} disabled={busy} onChange={event => { const listed = event.target.checked; setListings(previous => [...previous.filter(item => item.unit_id !== unit.id), { unit_id: unit.id, asking_rent: listing?.asking_rent ?? null, description: listing?.description ?? '', listed_at: listing?.listed_at ?? new Date().toISOString(), hidden: !listed, publicly_available: listing?.publicly_available ?? false }]); void run('set_room_listing', { p_unit_id: unit.id, p_listed: event.target.checked, p_asking_rent: event.target.checked ? listing?.asking_rent ?? null : null, p_description: event.target.checked ? listing?.description ?? '' : null }, saved(listed)) }} /> {tr('Show on public page when vacant', 'Ipakita sa publiko kon bakante')}</label>
            {wanted && <details className="listing-edit"><summary>{listing?.asking_rent ? `${decimalPesos(listing.asking_rent)} ${tr('per month', 'matag bulan')}${listing.description ? ` · ${listing.description}` : ''} · ${tr('edit', 'usba')}` : tr('Add price and description', 'Idugang ang presyo ug deskripsyon')}</summary>
              <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const rent = String(f.get('rent') ?? '').trim()
                void run('set_room_listing', { p_unit_id: unit.id, p_listed: true, p_asking_rent: rent || null, p_description: String(f.get('description') ?? '') }, saved(true)) }}>
                <div className="listing-fields">
                  <div><label htmlFor={`rent-${unit.id}`}>{tr('Monthly rent (PHP)', 'Binulan nga abang (PHP)')}</label><input id={`rent-${unit.id}`} name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={listing?.asking_rent ?? ''} placeholder={tr('Ask for the price', 'Pangutana sa presyo')} /></div>
                  <div><label htmlFor={`description-${unit.id}`}>{tr('Short description', 'Mubo nga deskripsyon')}</label><input id={`description-${unit.id}`} name="description" maxLength={300} defaultValue={listing?.description ?? ''} placeholder={tr('e.g. Second floor, good for 2 persons', 'pananglitan: Ikaduhang andana, para sa 2 ka tawo')} /></div>
                </div>
                <p className="field-help">{tr('Leave the rent empty to show "Ask for the price".', 'Biyai nga walay sulod ang abang aron makita ang "Pangutana sa presyo".')}</p>
                <Button className="primary" disabled={busy}>{tr('Save', 'I-save')}</Button>
              </form>
            </details>}
          </li>
        })}</ul>
      </>}
    </> : <>
      {!inquiries.length ? <p className="field-help" role="status">{tr('No inquiries yet. Messages from the public page appear here and are kept for 90 days.', 'Wala pay pangutana. Makita dinhi ang mensahe gikan sa publiko nga panid ug tipigan sulod sa 90 ka adlaw.')}</p>
        : <ul className="inquiry-list">{inquiries.map(item => <li key={item.id} className={`inquiry-item ${item.handled_at ? 'inquiry-item--handled' : ''}`}>
          <div className="inquiry-item__head"><strong>{item.visitor_name}</strong><span className={`status ${item.handled_at ? 'status--archived' : 'status--pending'}`}>{item.handled_at ? tr('Handled', 'Natubag na') : tr('New', 'Bag-o')}</span></div>
          <p><strong>{tr('Contact:', 'Kontak:')}</strong> {item.contact} · {unitLabel(item.unit_id)} · {dateTime(item.created_at)}</p>
          {item.message && <p className="inquiry-message">{item.message}</p>}
          {!item.handled_at && <Button className="secondary-button" disabled={busy} onClick={() => void run('mark_inquiry_handled', { p_inquiry_id: item.id }, tr('Marked as handled.', 'Gimarkahan nga natubag na.'))}>{tr('Mark handled', 'Markahi nga natubag')}</Button>}
        </li>)}</ul>}
    </>}
  </section>
}
