import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRememberStorage } from '../src/access/remember.ts'

const memory = () => { const map = new Map<string, string>(); return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) } }

// "Keep me signed in": the session goes to long-term storage for 30 days only when chosen; never the password.
test('keep me signed in stores the session in the right place and forgets it', () => {
  const long = memory(), short = memory(); let now = 1_000_000
  const r = createRememberStorage(long, short, () => now)
  r.storage.setItem('sb-x-auth-token', 'session-1')
  assert.equal(short.map.get('sb-x-auth-token'), 'session-1', 'not chosen: ends with the browser')
  assert.equal(long.map.has('sb-x-auth-token'), false)

  r.setRemember(true, 'tenant@example.invalid')
  r.storage.setItem('sb-x-auth-token', 'session-2')
  assert.equal(long.map.get('sb-x-auth-token'), 'session-2', 'chosen: kept on this device')
  assert.equal(short.map.has('sb-x-auth-token'), false)
  assert.equal(r.storage.getItem('sb-x-auth-token'), 'session-2')
  assert.equal(r.rememberedEmail(), 'tenant@example.invalid')
  assert.ok(![...long.map.values()].some(value => /password/i.test(value)))

  now += 31 * 86_400_000 // after 30 days the kept sign-in is gone
  assert.equal(r.storage.getItem('sb-x-auth-token'), null)
  assert.equal(long.map.has('sb-x-auth-token'), false)
  assert.equal(r.rememberedEmail(), '')

  r.setRemember(true, 'tenant@example.invalid'); r.storage.setItem('sb-x-auth-token', 'session-3')
  r.storage.removeItem('sb-x-auth-token'); r.setRemember(false) // signing out
  assert.equal(r.storage.getItem('sb-x-auth-token'), null)
  assert.equal(long.map.size, 0)
})
