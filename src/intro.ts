import { currentSeason } from './landing/season'
// Lifts the intro that index.html draws (particles, logo, wordmark, counter, the street at sunrise or sunset) as a curtain
// that slides up with a glowing gold edge. The full intro plays only for the first visit to the landing page in a tab (about
// 5 seconds, so every part can be seen; shorter on phones marked lite by perf.ts). Any other load, such as the sign-in page
// or a return to the landing page in the same tab, gets a short version so it never feels repeated. Reduced motion gets a
// quick fade. A Skip button ends it at once. Automated browsers (the test suites) skip it entirely.
const FULL_MS = 5000
const FULL_LITE_MS = 4200
const QUICK_MS = 650
const WIPE_MS = 900
const QUICK_WIPE_MS = 500

// Runs as soon as this file loads: in the evening (3 pm to 4 am, Cebu time) the sun sets instead of rising.
function applyPhase() {
  const intro = document.getElementById('intro')
  if (!intro) return
  try {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Manila' }).format(new Date()))
    intro.dataset.phase = hour >= 15 || hour < 4 ? 'dusk' : 'dawn'
    const season = currentSeason(new Date(), location.hash)
    if (season) intro.dataset.season = season // Halloween look, same dates as the landing page
  } catch { /* keep the default sunrise */ }
}
applyPhase()

export function finishIntro() {
  const intro = document.getElementById('intro')
  const skip = document.getElementById('intro-skip')
  if (!intro) { skip?.remove(); return }
  if (navigator.webdriver) { intro.remove(); skip?.remove(); return }
  let seen = false
  try { seen = sessionStorage.getItem('rentbybob-intro') === '1'; sessionStorage.setItem('rentbybob-intro', '1') } catch { /* private mode: every load counts as a first visit */ }
  // The installed app (home-screen icon) plays the full intro every time it is opened.
  const launched = window.matchMedia?.('(display-mode: standalone)').matches && (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'navigate'
  if (launched) seen = false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const replay = new URLSearchParams(location.search).has('intro') // open /?intro to watch the full intro again in the same tab
  const full = !reduced && (!seen || replay) && location.pathname === '/'
  const lite = document.documentElement.dataset.perf === 'lite'
  const wipeMs = full ? WIPE_MS : QUICK_WIPE_MS

  // Particles, glow and logo drift a little with the pointer (not on lite phones).
  const move = (event: PointerEvent) => {
    intro.style.setProperty('--mx', String(((event.clientX / window.innerWidth) * 2 - 1).toFixed(3)))
    intro.style.setProperty('--my', String(((event.clientY / window.innerHeight) * 2 - 1).toFixed(3)))
  }
  if (full && !lite) window.addEventListener('pointermove', move)
  if (!full) skip?.remove() // the short versions are over before anyone could use it

  let timer = 0
  let leaving = false
  const leave = (quick = false) => {
    if (leaving) return
    leaving = true
    window.clearTimeout(timer)
    skip?.remove()
    const ms = quick ? QUICK_WIPE_MS : wipeMs
    if (!reduced) intro.style.transitionDuration = `${ms}ms`
    intro.classList.add('is-leaving')
    window.setTimeout(() => { intro.remove(); window.removeEventListener('pointermove', move) }, reduced ? 300 : ms + 340) // the curtain waits 280 ms for the name to split
  }
  skip?.addEventListener('click', () => leave(true))

  const fullMs = lite ? FULL_LITE_MS : FULL_MS
  const wait = reduced ? 150 : full ? Math.max(0, fullMs - performance.now()) : Math.max(0, QUICK_MS - performance.now())
  timer = window.setTimeout(() => leave(), wait)
}
