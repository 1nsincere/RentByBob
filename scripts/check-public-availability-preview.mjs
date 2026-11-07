import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

// Development sample of the public rooms page (?availability=preview): fictional rooms, no network, simulated send.
const origin = 'http://127.0.0.1:5174'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const externalRequests = [], requests = [], pageErrors = []
  page.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { externalRequests.push(route.request().url()); return route.abort() }
    return route.continue()
  })

  await page.goto(`${origin}/?availability=preview`)
  await page.getByRole('heading', { name: 'Rooms for rent', exact: true }).waitFor()
  await page.getByText('Development sample · Fictional rooms · Messages are not sent or saved', { exact: true }).waitFor()

  // One-screen browsing: building tabs with counts; the first building is selected.
  const tabs = page.getByRole('tab')
  assert.deepEqual(await tabs.evaluateAll(items => items.map(item => item.textContent)), ['Building 12 rooms available', 'Building 21 room available', "Bob's house2 rooms available"])
  assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
  assert.deepEqual(await page.locator('.public-room-card h3').allTextContents(), ['Room 03', 'Room 06'])
  await page.getByRole('tab', { name: /Bob's house/ }).click()
  assert.deepEqual(await page.locator('.public-room-card h3').allTextContents(), ['Room 04', 'Room 05'])
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.getByRole('tab', { name: /Building 2/ }).getAttribute('aria-selected'), 'true', 'arrow keys move between building tabs')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'tab')
  await page.locator('.public-room-card').filter({ hasText: 'Room 02' }).getByText('₱3,800.00', { exact: true }).waitFor()

  // Inquiry opens a focused dialog; sending (simulated) confirms; closing returns focus to the button.
  const ask = page.locator('.public-room-card').filter({ hasText: 'Room 02' }).getByRole('button', { name: 'Ask about this room', exact: true })
  await ask.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'Ask about Room 02' }).waitFor()
  await dialog.getByLabel('Your name', { exact: true }).fill('Sample Visitor')
  await dialog.getByLabel('Phone number or Messenger name', { exact: true }).fill('0917 000 0000')
  assert.match(await dialog.getByLabel('Message', { exact: true }).inputValue(), /Room 02 in Building 2/)
  await dialog.getByRole('button', { name: 'Send message', exact: true }).click()
  await dialog.getByText('Message sent. Thank you!', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await ask.evaluate(element => element === document.activeElement), true, 'focus returns to the room button')

  await page.getByRole('link', { name: 'Skip to rooms', exact: true }).focus()
  assert.ok(await page.getByRole('link', { name: 'Skip to rooms', exact: true }).evaluate(element => element.getBoundingClientRect().top >= 0), 'keyboard-focused skip link should be visible')
  await page.getByRole('button', { name: 'English · Filipino', exact: true }).click()
  await page.getByRole('heading', { name: 'Mga kuwartong paupahan', exact: true }).waitFor()

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at ${width}px`)
  }
  assert.deepEqual(externalRequests, [], 'sample should not make external requests')
  assert.ok(!requests.some(url => /\/(rest|auth)\/v1\//.test(url)), 'sample must not call Supabase APIs')
  assert.ok(!requests.some(url => url.includes('/src/App.tsx') || url.includes('/src/access/client.ts')), 'sample must not load the authenticated app or Supabase client')
  assert.deepEqual(pageErrors, [], 'sample should not produce runtime errors')
  console.log('PASS: public rooms sample: building tabs (mouse and arrow keys), room cards, inquiry dialog with simulated send and focus return, Filipino switch, 320/390/768px reflow, no network or app code.')
} finally {
  await browser.close()
}
