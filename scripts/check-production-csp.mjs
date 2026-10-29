import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

// Serves the PRODUCTION build (run `npm run build` first) the way Cloudflare Pages would: the rules in
// dist/_headers and single-page routing of /rooms (wrangler.jsonc). Opens the sign-in page and the public rooms page and fails
// on any Content-Security-Policy violation, so a deploy cannot ship a page its own security headers would break.
// Local builds may point at a local Supabase (http://127.0.0.1); those connect-src reports are expected and ignored
// because a deployed build uses an https://*.supabase.co project.
const dist = path.resolve('dist')
const headerText = await readFile(path.join(dist, '_headers'), 'utf8')
const rules = []
for (const line of headerText.split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue
  if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: [] })
  else { const at = line.indexOf(':'); rules.at(-1).headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]) }
}
const matches = (pattern, url) => pattern === url || (pattern.endsWith('*') && url.startsWith(pattern.slice(0, -1)))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
const server = createServer(async (request, response) => {
  let url = new URL(request.url, 'http://x').pathname
  if (url === '/' || url === '/rooms') url = '/index.html'
  try {
    const body = await readFile(path.join(dist, path.normalize(url).replace(/^([/\\])+/, '')))
    for (const rule of rules) if (matches(rule.pattern, url)) for (const [name, value] of rule.headers) response.setHeader(name, value)
    response.setHeader('Content-Type', types[path.extname(url)] ?? 'application/octet-stream')
    response.end(body)
  } catch { response.statusCode = 404; response.end('Not found') }
})
await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const violations = []
  const page = await browser.newPage()
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    (window.__csp ||= []).push(`${event.violatedDirective} ${event.blockedURI}`)
  }))
  page.on('console', message => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()) })
  for (const route of ['/', '/rooms']) {
    const response = await page.goto(`http://127.0.0.1:4181${route}`, { waitUntil: 'networkidle' })
    assert.ok(response?.headers()['content-security-policy']?.includes("script-src 'self'"), `${route} is served with the CSP`)
    await page.locator('#root > *').first().waitFor()
    violations.push(...(await page.evaluate(() => window.__csp ?? [])))
  }
  const unexpected = violations.filter(text => !/connect-src.*(127\.0\.0\.1|localhost)|(127\.0\.0\.1|localhost).*connect-src/i.test(text))
  assert.deepEqual(unexpected, [], 'production pages must not trigger Content-Security-Policy violations')
  console.log(`PASS: production build renders / and /rooms under its own security headers (${violations.length - unexpected.length} local-Supabase connect reports ignored)`)
} finally {
  await browser.close()
  server.close()
}
