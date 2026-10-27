import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { decimalPesos } from './CashAcknowledgment'
import { parsePublicListings, roomCount, type PublicListings, type PublicRoom } from './public-listings-model.ts'
import { Facade, SITE, roomPlace, type RoomPlace } from '../landing/street'
import { text, type Language } from '../i18n'
import './public-rooms.css'

export type InquiryInput = { id: string; unitId: string; name: string; contact: string; message: string }
export type InquiryResult = 'sent' | 'limit' | 'unlisted' | 'error'

// Focused inquiry dialog: one request ID per opened dialog so a retried send cannot create a duplicate.
function InquiryDialog({ building, room, language, submit, close }: { building: string; room: PublicRoom; language: Language; submit: (input: InquiryInput) => Promise<InquiryResult>; close: () => void }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const dialog = useRef<HTMLDialogElement>(null)
  const requestId = useRef(crypto.randomUUID())
  const [state, setState] = useState<'editing' | 'sending' | InquiryResult>('editing')
  const [sentTo, setSentTo] = useState('')
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => { opener.current = document.activeElement as HTMLElement | null; dialog.current?.showModal() }, [])
  // Close the modal first, then return focus to the button that opened it, then unmount.
  const finish = () => { dialog.current?.close(); opener.current?.focus(); close() }
  const failure = state === 'limit' ? tr('Too many messages were sent recently. Please try again later.', 'Daghan na kaayong mensahe karong bag-o. Palihug sulayi pag-usab unya.')
    : state === 'unlisted' ? tr('Sorry, this room is no longer listed. Please choose another room.', 'Pasensya, wala na nalista kini nga kwarto. Palihug pagpili og lain.')
    : state === 'error' ? tr('Your message could not be sent. Check your connection and try again.', 'Wala mapadala ang imong mensahe. Susiha ang koneksyon ug sulayi pag-usab.') : ''
  return <dialog ref={dialog} className="inquiry-dialog" aria-labelledby="inquiry-heading" onCancel={e => { e.preventDefault(); finish() }}>
    <div className="inquiry-dialog__head">
      <div><p className="inquiry-dialog__where">{building}</p><h2 id="inquiry-heading">{tr('Ask about', 'Pangutana bahin sa')} {room.room}</h2><p className="inquiry-rent">{room.asking_rent ? `${decimalPesos(room.asking_rent)} ${tr('per month', 'matag bulan')}` : tr('Ask for the price', 'Pangutana sa presyo')}</p></div>
      <Button type="button" className="secondary-button" onClick={finish}>{tr('Close', 'Sirado')}</Button>
    </div>
    {state === 'sent' ? <div className="inquiry-sent" role="status">
      <span className="inquiry-sent__mark" aria-hidden="true">✓</span>
      <p><strong>{tr('Message sent. Thank you!', 'Napadala na ang mensahe. Salamat!')}</strong> {tr('The property staff will contact you at', 'Kontakon ka sa staff sa propiedad pinaagi sa')} {sentTo}.</p>
      <Button className="primary" onClick={finish}>{tr('Done', 'Human na')}</Button>
    </div> : <form onSubmit={async e => {
      e.preventDefault()
      const form = new FormData(e.currentTarget)
      // Hidden field that people never fill; automated spam often does. Pretend success and send nothing.
      if (String(form.get('website') ?? '')) { setSentTo(String(form.get('contact'))); setState('sent'); return }
      setState('sending')
      const contact = String(form.get('contact')).trim()
      const result = await submit({ id: requestId.current, unitId: room.unit_id, name: String(form.get('name')).trim(), contact, message: String(form.get('message')).trim() })
      if (result === 'sent') setSentTo(contact)
      setState(result)
    }}>
      {failure && <p className="notice notice--error" role="alert">{failure}</p>}
      <label htmlFor="inquiry-name">{tr('Your name', 'Imong ngalan')}</label>
      <input id="inquiry-name" name="name" autoComplete="name" required maxLength={100} />
      <label htmlFor="inquiry-contact">{tr('Phone number or Messenger name', 'Numero sa telepono o ngalan sa Messenger')}</label>
      <input id="inquiry-contact" name="contact" autoComplete="tel" required minLength={3} maxLength={120} aria-describedby="inquiry-contact-help" />
      <p className="field-help" id="inquiry-contact-help">{tr('Staff will use this only to reply about the room.', 'Gamiton lang kini sa staff aron motubag bahin sa kwarto.')}</p>
      <label htmlFor="inquiry-message">{tr('Message', 'Mensahe')}</label>
      <textarea id="inquiry-message" name="message" maxLength={1000} defaultValue={tr(`Hi, is ${room.room} in ${building} still available? When can I visit?`, `Hi, available pa ba ang ${room.room} sa ${building}? Kanus-a ko makabisita?`)} />
      <div className="inquiry-trap" aria-hidden="true"><label htmlFor="inquiry-website">Website</label><input id="inquiry-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <p className="field-help">{tr('Your message is kept for up to 90 days and is seen only by the property staff.', 'Ang imong mensahe tipigan hangtod 90 ka adlaw ug makita lang sa staff sa propiedad.')}</p>
      <Button className="primary" disabled={state === 'sending'}>{state === 'sending' ? tr('Sending…', 'Gipadala…') : tr('Send message', 'Ipadala ang mensahe')}</Button>
    </form>}
  </dialog>
}

