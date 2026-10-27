import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { text, type Language } from '../i18n'
import { parsePublicListings, type PublicListings } from '../access/public-listings-model.ts'
import './landing.css'

// Public landing page at "/" for visitors who are not signed in. Live vacancy comes only from the public listing
// function (the same data as /rooms); nothing private is read. Contact details below are PLACEHOLDERS (owner to
// replace before going public; see docs/DEPLOYMENT.md).
export const CONTACT = {
  phone: '+63 900 000 0000', // placeholder
  phoneHref: 'tel:+639000000000', // placeholder
  messenger: 'm.me/rentbybob', // placeholder
  messengerHref: 'https://m.me/rentbybob', // placeholder
  address: 'B. Zubiri St., Brgy. Labangon, Cebu City, Cebu',
  mapsHref: 'https://www.google.com/maps/search/?api=1&query=B.+Zubiri+St,+Labangon,+Cebu+City,+Cebu',
}

// The property as it stands on the street (fixed sketch order). Windows light up for rooms open right now.
const STREET: { label: string; kind: 'tall' | 'wide' | 'house' | 'shop'; floors: number; bays: number }[] = [
  { label: 'Building 1', kind: 'tall', floors: 2, bays: 5 },
  { label: 'Building 2', kind: 'tall', floors: 2, bays: 5 },
  { label: "Bob's house", kind: 'house', floors: 1, bays: 3 },
  { label: 'House 1', kind: 'house', floors: 1, bays: 2 },
  { label: 'Store 1', kind: 'shop', floors: 1, bays: 1 },
  { label: 'Store 2', kind: 'shop', floors: 1, bays: 1 },
  { label: 'Store 3', kind: 'shop', floors: 1, bays: 1 },
  { label: 'Yamaha property', kind: 'wide', floors: 1, bays: 3 },
]

const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

// Counts up once when first shown (instant under reduced motion).
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (reduceMotion()) { setShown(value); return }
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const step = (now: number) => { const t = Math.min(1, (now - start) / 900); setShown(Math.round(value * (1 - Math.pow(1 - t, 3)))); if (t < 1) frame = requestAnimationFrame(step) }
      frame = requestAnimationFrame(step)
    }, { threshold: 0.4 })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])
  return <span ref={ref}>{shown}</span>
}

// Sections fade up as they scroll into view.
function useReveal() {
  useEffect(() => {
    const items = [...document.querySelectorAll<HTMLElement>('.lp-reveal')]
    if (reduceMotion() || !('IntersectionObserver' in window)) { items.forEach(item => item.classList.add('is-in')); return }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target) } }), { threshold: 0.15 })
    items.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [])
}

function Facade({ building, open, active, language, onFocus }: { building: (typeof STREET)[number]; open: number; active: boolean; language: Language; onFocus: () => void }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const width = building.kind === 'tall' ? 132 : building.kind === 'wide' ? 150 : building.kind === 'house' ? 112 : 64
  const height = building.kind === 'tall' ? 168 : building.kind === 'house' ? 112 : building.kind === 'wide' ? 96 : 92
  const windows = building.floors * building.bays
  const label = `${building.label}: ${open ? `${open} ${tr(open === 1 ? 'room open now' : 'rooms open now', 'ka kwarto nga bakante karon')}` : tr('full right now', 'puno karon')}`
  return <a className={`lp-facade lp-facade--${building.kind}${active ? ' is-active' : ''}${open ? ' has-open' : ''}`} href="/rooms" aria-label={label}
    onMouseEnter={onFocus} onFocus={onFocus} style={{ '--w': `${width}px`, '--h': `${height}px` } as CSSProperties}>
    <svg viewBox={`0 0 ${width} ${height + 18}`} aria-hidden="true">
      {building.kind === 'house' ? <path className="lp-roof" d={`M-4 ${height * 0.34} L${width / 2} 6 L${width + 4} ${height * 0.34}Z`} /> : <rect className="lp-roof" x="-3" y="4" width={width + 6} height="10" rx="2" />}
      <rect className="lp-wall" x="0" y={building.kind === 'house' ? height * 0.32 : 12} width={width} height={building.kind === 'house' ? height * 0.68 + 2 : height - 10} rx="3" />
      {Array.from({ length: windows }, (_, index) => {
        const floor = Math.floor(index / building.bays), bay = index % building.bays
        const top = (building.kind === 'house' ? height * 0.44 : 26) + floor * ((height - 52) / building.floors)
        const gap = width / building.bays
        const lit = index < open
        return <rect key={index} className={`lp-window${lit ? ' is-lit' : ''}`} style={{ transitionDelay: `${index * 40}ms` } as CSSProperties}
          x={bay * gap + gap * 0.22} y={top} width={gap * 0.56} height={building.kind === 'shop' ? 30 : 22} rx="2" />
      })}
      {building.kind === 'shop' && <rect className="lp-awning" x="-2" y="16" width={width + 4} height="8" rx="2" />}
      <rect className="lp-door" x={width / 2 - 9} y={height - 22} width="18" height="30" rx="2" />
    </svg>
    <span className="lp-facade-name">{building.label.replace(' property', '')}</span>
  </a>
}

