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
  await page.getByLabel('Search name, building or room').fill('Corner')
  await page.getByText('Sample Corner Shop', { exact: true }).waitFor()
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
  assert.deepEqual(externalRequests, [])
  await page.getByRole('button', { name: 'Exit preview', exact: true }).click()
  await page.getByRole('heading', { name: 'Development connection is not configured', exact: true }).waitFor()
  console.log('PASS: direct dashboard, fixture search/navigation, unsaved form, reload, exit and zero external network requests.')
} finally { await browser.close() }
