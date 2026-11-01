import { useState, type CSSProperties } from 'react'
import { currentSeason, type Season } from '../landing/season'
import { text, type Language } from '../i18n'

// Seasonal touches inside the app (owner request, 1 Nov 2026). Kept to the edges so money screens stay plain: a
// band under the app bar (fiesta banderitas at Halloween, a string of lights at Christmas), a small hat on the logo,
// a scene in the sign-in welcome panel and one greeting line on the dashboard. The landing page's "Hide decorations"
// choice (localStorage 'rentbybob-decor') switches all of it off; Account security has the same switch.
export function useSeasonal() {
  const [off, setOff] = useState(() => { try { return localStorage.getItem('rentbybob-decor') === 'off' } catch { return false } })
  const dateSeason = currentSeason(new Date(), location.hash)
  const toggle = () => setOff(value => { try { localStorage.setItem('rentbybob-decor', value ? 'on' : 'off') } catch { /* not remembered */ } return !value })
  return { season: off ? null : dateSeason, dateSeason, off, toggle }
}

// Hand-cut paper flags on a string (banderitas, as at a barangay fiesta), in Halloween orange, aubergine and ink.
function Banderitas() {
  const flags = Array.from({ length: 34 }, (_, i) => i)
  return <svg className="season-band-art" viewBox="0 0 680 22" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="sb-string" d="M0 3 Q170 9 340 3 T680 3" />
    {flags.map(i => {
      const x = 4 + i * 20, y = 3 + 6 * Math.sin((x / 680) * Math.PI * 2) ** 2 * 0.5
      return <path key={i} className={`sb-flag sb-flag--${i % 3}`} d={`M${x} ${y} h14 l-7 ${11 + (i % 2) * 2}Z`} style={{ animationDelay: `${(i % 7) * -0.4}s` } as CSSProperties} />
    })}
  </svg>
}

// A strand of bulbs drooping between hooks.
function LightString() {
  const swags = 6, step = 680 / swags, bulbs: { x: number; y: number; c: number }[] = []
  let d = 'M0 2'
  for (let i = 0; i < swags; i++) {
    const x0 = i * step
    d += ` Q${x0 + step / 2} 16 ${x0 + step} 2`
    for (let k = 1; k < 6; k++) { const t = k / 6; bulbs.push({ x: x0 + step * t, y: 2 + 28 * t * (1 - t), c: (i * 5 + k) % 3 }) }
  }
  return <svg className="season-band-art" viewBox="0 0 680 22" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="sb-wire" d={d} />
    {bulbs.map((b, i) => <ellipse key={i} className={`sb-bulb sb-bulb--${b.c}`} cx={b.x} cy={b.y + 3.6} rx="1.8" ry="2.7" style={{ animationDelay: `${(i % 5) * 0.4}s` } as CSSProperties} />)}
  </svg>
}

export function SeasonBand({ season }: { season: Season }) {
  if (!season) return null
  return <div className={`season-band season-band--${season}`} aria-hidden="true">{season === 'christmas' ? <LightString /> : <Banderitas />}</div>
}

// A small hat tipped onto the logo tile.
export function LogoHat({ season }: { season: Season }) {
  if (!season) return null
  return <svg className={`logo-hat logo-hat--${season}`} viewBox="0 0 24 20" aria-hidden="true" focusable="false">
    {season === 'christmas'
      ? <><path className="lh-red" d="M3 15C6 7 11 3 16 3.5c3 .3 4.6 2.6 4.8 5.4-1.6-1.4-3.4-1.8-5-1.2C12.6 9 11 12.5 10.6 15Z" /><rect className="lh-fur" x="1.6" y="14" width="11" height="4" rx="2" /><circle className="lh-fur" cx="21" cy="9.4" r="2.2" /></>
      : <><path className="lh-witch" d="M5 15.6 13.8 1.4c.3 2.6 1.6 4.8 3.6 6.2-2 .6-3.2 2.8-3.4 8Z" /><ellipse className="lh-witch" cx="11" cy="16" rx="10" ry="2.6" /><path className="lh-band" d="M7.6 13.4c2.2.8 4.6.9 6.6.3l.2 1.8c-2.2.6-4.8.5-7.2-.4Z" /></>}
  </svg>
}

