import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { text, type Language } from '../i18n'
import { parsePublicListings, type PublicListings } from '../access/public-listings-model.ts'
import { LogoMark } from '../components/Logo'
import { currentSeason } from './season'
import { Garland, Parol, Pumpkin, SpiderWeb } from './street'
import { Facade, SITE, StreetPlan, StreetSummary, TOTAL_SPACES, statusText } from './street'
import './landing.css'

// Public landing page at "/" for visitors who are not signed in. Live vacancy comes only from the public listing
// function (the same data as /rooms); nothing private is read. The phone number is still a PLACEHOLDER for the owner
// to replace before going public (docs/DEPLOYMENT.md); the Facebook page is the owner's real contact (28 Oct 2026).
export const CONTACT = {
  // Set both to the real business number to show the Call button, e.g. '0917 123 4567' and 'tel:+639171234567'.
  // While they are empty the button stays hidden, so visitors never see a fake number.
  phone: '',
  phoneHref: '',
  facebookHref: 'https://www.facebook.com/jameslee.gica.1',
  address: '100A B. Zubiri St, Cebu City, 6000 Cebu',
  mapsHref: 'https://www.google.com/maps/search/?api=1&query=100A+B.+Zubiri+St,+Cebu+City,+6000+Cebu',
}

// Scroll stories (street, homes) and pointer effects only run with motion allowed on a wide screen; otherwise the
// same content is laid out as ordinary sections (see landing.css "cinematic" media query).
const CINEMATIC = '(min-width: 60rem) and (prefers-reduced-motion: no-preference)'
const matches = (query: string) => { try { return window.matchMedia(query).matches } catch { return false } }

// Sections drift in as they scroll into view.
function useReveal() {
  useEffect(() => {
    const items = [...document.querySelectorAll<HTMLElement>('.lp-reveal')]
    if (matches('(prefers-reduced-motion: reduce)') || !('IntersectionObserver' in window)) { items.forEach(item => item.classList.add('is-in')); return }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); observer.unobserve(entry.target) } }), { threshold: 0.18 })
    items.forEach(item => observer.observe(item))
    return () => observer.disconnect()
  }, [])
}

// One scroll/resize loop for the whole page: page progress, and for each [data-scene] its own progress (--p), the
// current story step (data-step) and, for a horizontal track, how far it slides. No React state, so no re-renders.
function useScrollScenes(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let frame = 0
    const layout = () => {
      const cinematic = matches(CINEMATIC)
      document.querySelectorAll<HTMLElement>('[data-hscroll]').forEach(section => {
        const track = section.querySelector<HTMLElement>('[data-track]')
        const overflow = track ? Math.max(0, track.scrollWidth - (track.parentElement?.clientWidth ?? 0)) : 0
        section.style.height = cinematic && overflow ? `${window.innerHeight + overflow}px` : ''
        if (!cinematic && track) track.style.transform = ''
      })
    }
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      root.current?.style.setProperty('--lp-progress', (max > 0 ? window.scrollY / max : 0).toFixed(4))
      root.current?.classList.toggle('is-scrolled', window.scrollY > 40)
      const cinematic = matches(CINEMATIC)
      document.querySelectorAll<HTMLElement>('[data-scene]').forEach(scene => {
        const box = scene.getBoundingClientRect()
        const span = Math.max(1, box.height - window.innerHeight)
        const progress = cinematic ? Math.min(1, Math.max(0, -box.top / span)) : 1
        scene.style.setProperty('--p', progress.toFixed(4))
        const steps = Number(scene.dataset.steps ?? 0)
        if (steps) scene.dataset.step = String(Math.min(steps - 1, Math.floor(progress * steps * 0.999)))
        const track = scene.querySelector<HTMLElement>('[data-track]')
        if (track && cinematic) track.style.transform = `translate3d(${(-progress * Math.max(0, track.scrollWidth - (track.parentElement?.clientWidth ?? 0))).toFixed(1)}px,0,0)`
      })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const resize = () => { layout(); schedule() }
    resize()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resize) }
  }, [root])
}

