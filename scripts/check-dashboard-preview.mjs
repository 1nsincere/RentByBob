import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { screenshotDir } from './screenshot-dir.mjs'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const externalRequests = []
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5173') {
      externalRequests.push(route.request().url()); return route.abort()
    }
    return route.continue()
  })
  await page.goto('http://127.0.0.1:5173/?preview=1')
  await page.getByRole('heading', { name: 'Owner workspace', exact: true }).waitFor()
  await page.getByRole('link', { name: 'Skip to content', exact: true }).focus()
  const skipLink = await page.evaluate(() => ({ className: document.activeElement?.className, top: document.activeElement?.getBoundingClientRect().top }))
  assert.equal(skipLink.className, 'skip-link')
  assert.ok(skipLink.top >= 0, `keyboard-focused skip link is not visible: ${skipLink.top}`)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const focusedControl = await page.evaluate(() => ({
    matches: document.activeElement?.matches(':focus-visible'),
    outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
    outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
  }))
  assert.equal(focusedControl.matches, true, 'keyboard-focused header action should match :focus-visible')
  assert.equal(focusedControl.outlineStyle, 'solid')
  assert.equal(focusedControl.outlineWidth, '3px')
  await page.getByText('Fictional dashboard preview - sign-in skipped.').waitFor()
  await page.getByText('Fictional preview · Offline sample data', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Return to account app', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor()
  await page.getByText('Signed in as preview@example.invalid', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Show basic Bisaya', exact: true }).click()
  await page.getByRole('heading', { name: 'Panid sa tag-iya', exact: true }).waitFor()
  await page.getByText('Sample nga preview · Sample nga datos nga offline', { exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Maayong pagbalik', exact: true }).waitFor()
  await page.locator('.workspace-sidebar').getByRole('link', { name: 'Kinatibuk-ang panid', exact: true }).waitFor()
  await page.getByText('PAGDUMALA SA PROPIEDAD', { exact: true }).waitFor()
  await page.getByText('Nakasulod isip preview@example.invalid', { exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'fil')
  assert.equal(await page.evaluate(() => localStorage.getItem('rentbybob-language')), 'fil')
  await page.reload()
  await page.getByRole('heading', { name: 'Panid sa tag-iya', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Ipakita ang Iningles', exact: true }).click()
  await page.getByRole('heading', { name: 'Owner workspace', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  for (const label of ['Log a payment', 'Add a tenant', 'View the property', 'Find a tenant']) {
    await page.getByRole('button', { name: new RegExp(label) }).waitFor()
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const actionTransition = await page.getByRole('button', { name: /Log a payment/ }).evaluate(element => getComputedStyle(element).transitionDuration)
  assert.ok(actionTransition.split(',').every(value => parseFloat(value) <= 0.00001), `reduced-motion transition is not suppressed: ${actionTransition}`)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: `${screenshotDir}/dashboard-landing-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: `${screenshotDir}/dashboard-landing-mobile.png`, fullPage: true })
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
  await page.screenshot({ path: `${screenshotDir}/dashboard-landing-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const stats = await page.locator('.workspace-overview .stat-card').evaluateAll(cards => cards.map(card => {
    const { x, y, width } = card.getBoundingClientRect()
    return { x, y, width }
  }))
  assert.equal(stats.length, 3)
  assert.ok(stats[0].width > stats[1].width * 1.8, 'active records should have clear priority on mobile')
  assert.ok(Math.abs(stats[1].y - stats[2].y) < 2, 'secondary summary cards should share a row')
  await page.screenshot({ path: `${screenshotDir}/dashboard-landing-mobile.png`, fullPage: true })
  assert.deepEqual(externalRequests, [])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Use Night mode', exact: true }).click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  await page.getByRole('link', { name: 'Payments and balances', exact: true }).click()
  await page.getByRole('button', { name: 'Paid rent report', exact: true }).click()
  // Measure the settled colours, not the 130 ms hover-to-selected transition.
  await page.waitForTimeout(400)
  const themeContrast = await page.locator('.simple-payments > .segmented-control .button[aria-pressed="true"]').evaluate(element => {
    const channels = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
      const normalized = channel / 255
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    const [r, g, b] = channels(getComputedStyle(element).color)
    const [br, bg, bb] = channels(getComputedStyle(element).backgroundColor)
    const luminance = (red, green, blue) => 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const foreground = luminance(r, g, b)
    const background = luminance(br, bg, bb)
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
  assert.ok(themeContrast >= 4.5, `dark selected-control contrast ${themeContrast.toFixed(2)}:1 is below 4.5:1`)
  // The table header must use the active theme's --table-heading token (resolved to rgb for comparison).
  assert.equal(await page.locator('.paid-report-table thead th').first().evaluate(element => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--table-heading)'
    document.body.append(probe)
    const expected = getComputedStyle(probe).backgroundColor
    probe.remove()
    return getComputedStyle(element).backgroundColor === expected && expected !== 'rgba(0, 0, 0, 0)'
  }), true)
  assert.equal(await page.evaluate(() => localStorage.getItem('rentbybob-theme')), 'dark')
  await page.reload()
  await page.getByRole('heading', { name: 'Owner workspace', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  assert.deepEqual(externalRequests, [])
  await page.getByRole('button', { name: 'Return to account app', exact: true }).click()
  await page.waitForURL(url => url.searchParams.get('auth') === '1')
  assert.equal(await page.getByText('Fictional dashboard preview - sign-in skipped.').count(), 0)
  await page.getByRole('button', { name: 'Open fictional preview', exact: true }).waitFor()
  console.log('PASS: same-origin preview, fixture navigation, unsaved form, reload, return to account app and zero external requests in preview.')
} finally { await browser.close() }
