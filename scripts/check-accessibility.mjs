import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium } from '@playwright/test'

// Automated WCAG 2.1 A/AA scan (axe-core) of the main fictional preview screens in light and dark themes on a
// backend-free dev server. Automated rules catch only part of WCAG; this is not a conformance claim.
const origin = 'http://127.0.0.1:5173'
const axePath = path.resolve('node_modules/axe-core/axe.min.js')
const screens = [
  { name: 'sign-in (no connection configured)', url: '/', ready: page => page.locator('.auth-card').waitFor() },
  { name: 'staff dashboard', url: '/?preview=1', ready: page => page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor() },
  { name: 'tenant directory', url: '/?preview=1', open: 'Tenant directory' },
  { name: 'property map', url: '/?preview=1', open: 'Buildings and units' },
  { name: 'building front view', url: '/?preview=1', open: 'Buildings and units', then: page => page.getByRole('button', { name: 'Explore Building 1', exact: true }).click() },
  { name: 'add tenant', url: '/?preview=1', open: 'Add tenant record' },
  { name: 'payments', url: '/?preview=1', open: 'Payments and balances' },
  { name: 'paid rent report', url: '/?preview=1', open: 'Payments and balances', then: page => page.getByRole('button', { name: 'Paid rent report', exact: true }).click() },
  { name: 'renter view', url: '/?preview=renter', ready: page => page.getByRole('heading', { name: 'Hello, Sample Alex Santos' }).waitFor() },
]

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const failures = []
try {
  for (const theme of ['light', 'dark']) {
    for (const screen of screens) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      await page.addInitScript(value => localStorage.setItem('rentbybob-theme', value), theme)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(origin + screen.url)
      if (screen.ready) await screen.ready(page)
      else await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
      if (screen.open) await page.locator('.workspace-sidebar').getByRole('link', { name: screen.open, exact: true }).click()
      if (screen.then) await screen.then(page)
      await page.waitForTimeout(500)
      await page.addScriptTag({ path: axePath })
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations
        .map(v => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(' ')) })))
      for (const violation of violations) failures.push({ theme, screen: screen.name, ...violation })
      console.log(`${violations.length ? 'ISSUES' : 'PASS  '} ${theme.padEnd(5)} ${screen.name}${violations.length ? ': ' + violations.map(v => `${v.id}(${v.count})`).join(', ') : ''}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
if (failures.length) console.log(JSON.stringify(failures, null, 1))
assert.equal(failures.length, 0, `${failures.length} automated accessibility issue(s) found`)
console.log(`PASS: no automated WCAG 2.1 A/AA violations on ${screens.length} screens in light and dark themes (axe-core).`)
