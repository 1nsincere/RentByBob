import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStatementEvents, hasPositiveSavedBalance, savedCashFitsBalance } from '../src/access/saved-payments-model.ts'

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

test('account statement includes charges and confirmed cash but excludes pending cash', () => {
  const charges = [
    { id: 'feb-charge', rental_month: '2026-02-01', due_date: '2026-02-16', amount: '1000.00', remaining: '0.00' },
    { id: 'mar-charge', rental_month: '2026-03-01', due_date: '2026-03-16', amount: '1000.00', remaining: '400.00' },
  ]
  const cash = [
    {
      id: 'confirmed-cash',
      amount: '1600.00',
      received_on: '2026-03-16',
      collector: 'James',
      confirmed_at: '2026-03-16T05:00:00Z',
      acknowledgment: { allocations: [
        { month: '2026-02-01', amount: '1000.00' },
        { month: '2026-03-01', amount: '600.00' },
      ] },
    },
    {
      id: 'pending-cash',
      amount: '400.00',
      received_on: '2026-03-16',
      collector: 'Bob',
      confirmed_at: null,
      acknowledgment: null,
    },
  ]

  const events = buildStatementEvents(charges, cash)
  assert.deepEqual(events.map(event => `${event.kind}:${event.id}`), [
    'charge:feb-charge',
    'charge:mar-charge',
    'payment:confirmed-cash',
  ])
  const payment = events[2]
  assert.equal(payment.kind, 'payment')
  if (payment.kind === 'payment') {
    assert.deepEqual(payment.allocations, [
      { month: '2026-02-01', amount: '1000.00' },
      { month: '2026-03-01', amount: '600.00' },
    ])
    assert.equal(payment.amount, '1600.00')
  }
})

test('same-day statement puts rent charge before confirmed payment', () => {
  const events = buildStatementEvents(
    [{ id: 'charge', rental_month: '2026-04-01', due_date: '2026-04-16', amount: '10.00', remaining: '0.00' }],
    [{ id: 'payment', amount: '10.00', received_on: '2026-04-16', collector: 'James', confirmed_at: '2026-04-16T01:00:00Z', acknowledgment: { allocations: [] } }],
  )
  assert.deepEqual(events.map(event => event.kind), ['charge', 'payment'])
})