export function LandingPage() {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('rentbybob-language') === 'ceb' ? 'ceb' : 'en' } catch { return 'en' } })
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [listings, setListings] = useState<PublicListings | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [active, setActive] = useState(STREET[0].label)
  const hero = useRef<HTMLElement>(null)
  useReveal()
  useEffect(() => { document.documentElement.lang = language === 'ceb' ? 'ceb' : 'en'; try { localStorage.setItem('rentbybob-language', language) } catch { /* not remembered */ } }, [language])
  useEffect(() => { document.title = 'RentByBob | Rooms for rent in Labangon, Cebu City' }, [])
  useEffect(() => {
    void (async () => {
      try {
        const { supabase } = await import('../access/client')
        if (!supabase) throw new Error('No connection')
        const { data, error } = await supabase.rpc('read_public_listings')
        if (error) throw error
        setListings(parsePublicListings(data))
      } catch { setUnavailable(true) }
    })()
  }, [])

  const openByBuilding = useMemo(() => {
    const counts = new Map<string, number>()
    for (const property of listings?.properties ?? []) for (const building of property.buildings) counts.set(building.label, (counts.get(building.label) ?? 0) + building.rooms.length)
    return counts
  }, [listings])
  const totalOpen = [...openByBuilding.values()].reduce((sum, count) => sum + count, 0)
  const buildingsWithRooms = [...openByBuilding.values()].filter(count => count > 0).length
  const lowestRent = useMemo(() => {
    const prices = (listings?.properties ?? []).flatMap(property => property.buildings.flatMap(building => building.rooms.map(room => room.asking_rent))).filter((value): value is string => Boolean(value)).map(Number)
    return prices.length ? Math.min(...prices) : null
  }, [listings])
  const activeOpen = openByBuilding.get(active) ?? 0

  // Soft light that follows the pointer across the hero (skipped under reduced motion).
  function follow(event: ReactPointerEvent<HTMLElement>) {
    if (reduceMotion() || !hero.current) return
    const box = hero.current.getBoundingClientRect()
    hero.current.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`)
    hero.current.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`)
  }

  return <div className="lp">
    <a className="lp-skip" href="#lp-main">{tr('Skip to content', 'Lakaw sa sulod')}</a>
    <header className="lp-nav">
      <a className="lp-brand" href="/" aria-label="RentByBob home"><span className="lp-mark" aria-hidden="true">R</span><span>Rent<em>ByBob</em></span></a>
      <nav aria-label={tr('Main', 'Panguna')}>
        <a href="/rooms">{tr('Rooms', 'Mga kwarto')}</a>
        <a href="#how">{tr('How it works', 'Unsaon')}</a>
        <a href="#visit">{tr('Visit', 'Bisita')}</a>
      </nav>
      <div className="lp-nav-actions">
        <button type="button" className="lp-lang" aria-label={language === 'en' ? 'Gamita ang Bisaya' : 'Use English'} onClick={() => setLanguage(language === 'en' ? 'ceb' : 'en')}>
          <span aria-hidden="true" className={language === 'en' ? 'is-on' : ''}>EN</span><span aria-hidden="true" className={language === 'ceb' ? 'is-on' : ''}>CEB</span>
        </button>
        <a className="lp-button lp-button--ghost" href="/sign-in">{tr('Sign in', 'Sulod')}</a>
      </div>
    </header>

    <main id="lp-main" tabIndex={-1}>
      <section className="lp-hero" ref={hero} onPointerMove={follow} aria-labelledby="lp-title">
        <div className="lp-hero-copy">
          <p className="lp-kicker"><span className="lp-dot" aria-hidden="true" />{tr('Labangon, Cebu City', 'Labangon, Siyudad sa Sugbo')}</p>
          <h1 id="lp-title"><span className="lp-line">{tr('A room in Labangon,', 'Kwarto sa Labangon,')}</span> <span className="lp-line lp-line--accent">{tr('without the runaround.', 'walay daghang lakaw.')}</span></h1>
          <p className="lp-lede">{tr('Rooms, a whole house and shop spaces on B. Zubiri St. See what is open today, ask in one message, and move in with clear monthly rent.', 'Mga kwarto, tibuok balay ug tindahan sa B. Zubiri St. Tan-awa kung unsay bakante karon, pangutana sa usa ka mensahe, ug sulod nga klaro ang binulan nga abang.')}</p>
          <div className="lp-cta">
            <a className="lp-button lp-button--primary" href="/rooms">{tr('See available rooms', 'Tan-awa ang bakante')}<span className="lp-arrow" aria-hidden="true">→</span></a>
            <a className="lp-button lp-button--quiet" href="/sign-in">{tr('Tenant sign-in', 'Sulod sa nag-abang')}</a>
          </div>
          <dl className="lp-facts" aria-live="polite">
            <div><dt>{tr('Open now', 'Bakante karon')}</dt><dd>{listings ? <CountUp value={totalOpen} /> : '—'}</dd></div>
            <div><dt>{tr('Buildings with space', 'Bilding nga naay luna')}</dt><dd>{listings ? <CountUp value={buildingsWithRooms} /> : '—'}</dd></div>
            <div><dt>{tr('Rent from', 'Abang gikan')}</dt><dd>{lowestRent ? `₱${lowestRent.toLocaleString('en-PH')}` : tr('Ask us', 'Pangutana')}</dd></div>
          </dl>
          {unavailable && <p className="lp-note">{tr('Live availability is not connected right now. You can still ask us directly.', 'Dili makita karon ang live nga bakante. Mahimo gihapon ka mangutana direkta.')}</p>}
        </div>

        <div className="lp-street-card">
          <div className="lp-street-head">
            <p>{tr('The property, as it stands', 'Ang propiedad')}</p>
            <p className="lp-street-status" aria-live="polite"><strong>{active}</strong> · {listings ? (activeOpen ? `${activeOpen} ${tr(activeOpen === 1 ? 'room open' : 'rooms open', 'ka bakante')}` : tr('full right now', 'puno karon')) : tr('checking…', 'gisusi…')}</p>
          </div>
          <div className="lp-street" role="group" aria-label={tr('Buildings on B. Zubiri St. Lit windows are rooms open now. Choose one to see rooms.', 'Mga bilding sa B. Zubiri St. Ang nagsiga nga bintana bakante karon.')}>
            {STREET.map(building => <Facade key={building.label} building={building} open={openByBuilding.get(building.label) ?? 0} active={active === building.label} language={language} onFocus={() => setActive(building.label)} />)}
          </div>
          <div className="lp-road" aria-hidden="true"><span>B. ZUBIRI ST.</span></div>
          <p className="lp-street-hint">{tr('Lit windows are rooms open today. Hover or tap a building.', 'Ang nagsiga nga bintana bakante karon. I-hover o i-tap ang bilding.')}</p>
        </div>
      </section>

      <section className="lp-section lp-steps lp-reveal" id="how" aria-labelledby="lp-how">
        <p className="lp-eyebrow">{tr('How it works', 'Unsaon')}</p>
        <h2 id="lp-how">{tr('Three steps. No agents, no guesswork.', 'Tulo ka lakang. Walay ahente, walay tag-an.')}</h2>
        <ol>
          <li><span className="lp-step-no">01</span><h3>{tr('Browse what is open', 'Tan-awa ang bakante')}</h3><p>{tr('Every room on the list is free right now. Occupied rooms never appear.', 'Ang tanang kwarto sa lista bakante karon. Ang naay nagpuyo dili makita.')}</p></li>
          <li><span className="lp-step-no">02</span><h3>{tr('Send one message', 'Usa ka mensahe')}</h3><p>{tr('Leave your name and number on the room you like. The owner replies, usually the same day.', 'Ibilin ang imong ngalan ug numero sa kwarto nga gusto nimo. Motubag ang tag-iya, kasagaran sa samang adlaw.')}</p></li>
          <li><span className="lp-step-no">03</span><h3>{tr('Visit and move in', 'Bisita ug sulod')}</h3><p>{tr('See the room, agree on the rent, and you are set. Rent is due on the same day each month.', 'Tan-awa ang kwarto, magkasabot sa abang, ug andam na. Ang abang bayran sa parehong adlaw matag bulan.')}</p></li>
        </ol>
      </section>

      <section className="lp-section lp-tenants lp-reveal" aria-labelledby="lp-tenants">
        <div>
          <p className="lp-eyebrow">{tr('Already renting here?', 'Nag-abang na diri?')}</p>
          <h2 id="lp-tenants">{tr('Your rent, in plain sight.', 'Ang imong abang, klaro.')}</h2>
          <p>{tr('Sign in to see what is left to pay, which months are settled, and every receipt. Payments are still made in person; the site never asks for card details.', 'Sulod aron makita ang nabilin nga bayranan, mga bulan nga bayad na, ug tanang resibo. Personal gihapon ang pagbayad; dili mangayo ang site og detalye sa card.')}</p>
          <a className="lp-button lp-button--light" href="/sign-in">{tr('Tenant sign-in', 'Sulod sa nag-abang')}<span className="lp-arrow" aria-hidden="true">→</span></a>
        </div>
        <ul className="lp-perks">
          <li><span aria-hidden="true">₱</span>{tr('Balance after confirmed payments only', 'Balanse human sa kumpirmadong bayad lang')}</li>
          <li><span aria-hidden="true">✓</span>{tr('Receipts you can open any time', 'Resibo nga maablihan bisan kanus-a')}</li>
          <li><span aria-hidden="true">Aa</span>{tr('English or Bisaya, day or night', 'English o Bisaya, adlaw o gabii')}</li>
        </ul>
      </section>

      <section className="lp-section lp-visit lp-reveal" id="visit" aria-labelledby="lp-visit">
        <div className="lp-map" aria-hidden="true">
          <svg viewBox="0 0 400 260">
            <path className="lp-map-road lp-map-road--main" d="M-10 170 C 90 150, 180 190, 410 140" />
            <path className="lp-map-road" d="M120 -10 C 140 80, 150 170, 170 270" />
            <path className="lp-map-road" d="M260 -10 C 250 90, 280 180, 300 270" />
            <path className="lp-map-road lp-map-road--thin" d="M-10 70 L 410 95" />
          </svg>
          <span className="lp-pin"><span /></span>
          <span className="lp-map-label">B. Zubiri St.</span>
        </div>
        <div>
          <p className="lp-eyebrow">{tr('Visit', 'Bisita')}</p>
          <h2 id="lp-visit">{tr('Find us in Labangon.', 'Makit-i mi sa Labangon.')}</h2>
          <address>{CONTACT.address}</address>
          <div className="lp-contact">
            <a className="lp-button lp-button--primary" href={CONTACT.mapsHref} target="_blank" rel="noopener noreferrer">{tr('Open in Google Maps', 'Ablihi sa Google Maps')}<span className="lp-arrow" aria-hidden="true">↗</span></a>
            <a className="lp-chip" href={CONTACT.phoneHref}><span className="lp-chip-label">{tr('Call or text', 'Tawag o text')}</span>{CONTACT.phone}</a>
            <a className="lp-chip" href={CONTACT.messengerHref} target="_blank" rel="noopener noreferrer"><span className="lp-chip-label">Messenger</span>{CONTACT.messenger}</a>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <span>© {new Date().getFullYear()} RentByBob · Labangon, Cebu City</span>
      <nav aria-label={tr('Footer', 'Ubos')}><a href="/rooms">{tr('Available rooms', 'Bakante nga kwarto')}</a><a href="/sign-in">{tr('Tenant & staff sign-in', 'Sulod sa nag-abang ug staff')}</a></nav>
    </footer>
  </div>
}
