import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chargeStatus, parseRenterAccount, summarizeAgreement } from '../src/access/renter-account-model.ts'

const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const acknowledgment = {
  number: `RBB-${id(50)}`, title: 'Cash Payment Acknowledgment', payment_id: id(50), tenant: 'Sample Renter A', building: 'Sample building',
  room: 'Room A', property: 'Fictional property', amount: '5000.00', received_on: '2024-02-14', collector: 'Bob',
  issued_at: '2024-02-15T02:00:00+00:00', balance_at_issuance: '5000.00', currency: 'PHP', notice: 'Payment acknowledgment only.',
  allocations: [{ month: '2024-02-01', amount: '5000.00' }],
}
function fixture() {
  return {
    tenants: [{
      id: id(1), display_name: 'Sample Renter A', kind: 'individual', property: 'Fictional property',
      agreements: [{
        id: id(2), building: 'Sample building', room: 'Room A', move_in: '2024-01-15', rent: '5000.00', balance: '3500.00',
        charges: [
          { id: id(3), rental_month: '2024-02-01', due_date: '2024-02-15', amount: '5000.00', remaining: '0.00' },
          { id: id(4), rental_month: '2024-03-01', due_date: '2024-03-15', amount: '5000.00', remaining: '3500.00' },
        ],
        payments: [
          { kind: 'cash', id: id(50), amount: '5000.00', received_on: '2024-02-14', confirmed_at: '2024-02-15T02:00:00+00:00', months: [{ month: '2024-02-01', amount: '5000.00' }], acknowledgment },
          { kind: 'check', id: id(60), reference: 'CHK-0001', amount: '1500.00', received_on: '2024-03-10', confirmed_at: '2024-03-20T02:00:00+00:00', months: [{ month: '2024-03-01', amount: '1500.00' }] },
        ],
        unconfirmed: [
          { kind: 'cash', id: id(51), amount: '1000.00', received_on: '2024-03-05' },
          { kind: 'check', id: id(61), reference: 'CHK-0002', amount: '700.50', received_on: '2024-03-12', status: 'received' },
        ],
      }],
    }],
  }
}

test('renter account summary keeps unconfirmed money separate from the balance', () => {
  const account = parseRenterAccount(fixture())
  const agreement = account.tenants[0].agreements[0]
  const summary = summarizeAgreement(agreement)
  assert.equal(agreement.balance, '3500.00')
  assert.equal(summary.oldestUnpaid?.rental_month, '2024-03-01')
  assert.equal(summary.monthsWithBalance, 1)
  assert.equal(summary.unconfirmedTotal, '1700.50', 'exact centavo total of pending items')
  assert.deepEqual(summary.payments.map(payment => payment.id), [id(60), id(50)], 'newest received first')
  assert.deepEqual(agreement.charges.map(chargeStatus), ['paid', 'partly-paid'])
  assert.equal(chargeStatus({ ...agreement.charges[1], remaining: '5000.00' }), 'unpaid')
})

test('an empty renter account is valid', () => {
  assert.deepEqual(parseRenterAccount({ tenants: [] }), { tenants: [] })
})

test('malformed or inconsistent renter data is rejected rather than displayed', () => {
  const broken: Array<[string, (value: any) => void]> = [
    ['float money', value => { value.tenants[0].agreements[0].balance = 3500 }],
    ['three decimals', value => { value.tenants[0].agreements[0].charges[1].remaining = '3500.001' }],
    ['balance not matching charges', value => { value.tenants[0].agreements[0].balance = '3400.00' }],
    ['remaining above charge', value => { value.tenants[0].agreements[0].charges[0].remaining = '5000.01' }],
    ['payment months not adding up', value => { value.tenants[0].agreements[0].payments[1].months[0].amount = '1400.00' }],
    ['unconfirmed payment listed as paid', value => { value.tenants[0].agreements[0].payments[1].confirmed_at = null }],
    ['acknowledgment amount mismatch', value => { value.tenants[0].agreements[0].payments[0].acknowledgment.amount = '4000.00' }],
    ['unknown check status', value => { value.tenants[0].agreements[0].unconfirmed[1].status = 'cleared' }],
    ['unknown tenant kind', value => { value.tenants[0].kind = 'family' }],
    ['impossible date', value => { value.tenants[0].agreements[0].charges[0].due_date = '2024-02-30' }],
  ]
  for (const [name, mutate] of broken) {
    const value = fixture()
    mutate(value)
    assert.throws(() => parseRenterAccount(value), /Invalid renter account response/, name)
  }
})
