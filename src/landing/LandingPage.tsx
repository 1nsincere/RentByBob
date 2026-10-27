import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { text, type Language } from '../i18n'
import { parsePublicListings, type PublicListings } from '../access/public-listings-model.ts'
import './landing.css'

// Public landing page at "/" for visitors who are not signed in. Live vacancy comes only from the public listing
// function (the same data as /rooms); nothing private is read. Phone and Messenger are PLACEHOLDERS for the owner
// to replace before going public (docs/DEPLOYMENT.md).
export const CONTACT = {
  phone: '0900 000 0000', // placeholder
  phoneHref: 'tel:+639000000000', // placeholder
  messenger: 'm.me/rentbybob', // placeholder
  messengerHref: 'https://m.me/rentbybob', // placeholder
  address: '100A B. Zubiri St, Cebu City, 6000 Cebu',
  mapsHref: 'https://www.google.com/maps/search/?api=1&query=100A+B.+Zubiri+St,+Cebu+City,+6000+Cebu',
}

// Site plan of the rentable homes, placed as on the owner's sketch: B. Zubiri St in front, Mariano Abella St beside
// Bob's house. Stores and the Yamaha space are private negotiations and are never shown publicly (owner decision
// 27 Oct 2026). Each home has one window per rentable space; windows glow for spaces open right now (public listing
// data only). fw is the drawing's width in its plot, so every home is drawn at the same scale.
type Site = { label: string; kind: 'block' | 'house'; spaces: number; x: number; y: number; w: number; h: number; fw: number }
const SITE: Site[] = [
  { label: 'Building 1', kind: 'block', spaces: 10, x: 3, y: 3, w: 32, h: 47, fw: 100 },
  { label: 'Building 2', kind: 'block', spaces: 8, x: 37, y: 3, w: 28, h: 47, fw: 100 },
  { label: 'House 1', kind: 'house', spaces: 1, x: 69, y: 3, w: 26, h: 47, fw: 54 },
  { label: "Bob's house", kind: 'house', spaces: 6, x: 27, y: 66.5, w: 40, h: 31, fw: 60 },
]

