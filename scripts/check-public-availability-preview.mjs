import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const externalRequests = []
  const requests = []
  const pageErrors = []
  page.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5174') {
      externalRequests.push(route.request().url())
      return route.abort()
    }
    return route.continue()
  })

  await page.goto('http://127.0.0.1:5174/?availability=preview')
  await page.getByRole('heading', { name: 'Rooms shown as available', exact: true }).waitFor()
  await page.getByText('Development preview · Fictional sample data · Not connected to rental records', { exact: true }).waitFor()
  await page.getByText('These fictional listings demonstrate a possible public page. They do not show real rooms or current availability.', { exact: true }).waitFor()
  assert.deepEqual(await page.locator('.availability-building').evaluateAll(buildings =>
    buildings.map(building => ({
      name: building.querySelector('h2')?.textContent,
      rooms: [...building.querySelectorAll('.availability-room strong')].map(room => room.textContent),
    })),
  ), [
    { name: 'Building A', rooms: ['Room 01', 'Room 03'] },
    { name: 'Building B', rooms: ['Unit 02'] },
  ])
  assert.equal(await page.locator('form, button').count(), 0, 'public listing preview should be view-only')
  assert.equal(await page.locator('.availability-room .status').count(), 3)

  await page.getByRole('link', { name: 'Skip to available rooms', exact: true }).focus()
  assert.ok(await page.getByRole('link', { name: 'Skip to available rooms', exact: true }).evaluate(element =>
    element.getBoundingClientRect().top >= 0,
  ), 'keyboard-focused skip link should be visible')

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}px`)
  }
  assert.deepEqual(externalRequests, [], 'preview should not make external requests')
  assert.ok(!requests.some(url => /\/(rest|auth)\/v1\//.test(url)), 'preview must not call Supabase APIs')
  assert.ok(!requests.some(url => url.includes('/src/App.tsx') || url.includes('/src/access/client.ts')), 'preview must not load the authenticated app')
  assert.deepEqual(pageErrors, [], 'preview should not produce runtime errors')
} finally {
  await browser.close()
}