// A soft ring that trails the pointer (fine pointers, motion allowed), labelled over links that set data-cursor;
// buttons marked .lp-magnetic lean toward the pointer; the hero light follows it. The real cursor stays visible.
function usePointerEffects(root: RefObject<HTMLDivElement | null>, ring: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!matches('(pointer: fine) and (prefers-reduced-motion: no-preference)') || !ring.current || !root.current) return
    const el = ring.current, page = root.current
    let x = -100, y = -100, tx = -100, ty = -100, frame = 0
    const loop = () => {
      x += (tx - x) * 0.2; y += (ty - y) * 0.2
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(loop) : 0
    }
    let magnet: HTMLElement | null = null
    const move = (event: PointerEvent) => {
      if (el.hidden) { el.hidden = false; x = event.clientX; y = event.clientY }
      tx = event.clientX; ty = event.clientY
      if (!frame) frame = requestAnimationFrame(loop)
      page.style.setProperty('--mx', `${event.clientX}px`); page.style.setProperty('--my', `${event.clientY}px`)
      const target = (event.target as Element | null)?.closest<HTMLElement>('a, button')
      el.classList.toggle('is-hover', Boolean(target))
      const label = target?.dataset.cursor ?? ''
      if (el.firstElementChild && el.firstElementChild.textContent !== label) el.firstElementChild.textContent = label
      el.classList.toggle('has-label', Boolean(label))
      const pull = (event.target as Element | null)?.closest<HTMLElement>('.lp-magnetic') ?? null
      if (magnet && magnet !== pull) magnet.style.transform = ''
      magnet = pull
      if (pull) { const box = pull.getBoundingClientRect(); pull.style.transform = `translate(${((event.clientX - box.left - box.width / 2) * 0.25).toFixed(1)}px, ${((event.clientY - box.top - box.height / 2) * 0.35).toFixed(1)}px)` }
    }
    const leave = () => { el.classList.remove('is-hover', 'has-label'); tx = ty = -100; if (!frame) frame = requestAnimationFrame(loop); if (magnet) magnet.style.transform = '' }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave) }
  }, [root, ring])
}

// Headline words rise out of a mask, one after another.
function Words({ children, start = 0 }: { children: string; start?: number }) {
  return <>{children.split(' ').map((word, index) => <Fragment key={index}>{index > 0 && ' '}<span className="lp-word"><span style={{ '--i': start + index } as CSSProperties}>{word}</span></span></Fragment>)}</>
}

// A number that counts up once when it scrolls into view (shown at once with reduced motion).
function CountUp({ value }: { value: number }) {
  const element = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(() => matches('(prefers-reduced-motion: reduce)') ? value : 0)
  useEffect(() => {
    const node = element.current
    if (!node || matches('(prefers-reduced-motion: reduce)') || !('IntersectionObserver' in window)) { setShown(value); return }
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const step = (now: number) => { const t = Math.min(1, (now - start) / 900); setShown(Math.round(value * (1 - (1 - t) ** 3))); if (t < 1) frame = requestAnimationFrame(step) }
      frame = requestAnimationFrame(step)
    }, { threshold: 0.6 })
    observer.observe(node)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [value])
  return <span ref={element}><span aria-hidden="true">{shown}</span><span className="lp-visually-hidden">{value}</span></span>
}

// Two split-flap digits (like an old terminal board); a digit flips when the live number changes.
function SplitFlap({ value, label }: { value: number | null; label: string }) {
  const digits = value === null ? ['–', '–'] : String(Math.min(value, 99)).padStart(2, '0').split('')
  return <span className="lp-flap" role="img" aria-label={label}>
    {digits.map((digit, index) => <span key={`${index}-${digit}`} className="lp-flap-digit" aria-hidden="true"><span>{digit}</span></span>)}
  </span>
}

