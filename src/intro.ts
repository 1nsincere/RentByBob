// Removes the intro splash that index.html draws (logo, wordmark, loading bar). On the first visit in a tab it stays for
// about 1.5 seconds from the start of loading; on later loads in the same tab, or with reduced motion, it leaves quickly.
// Automated browsers (the test suites) skip it so it never covers the page under test.
const FIRST_VISIT_MS = 1500

export function finishIntro() {
  const intro = document.getElementById('intro')
  if (!intro) return
  if (navigator.webdriver) { intro.remove(); return }
  let seen = false
  try { seen = sessionStorage.getItem('rentbybob-intro') === '1'; sessionStorage.setItem('rentbybob-intro', '1') } catch { /* private mode: treat every load as a first visit */ }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const wait = seen || reduced ? 120 : Math.max(0, FIRST_VISIT_MS - performance.now())
  window.setTimeout(() => {
    intro.classList.add('is-leaving')
    window.setTimeout(() => intro.remove(), 480)
  }, wait)
}
