import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { screenshotDir } from './screenshot-dir.mjs'

// Fictional renter view (?preview=renter) on a backend-free dev server; no sign-in or database.
const origin = 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const external = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort() }
    return route.continue()
  })
  await page.goto(`${origin}/?preview=renter`)
  await page.getByRole('heading', { name: 'Hello, Sample Alex Santos' }).waitFor()
  await page.getByText('Fictional renter preview · Sample data · No sign-in or database', { exact: true }).waitFor()
  await page.getByRole('heading', { name: "Bob's house · Room 01" }).waitFor()

  // Balance counts confirmed payments only; the pending cash is shown separately.
  assert.equal(await page.locator('.renter-balance-card strong').textContent(), '₱1,000.00')
  await page.getByText('₱1,000.00 is waiting for confirmation.', { exact: true }).waitFor()
  assert.equal(await page.locator('.renter-pending-list li').count(), 1)
  await page.locator('.renter-pending-list').getByText('Not yet confirmed', { exact: true }).waitFor()

  // Rent by month uses text statuses (not colour alone), newest first.
  assert.deepEqual(await page.locator('.renter-month').evaluateAll(rows => rows.map(row => [row.querySelector('strong')?.textContent, row.querySelector('.status')?.textContent])),
    [['October 2026', 'Partly paid'], ['September 2026', 'Paid'], ['August 2026', 'Paid']])
  const monthColumns = await page.locator('.renter-month dl').evaluateAll(lists => lists.map(list => Math.round(list.getBoundingClientRect().left)))
  assert.equal(new Set(monthColumns).size, 1, 'month rows keep their amount columns aligned')

  // Confirmed payments: cash and a cleared check; cash opens its acknowledgment.
  assert.equal(await page.locator('.renter-payment-list li').count(), 3)
  await page.locator('.renter-payment-list li').filter({ hasText: 'Check CHK-0003' }).waitFor()
  assert.equal(await page.locator('.renter-payment-list li').filter({ hasText: 'Check CHK-0003' }).getByRole('button').count(), 0)
  await page.getByRole('button', { name: 'View acknowledgment' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'Cash Payment Acknowledgment' }).waitFor()
  await dialog.getByText('SAMPLE ONLY — not proof of payment.', { exact: true }).waitFor()
  await page.screenshot({ path: `${screenshotDir}/renter-acknowledgment.png` })
  await dialog.getByRole('button', { name: 'Close receipt' }).click()
  assert.equal(await page.getByRole('dialog').count(), 0)
  await page.getByText('payments are not made on this website', { exact: false }).waitFor()
  await page.screenshot({ path: `${screenshotDir}/renter-view-desktop.png`, fullPage: true })

  // Language switch translates app copy and keeps names, rooms and amounts unchanged.
  await page.getByRole('button', { name: 'English · Bisaya' }).click()
  await page.getByRole('heading', { name: 'Kumusta, Sample Alex Santos' }).waitFor()
  await page.getByText('Nabilin nga abang', { exact: true }).waitFor()
  assert.equal(await page.locator('.renter-balance-card strong').textContent(), '₱1,000.00')
  await page.getByRole('button', { name: 'Bisaya · English' }).click()

  // Narrow screens, enlarged text and touch targets.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Renter view overflows at ${width}px`)
  }
  await page.setViewportSize({ width: 390, height: 900 })
  await page.screenshot({ path: `${screenshotDir}/renter-view-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 320, height: 900 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Renter view overflows at 200% text size')
  assert.ok(await page.locator('button:visible').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)), 'Visible renter buttons must be at least 44px tall')

  assert.deepEqual(external, [])
  assert.deepEqual(errors, [])
  console.log('PASS: renter view shows confirmed balance, separate pending cash, month statuses, cleared check and cash acknowledgment; Bisaya switch; 390/320px and 200% text reflow; 44px targets; no external requests or errors.')
} finally {
  await browser.close()
}
