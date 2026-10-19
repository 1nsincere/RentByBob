import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStatementEvents, hasPositiveSavedBalance, parseRentWorkspaceSnapshot, savedCashFitsBalance } from '../src/access/saved-payments-model.ts'

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

const statementFixture = () => ({
  agreements: [{
    id: '11111111-1111-4111-8111-111111111111',
    tenant_id: '22222222-2222-4222-8222-222222222222',
    unit_id: '33333333-3333-4333-8333-333333333333',
    move_in: '2026-01-16',
    rent: '1000.00',
    balance: '400.00',
  }],
  units: [{ id: '33333333-3333-4333-8333-333333333333', label: 'Room 1', building_id: '44444444-4444-4444-8444-444444444444' }],
  charges: [{
    id: '55555555-5555-4555-8555-555555555555',
    agreement_id: '11111111-1111-4111-8111-111111111111',
    rental_month: '2026-04-01',
    due_date: '2026-04-16',
    amount: '1000.00',
    remaining: '400.00',
  }],
  cash: [{
    id: '66666666-6666-4666-8666-666666666666',
    agreement_id: '11111111-1111-4111-8111-111111111111',
    amount: '600.00',
    received_on: '2026-04-16',
    collector: 'James',
    confirmed_at: '2026-04-16T05:00:00Z',
    acknowledgment: {
      number: 'RBB-example',
      tenant: 'Example Tenant',
      building: 'Example Building',
      room: 'Room 1',
      property: 'Example Property',
      amount: '600.00',
      received_on: '2026-04-16',
      collector: 'James',
      issued_at: '2026-04-16T05:00:00Z',
      balance_at_issuance: '400.00',
      allocations: [{ month: '2026-04-01', amount: '600.00' }],
    },
  }],
  verifiers: [{ user_id: '77777777-7777-4777-8777-777777777777' }],
  buildings: [{ id: '44444444-4444-4444-8444-444444444444', label: 'Example Building' }],
})

test('saved rent workspace accepts exact, internally consistent financial records', () => {
  const snapshot = parseRentWorkspaceSnapshot(statementFixture())
  assert.equal(snapshot.agreements[0].balance, '400.00')
  assert.equal(snapshot.cash[0].acknowledgment?.allocations[0].amount, '600.00')
})

test('saved rent workspace retains agreements whose archived unit is absent from active location results', () => {
  const snapshot = statementFixture()
  snapshot.agreements[0].unit_id = '88888888-8888-4888-8888-888888888888'
  assert.equal(parseRentWorkspaceSnapshot(snapshot).agreements.length, 1)
})

test('saved rent workspace accepts a zero-balance agreement without recorded charges', () => {
  const snapshot = statementFixture()
  snapshot.agreements[0].balance = '0'
  snapshot.charges = []
  snapshot.cash = []
  assert.equal(parseRentWorkspaceSnapshot(snapshot).agreements[0].balance, '0')
})

test('saved rent workspace rejects malformed money, dates and relationship totals', () => {
  const malformedMoney = statementFixture()
  malformedMoney.charges[0].amount = '1000.000'
  assert.throws(() => parseRentWorkspaceSnapshot(malformedMoney), /Invalid rent workspace response/)

  const malformedDate = statementFixture()
  malformedDate.charges[0].due_date = '2026-02-30'
  assert.throws(() => parseRentWorkspaceSnapshot(malformedDate), /Invalid rent workspace response/)

  const inconsistentBalance = statementFixture()
  inconsistentBalance.agreements[0].balance = '399.99'
  assert.throws(() => parseRentWorkspaceSnapshot(inconsistentBalance), /Invalid rent workspace response/)

  const inconsistentAcknowledgment = statementFixture()
  inconsistentAcknowledgment.cash[0].acknowledgment.allocations[0].amount = '599.99'
  assert.throws(() => parseRentWorkspaceSnapshot(inconsistentAcknowledgment), /Invalid rent workspace response/)
})

test('saved rent workspace rejects unsettled cash with a confirmation acknowledgment', () => {
  const snapshot = statementFixture()
  snapshot.cash[0].confirmed_at = null
  assert.throws(() => parseRentWorkspaceSnapshot(snapshot), /Invalid rent workspace response/)
})

test('saved rent workspace rejects duplicate record IDs and agreements for tenants outside the property result', () => {
  const duplicate = statementFixture()
  duplicate.buildings.push({ ...duplicate.buildings[0] })
  assert.throws(() => parseRentWorkspaceSnapshot(duplicate), /Invalid rent workspace response/)

  assert.throws(
    () => parseRentWorkspaceSnapshot(statementFixture(), [{ id: '99999999-9999-4999-8999-999999999999' }]),
    /Invalid rent workspace response/,
  )
})
