import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { chromium } from '@playwright/test'

// Loads the PRODUCTION build (run `npm run build` first) on an emulated mid-range phone: 390px viewport,
// 4x CPU slowdown and a slow-4G-like connection. Reports Core Web Vitals for the first screen everyone sees.
// Lab numbers from one machine are indicative only; field data from real devices is still needed.
const port = 4173
const server = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const budgets = { lcpMs: 4000, cls: 0.1, transferKb: 600 }
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break } catch {} await new Promise(r => setTimeout(r, 500)) }
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const runs = []
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.addInitScript(() => {
      window.__vitals = { lcp: 0, cls: 0 }
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__vitals.cls += entry.value }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
    await page.locator('.auth-card').waitFor()
    await page.waitForTimeout(1000)
    const result = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0]
      const transfer = [navigation, ...performance.getEntriesByType('resource')].reduce((sum, entry) => sum + (entry.transferSize || 0), 0)
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
      return { lcpMs: Math.round(window.__vitals.lcp), fcpMs: Math.round(fcp), cls: Number(window.__vitals.cls.toFixed(3)), transferKb: Math.round(transfer / 1024) }
    })
    runs.push(result)
    await context.close()
  }
  await browser.close()
  const median = key => runs.map(r => r[key]).sort((a, b) => a - b)[1]
  const summary = { lcpMs: median('lcpMs'), fcpMs: median('fcpMs'), cls: median('cls'), transferKb: median('transferKb') }
  console.log(`Runs: ${JSON.stringify(runs)}`)
  console.log(`Median (390px phone, 4x CPU, slow 4G): LCP ${summary.lcpMs} ms, FCP ${summary.fcpMs} ms, CLS ${summary.cls}, transferred ${summary.transferKb} KB`)
  assert.ok(summary.lcpMs > 0 && summary.lcpMs <= budgets.lcpMs, `LCP ${summary.lcpMs} ms exceeds ${budgets.lcpMs} ms budget`)
  assert.ok(summary.cls <= budgets.cls, `CLS ${summary.cls} exceeds ${budgets.cls}`)
  assert.ok(summary.transferKb <= budgets.transferKb, `Transferred ${summary.transferKb} KB exceeds ${budgets.transferKb} KB`)
  console.log(`PASS: within lab budgets (LCP <= ${budgets.lcpMs} ms, CLS <= ${budgets.cls}, transfer <= ${budgets.transferKb} KB).`)
} finally {
  server.kill()
}
