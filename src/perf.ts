// Marks the page <html data-perf="lite"> on phones that may struggle with graphics. The intro and the landing street then
// drop their heaviest effects (extra particles, glows and filters, endless ambient motion, extra traffic) and keep the
// story. Two signals: what the device says about itself (little memory, few processor cores on a touch screen, data saver,
// a very slow connection), and a short frame-rate check shortly after the page starts. Once lite, it stays lite.
type Hints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }

const setLite = () => { document.documentElement.dataset.perf = 'lite' }

function weakDevice() {
  const nav = navigator as Hints
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    (touch && nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4) ||
    nav.connection?.saveData === true || ['slow-2g', '2g'].includes(nav.connection?.effectiveType ?? '')
}

// Counts animation frames for about a second, starting after the first moments of loading; under ~30 frames a second is lite.
function probeFrameRate() {
  window.setTimeout(() => {
    if (document.documentElement.dataset.perf === 'lite') return
    const start = performance.now()
    let frames = 0
    const step = (now: number) => {
      frames++
      if (now - start < 1000) { requestAnimationFrame(step); return }
      if (frames < 30) setLite()
    }
    requestAnimationFrame(step)
  }, 500)
}

// Testing: localStorage 'rentbybob-perf' = 'lite' or 'full' overrides the detection above.
const forced = (() => { try { return localStorage.getItem('rentbybob-perf') } catch { return null } })()
if (typeof document !== 'undefined' && !navigator.webdriver) {
  if (forced === 'lite') setLite()
  else if (forced !== 'full') { if (weakDevice()) setLite(); else probeFrameRate() }
}
