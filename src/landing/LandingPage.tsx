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

// Site plan of the rentable homes, placed as on the owner's sketch (access road with a side road). Stores and the
// Yamaha space are private negotiations and are never shown publicly (owner decision 27 Oct 2026). Each home has
// one window per rentable space; windows glow for spaces open right now (public listing data only).
type Site = { label: string; kind: 'block' | 'house'; spaces: number; cols: number; x: number; y: number; w: number; h: number }
const SITE: Site[] = [
  { label: 'Building 1', kind: 'block', spaces: 10, cols: 5, x: 4, y: 7, w: 30, h: 40 },
  { label: 'Building 2', kind: 'block', spaces: 8, cols: 4, x: 37, y: 7, w: 28, h: 40 },
  { label: 'House 1', kind: 'house', spaces: 1, cols: 1, x: 68, y: 7, w: 28, h: 40 },
  { label: "Bob's house", kind: 'house', spaces: 6, cols: 6, x: 27, y: 69, w: 38, h: 27 },
]

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
    <span className="lp-plot-windows" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${site.cols}, 1fr)` } as CSSProperties}>
      {Array.from({ length: site.spaces }, (_, index) => <i key={index} className={index < lit ? 'is-lit' : ''} style={{ animationDelay: `${(index % 4) * 0.4}s` } as CSSProperties} />)}
    </span>
    <span className="lp-plot-name">{site.label}</span>
    <span className={`lp-plot-status${lit ? ' is-open' : ''}`}>{status}</span>
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
          <div className="lp-plan" role="group" aria-label={tr('Site plan on B. Zubiri St. Glowing windows are spaces open now. Choose a home to see rooms.', 'Plano sa B. Zubiri St. Ang nagsiga nga bintana bakante karon.')}>
            <span className="lp-plan-road lp-plan-road--main" aria-hidden="true"><b>B. ZUBIRI ST.</b><em className="lp-car" /><em className="lp-car lp-car--two" /></span>
            <span className="lp-plan-road lp-plan-road--side" aria-hidden="true" />
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