// The scene in the sign-in welcome panel: a parol hanging from the top corner, or a moon and two lanterns-in-pumpkins.
export function SignInScene({ season }: { season: Season }) {
  if (!season) return null
  return season === 'christmas'
    ? <div className="signin-scene signin-scene--christmas" aria-hidden="true">
      <svg className="ss-parol" viewBox="0 0 60 120" focusable="false">
        <line className="ss-cord" x1="30" y1="0" x2="30" y2="34" />
        <g className="ss-swing">
          <circle className="ss-halo" cx="30" cy="58" r="30" />
          <circle className="ss-ring" cx="30" cy="58" r="21" />
          <path className="ss-star" d="M30 38 35.3 51 49.4 51.6 38.4 60.6 42.2 74.3 30 66.6 17.8 74.3 21.6 60.6 10.6 51.6 24.7 51Z" />
          <path className="ss-star-in" d="M30 47 32.6 53.7 39.7 54 34.1 58.5 36.1 65.4 30 61.5 23.9 65.4 25.9 58.5 20.3 54 27.4 53.7Z" />
          <path className="ss-tail" d="M23 77c-2 12-6 22-11 36M37 77c2 12 6 22 11 36M27 78c-1 12-2 22-4 34M33 78c1 12 2 22 4 34" />
        </g>
      </svg>
    </div>
    : <div className="signin-scene signin-scene--halloween" aria-hidden="true">
      <svg className="ss-moon" viewBox="0 0 60 60" focusable="false"><circle cx="30" cy="30" r="22" /><circle className="ss-moon-bite" cx="40" cy="24" r="19" /></svg>
      <svg className="ss-patch" viewBox="0 0 96 48" focusable="false">
        <ellipse className="ss-pool" cx="48" cy="44" rx="46" ry="5" />
        <g transform="translate(6 10)"><path className="ss-stem" d="M17 6c0-3 1-5 3.4-6l1.2 1.4C20 2.6 19.5 4 19.5 6Z" /><ellipse className="ss-pk" cx="12" cy="20" rx="10" ry="12" /><ellipse className="ss-pk" cx="26" cy="20" rx="10" ry="12" /><ellipse className="ss-pk ss-pk--mid" cx="19" cy="20" rx="10" ry="13" /><path className="ss-face" d="M11 16l4-2 .6 4.4Zm16 0-4-2-.6 4.4ZM10.6 23c2.6 4 14.2 4 16.8 0l-2.6 1-1.6-1.6-2 1.8-2.2-1.8-2.2 1.8-2-1.8-1.6 1.6Z" /></g>
        <g transform="translate(52 22) scale(.62)"><path className="ss-stem" d="M17 6c0-3 1-5 3.4-6l1.2 1.4C20 2.6 19.5 4 19.5 6Z" /><ellipse className="ss-pk" cx="12" cy="20" rx="10" ry="12" /><ellipse className="ss-pk" cx="26" cy="20" rx="10" ry="12" /><ellipse className="ss-pk ss-pk--mid" cx="19" cy="20" rx="10" ry="13" /><path className="ss-face" d="M11 16l4-2 .6 4.4Zm16 0-4-2-.6 4.4ZM10.6 23c2.6 4 14.2 4 16.8 0l-2.6 1-1.6-1.6-2 1.8-2.2-1.8-2.2 1.8-2-1.8-1.6 1.6Z" /></g>
      </svg>
    </div>
}

// One line for the dashboard greeting.
export function seasonGreeting(season: Season, language: Language) {
  if (season === 'christmas') return text(language, 'Maligayang Pasko from all of us on B. Zubiri St.', 'Maligayang Pasko mula sa aming lahat sa B. Zubiri St.')
  if (season === 'halloween') return text(language, 'Happy Undas. Light a candle, take it easy this week.', 'Maligayang Undas. Magsindi ng kandila, magpahinga ngayong linggo.')
  return null
}
