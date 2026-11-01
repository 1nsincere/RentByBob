import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestSnapshot, requestState, trackRequests } from '../src/components/requests.ts'

// The slow-connection bar and notice only appear after a request has waited a while, never for quick answers.
test('request state turns busy, then slow, only while something is waiting', () => {
  assert.equal(requestState({ pending: 0, wait: 0 }), 'idle')
  assert.equal(requestState({ pending: 1, wait: 300 }), 'idle')
  assert.equal(requestState({ pending: 1, wait: 700 }), 'busy')
  assert.equal(requestState({ pending: 2, wait: 7000 }), 'slow')
})

test('tracked requests are counted while waiting and released when they finish or fail', async () => {
  let finish!: () => void
  const slow = trackRequests(() => new Promise<Response>(resolve => { finish = () => resolve(new Response('ok')) }))
  const failing = trackRequests(() => Promise.reject(new Error('offline')))
  const waiting = slow('https://example.invalid')
  assert.equal(requestSnapshot().pending, 1)
  await assert.rejects(failing('https://example.invalid'))
  assert.equal(requestSnapshot().pending, 1)
  finish()
  await waiting
  assert.equal(requestSnapshot().pending, 0)
  assert.equal(requestSnapshot().wait, 0)
})
