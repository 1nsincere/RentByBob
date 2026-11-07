// Marks the page <html data-perf="lite"> on phones that may struggle with graphics. The intro and landing then drop
// their heaviest effects. Hardware hints are often missing or misleading on budget Android phones, so use an early
// frame-rate probe for every device too. Once lite, it stays lite for this page load.
type Hints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }

const setLite = () => { document.documentElement.dataset.perf = 'lite' }

function weakDevice() {
  const nav = navigator as Hints
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
    (touch && nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 6) ||
    nav.connection?.saveData === true || ['slow-2g', '2g'].includes(nav.connection?.effectiveType ?? '')
}

// Counts frames for 700 ms once the page has settled slightly; low frame rate triggers the lighter landing style.
function probeFrameRate() {
  window.setTimeout(() => {
    if (document.documentElement.dataset.perf === 'lite') return
    const samples: number[] = []
    let previous = performance.now()
    const step = (now: number) => {
      samples.push(now - previous)
      previous = now
      if (samples.length < 42) { requestAnimationFrame(step); return }
      const sorted = samples.slice(4).sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0
      if (median > 38) setLite()
    }
    requestAnimationFrame(step)
  }, 250)
}

// Testing: localStorage 'rentbybob-perf' = 'lite' or 'full' overrides the detection above.
const forced = (() => { try { return localStorage.getItem('rentbybob-perf') } catch { return null } })()
if (typeof document !== 'undefined' && !navigator.webdriver) {
  if (forced === 'lite') setLite()
  else if (forced !== 'full') { if (weakDevice()) setLite(); probeFrameRate() }
}
