import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDLE_GRACE_MS, IDLE_WARN_MS, idleState, secondsLeft } from '../src/access/idle-model.ts'

test('staff idle timer warns at 30 minutes and signs out 2 minutes later', () => {
  const start = 1_000_000
  assert.equal(idleState(start + IDLE_WARN_MS - 1, start), 'active')
  assert.equal(idleState(start + IDLE_WARN_MS, start), 'warn')
  assert.equal(secondsLeft(start + IDLE_WARN_MS, start), 120)
  assert.equal(idleState(start + IDLE_WARN_MS + IDLE_GRACE_MS - 1, start), 'warn')
  assert.equal(idleState(start + IDLE_WARN_MS + IDLE_GRACE_MS, start), 'expired')
  assert.equal(secondsLeft(start + IDLE_WARN_MS + IDLE_GRACE_MS + 5000, start), 0)
  assert.equal(idleState(start - 5000, start), 'active', 'clock skew from another tab never expires early')
})
