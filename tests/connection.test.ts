import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionAllowed, hostedDevelopmentUrl } from '../src/access/connection.ts'

test('hosted development requires explicit target, exact project and a development build', () => {
  assert.equal(connectionAllowed('http://127.0.0.1:54321', undefined, true), true)
  assert.equal(connectionAllowed(hostedDevelopmentUrl, 'hosted-development', true), true)
  assert.equal(connectionAllowed(hostedDevelopmentUrl, undefined, true), false)
  assert.equal(connectionAllowed(hostedDevelopmentUrl, 'hosted-development', false), false)
  assert.equal(connectionAllowed('http://127.0.0.1:64321', 'isolated-cash-test', true), true)
  assert.equal(connectionAllowed('http://127.0.0.1:64321', 'isolated-cash-test', false), false)
  assert.equal(connectionAllowed('http://127.0.0.1:0', 'isolated-cash-test', true), false)
  assert.equal(connectionAllowed('http://127.0.0.1:65536', 'isolated-cash-test', true), false)
  assert.equal(connectionAllowed('https://example.invalid', 'isolated-cash-test', true), false)
  for (const url of [undefined, 'https://other.supabase.co', hostedDevelopmentUrl + '.evil.invalid', hostedDevelopmentUrl + '/']) {
    assert.equal(connectionAllowed(url, 'hosted-development', true), false)
  }
})

test('staging connects only to the exact pinned project with an explicit staging target', () => {
  const pinned = 'https://abcdefghijklmnopqrst.supabase.co'
  assert.equal(connectionAllowed(pinned, 'staging', false, null), false, 'no staging project pinned yet: staging cannot connect')
  assert.equal(connectionAllowed(pinned, 'staging', false, pinned), true, 'production-style staging build with the pinned project')
  assert.equal(connectionAllowed(pinned, undefined, false, pinned), false, 'staging target must be explicit')
  assert.equal(connectionAllowed(pinned, 'hosted-development', true, pinned), false)
  for (const url of [undefined, 'https://zyxwvutsrqponmlkjihg.supabase.co', pinned + '/', pinned + '.evil.invalid', 'http://abcdefghijklmnopqrst.supabase.co', hostedDevelopmentUrl]) {
    assert.equal(connectionAllowed(url, 'staging', false, pinned), false, `rejects ${url}`)
  }
  for (const badPin of ['https://short.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co/', 'https://ABCDEFGHIJKLMNOPQRST.supabase.co', hostedDevelopmentUrl]) {
    assert.equal(connectionAllowed(badPin, 'staging', false, badPin), false, `refuses malformed or development pin ${badPin}`)
  }
})

test('production (client trial) connects only to its exact pinned project with an explicit production target', () => {
  const live = 'https://abcdefghijklmnopqrst.supabase.co', staging = 'https://zyxwvutsrqponmlkjihg.supabase.co'
  assert.equal(connectionAllowed(live, 'production', false, null, null), false, 'nothing pinned: the live build cannot connect')
  assert.equal(connectionAllowed(live, 'production', false, staging, live), true)
  assert.equal(connectionAllowed(live, undefined, false, null, live), false, 'production target must be explicit')
  assert.equal(connectionAllowed(live, 'staging', false, null, live), false, 'a staging build cannot reach the live project')
  assert.equal(connectionAllowed(staging, 'production', false, staging, live), false, 'a production build cannot reach staging')
  assert.equal(connectionAllowed(live, 'production', false, live, live), false, 'staging and live must be different projects')
  for (const badPin of ['https://short.supabase.co', live + '/', hostedDevelopmentUrl]) {
    assert.equal(connectionAllowed(badPin, 'production', false, null, badPin), false, `refuses malformed or development pin ${badPin}`)
  }
})