const placeText = (place: RoomPlace | null, tr: (english: string, bisaya: string) => string) => place === 'upstairs' ? tr('Upstairs, on the balcony walk', 'Sa taas, sa balkonahe')
  : place === 'wing' ? tr('Upstairs, in the wing', 'Sa taas, sa pako')
    : place === 'inside' ? tr('Ground floor, inside past the door', 'Sa ubos, sa sulod lapas sa pultahan')
      : place === 'street' ? tr('Ground floor, its own street door', 'Sa ubos, kaugalingong pultahan sa dalan')
        : place === 'house' ? tr('Inside the house', 'Sa sulod sa balay') : null

// Building tabs (each drawn with its open rooms lit), the selected building large, and its room cards. Clicking a lit
// room in the drawing jumps to its card; pointing at a card lights its room. Cards and buttons are the keyboard path.
export function PublicRoomsView({ listings, language, submit }: { listings: PublicListings; language: Language; submit: (input: InquiryInput) => Promise<InquiryResult> }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const buildings = listings.properties.flatMap(property => property.buildings)
  const [active, setActive] = useState(0)
  const [asking, setAsking] = useState<{ building: string; room: PublicRoom } | null>(null)
  const [hover, setHover] = useState<string | undefined>()
  const [picked, setPicked] = useState<string | undefined>()
  const cards = useRef<HTMLDivElement>(null)
  const building = buildings[Math.min(active, Math.max(0, buildings.length - 1))]
  const site = building && SITE.find(item => item.label === building.label)
  const total = roomCount(listings)
  if (!total) return <div className="pr-empty"><h2>{tr('No rooms are listed right now', 'Walay kwarto nga nalista karon')}</h2><p>{tr('Please check again soon. Rooms appear here as soon as they become available.', 'Palihug susiha pag-usab unya. Makita dinhi ang kwarto inig ka-available niini.')}</p></div>
  const pick = (label: string) => {
    setPicked(label)
    const card = [...(cards.current?.querySelectorAll<HTMLElement>('.public-room-card') ?? [])].find(item => item.dataset.room === label)
    card?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    card?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }
  return <div className="public-rooms">
    <div className="public-building-tabs" role="tablist" aria-label={tr('Buildings', 'Mga bilding')}>
      {buildings.map((item, index) => {
        const drawn = SITE.find(entry => entry.label === item.label)
        return <button key={item.label} type="button" role="tab" id={`building-tab-${index}`} aria-controls="building-rooms" aria-selected={item === building} tabIndex={item === building ? 0 : -1} className="public-building-tab"
          onClick={() => { setActive(index); setPicked(undefined) }}
          onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { const next = (index + (event.key === 'ArrowRight' ? 1 : buildings.length - 1)) % buildings.length; setActive(next); setPicked(undefined); document.getElementById(`building-tab-${next}`)?.focus() } }}>
          {drawn && <span className="public-building-tab__art" aria-hidden="true"><Facade site={drawn} open={item.rooms.map(room => room.room)} width={100} /></span>}
          <strong>{item.label}</strong><span>{item.rooms.length} {tr(item.rooms.length === 1 ? 'room available' : 'rooms available', 'ka kwarto nga available')}</span>
        </button>
      })}
    </div>
    <section id="building-rooms" role="tabpanel" aria-labelledby={`building-tab-${buildings.indexOf(building)}`} className={`pr-panel${site ? '' : ' pr-panel--plain'}`}>
      {site && <figure className="pr-stage">
        <div className="pr-stage__art"><Facade site={site} open={building.rooms.map(room => room.room)} width={100} onPick={pick} focus={hover ?? picked} /></div>
        <figcaption>{tr('Glowing doors and windows are open. Tap one to jump to its room.', 'Ang nagsiga nga pultahan ug bintana bakante. I-tap aron moadto sa kwarto.')}</figcaption>
      </figure>}
      <div className="public-room-grid" ref={cards}>
        {building.rooms.map(room => {
          const place = placeText(roomPlace(building.label, room.room), tr)
          return <article key={room.unit_id} data-room={room.room} className={`public-room-card${picked === room.room ? ' is-picked' : ''}`}
            onMouseEnter={() => setHover(room.room)} onMouseLeave={() => setHover(undefined)} onFocus={() => setHover(room.room)} onBlur={() => setHover(undefined)}>
            <div className="public-room-card__top"><h3>{room.room}</h3><span className="status status--ready">{tr('Available', 'Available')}</span></div>
            {place && <p className="public-room-place">{place}</p>}
            <p className="public-room-rent">{room.asking_rent ? <><strong>{decimalPesos(room.asking_rent)}</strong> <span>{tr('per month', 'matag bulan')}</span></> : <strong>{tr('Ask for the price', 'Pangutana sa presyo')}</strong>}</p>
            {room.description && <p className="public-room-description">{room.description}</p>}
            <Button className="primary" onClick={() => setAsking({ building: building.label, room })}>{tr('Ask about this room', 'Pangutana bahin niini')}</Button>
          </article>
        })}
      </div>
    </section>
    {asking && <InquiryDialog building={asking.building} room={asking.room} language={language} submit={submit} close={() => setAsking(null)} />}
  </div>
}

