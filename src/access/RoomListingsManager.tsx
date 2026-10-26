import { useCallback, useEffect, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { supabase } from './client'
import { text, type Language } from '../i18n'

type Listing = { unit_id: string; asking_rent: string; description: string; listed_at: string; publicly_available: boolean }
type Inquiry = { id: string; unit_id: string; visitor_name: string; contact: string; message: string; created_at: string; handled_at: string | null }
type Unit = { id: string; label: string; building_id: string }
type Building = { id: string; label: string }

const dateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))

// Staff (MFA) manage which rooms appear on the public /rooms page and follow up visitor inquiries.
export function RoomListingsManager({ propertyId, language = 'en' }: { propertyId: string; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [tab, setTab] = useState<'listings' | 'inquiries'>('listings')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
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
      setActiveBuilding(previous => b.data.some(item => item.id === previous) ? previous : b.data[0]?.id ?? '')
      setState('ready')
    } catch { setState('failed') }
  }, [propertyId])
  useEffect(() => { void load() }, [load])

  async function run(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true); setMessage(null)
    const { error } = await supabase!.rpc(name, { p_property_id: propertyId, ...args })
    setBusy(false)
    if (error) { setMessage({ text: error.code === '42501' ? tr('Your staff session needs the authenticator code again.', 'Kinahanglan na usab ang authenticator code sa imong staff session.') : tr('Not saved. Check the rent (a positive amount) and keep the description under 300 characters.', 'Wala na-save. Susiha ang abang (positibo nga kantidad) ug ipamubo ang deskripsyon ubos sa 300 ka letra.'), error: true }); return }
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
        <div className="public-building-tabs staff-building-tabs" role="group" aria-label={tr('Buildings', 'Mga bilding')}>
          {buildings.map(item => { const count = listings.filter(listing => units.find(unit => unit.id === listing.unit_id)?.building_id === item.id && listing.publicly_available).length
            return <button key={item.id} type="button" className="public-building-tab" aria-pressed={item.id === activeBuilding} onClick={() => setActiveBuilding(item.id)}><strong>{item.label}</strong><span>{count} {tr('shown to the public', 'makita sa publiko')}</span></button> })}
        </div>
        <ul className="listing-rows">{units.filter(unit => unit.building_id === activeBuilding).map(unit => {
          const listing = listings.find(item => item.unit_id === unit.id)
          const status = !listing ? tr('Not listed', 'Wala nalista') : listing.publicly_available ? tr('Visible to the public', 'Makita sa publiko') : tr('Listed but hidden: room has a current or upcoming agreement', 'Nalista apan natago: naay kasabotan karon o umaabot')
          return <li key={unit.id} className="listing-row">
            <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const listed = f.get('listed') === 'on'
              void run('set_room_listing', { p_unit_id: unit.id, p_listed: listed, p_asking_rent: listed ? String(f.get('rent')) : null, p_description: listed ? String(f.get('description') ?? '') : null }, listed ? tr(`${unit.label} saved to the public listing.`, `Na-save ang ${unit.label} sa publiko nga lista.`) : tr(`${unit.label} removed from the public page.`, `Gikuha ang ${unit.label} sa publiko nga panid.`)) }}>
              <div className="listing-row__head"><strong>{unit.label}</strong><span className={`status ${!listing ? '' : listing.publicly_available ? 'status--ready' : 'status--warning'}`}>{status}</span></div>
              <label className="listing-toggle"><input type="checkbox" name="listed" defaultChecked={Boolean(listing)} /> {tr('Show on public page', 'Ipakita sa publiko nga panid')}</label>
              <div className="listing-fields">
                <div><label htmlFor={`rent-${unit.id}`}>{tr('Monthly rent (PHP)', 'Binulan nga abang (PHP)')}</label><input id={`rent-${unit.id}`} name="rent" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={listing?.asking_rent ?? ''} /></div>
                <div><label htmlFor={`description-${unit.id}`}>{tr('Short description', 'Mubo nga deskripsyon')}</label><input id={`description-${unit.id}`} name="description" maxLength={300} defaultValue={listing?.description ?? ''} placeholder={tr('e.g. Second floor, good for 2 persons', 'pananglitan: Ikaduhang andana, para sa 2 ka tawo')} /></div>
              </div>
              <Button className="primary" disabled={busy}>{tr('Save', 'I-save')}</Button>
            </form>
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
