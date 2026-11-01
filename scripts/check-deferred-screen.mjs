import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

// Requires a development server on 5173 (for example `npm.cmd run dev -- --port 5173 --strictPort`); no backend is used.
const origin = 'http://127.0.0.1:5173'
const sampleModule = '/tests/browser/fixtures/deferred-screen-sample.tsx'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  async function openHarness(language, { failFirstDownload = false, failRender = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    if (failRender) await page.addInitScript(() => { window.failSampleRender = true })
    const externalRequests = [], pageErrors = []
    let sampleRequests = 0
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { externalRequests.push(url.href); return route.abort() }
      if (url.pathname === sampleModule && ++sampleRequests === 1 && failFirstDownload) return route.abort('internetdisconnected')
      return route.continue()
    })
    await page.goto(`${origin}/?availability=preview`)
    await page.evaluate(async language => (await import('/tests/browser/fixtures/deferred-screen-harness.tsx')).mount(language), language)
    return { page, externalRequests, pageErrors, sampleRequests: () => sampleRequests }
  }

  {
    const { page, externalRequests, pageErrors, sampleRequests } = await openHarness('en', { failFirstDownload: true })
    await page.getByLabel('Other section draft', { exact: true }).fill('Unsaved fictional note')
    const alert = page.getByRole('alert')
    await alert.getByText('This section did not open.', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'alert', 'failure message receives focus')
    assert.equal(await page.getByLabel('Other section draft', { exact: true }).inputValue(), 'Unsaved fictional note', 'other sections keep their drafts')
    for (const name of ['Try again', 'Reload page']) {
      const box = await alert.getByRole('button', { name, exact: true }).boundingBox()
      assert.ok(box && box.height >= 44, `${name} meets the 44px target`)
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Failure message overflows at ${width}px`)
    }
    await alert.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('heading', { name: 'Sample screen loaded', exact: true }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(sampleRequests(), 2, 'Try again requests the screen module again')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'sample-section', 'focus returns to the section')
    assert.equal(await page.getByLabel('Other section draft', { exact: true }).inputValue(), 'Unsaved fictional note')
    assert.deepEqual(externalRequests, [])
    assert.deepEqual(pageErrors, [])
    await page.close()
  }

  {
    const { page, pageErrors } = await openHarness('fil', { failRender: true })
    const alert = page.getByRole('alert')
    await alert.getByText('Wala maablihi kini nga bahin.', { exact: true }).waitFor()
    await alert.getByRole('button', { name: 'Sulayi pag-usab', exact: true }).waitFor()
    await page.evaluate(() => { window.failSampleRender = false })
    await alert.getByRole('button', { name: 'Sulayi pag-usab', exact: true }).click()
    await page.getByRole('heading', { name: 'Sample screen loaded', exact: true }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.deepEqual(pageErrors, [])
    await page.close()
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.route('**/src/App.tsx*', route => route.abort('internetdisconnected'))
    await page.goto(`${origin}/?preview=1`)
    const alert = page.getByRole('alert')
    await alert.getByText('The app did not open.', { exact: true }).waitFor()
    await alert.getByRole('button', { name: 'Reload page / I-reload ang panid', exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Startup failure overflows at 390px')
    assert.deepEqual(pageErrors, [])
    await page.close()
  }
  console.log('Deferred screen failure check passed: download and render failures stay inside one section and recover; startup failure shows a reload message.')
} finally {
  await browser.close()
}