// Street-front drawing of one home: tin roof, yellow walls, a window per rentable space (lit = open now).
// Boarding blocks get a balcony rail and an outside stair; houses get a front door and a gable.
function Facade({ site, lit }: { site: Site; lit: number }) {
  const block = site.kind === 'block'
  const floors = block || site.spaces > 2 ? 2 : 1
  const per = Math.ceil(site.spaces / floors)
  const cell = 22, floorH = 30, x0 = 5
  const door = block ? 0 : 1
  const wallW = (per + door) * cell + 10
  const roofH = block ? 15 : 24
  const groundY = roofH + floors * floorH
  const stairW = block ? 24 : 0
  const W = x0 + wallW + stairW + 5, H = groundY + 7
  const doorSlot = Math.floor(per / 2)
  const windows: { x: number; y: number }[] = []
  for (let f = 0; f < floors; f++) {
    const ground = f === floors - 1
    const count = Math.min(per, site.spaces - windows.length)
    for (let s = 0; s < count; s++) {
      const slot = ground && door ? (s >= doorSlot ? s + 1 : s) : s
      const shift = !ground && door ? cell / 2 : 0
      windows.push({ x: x0 + 9 + slot * cell + shift, y: roofH + f * floorH + 7 })
    }
  }
  const rightEdge = x0 + wallW
  const ridges = Array.from({ length: Math.floor((wallW + 6) / 6) }, (_, i) => x0 - 1 + i * 6)
  // Top of the hip roof at x, so the corrugation lines stay inside the sloped ends.
  const roofTop = (x: number) => roofH + 2 - (roofH - 2) * Math.min(1, Math.min(x - (x0 - 5), rightEdge + 5 - x) / 13)
  return <svg className="lp-facade" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" style={{ width: `${site.fw}%` } as CSSProperties} aria-hidden="true" focusable="false">
    <ellipse className="fx-shadow" cx={W / 2} cy={H - 3} rx={W / 2} ry={3.5} />
    <rect className="fx-wall" x={x0} y={roofH} width={wallW} height={groundY - roofH} />
    <rect className="fx-wall-shade" x={rightEdge - 7} y={roofH} width={7} height={groundY - roofH} />
    {floors === 2 && <rect className="fx-trim" x={x0 - 2} y={roofH + floorH - 2} width={wallW + 4} height={3} />}
    {block ? <>
      <polygon className="fx-roof" points={`${x0 - 5},${roofH + 1} ${rightEdge + 5},${roofH + 1} ${rightEdge - 8},3 ${x0 + 8},3`} />
      {ridges.filter(x => roofTop(x) < roofH - 3).map(x => <line key={x} className="fx-ridge" x1={x} y1={roofTop(x)} x2={x} y2={roofH - 1} />)}
      <rect className="fx-eave" x={x0 - 5} y={roofH - 1} width={wallW + 10} height={3} />
      <line className="fx-rail" x1={x0} y1={roofH + floorH - 9} x2={rightEdge} y2={roofH + floorH - 9} />
      {Array.from({ length: Math.floor(wallW / 5) }, (_, i) => <line key={i} className="fx-baluster" x1={x0 + 2 + i * 5} y1={roofH + floorH - 9} x2={x0 + 2 + i * 5} y2={roofH + floorH - 2} />)}
      <path className="fx-stair" d={`M${rightEdge + stairW} ${groundY} ${Array.from({ length: 6 }, () => `v-${floorH / 6} h-${stairW / 6}`).join(' ')} L${rightEdge} ${groundY} Z`} />
      <line className="fx-rail" x1={rightEdge + stairW} y1={groundY - 9} x2={rightEdge + 2} y2={roofH + floorH - 9} />
    </> : <>
      <polygon className="fx-gable" points={`${x0},${roofH + 1} ${x0 + wallW / 2},6 ${rightEdge},${roofH + 1}`} />
      <circle className="fx-vent" cx={x0 + wallW / 2} cy={roofH - 6} r={2.6} />
      <polyline className="fx-roof-line" points={`${x0 - 5},${roofH + 3} ${x0 + wallW / 2},2 ${rightEdge + 5},${roofH + 3}`} />
      <rect className="fx-door" x={x0 + 9 + doorSlot * cell} y={groundY - 22} width={14} height={22} rx={1} />
      <circle className="fx-knob" cx={x0 + 20 + doorSlot * cell} cy={groundY - 11} r={1} />
      <polygon className="fx-awning" points={`${x0 + 6 + doorSlot * cell},${groundY - 23} ${x0 + 26 + doorSlot * cell},${groundY - 23} ${x0 + 23 + doorSlot * cell},${groundY - 28} ${x0 + 9 + doorSlot * cell},${groundY - 28}`} />
    </>}
    {windows.map((spot, index) => <g key={index}>
      <rect className="fx-frame" x={spot.x - 1.5} y={spot.y - 1.5} width={17} height={18} rx={1} />
      <rect className={`fx-glass${index < lit ? ' is-lit' : ''}`} x={spot.x} y={spot.y} width={14} height={15} style={{ animationDelay: `${(index % 4) * 0.45}s` } as CSSProperties} />
      {index < lit ? <rect className="fx-curtain" x={spot.x} y={spot.y} width={5} height={15} /> : <line className="fx-glint" x1={spot.x + 3} y1={spot.y + 12} x2={spot.x + 10} y2={spot.y + 3} />}
      <line className="fx-mullion" x1={spot.x + 7} y1={spot.y} x2={spot.x + 7} y2={spot.y + 15} />
      <rect className="fx-sill" x={spot.x - 2.5} y={spot.y + 15.5} width={19} height={2} />
    </g>)}
    <circle className="fx-bush" cx={x0 + 3} cy={groundY - 2} r={4.5} />
    <circle className="fx-bush" cx={rightEdge - 4} cy={groundY - 2} r={4} />
    <rect className="fx-ground" x={0} y={groundY} width={W} height={2.5} />
  </svg>
}