// Shared public page frame (header, intro, language switch). Used by the live /rooms page and the dev sample.
export function PublicRoomsFrame({ propertyName, notice, children, language, setLanguage, open }: { propertyName: string; notice?: string; children: ReactNode; language: Language; setLanguage: (language: Language) => void; open?: number | null }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return <div className="pr-shell">
    <a className="skip-link" href="#rooms-main">{tr('Skip to rooms', 'Lakaw sa mga kwarto')}</a>
    {notice && <div className="environment-note" role="status">{notice}</div>}
    <header className="pr-nav">
      <a className="pr-brand" href="/" aria-label={tr('RentByBob home', 'Panimalay sa RentByBob')}><span className="pr-brand-mark" aria-hidden="true" /><span>Rent<i>By</i>Bob</span></a>
      <Button className="pr-lang" aria-pressed={language === 'ceb'} onClick={() => setLanguage(language === 'en' ? 'ceb' : 'en')}>{language === 'en' ? 'English · Bisaya' : 'Bisaya · English'}</Button>
    </header>
    <main id="rooms-main" tabIndex={-1}>
      <section className="pr-hero">
        <p className="pr-hero__place">{propertyName} · B. Zubiri St, Cebu City</p>
        <h1>{tr('Rooms for rent', 'Mga kwarto nga paabangan')}</h1>
        <p className="pr-hero__lede">{tr('Choose a building, pick a glowing room, then send one message. Staff will reply even if no one is at the office right now.', 'Pagpili og bilding, pilia ang nagsiga nga kwarto, dayon pagpadala og usa ka mensahe. Motubag ang staff bisan walay tawo sa opisina karon.')}</p>
        {typeof open === 'number' && <p className="pr-hero__count"><strong>{open}</strong> {tr(open === 1 ? 'space open right now' : 'spaces open right now', 'ka luna nga bakante karon')}</p>}
      </section>
      <div className="pr-body">
        {children}
        <p className="pr-footnote">{tr('Listings are updated by the property staff. Viewing is free; no account or payment is needed to ask.', 'Ang staff sa propiedad ang nag-update sa lista. Libre ang pagtan-aw; walay account o bayad nga kinahanglan aron mangutana.')} <a href="/">{tr('Back to the street', 'Balik sa dalan')}</a></p>
      </div>
    </main>
  </div>
}

// Live public page at /rooms: anonymous, read-only listing plus write-only inquiries.
export function PublicRoomsPage() {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('rentbybob-language') === 'ceb' ? 'ceb' : 'en' } catch { return 'en' } })
  const [listings, setListings] = useState<PublicListings | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { document.documentElement.lang = language === 'ceb' ? 'ceb' : 'en'; try { localStorage.setItem('rentbybob-language', language) } catch { /* not remembered */ } }, [language])
  useEffect(() => { document.title = 'Rooms for rent | RentByBob' }, [])
  useEffect(() => {
    void (async () => {
      try {
        const { supabase } = await import('./client')
        if (!supabase) throw new Error('No connection')
        const { data, error } = await supabase.rpc('read_public_listings')
        if (error) throw error
        setListings(parsePublicListings(data))
      } catch { setFailed(true) }
    })()
  }, [])
  async function submit(input: InquiryInput): Promise<InquiryResult> {
    try {
      const { supabase } = await import('./client')
      const { error } = await supabase!.rpc('submit_rental_inquiry', { p_id: input.id, p_unit_id: input.unitId, p_name: input.name, p_contact: input.contact, p_message: input.message })
      if (!error) return 'sent'
      return /Too many/.test(error.message) ? 'limit' : /no longer listed/.test(error.message) ? 'unlisted' : 'error'
    } catch { return 'error' }
  }
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return <PublicRoomsFrame propertyName={listings?.properties[0]?.name ?? 'RentByBob'} language={language} setLanguage={setLanguage} open={listings ? roomCount(listings) : null}>
    {failed ? <p className="notice notice--error" role="alert">{tr('Room listings could not be loaded. Please try again later.', 'Wala ma-load ang lista sa kwarto. Palihug sulayi pag-usab unya.')}</p>
      : !listings ? <LoadingSkeleton label={tr('Loading rooms…', 'Gikarga ang mga kwarto…')} rows={3} />
      : <PublicRoomsView listings={listings} language={language} submit={submit} />}
  </PublicRoomsFrame>
}
