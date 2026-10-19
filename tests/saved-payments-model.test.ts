import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasPositiveSavedBalance, savedCashFitsBalance } from '../src/access/saved-payments-model.ts'

test('saved cash amount cannot exceed the exact outstanding balance', () => {
  assert.equal(savedCashFitsBalance('0.01', '0.10'), true)
  assert.equal(savedCashFitsBalance('5000.25', '5000.25'), true)
  assert.equal(savedCashFitsBalance('5000.26', '5000.25'), false)
  assert.equal(savedCashFitsBalance('0.01', '0.00'), false)
  assert.equal(savedCashFitsBalance('0', '100.00'), false)
})

test('saved balance parsing rejects malformed, excessive-precision and out-of-range values', () => {
  for (const value of ['1.001', '-1.00', '1e3', '1000000000000.00', '']) {
    assert.equal(hasPositiveSavedBalance(value), false)
    assert.equal(savedCashFitsBalance(value, '100.00'), false)
  }
  assert.equal(hasPositiveSavedBalance('0.01'), true)
  assert.equal(hasPositiveSavedBalance('0.00'), false)
})