// Top-view vehicles (drawn facing east in an L×20 box, then turned for their lane). Philippine traffic keeps right.
type Heading = 'e' | 'w' | 'n' | 's'
type Ride = { kind: 'car' | 'moto' | 'jeep'; heading: Heading; color: string; duration: number; delay: number; rest: number }
const LENGTH = { car: 40, moto: 30, jeep: 60 }
const TRAFFIC: Ride[] = [
  { kind: 'car', heading: 'e', color: '#f4efe2', duration: 18, delay: -2, rest: 8 },
  { kind: 'moto', heading: 'e', color: '#e2725b', duration: 18, delay: -8, rest: 40 },
  { kind: 'car', heading: 'e', color: '#6cc3b0', duration: 18, delay: -14, rest: 74 },
  { kind: 'jeep', heading: 'w', color: '#dfe5e1', duration: 24, delay: -5, rest: 55 },
  { kind: 'moto', heading: 'w', color: '#f2c230', duration: 24, delay: -16, rest: 22 },
  { kind: 'moto', heading: 'n', color: '#6cc3b0', duration: 10, delay: -3, rest: 45 },
  { kind: 'car', heading: 's', color: '#f2c230', duration: 12, delay: -7, rest: 20 },
]
function Vehicle({ ride }: { ride: Ride }) {
  const L = LENGTH[ride.kind]
  const vertical = ride.heading === 'n' || ride.heading === 's'
  const turn = { e: undefined, w: `translate(${L},0) scale(-1,1)`, n: `translate(0,${L}) rotate(-90)`, s: `translate(20,0) rotate(90)` }[ride.heading]
  return <span className={`lp-lane lp-lane--${ride.heading}`} style={{ '--dur': `${ride.duration}s`, '--delay': `${ride.delay}s`, '--rest': `${ride.rest}%` } as CSSProperties}>
    <svg viewBox={vertical ? `0 0 20 ${L}` : `0 0 ${L} 20`} aria-hidden="true" focusable="false"><g transform={turn}>
      {ride.kind === 'car' && <>
        <rect x="1" y="2" width="38" height="16" rx="6" fill={ride.color} />
        <rect className="v-roof" x="12" y="4" width="12" height="12" rx="2" />
        <rect className="v-glass" x="25" y="3.5" width="7" height="13" rx="2.5" />
        <rect className="v-glass" x="6" y="4.5" width="5" height="11" rx="2" />
        <circle className="v-light" cx="38" cy="5" r="1.4" /><circle className="v-light" cx="38" cy="15" r="1.4" />
        <rect className="v-tail" x="0.8" y="3.5" width="1.6" height="3" /><rect className="v-tail" x="0.8" y="13.5" width="1.6" height="3" />
      </>}
      {ride.kind === 'moto' && <>
        <rect className="v-tyre" x="2" y="8.5" width="8" height="3" rx="1.5" /><rect className="v-tyre" x="20" y="8.5" width="8" height="3" rx="1.5" />
        <rect x="7" y="7" width="15" height="6" rx="3" fill={ride.color} />
        <line className="v-bar" x1="21" y1="4.5" x2="21" y2="15.5" />
        <ellipse className="v-rider" cx="13" cy="10" rx="4.5" ry="5.5" />
        <circle cx="14.5" cy="10" r="3.2" fill={ride.color} stroke="#1c2a23" strokeWidth="0.8" />
        <circle className="v-light" cx="29" cy="10" r="1.3" />
      </>}
      {ride.kind === 'jeep' && <>
        <rect x="1" y="2" width="58" height="16" rx="3" fill={ride.color} />
        <rect className="v-stripe-a" x="6" y="4" width="40" height="3" /><rect className="v-stripe-b" x="6" y="8.5" width="40" height="3" /><rect className="v-stripe-c" x="6" y="13" width="40" height="3" />
        <rect className="v-hood" x="47" y="3" width="11" height="14" rx="2" />
        <rect className="v-glass" x="47" y="4" width="3.5" height="12" rx="1" />
        <circle className="v-light" cx="58" cy="5" r="1.4" /><circle className="v-light" cx="58" cy="15" r="1.4" />
        <rect className="v-tail" x="0.8" y="3.5" width="1.6" height="3" /><rect className="v-tail" x="0.8" y="13.5" width="1.6" height="3" />
      </>}
    </g></svg>
  </span>
}

const TREES = [[1, 71, 9], [6, 86, 6], [70, 70, 7], [79, 79, 10], [90, 68, 7], [89, 87, 7], [71, 87, 5]]
const LAMPS = [[9, 'top'], [33, 'top'], [66, 'top'], [96, 'top'], [25, 'bottom'], [52, 'bottom'], [78, 'bottom']] as const

