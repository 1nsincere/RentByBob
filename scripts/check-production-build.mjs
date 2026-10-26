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

console.log(`Production artifact verified: ${javascriptFiles.length} JavaScript chunk(s), ${stylesheetFiles.length} stylesheet(s); no public availability preview code.`)
