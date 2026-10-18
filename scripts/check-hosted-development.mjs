import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Read-only network checks: no signup, login, email, fixture or financial writes.
try {
  const { url, key } = JSON.parse(readFileSync(new URL('../.env.hosted-development.local', import.meta.url), 'utf8'))
  assert.equal(url, 'https://vyzexanzktskvjxjpphp.supabase.co')
  assert.match(key, /^sb_publishable_[A-Za-z0-9_-]+$/)
  const request = (path, options = {}) => fetch(url + path, {
    ...options, headers: { apikey: key, ...options.headers }, signal: AbortSignal.timeout(15000),
  })
  const settingsResponse = await request('/auth/v1/settings')
  assert.equal(settingsResponse.status, 200)
  const settings = await settingsResponse.json()
  console.log(`Hosted Auth reachable; public signup disabled: ${settings.disable_signup === true}; anonymous sign-in disabled: ${settings.external?.anonymous_users === false}`)
  for (const name of ['properties', 'staff_memberships', 'tenants', 'tenant_contacts', 'audit_events', 'buildings', 'units']) {
    const response = await request(`/rest/v1/${name}?select=*&limit=1`)
    assert.ok([401, 403].includes(response.status), 'Anonymous table read was not denied')
  }
  console.log('Anonymous reads denied for all seven application tables.')
  const rpc = await request('/rest/v1/rpc/my_access_state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.ok([401, 403].includes(rpc.status))
  const edge = await request('/functions/v1/invite-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(edge.status, 401)
  const options = await request('/functions/v1/invite-account', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } })
  assert.equal(options.status, 204)
  assert.equal(options.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5173')
  const badOrigin = await request('/functions/v1/invite-account', { method: 'OPTIONS', headers: { Origin: 'https://unapproved.invalid' } })
  assert.equal(badOrigin.status, 403)
  console.log('Anonymous RPC/function access denied; Edge runtime and exact-origin CORS verified.')
  assert.equal(settings.disable_signup, true, 'Public signup must be disabled before use')
  assert.equal(settings.external?.anonymous_users, false)
  console.log('Hosted read-only connection checks passed. Authenticated/MFA and redirect checks remain separate.')
} catch {
  console.error('Hosted check incomplete or failed. Check Auth settings and connection; no response bodies or credentials are displayed.')
  process.exitCode = 1
}