const manilaTime = (date: Date) => new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(date)
const manilaMinutes = (date: Date) => { const [h, m] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Manila' }).format(date).split(':').map(Number); return h * 60 + m }
// Preview another hour by opening the page with "#at=7", "#at=07:30" or "#at=19" (visual only; nothing else changes).
function simulatedMinutes(hash: string): number | null {
  const match = /^#at=(\d{1,2})(?::(\d{2}))?$/.exec(hash)
  if (!match || Number(match[1]) > 23 || Number(match[2] ?? 0) > 59) return null
  return Number(match[1]) * 60 + Number(match[2] ?? 0)
}
const clockText = (minutes: number) => `${(Math.floor(minutes / 60) + 11) % 12 + 1}:${String(minutes % 60).padStart(2, '0')} ${minutes < 720 ? 'AM' : 'PM'}`

// True when this tab already has a saved sign-in, so the menu button says so.
const signedInHere = (() => { try { return Object.keys(sessionStorage).some(key => /^sb-.+-auth-token$/.test(key)) } catch { return false } })()

export function LandingPage() {
  const signedIn = signedInHere
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('rentbybob-language') === 'fil' ? 'fil' : 'en' } catch { return 'en' } })
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [listings, setListings] = useState<PublicListings | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [now, setNow] = useState(() => new Date())
  // Daytime in Cebu (5:00 to 17:59) shows a morning street; otherwise the night street. "#at=" previews an hour.
  const [simulated, setSimulated] = useState(() => simulatedMinutes(location.hash))
  useEffect(() => { const read = () => { const value = simulatedMinutes(location.hash); if (value !== null) setSimulated(value) }; window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read) }, [])
  const minutes = simulated ?? manilaMinutes(now)
  const phase = minutes >= 300 && minutes < 1080 ? 'day' : 'night'
  const day = phase === 'day'
  const [dateSeason, setSeason] = useState(() => currentSeason(new Date(), location.hash))
  // Visitors can switch the seasonal decorations off; the choice is remembered on this device.
  const [decorOff, setDecorOff] = useState(() => { try { return localStorage.getItem('rentbybob-decor') === 'off' } catch { return false } })
  const toggleDecor = () => setDecorOff(off => { try { localStorage.setItem('rentbybob-decor', off ? 'on' : 'off') } catch { /* not remembered */ } return !off })
  const season = decorOff ? null : dateSeason
  useEffect(() => { const read = () => setSeason(currentSeason(new Date(), location.hash)); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read) }, [])
  // Sky over the hero follows the real Cebu hour: the sun (day) or moon (night) travels an arc left to right, and the
  // sky tint changes for morning, noon and golden hour.
  const sky = !day ? 'night' : minutes < 600 ? 'morning' : minutes < 900 ? 'noon' : 'golden'
  const arc = day ? (minutes - 300) / 780 : (((minutes - 1080) % 1440) + 1440) % 1440 / 660
  const skyStyle = { '--arc-x': `${(60 + Math.min(1, arc) * 32).toFixed(1)}%`, '--arc-y': `${(10 + Math.sin(Math.PI * Math.min(1, arc)) * 26).toFixed(1)}%` } as CSSProperties
  const clock = simulated === null ? manilaTime(now) : clockText(simulated)
  const [active, setActive] = useState(SITE[0].label)
  const root = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const homes = useRef<HTMLElement>(null)
  useReveal()
  useScrollScenes(root)
  usePointerEffects(root, ring)
  useEffect(() => { document.documentElement.lang = language === 'fil' ? 'fil' : 'en'; try { localStorage.setItem('rentbybob-language', language) } catch { /* not remembered */ } }, [language])
  useEffect(() => { document.title = 'RentByBob | Rooms for rent on B. Zubiri St, Cebu City' }, [])
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 15000); return () => window.clearInterval(timer) }, [])
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
    const rooms = new Map<string, string[]>()
    for (const property of listings?.properties ?? []) for (const building of property.buildings) rooms.set(building.label, [...(rooms.get(building.label) ?? []), ...building.rooms.map(room => room.room)])
    return rooms
  }, [listings])
  const openRooms = (label: string) => (openByBuilding.get(label) ?? []).slice(0, SITE.find(site => site.label === label)?.spaces ?? 0)
  const openAt = (label: string) => openRooms(label).length
  const totalOpen = SITE.reduce((sum, site) => sum + openAt(site.label), 0)
  const lowestRent = useMemo(() => {
    const prices = (listings?.properties ?? []).flatMap(property => property.buildings.filter(building => SITE.some(site => site.label === building.label)).flatMap(building => building.rooms.map(room => room.asking_rent))).filter((value): value is string => Boolean(value)).map(Number)
    return prices.length ? Math.min(...prices) : null
  }, [listings])
  const known = Boolean(listings)
  const checked = checkedAt ? manilaTime(checkedAt) : null
  // In the pinned homes gallery a focused card may be off to the side: scroll the page to where it slides into view.
  function revealCard(index: number) {
    const section = homes.current
    if (!section || !section.style.height) return
    const top = section.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + (section.offsetHeight - window.innerHeight) * index / (SITE.length - 1) })
  }
  const homeFacts: Record<string, [string, string]> = {
    'Building 1': [tr('10 rooms · 2 floors', '10 kuwarto · 2 palapag'), tr('Six rooms upstairs on a balcony walk; the apartment, and three rooms inside past the gate.', 'Anim na kuwarto sa itaas sa balkonahe; ang apartment, at tatlong kuwarto sa loob lampas sa gate.')],
    'Building 2': [tr('8 rooms · 2 floors', '8 kuwarto · 2 palapag'), tr('Five rooms upstairs, one in its own wing; the gym and three rooms below.', 'Limang kuwarto sa itaas, isa sa sariling pakpak; ang gym at tatlong kuwarto sa ibaba.')],
    'House 1': [tr('1 whole house', '1 buong bahay'), tr('A house of its own, rented as one.', 'Isang bahay, inuupahan bilang isa.')],
    "Bob's house": [tr('6 rooms · 2 floors', '6 kuwarto · 2 palapag'), tr('Across the road, beside Mariano Abella St.', 'Tawid ng kalye, katabi ng Mariano Abella St.')],
  }
  const facts: [number | null, string, string][] = [
    [SITE.length, tr('homes on one corner', 'bahay sa isang kanto'), tr('B. Zubiri St and Mariano Abella St', 'B. Zubiri St at Mariano Abella St')],
    [TOTAL_SPACES, tr('rooms and spaces', 'kuwarto at espasyo'), tr('Boarding rooms, an apartment and a house', 'Boarding na kuwarto, apartment at bahay')],
    [listings ? totalOpen : null, day ? tr('open today', 'bakante ngayon') : tr('open tonight', 'bakante ngayong gabi'), tr('Live from the property records', 'Live mula sa talaan ng property')],
    [2, tr('languages', 'wika'), tr('English and Filipino, on every page', 'English at Filipino, sa bawat pahina')],
  ]

  return <div className="lp" ref={root} data-phase={phase} data-season={season ?? undefined}>
    <div className="lp-progress" aria-hidden="true" />
    <div className="lp-grain" aria-hidden="true" />
    <div className="lp-cursor" ref={ring} hidden aria-hidden="true"><span /></div>
    {simulated !== null && <p className="lp-sim" role="status">{tr('Simulated Cebu time', 'Simulated na oras')} {clock} · <a href="#" onClick={event => { event.preventDefault(); history.replaceState(null, '', location.pathname); setSimulated(null) }}>{tr('Back to live time', 'Bumalik sa tunay na oras')}</a></p>}
    <a className="lp-skip" href="#lp-main">{tr('Skip to content', 'Pumunta sa nilalaman')}</a>
    <header className="lp-nav">
      <a className="lp-brand" href="/" aria-label="RentByBob home"><LogoMark size={34} /><span>Rent<i>By</i>Bob</span></a>
      <nav aria-label={tr('Main', 'Pangunahin')}>
        <a href="#street">{tr('The street', 'Ang kalye')}</a>
        <a href="#homes">{tr('Homes', 'Mga bahay')}</a>
        <a href="#how">{tr('How it works', 'Paano')}</a>
        <a href="#visit">{tr('Find us', 'Nasaan kami')}</a>
      </nav>
      <div className="lp-nav-actions">
        <button type="button" className="lp-lang" aria-label={language === 'en' ? 'Gamitin ang Filipino' : 'Use English'} onClick={() => setLanguage(language === 'en' ? 'fil' : 'en')}><span className={language === 'en' ? 'is-on' : ''}>EN</span><span className={language === 'fil' ? 'is-on' : ''}>FIL</span></button>
        <a className="lp-pill lp-pill--light" href="/sign-in">{signedIn ? tr('Open my account', 'Buksan ang aking account') : tr('Sign in', 'Mag-sign in')}</a>
      </div>
    </header>

    <main id="lp-main" tabIndex={-1}>
      <section className="lp-hero" data-sky={sky} style={skyStyle} aria-labelledby="lp-title">
        <div className="lp-hero-light" aria-hidden="true" />
        {day ? <><div className="lp-sun" aria-hidden="true" /><span className="lp-cloud-sky lp-cloud-sky--a" aria-hidden="true" /><span className="lp-cloud-sky lp-cloud-sky--b" aria-hidden="true" /></>
          : <><span className="lp-stars" aria-hidden="true" /><span className="lp-moon" aria-hidden="true" /></>}
        {!day && <span className="lp-hero-lamps" aria-hidden="true" />}
        {dateSeason && <button type="button" className="lp-decor-toggle" aria-pressed={!decorOff} onClick={toggleDecor}>{dateSeason === 'christmas' ? '✦' : '☾'} {decorOff ? tr('Show decorations', 'Ipakita ang dekorasyon') : tr('Hide decorations', 'Itago ang dekorasyon')}</button>}
        {season === 'halloween' && <><SpiderWeb className="lp-hw-web lp-hw-web--l" /><SpiderWeb className="lp-hw-web lp-hw-web--r" /></>}
        {season === 'christmas' && <>
          <span className="lp-xm-tint" aria-hidden="true" />
          <span className="lp-xm-sparkles" aria-hidden="true" />
          <p className="lp-hw-badge lp-xm-badge"><Parol className="lp-hw-badge-pumpkin" />{tr('Maligayang Pasko from B. Zubiri St.', 'Maligayang Pasko mula sa B. Zubiri St.')}</p>
        </>}
        {season === 'halloween' && <>
          <span className="lp-hw-tint" aria-hidden="true" />
          {[0, 1, 2].map(i => <svg key={i} className={`lp-bat lp-bat--${i}`} viewBox="0 0 40 16" aria-hidden="true" focusable="false"><path d="M20 6c-1-2-2.6-2.4-3.4-1.6.4-1.6-.6-2.8-2-2.4C13 4 9.5 4.6 6 3.4 4 2.8 1.6 3.4 0 5.2c2.4-.4 4 .4 4.8 2 1.6-1 3.4-.8 4.6.8 1.4-1.2 3.4-1 4.4.6 1-1.6 3.2-1.8 4.2-.2.6 1.4 1.4 2.2 2 2.4.6-.2 1.4-1 2-2.4 1-1.6 3.2-1.4 4.2.2 1-1.6 3-1.8 4.4-.6 1.2-1.6 3-1.8 4.6-.8.8-1.6 2.4-2.4 4.8-2-1.6-1.8-4-2.4-6-1.8-3.5 1.2-7 .6-8.6-1.4-1.4-.4-2.4.8-2 2.4C22.6 3.6 21 4 20 6Z" /></svg>)}
          <p className="lp-hw-badge"><Pumpkin className="lp-hw-badge-pumpkin" />{tr('Spooky season on B. Zubiri St.', 'Spooky season sa B. Zubiri St.')}</p>
        </>}
        <div className="lp-hero-top">
          <p>{tr('Labangon, Cebu City', 'Labangon, Lungsod ng Cebu')}</p>
          <p><span className="lp-dot" aria-hidden="true" /> {tr('Cebu time', 'Oras sa Cebu')} {clock}</p>
        </div>
        <h1 id="lp-title"><span className="lp-h1-line"><Words>{tr('Rooms for rent', 'Mga kuwartong paupahan')}</Words></span><span className="lp-h1-line lp-serif"><Words start={3}>{tr('on B. Zubiri St.', 'sa B. Zubiri St.')}</Words></span></h1>
        <div className="lp-hero-foot">
          <p className="lp-lede">{day ? tr('Rooms and a whole house in Labangon, Cebu City. Every glowing window on our street is a space open today; ask in one message and the owner replies.', 'Malilinis na kuwarto at buong bahay sa Labangon, Lungsod ng Cebu. Bawat umiilaw na bintana sa aming kalye ay bakante ngayon; magtanong sa isang mensahe at sasagot ang may-ari.') : tr('Clean rooms and a whole house in Labangon, Cebu City. Every lit window on our street is a space open tonight; ask in one message and the owner replies.', 'Malilinis na kuwarto at buong bahay sa Labangon, Lungsod ng Cebu. Bawat umiilaw na bintana sa aming kalye ay bakante ngayong gabi; magtanong sa isang mensahe at sasagot ang may-ari.')}</p>
          <div className="lp-hero-count">
            <SplitFlap value={listings ? totalOpen : null} label={listings ? `${totalOpen} ${day ? tr('spaces open today', 'bakante ngayon') : tr('spaces open tonight', 'bakante ngayong gabi')}` : tr('Checking open spaces', 'Sinusuri ang bakante')} />
            <p>{day ? tr('open today', 'bakante ngayon') : tr('open tonight', 'bakante ngayong gabi')}<br /><span>{tr('of', 'sa')} {TOTAL_SPACES} {tr('spaces', 'espasyo')}</span></p>
          </div>
          <div className="lp-cta">
            <a className="lp-pill lp-pill--amber lp-magnetic" href="/rooms" data-cursor={tr('Look', 'Tingnan')}>{tr('See open rooms', 'Tingnan ang bakante')} <span aria-hidden="true">→</span></a>
            <a className="lp-pill lp-pill--ghost lp-magnetic" href="/sign-in">{tr('I already rent here', 'Umuupa na ako rito')}</a>
          </div>
        </div>
        <div className="lp-skyline" aria-hidden="true">{season === 'halloween' && [8, 34, 58, 83].map((left, i) => <Pumpkin key={left} className="lp-hw-porch" style={{ left: `${left}%`, animationDelay: `${i * -0.7}s` }} />)}{season === 'christmas' && <Garland className="lp-xm-hero-garland" swags={5} />}{season === 'christmas' && [10, 30, 50, 70, 90].map((left, i) => <Parol key={left} className={`lp-xm-porch${i % 2 ? ' lp-xm-porch--small' : ''}`} style={{ left: `${left}%`, animationDelay: `${i * -0.8}s` }} />)}{SITE.map(site => <div key={site.label} className={`lp-skyline-home lp-skyline-home--${site.kind}`}><Facade site={site} open={openRooms(site.label)} width={100} /></div>)}</div>
        <a className="lp-scroll-cue" href="#street"><span>{tr('Walk down the street', 'Libutin ang kalye')}</span><i aria-hidden="true" /></a>
      </section>

      <section className="lp-facts" aria-label={tr('At a glance', 'Sa isang tingin')}>
        <ul>{facts.map(([value, label, line], index) => <li key={index} className="lp-reveal" style={{ '--i': index } as CSSProperties}>
          <strong>{value === null ? '–' : <CountUp value={value} />}</strong>
          <span className="lp-facts-label">{label}</span>
          <span className="lp-facts-line">{line}</span>
        </li>)}</ul>
      </section>

      <section className="lp-street" id="street" data-scene data-steps="3" aria-labelledby="lp-street-title">
        <div className="lp-street-pin">
          <div className="lp-street-copy">
            <p className="lp-label">{tr('Live street', 'Live na kalye')}{checked && <span className="lp-live"><span className="lp-dot" aria-hidden="true" /> {tr('updated', 'na-update')} {checked}</span>}</p>
            <h2 id="lp-street-title" className="lp-visually-hidden">{tr('Our street, live', 'Ang aming kalye, live')}</h2>
            <ol className="lp-steps">
              <li><span className="lp-step-no">01</span><h3>{tr('This is B. Zubiri St.', 'Ito ang B. Zubiri St.')}</h3><p>{tr('Four homes on one street in Labangon, with Mariano Abella St at the corner.', 'Apat na bahay sa isang kalye sa Labangon, at ang Mariano Abella St sa kanto.')}</p></li>
              <li><span className="lp-step-no">02</span><h3>{day ? tr('The street wakes up.', 'Gising na ang kalye.') : tr('Evening comes.', 'Gumagabi na.')}</h3><p>{day ? tr(`Jeepneys and motorbikes start running. Every window is a space we rent out: ${TOTAL_SPACES} in all.`, `Umaandar na ang mga jeep at motor. Bawat bintana ay isang espasyong paupahan namin: ${TOTAL_SPACES} lahat.`) : tr(`The lamps come on. Every window is a space we rent out: ${TOTAL_SPACES} in all.`, `Umiilaw na ang mga ilaw. Bawat bintana ay isang espasyong paupahan namin: ${TOTAL_SPACES} lahat.`)}</p></li>
              <li><span className="lp-step-no">03</span><h3>{tr('Lit windows are open.', 'Ang umiilaw, bakante.')}</h3><p>{known ? `${totalOpen} ${day ? tr('open today. The street checks again every 30 seconds.', 'bakante ngayon. Susuriin ulit bawat 30 segundo.') : tr('open tonight. The street checks again every 30 seconds.', 'bakante ngayong gabi. Susuriin ulit bawat 30 segundo.')}` : tr('The street checks for open rooms every 30 seconds.', 'Susuriin ng kalye ang bakante bawat 30 segundo.')}</p></li>
            </ol>
            <dl className="lp-street-facts">
              <div><dt>{tr('Rent from', 'Upa mula')}</dt><dd>{lowestRent ? `₱${lowestRent.toLocaleString('en-PH')}/${tr('mo', 'buwan')}` : tr('ask us', 'tanong')}</dd></div>
              <div><dt>{tr('Selected', 'Napili')}</dt><dd aria-live="polite">{active} · {listings ? (openAt(active) ? `${openAt(active)} ${tr('open', 'bakante')}` : tr('full', 'puno')) : '…'}</dd></div>
            </dl>
            {unavailable && <p className="lp-note">{tr('The live street is not connected right now. Message us and we will tell you what is open.', 'Hindi konektado ngayon ang live na kalye. Mag-message sa amin at sasabihin namin kung ano ang bakante.')}</p>}
          </div>
          <div className="lp-street-stage">
            <div className="lp-plan-frame"><StreetPlan openByBuilding={openByBuilding} known={known} active={active} setActive={setActive} language={language} season={season} /></div>
            <StreetSummary openByBuilding={openByBuilding} known={known} active={active} setActive={setActive} language={language} />
            <p className="lp-plan-note">{tr('Not to scale. Tap a home to see what is open; use the buttons below to see the rooms.', 'Hindi sukat. I-tap ang bahay para makita kung ano ang bakante; gamitin ang mga button sa ibaba para makita ang mga kuwarto.')}<span className="lp-swipe-hint"> {tr('Swipe sideways to see the whole street.', 'I-swipe pakanan para makita ang buong kalye.')}</span></p>
          </div>
        </div>
      </section>

      <section className="lp-homes" id="homes" ref={homes} data-scene data-hscroll aria-labelledby="lp-homes-title">
        <div className="lp-homes-pin">
          <div className="lp-homes-head lp-reveal">
            <p className="lp-label">{tr('The homes', 'Ang mga bahay')}</p>
            <h2 id="lp-homes-title">{tr('Four homes.', 'Apat na bahay.')} <span className="lp-serif">{tr(`${TOTAL_SPACES} spaces.`, `${TOTAL_SPACES} ka luna.`)}</span></h2>
          </div>
          <div className="lp-homes-viewport">
            <ul className="lp-homes-track" data-track>
              {SITE.map((site, index) => {
                const lit = openAt(site.label)
                const [facts, line] = homeFacts[site.label]
                return <li key={site.label}>
                  <a className={`lp-home${lit ? ' has-open' : ''}`} href="/rooms" data-cursor={tr('Rooms', 'Kuwarto')} onFocus={() => revealCard(index)}>
                    <span className="lp-home-no" aria-hidden="true">0{index + 1}</span>
                    <span className="lp-home-art"><Facade site={site} open={openRooms(site.label)} width={site.kind === 'house' && site.spaces === 1 ? 56 : 94} /></span>
                    <span className="lp-home-body">
                      <span className="lp-home-name">{site.label}</span>
                      <span className="lp-home-facts">{facts}</span>
                      <span className="lp-home-line">{line}</span>
                      <span className={`lp-home-status${lit ? ' is-open' : ''}`}><span className="lp-dot" aria-hidden="true" /> {statusText(language, known, lit)}</span>
                    </span>
                    <span className="lp-home-go" aria-hidden="true">→</span>
                  </a>
                </li>
              })}
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-how" id="how" aria-labelledby="lp-how-title">
        <div className="lp-how-head lp-reveal"><p className="lp-label">{tr('How it works', 'Paano')}</p><h2 id="lp-how-title">{tr('Renting here,', 'Umupa rito,')} <span className="lp-serif">{tr('in three steps.', 'sa tatlong hakbang.')}</span></h2></div>
        <ol className="lp-how-list">
          <li className="lp-reveal"><span className="lp-how-no">01</span><h3>{tr('Look at the street.', 'Tingnan ang kalye.')}</h3><p>{tr('Every lit window is open today. Occupied rooms never show.', 'Bawat umiilaw na bintana ay bakante ngayon. Hindi makikita ang may nakatira.')}</p></li>
          <li className="lp-reveal"><span className="lp-how-no">02</span><h3>{tr('Send one message.', 'Isang mensahe.')}</h3><p>{tr('Leave your name and number on the room you like. The owner replies, usually the same day.', 'Iwanan ang pangalan at numero ng kuwartong gusto mo. Sasagot ang may-ari, kadalasan sa parehong araw.')}</p></li>
          <li className="lp-reveal"><span className="lp-how-no">03</span><h3>{tr('Visit, agree, move in.', 'Bisita, kasunduan, lipat.')}</h3><p>{tr('Rent is the same amount, due on the same day each month.', 'Pareho ang upa at sa parehong araw bawat buwan.')}</p></li>
        </ol>
      </section>

      <section className="lp-tenant" aria-labelledby="lp-tenant-title">
        <div className="lp-tenant-copy lp-reveal">
          <p className="lp-label">{tr('Already renting here?', 'Umuupa na rito?')}</p>
          <h2 id="lp-tenant-title">{tr('Your rent,', 'Ang iyong upa,')} <span className="lp-serif">{tr('written down.', 'nakasulat.')}</span></h2>
          <p>{tr('Sign in to see what is left to pay, which months are settled, and every acknowledgment. You can tell us when you have paid. You still pay your collector in person; this site never asks for card details.', 'Mag-sign in para makita ang natitirang singil, mga buwang bayad na, at lahat ng resibo. Maaari mong sabihin sa amin kung nakapagbayad ka na. Personal pa rin ang pagbabayad; hindi hihingi ang site ng detalye ng card.')}</p>
          <a className="lp-pill lp-pill--cream lp-magnetic" href="/sign-in">{tr('Tenant sign-in', 'Sign-in ng umuupa')} <span aria-hidden="true">→</span></a>
        </div>
        <div className="lp-receipt lp-reveal" aria-hidden="true">
          <p className="lp-receipt-head">RENTBYBOB<br /><small>{tr('your account', 'iyong account')}</small></p>
          {[[tr('Rent left to pay', 'Natitirang upa'), tr('shown', 'makikita')], [tr('Months settled', 'Mga bayad na buwan'), tr('listed', 'nakalista')], [tr('Acknowledgments', 'Mga resibo'), tr('kept', 'nakatabi')], [tr('Report a payment', 'Iulat ang bayad'), tr('yes', 'oo')], [tr('Language', 'Wika'), 'EN / CEB']].map(([label, value], index) =>
            <p key={label} className="lp-receipt-row" style={{ '--i': index } as CSSProperties}><span>{label}</span><span>{value}</span></p>)}
          <p className="lp-receipt-foot">{tr('* pending cash is never counted as paid', '* hindi binibilang na bayad ang nakabinbing cash')}</p>
        </div>
      </section>

      <section className="lp-visit" id="visit" aria-labelledby="lp-visit-title">
        <p className="lp-label lp-reveal">{tr('Find us', 'Nasaan kami')}</p>
        <h2 id="lp-visit-title" className="lp-visit-title"><span className="lp-h1-line"><Words>{tr('Come home', 'Umuwi na')}</Words></span><span className="lp-h1-line lp-serif"><Words start={2}>{tr('to B. Zubiri.', 'sa B. Zubiri.')}</Words></span></h2>
        <div className="lp-visit-grid">
          <div className="lp-reveal">
            <address>100A B. Zubiri St<br />Cebu City, 6000 Cebu</address>
            <div className="lp-contact">
              <a className="lp-pill lp-pill--amber lp-magnetic" href={CONTACT.mapsHref} target="_blank" rel="noopener noreferrer" data-cursor={tr('Map', 'Mapa')}>{tr('Directions', 'Direksyon')} <span aria-hidden="true">↗</span></a>
              {CONTACT.phone && CONTACT.phoneHref && <a className="lp-pill lp-pill--ghost lp-magnetic" href={CONTACT.phoneHref}>{tr('Call', 'Tumawag')} {CONTACT.phone}</a>}
              <a className="lp-pill lp-pill--ghost lp-magnetic" href={CONTACT.facebookHref} target="_blank" rel="noopener noreferrer">Facebook<span className="visually-hidden"> ({tr('opens in a new tab', 'magbubukas sa bagong tab')})</span></a>
            </div>
          </div>
          <div className="lp-sketch-map lp-reveal" aria-hidden="true">
            <svg viewBox="0 0 420 280">
              <path className="lp-sketch-road" d="M-10 182 C 70 176, 150 196, 230 186 S 360 170, 430 178" />
              <path className="lp-sketch-road lp-sketch-road--thin" d="M150 -10 C 146 70, 158 140, 150 290" />
              <path className="lp-sketch-road lp-sketch-road--thin" d="M318 -10 C 326 90, 312 170, 322 290" />
              <path className="lp-sketch-walk" d="M60 250 C 110 228, 150 214, 200 196" />
              <circle className="lp-sketch-x" cx="214" cy="186" r="15" />
            </svg>
            <span className="lp-sketch-label lp-sketch-label--street">B. Zubiri St</span>
            <span className="lp-sketch-label lp-sketch-label--side">Mariano Abella St</span>
            <span className="lp-sketch-label lp-sketch-label--here">{tr('we are here', 'nandito kami')}</span>
          </div>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <p className="lp-wordmark" aria-hidden="true">Rent<i>By</i>Bob</p>
      <div className="lp-footer-row">
        <span>RentByBob · 100A B. Zubiri St, Cebu City · {tr('Cebu time', 'Oras sa Cebu')} {clock}</span>
        <nav aria-label={tr('Footer', 'Ibaba')}><a href="/rooms">{tr('Open rooms', 'Bakanteng kuwarto')}</a><a href="/sign-in">{tr('Tenant & staff sign-in', 'Sign-in ng umuupa at staff')}</a><a href="#lp-main">{tr('Back to top', 'Bumalik sa itaas')} ↑</a></nav>
      </div>
    </footer>
  </div>
}
