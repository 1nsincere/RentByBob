// Lifts the intro that index.html draws (particles, logo, wordmark, counter) with a curtain wipe and a gold leading edge.
// On the first visit in a tab it plays for about 3 seconds from the start of loading; on later loads in the same tab, or
// with reduced motion, it leaves quickly. Automated browsers (the test suites) skip it so it never covers the page under test.
const FIRST_VISIT_MS = 3100
const WIPE_MS = 900

export function finishIntro() {
  const intro = document.getElementById('intro')
  if (!intro) return
  if (navigator.webdriver) { intro.remove(); return }
  let seen = false
  try { seen = sessionStorage.getItem('rentbybob-intro') === '1'; sessionStorage.setItem('rentbybob-intro', '1') } catch { /* private mode: treat every load as a first visit */ }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  // Particles, glow and logo drift a little with the pointer (or finger).
  const move = (event: PointerEvent) => {
    intro.style.setProperty('--mx', String(((event.clientX / window.innerWidth) * 2 - 1).toFixed(3)))
    intro.style.setProperty('--my', String(((event.clientY / window.innerHeight) * 2 - 1).toFixed(3)))
  }
  if (!reduced) window.addEventListener('pointermove', move)

  const wait = reduced ? 150 : seen ? 600 : Math.max(0, FIRST_VISIT_MS - performance.now())
  window.setTimeout(() => {
    const edge = document.createElement('div')
    edge.className = 'in-edge'
    if (!reduced) { document.body.appendChild(edge); void edge.offsetWidth; edge.classList.add('go') }
    intro.classList.add('is-leaving')
    window.setTimeout(() => { intro.remove(); edge.remove(); window.removeEventListener('pointermove', move) }, reduced ? 300 : WIPE_MS + 60)
  }, wait)
}
