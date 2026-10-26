import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { screenshotDir } from './screenshot-dir.mjs'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const external = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5173') { external.push(route.request().url()); return route.abort() }
    return route.continue()
  })
  await page.goto('http://127.0.0.1:5173/?preview=1')
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  assert.equal(await page.locator('.workspace-sidebar .workspace-links a').count(), 5)
  await page.locator('.workspace-sidebar').getByRole('link', { name: 'Tenant directory', exact: true }).click()
  await page.getByRole('heading', { name: 'Tenant directory', exact: true }).waitFor()
  await page.getByRole('button', { name: '+ Add tenant', exact: true }).click()
  await page.getByLabel('Tenant or business name', { exact: false }).fill('Sample Robin Cruz')
  await page.locator('.tenant-entry-form').getByLabel('Building', { exact: true }).selectOption('bob')
  await page.getByLabel('Room or unit', { exact: true }).selectOption('bob-2')
  await page.getByRole('button', { name: 'Review tenant record', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'at least two' }).waitFor()
  await page.getByRole('alert').getByRole('link').click()
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tenant-people')
  await page.getByLabel('Other occupants', { exact: false }).fill('Sample Jamie Cruz')
  await page.getByLabel('Email address', { exact: false }).fill('robin@example.com')
  await page.getByRole('button', { name: 'Review tenant record', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '.invalid' }).waitFor()
  await page.getByLabel('Email address', { exact: false }).fill('robin@example.invalid')
  await page.getByRole('link', { name: 'Tenant directory', exact: true }).click()
  await page.getByRole('link', { name: 'Add tenant record', exact: true }).click()
  assert.equal(await page.getByLabel('Other occupants', { exact: false }).inputValue(), 'Sample Jamie Cruz')
  await page.locator('.add-tenant-preview').screenshot({ path: `${screenshotDir}/add-tenant-workflow.png` })
  await page.getByRole('button', { name: 'Review tenant record', exact: true }).click()
  await page.getByRole('heading', { name: 'Review tenant details', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  assert.equal(await page.getByLabel('Room or unit', { exact: true }).inputValue(), 'bob-2')
  await page.getByRole('button', { name: 'Review tenant record', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm preview tenant', exact: true }).click()
  await page.getByRole('heading', { name: 'Tenant added to preview', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Confirm preview tenant', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'View tenant directory', exact: true }).click()
  assert.equal(await page.locator('.tenant-person-card').count(), 4)
  const card = page.locator('.tenant-person-card').filter({ hasText: 'Sample Robin Cruz' })
  await card.getByText('2 named occupants', { exact: true }).waitFor()
  await card.getByRole('button', { name: 'View details' }).click()
  await card.getByText('Sample Jamie Cruz', { exact: true }).waitFor()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.focused-preview').screenshot({ path: `${screenshotDir}/workspace-directory.png` })
  await card.getByRole('button', { name: 'Locate room' }).click()
  const tile = page.locator('.room-tile').filter({ hasText: 'Room 02' })
  await tile.getByText('2 people', { exact: true }).waitFor()
  await page.locator('.room-occupants').getByText('Sample Jamie Cruz', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add tenant to this space' }).click()
  assert.equal(await page.getByLabel('Room or unit', { exact: true }).inputValue(), 'bob-2')
  assert.equal(await page.getByLabel('Tenant or business name', { exact: false }).inputValue(), '')
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Form overflow at ${width}`)
  }
  await page.setViewportSize({ width: 768, height: 1000 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '225%' })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Form overflow at 200% text size')
  await page.evaluate(() => { document.documentElement.style.fontSize = '' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.add-tenant-preview').screenshot({ path: `${screenshotDir}/add-tenant-mobile.png` })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('link', { name: 'Buildings and units', exact: true }).click()
  await page.locator('.building-inspector').screenshot({ path: `${screenshotDir}/room-occupants.png` })
  await page.reload()
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  await page.locator('.workspace-sidebar').getByRole('link', { name: 'Tenant directory', exact: true }).click()
  await page.getByRole('heading', { name: 'Tenant directory', exact: true }).waitFor()
  assert.equal(await page.locator('.tenant-person-card').count(), 3)
  assert.deepEqual(external, []); assert.deepEqual(errors, [])

  // Leaving with unsaved typing asks first; leaving an untouched page does not.
  async function closePrompt(type) {
    const draftPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await draftPage.goto('http://127.0.0.1:5173/?preview=1')
    await draftPage.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
    await draftPage.locator('.workspace-sidebar').getByRole('link', { name: 'Add tenant record', exact: true }).click()
    // Browsers only allow the leave prompt after a real gesture, as when a person taps the field before typing.
    if (type) { const field = draftPage.getByLabel('Tenant or business name', { exact: false }); await field.click(); await field.pressSequentially('Sample Unsaved Draft') }
    // Navigating away is the realistic trigger (headless tab close does not surface the dialog).
    let prompt = null
    draftPage.on('dialog', dialog => { prompt = dialog.type(); void dialog.accept() })
    await draftPage.goto('http://127.0.0.1:5173/?preview=1&leave-check=1')
    await draftPage.close()
    return prompt
  }
  assert.equal(await closePrompt(true), 'beforeunload', 'unsaved form typing must prompt before leaving')
  assert.equal(await closePrompt(false), null, 'an untouched page must not prompt')
  console.log('PASS: three-section navigation; minimum occupants/email validation; preserved draft/review; one confirmed record; directory/room counts and named people; room prefill; mobile form reflow; reload reset; unsaved-typing leave prompt; zero external requests or runtime errors.')
} finally { await browser.close() }