const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

// Sections drift in as they scroll into view.
function useReveal() {
  useEffect(() => {
    const items = [...document.querySelectorAll<HTMLElement>('.lp-reveal')]
    if (reduceMotion() || !('IntersectionObserver' in window)) { items.forEach(item => item.classList.add('is-in')); return }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target) } }), { threshold: 0.15 })
    items.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [])
}

// Two split-flap digits (like an old terminal board); a digit flips when the live number changes.
function SplitFlap({ value, label }: { value: number | null; label: string }) {
  const digits = value === null ? ['–', '–'] : String(Math.min(value, 99)).padStart(2, '0').split('')
  return <span className="lp-flap" role="img" aria-label={label}>
    {digits.map((digit, index) => <span key={`${index}-${digit}`} className="lp-flap-digit" aria-hidden="true"><span>{digit}</span></span>)}
  </span>
}

function PlanBuilding({ site, open, active, known, language, onFocus }: { site: Site; open: number; active: boolean; known: boolean; language: Language; onFocus: () => void }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const lit = Math.min(open, site.spaces)
  const status = !known ? tr('Checking…', 'Gisusi…') : lit ? `${lit} ${tr('open now', 'bakante karon')}` : tr('Full right now', 'Puno karon')
  return <a className={`lp-plot lp-plot--${site.kind}${active ? ' is-active' : ''}${lit ? ' has-open' : ''}`} href="/rooms"
    aria-label={`${site.label}: ${status}`} onMouseEnter={onFocus} onFocus={onFocus}
    style={{ left: `${site.x}%`, top: `${site.y}%`, width: `${site.w}%`, height: `${site.h}%` } as CSSProperties}>
    <span className="lp-plot-tag" aria-hidden="true"><span className="lp-plot-name">{site.label}</span><span className={`lp-plot-status${lit ? ' is-open' : ''}`}>{status}</span></span>
    <Facade site={site} lit={lit} />
  </a>
}

