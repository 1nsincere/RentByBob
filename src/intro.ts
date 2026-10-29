// Lifts the intro that index.html draws (particles, logo, wordmark, counter) with a curtain wipe and a gold leading edge.
// The full intro plays only for the first visit to the landing page in a tab (about 5 seconds, so every part can be seen).
// Any other load, such as the sign-in page or a return to the landing page in the same tab, gets a short version so it
// never feels repeated. Reduced motion gets a quick fade. Automated browsers (the test suites) skip it entirely.
const FULL_MS = 5000
const QUICK_MS = 650
const WIPE_MS = 900
const QUICK_WIPE_MS = 500

export function finishIntro() {
  const intro = document.getElementById('intro')
  if (!intro) return
  if (navigator.webdriver) { intro.remove(); return }
  let seen = false
  try { seen = sessionStorage.getItem('rentbybob-intro') === '1'; sessionStorage.setItem('rentbybob-intro', '1') } catch { /* private mode: every load counts as a first visit */ }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const full = !reduced && !seen && location.pathname === '/'
  const wipeMs = full ? WIPE_MS : QUICK_WIPE_MS

  // Particles, glow and logo drift a little with the pointer (or finger).
  const move = (event: PointerEvent) => {
    intro.style.setProperty('--mx', String(((event.clientX / window.innerWidth) * 2 - 1).toFixed(3)))
    intro.style.setProperty('--my', String(((event.clientY / window.innerHeight) * 2 - 1).toFixed(3)))
  }
  if (full) window.addEventListener('pointermove', move)

  const wait = reduced ? 150 : full ? Math.max(0, FULL_MS - performance.now()) : Math.max(0, QUICK_MS - performance.now())
  window.setTimeout(() => {
    const edge = document.createElement('div')
    edge.className = 'in-edge'
    if (!reduced) {
      edge.style.transitionDuration = `${wipeMs}ms`
      intro.style.transitionDuration = `${wipeMs}ms`
      document.body.appendChild(edge); void edge.offsetWidth; edge.classList.add('go')
    }
    intro.classList.add('is-leaving')
    window.setTimeout(() => { intro.remove(); edge.remove(); window.removeEventListener('pointermove', move) }, reduced ? 300 : wipeMs + 60)
  }, wait)
}
