import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validAcknowledgment } from '../src/access/saved-payments-model.ts'

test('acknowledgment with advance credit is valid only when months plus credit equal the cash received', () => {
  const base = { number: 'RBB-1', tenant: 'Sample Renter', building: "Bob's house", room: 'Room 01', property: 'Fictional', amount: '7000.00', received_on: '2026-10-05', collector: 'Bob', issued_at: '2026-10-05T03:00:00Z', balance_at_issuance: '0.00', allocations: [{ month: '2026-10-01', amount: '3500.00' }] }
  assert.equal(validAcknowledgment({ ...base, advance_credit: '3500.00' }), true)
  assert.equal(validAcknowledgment({ ...base, advance_credit: '3499.99' }), false, 'a missing centavo is rejected')
  assert.equal(validAcknowledgment({ ...base, amount: '3500.00' }), true, 'older acknowledgments without credit still validate')
  assert.equal(validAcknowledgment({ ...base, allocations: [], advance_credit: '7000.00' }), true, 'paid entirely in advance')
  assert.equal(validAcknowledgment({ ...base, advance_credit: '-1.00' }), false)
})
