import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const externalRequests = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5175') {
      externalRequests.push(route.request().url()); return route.abort()
    }
    return route.continue()
  })
  await page.goto('http://127.0.0.1:5175')
  await page.getByRole('heading', { name: 'Owner workspace', exact: true }).waitFor()
  await page.getByText('Dashboard preview - sign-in skipped.').waitFor()
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  await page.getByText('Signed in as preview@example.invalid', { exact: true }).waitFor()
  for (const label of ['Log a payment', 'Add a tenant', 'View the property', 'Find a tenant']) {
    await page.getByRole('button', { name: new RegExp(label) }).waitFor()
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'docs/screenshots/dashboard-landing-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'docs/screenshots/dashboard-landing-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: /Log a payment/ }).click()
  assert.equal(await page.locator('#payment-records').isVisible(), true)
  await page.locator('.workspace-sidebar').getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Add a tenant/ }).click()
  assert.equal(await page.locator('#create-tenant').isVisible(), true)
  await page.locator('.workspace-sidebar').getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /View the property/ }).focus()
  await page.getByRole('button', { name: /View the property/ }).press('Enter')
  assert.equal(await page.locator('#property-locations').isVisible(), true)
  await page.locator('.workspace-sidebar').getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Find a tenant/ }).click()
  await page.getByLabel('Search name, building or room').fill('Corner')
  await page.getByRole('heading', { name: 'Sample Corner Shop', exact: true }).waitFor()
  assert.equal(await page.locator('.tenant-person-card').count(), 1)
  await page.getByRole('link', { name: 'Buildings and units', exact: true }).click()
  await page.getByRole('heading', { name: "Bob's house", exact: true }).waitFor()
  await page.getByRole('link', { name: 'Add tenant record', exact: true }).click()
  await page.getByLabel('Tenant or business name', { exact: false }).fill('Fictional unsaved preview')
  await page.getByRole('button', { name: 'Review tenant record', exact: true }).click()
  await page.getByRole('heading', { name: 'Review tenant details', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Owner workspace', exact: true }).waitFor()
  assert.equal(await page.getByText('Fictional unsaved preview', { exact: true }).count(), 0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: 'docs/screenshots/dashboard-landing-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const stats = await page.locator('.workspace-overview .stat-card').evaluateAll(cards => cards.map(card => {
    const { x, y, width } = card.getBoundingClientRect()
    return { x, y, width }
  }))
  assert.equal(stats.length, 3)
  assert.ok(stats[0].width > stats[1].width * 1.8, 'active records should have clear priority on mobile')
  assert.ok(Math.abs(stats[1].y - stats[2].y) < 2, 'secondary summary cards should share a row')
  await page.screenshot({ path: 'docs/screenshots/dashboard-landing-mobile.png', fullPage: true })
  assert.deepEqual(externalRequests, [])
  await page.getByRole('button', { name: 'Exit preview', exact: true }).click()
  await page.getByRole('heading', { name: 'Development connection is not configured', exact: true }).waitFor()
  console.log('PASS: direct dashboard, fixture search/navigation, unsaved form, reload, exit and zero external network requests.')
} finally { await browser.close() }