export function LandingPage() {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('rentbybob-language') === 'ceb' ? 'ceb' : 'en' } catch { return 'en' } })
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [listings, setListings] = useState<PublicListings | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [active, setActive] = useState(SITE[0].label)
  const sign = useRef<HTMLDivElement>(null)
  useReveal()
  useEffect(() => { document.documentElement.lang = language === 'ceb' ? 'ceb' : 'en'; try { localStorage.setItem('rentbybob-language', language) } catch { /* not remembered */ } }, [language])
  useEffect(() => { document.title = 'RentByBob | Rooms for rent on B. Zubiri St, Cebu City' }, [])
  // Live: read the public listing now, every 30 seconds while visible, and when the tab comes back.
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const { supabase } = await import('../access/client')
        if (!supabase) throw new Error('No connection')
        const { data, error } = await supabase.rpc('read_public_listings')
        if (error) throw error
        if (live) { setListings(parsePublicListings(data)); setUnavailable(false); setCheckedAt(new Date()) }
      } catch { if (live) setUnavailable(true) }
    }
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const openByBuilding = useMemo(() => {
    const counts = new Map<string, number>()
    for (const property of listings?.properties ?? []) for (const building of property.buildings) counts.set(building.label, (counts.get(building.label) ?? 0) + building.rooms.length)
    return counts
  }, [listings])
  const totalOpen = SITE.reduce((sum, site) => sum + Math.min(openByBuilding.get(site.label) ?? 0, site.spaces), 0)
  const lowestRent = useMemo(() => {
    const prices = (listings?.properties ?? []).flatMap(property => property.buildings.filter(building => SITE.some(site => site.label === building.label)).flatMap(building => building.rooms.map(room => room.asking_rent))).filter((value): value is string => Boolean(value)).map(Number)
    return prices.length ? Math.min(...prices) : null
  }, [listings])
  const activeOpen = Math.min(openByBuilding.get(active) ?? 0, SITE.find(site => site.label === active)?.spaces ?? 0)
  const checked = checkedAt ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(checkedAt) : null

  // The sign swings a little, away from where the pointer came in.
  function nudge(event: ReactPointerEvent<HTMLDivElement>) {
    if (reduceMotion() || !sign.current) return
    const box = sign.current.getBoundingClientRect()
    sign.current.style.setProperty('--swing', `${event.clientX < box.left + box.width / 2 ? 6 : -6}deg`)
    sign.current.classList.remove('is-swinging'); void sign.current.offsetWidth; sign.current.classList.add('is-swinging')
  }

  return <div className="lp">
    <a className="lp-skip" href="#lp-main">{tr('Skip to content', 'Lakaw sa sulod')}</a>
    <header className="lp-nav">
      <a className="lp-brand" href="/" aria-label="RentByBob home">Rent<span>By</span>Bob</a>
      <nav aria-label={tr('Main', 'Panguna')}>
        <a href="#board">{tr('Live board', 'Live nga board')}</a>
        <a href="/rooms">{tr('Rooms', 'Mga kwarto')}</a>
        <a href="#visit">{tr('Find us', 'Asa mi')}</a>
      </nav>
      <div className="lp-nav-actions">
        <button type="button" className="lp-lang" aria-label={language === 'en' ? 'Gamita ang Bisaya' : 'Use English'} onClick={() => setLanguage(language === 'en' ? 'ceb' : 'en')}>{language === 'en' ? 'Bisaya' : 'English'}</button>
        <a className="lp-stamp lp-stamp--small" href="/sign-in">{tr('Sign in', 'Sulod')}</a>
      </div>
    </header>

    <main id="lp-main" tabIndex={-1}>
      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-hero-copy">
          <p className="lp-address-line">{CONTACT.address}</p>
          <h1 id="lp-title">{tr('Rooms for rent', 'Kwarto nga paabangan')}<br />{tr('on B. Zubiri.', 'sa B. Zubiri.')}</h1>
          <p className="lp-lede">{tr('Clean rooms and a whole house in Labangon, Cebu City. What you see on the board below is open right now; ask in one message and we reply.', 'Limpyo nga mga kwarto ug tibuok balay sa Labangon, Cebu City. Ang makita nimo sa board sa ubos bakante karon; pangutana sa usa ka mensahe ug motubag mi.')}</p>
          <div className="lp-cta">
            <a className="lp-stamp lp-stamp--red" href="/rooms">{tr('See open rooms', 'Tan-awa ang bakante')} <span aria-hidden="true">→</span></a>
            <a className="lp-stamp" href="/sign-in">{tr('I already rent here', 'Nag-abang na ko diri')}</a>
          </div>
        </div>
        <div className="lp-sign-wrap">
          <div className="lp-sign" ref={sign} onPointerEnter={nudge} aria-hidden="true">
            <span className="lp-sign-nail" /><span className="lp-sign-string lp-sign-string--left" /><span className="lp-sign-string lp-sign-string--right" />
            <div className="lp-sign-board">
              <span className="lp-sign-big">{tr('ROOM', 'KWARTO')}</span>
              <span className="lp-sign-small">{tr('FOR RENT', 'PAABANGAN')}</span>
              <span className="lp-sign-hand">{tr('ask inside', 'pangutana sa sulod')} · {CONTACT.phone}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-board lp-reveal" id="board" aria-labelledby="lp-board-title">
        <div className="lp-board-side">
          <p className="lp-label">{tr('Live board', 'Live nga board')}{checked && <span className="lp-live"><span className="lp-dot" aria-hidden="true" /> {tr('updated', 'na-update')} {checked}</span>}</p>
          <h2 id="lp-board-title">{tr('Open today', 'Bakante karon')}</h2>
          <SplitFlap value={listings ? totalOpen : null} label={listings ? `${totalOpen} ${tr('spaces open today', 'ka bakante karon')}` : tr('Checking open spaces', 'Gisusi ang bakante')} />
          <dl className="lp-board-facts">
            <div><dt>{tr('Rent from', 'Abang gikan')}</dt><dd>{lowestRent ? `₱${lowestRent.toLocaleString('en-PH')}/${tr('mo', 'bulan')}` : tr('ask us', 'pangutana')}</dd></div>
            <div><dt>{tr('Selected', 'Napili')}</dt><dd aria-live="polite">{active} · {listings ? (activeOpen ? `${activeOpen} ${tr('open', 'bakante')}` : tr('full', 'puno')) : '…'}</dd></div>
          </dl>
          {unavailable && <p className="lp-note">{tr('The live board is not connected right now. Message us and we will tell you what is open.', 'Dili konektado karon ang live nga board. Mensahe mi ug among isulti kung unsay bakante.')}</p>}
        </div>
        <div className="lp-plan-paper">
          <div className="lp-plan" role="group" aria-label={tr('Site plan on B. Zubiri St and Mariano Abella St. Glowing windows are spaces open now. Choose a home to see rooms.', 'Plano sa B. Zubiri St ug Mariano Abella St. Ang nagsiga nga bintana bakante karon. Pilia ang balay aron makita ang kwarto.')}>
            <span className="lp-plan-road lp-plan-road--main" aria-hidden="true"><b>B. ZUBIRI ST.</b></span>
            <span className="lp-plan-road lp-plan-road--side" aria-hidden="true"><b><span className="lp-road-long">MARIANO ABELLA ST.</span><span className="lp-road-short">M. ABELLA ST.</span></b></span>
            {LAMPS.map(([left, side]) => <span key={`${left}${side}`} className={`lp-lamp lp-lamp--${side}`} style={{ left: `${left}%` } as CSSProperties} aria-hidden="true" />)}
            {TREES.map(([left, top, size]) => <svg key={`${left}:${top}`} className="lp-tree" viewBox="0 0 40 40" style={{ left: `${left}%`, top: `${top}%`, width: `${size}%` } as CSSProperties} aria-hidden="true" focusable="false">
              <circle className="lp-tree-shadow" cx="23" cy="24" r="16" /><circle className="lp-tree-crown" cx="20" cy="20" r="16" />
              <circle className="lp-tree-leaf" cx="14" cy="15" r="7" /><circle className="lp-tree-leaf" cx="25" cy="23" r="6" /><circle className="lp-tree-leaf" cx="15" cy="26" r="5" />
            </svg>)}
            {TRAFFIC.map((ride, index) => <Vehicle key={index} ride={ride} />)}
            <span className="lp-compass" aria-hidden="true">N</span>
            {SITE.map(site => <PlanBuilding key={site.label} site={site} open={openByBuilding.get(site.label) ?? 0} known={Boolean(listings)} active={active === site.label} language={language} onFocus={() => setActive(site.label)} />)}
          </div>
          <p className="lp-plan-note">{tr('Plan not to scale. Glowing windows are spaces open right now. Hover or tap a home.', 'Dili sukod ang plano. Ang nagsiga nga bintana bakante karon. I-hover o i-tap ang balay.')}</p>
        </div>
      </section>

      <section className="lp-flyer-wrap lp-reveal" aria-labelledby="lp-how">
        <div className="lp-flyer">
          <span className="lp-tape" aria-hidden="true" />
          <h2 id="lp-how">{tr('How renting here works', 'Unsaon pag-abang diri')}</h2>
          <ol>
            <li><strong>{tr('Look at the board.', 'Tan-awa ang board.')}</strong> {tr('Every lit window is open today. Occupied rooms never show.', 'Ang matag nagsiga nga bintana bakante karon. Ang naay nagpuyo dili makita.')}</li>
            <li><strong>{tr('Send one message.', 'Usa ka mensahe.')}</strong> {tr('Leave your name and number on the room you like. The owner replies, usually the same day.', 'Ibilin ang ngalan ug numero sa kwarto nga gusto nimo. Motubag ang tag-iya, kasagaran sa samang adlaw.')}</li>
            <li><strong>{tr('Visit, agree, move in.', 'Bisita, pagkasabot, sulod.')}</strong> {tr('Rent is the same amount, due on the same day each month.', 'Pareho ang abang ug sa parehong adlaw matag bulan.')}</li>
          </ol>
          <ul className="lp-tabs" aria-label={tr('Tear-off contact tabs', 'Mga tabs sa kontak')}>
            {Array.from({ length: 6 }, (_, index) => index === 2 ? <li key={index} className="lp-tab is-torn" aria-hidden="true" /> :
              <li key={index} className="lp-tab"><a href={CONTACT.phoneHref} aria-label={`${tr('Call or text', 'Tawag o text')} ${CONTACT.phone}`} tabIndex={index === 0 ? 0 : -1}><span>RentByBob</span><span>{CONTACT.phone}</span></a></li>)}
          </ul>
        </div>
      </section>

      <section className="lp-receipt-wrap lp-reveal" aria-labelledby="lp-tenants">
        <div className="lp-receipt-copy">
          <p className="lp-label">{tr('Already renting here?', 'Nag-abang na diri?')}</p>
          <h2 id="lp-tenants">{tr('Your rent, written down.', 'Ang imong abang, nakasulat.')}</h2>
          <p>{tr('Sign in to see what is left to pay, which months are settled, and every acknowledgment. You still pay your collector in person; this site never asks for card details.', 'Sulod aron makita ang nabilin nga bayranan, mga bulan nga bayad na, ug tanang resibo. Personal gihapon ang pagbayad; dili mangayo ang site og detalye sa card.')}</p>
          <a className="lp-stamp lp-stamp--red" href="/sign-in">{tr('Tenant sign-in', 'Sulod sa nag-abang')} <span aria-hidden="true">→</span></a>
        </div>
        <div className="lp-receipt" aria-hidden="true">
          <p className="lp-receipt-head">RENTBYBOB<br /><small>{tr('your account', 'imong account')}</small></p>
          <p className="lp-receipt-row"><span>{tr('Rent left to pay', 'Nabilin nga abang')}</span><span>{tr('shown', 'makita')}</span></p>
          <p className="lp-receipt-row"><span>{tr('Months settled', 'Bayad nga bulan')}</span><span>{tr('listed', 'gilista')}</span></p>
          <p className="lp-receipt-row"><span>{tr('Acknowledgments', 'Mga resibo')}</span><span>{tr('kept', 'gitipigan')}</span></p>
          <p className="lp-receipt-row"><span>{tr('Language', 'Pinulongan')}</span><span>EN / CEB</span></p>
          <p className="lp-receipt-foot">{tr('* pending cash is never counted as paid', '* ang pending nga kwarta dili giihap nga bayad')}</p>
        </div>
      </section>

      <section className="lp-visit lp-reveal" id="visit" aria-labelledby="lp-visit">
        <div className="lp-sketch-map" aria-hidden="true">
          <svg viewBox="0 0 420 280">
            <path className="lp-sketch-road" d="M-10 182 C 70 176, 150 196, 230 186 S 360 170, 430 178" />
            <path className="lp-sketch-road lp-sketch-road--thin" d="M150 -10 C 146 70, 158 140, 150 290" />
            <path className="lp-sketch-road lp-sketch-road--thin" d="M318 -10 C 326 90, 312 170, 322 290" />
            <path className="lp-sketch-walk" d="M60 250 C 110 228, 150 214, 200 196" />
            <circle className="lp-sketch-x" cx="214" cy="186" r="15" />
          </svg>
          <span className="lp-sketch-label lp-sketch-label--street">B. Zubiri St</span>
          <span className="lp-sketch-label lp-sketch-label--side">Mariano Abella St</span>
          <span className="lp-sketch-label lp-sketch-label--here">{tr('we are here', 'ari mi')}</span>
        </div>
        <div>
          <p className="lp-label">{tr('Find us', 'Asa mi')}</p>
          <h2 id="lp-visit">100A B. Zubiri St</h2>
          <address>Cebu City, 6000 Cebu</address>
          <div className="lp-contact">
            <a className="lp-stamp lp-stamp--red" href={CONTACT.mapsHref} target="_blank" rel="noopener noreferrer">{tr('Directions', 'Direksyon')} <span aria-hidden="true">↗</span></a>
            <a className="lp-stamp" href={CONTACT.phoneHref}>{tr('Call', 'Tawag')} {CONTACT.phone}</a>
            <a className="lp-stamp" href={CONTACT.messengerHref} target="_blank" rel="noopener noreferrer">Messenger</a>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <span>RentByBob · 100A B. Zubiri St, Cebu City</span>
      <nav aria-label={tr('Footer', 'Ubos')}><a href="/rooms">{tr('Open rooms', 'Bakante nga kwarto')}</a><a href="/sign-in">{tr('Tenant & staff sign-in', 'Sulod sa nag-abang ug staff')}</a></nav>
    </footer>
  </div>
}
