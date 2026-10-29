import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, 'dist')
const htmlPath = path.join(outputDirectory, 'index.html')
const html = await readFile(htmlPath, 'utf8')
const assetDirectory = path.join(outputDirectory, 'assets')
const assetFiles = await readdir(assetDirectory)
const javascriptFiles = assetFiles.filter(file => file.endsWith('.js'))
const stylesheetFiles = assetFiles.filter(file => file.endsWith('.css'))

assert.ok(javascriptFiles.length > 0, 'production build must contain JavaScript')
assert.ok(stylesheetFiles.length > 0, 'production build must contain CSS')
assert.ok(javascriptFiles.some(file => html.includes(`/assets/${file}`)),
  'index.html must reference an emitted JavaScript entry chunk')
assert.ok(stylesheetFiles.some(file => html.includes(`/assets/${file}`)),
  'index.html must reference an emitted stylesheet')

const javascript = await Promise.all(javascriptFiles.map(file => readFile(path.join(assetDirectory, file), 'utf8')))
const bundle = javascript.join('\n')
for (const deferredScreen of ['SavedPayments', 'PropertyLocations', 'ManageAccess', 'AccessAudit', 'InvitationReconciliation']) {
  assert.ok(javascriptFiles.some(file => file.startsWith(`${deferredScreen}-`)),
    `production build must keep ${deferredScreen} in a deferred screen chunk`)
}
for (const developmentOnlyMarker of [
  'Rooms shown as available',
  'PublicAvailabilityPreview',
  'Sample screen loaded',
  'Fictional renter preview',
  'Fictional sample boarding houses',
  // Preview fixture tenants must never ship in the production app.
  'Sample Alex Santos',
  'Sample Corner Shop',
  'RenterPortalPreview',
  'availability=preview',
]) {
  assert.ok(!bundle.includes(developmentOnlyMarker),
    `production JavaScript must not include development-only preview or test marker: ${developmentOnlyMarker}`)
}

// Cloudflare Pages security headers ship with the build and keep their key protections.
const headers = await readFile(path.join(outputDirectory, '_headers'), 'utf8')
for (const required of ["script-src 'self'", "frame-ancestors 'none'", "object-src 'none'", 'X-Content-Type-Options: nosniff', 'Referrer-Policy:', 'Strict-Transport-Security:', 'Cross-Origin-Resource-Policy: same-origin', 'Cross-Origin-Opener-Policy: same-origin']) {
  assert.ok(headers.includes(required), `dist/_headers must keep: ${required}`)
}
// Every HTML route must stay uncached so a new release (and any security fix) reaches everyone at once.
for (const route of ['/', '/index.html', '/rooms', '/sign-in', '/auth/callback']) {
  assert.ok(headers.includes(`\n${route}\n  Cache-Control: no-cache`), `dist/_headers must keep the HTML route ${route} uncached`)
}
// connect-src must name only the approved Supabase project, never a wildcard that lets script talk to any Supabase project.
assert.ok(!headers.includes('*.supabase.co'), 'dist/_headers must not allow every Supabase project in connect-src')
assert.ok(/connect-src[^;]*https:\/\/[a-z0-9]{20}\.supabase\.co/.test(headers), 'dist/_headers connect-src must name the approved Supabase project')
assert.ok(!/unsafe-eval/.test(headers) && !/script-src[^;]*unsafe-inline/.test(headers), 'dist/_headers must not allow eval or inline scripts')
assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), 'index.html must not contain inline scripts (blocked by the CSP)')
const redirects = await readFile(path.join(outputDirectory, '_redirects'), 'utf8')
assert.ok(/^\/rooms \/index\.html 200$/m.test(redirects), 'dist/_redirects must serve /rooms')

console.log(`Production artifact verified: ${javascriptFiles.length} JavaScript chunk(s), ${stylesheetFiles.length} stylesheet(s); no public availability preview code; security headers and redirects present.`)
