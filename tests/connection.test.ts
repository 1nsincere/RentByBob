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
