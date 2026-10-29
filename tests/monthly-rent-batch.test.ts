import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingMonthlyCharges } from '../src/access/monthly-rent-batch-model.ts'

const agreement = (id: string, moveIn: string, rent: string, endedOn: string | null = null) =>
  ({ id, tenant_id: `t-${id}`, unit_id: `u-${id}`, move_in: moveIn, rent, balance: '0.00', ended_on: endedOn, end_reason: endedOn ? 'Moved out' : null })
const data = {
  agreements: [
    agreement('a', '2024-01-31', '5000.00'),
    agreement('b', '2024-02-10', '4500.50'),
    agreement('c', '2024-04-05', '3000.00'),
    agreement('ended-march', '2023-06-15', '2500.00', '2024-03-20'),
    agreement('ended-april', '2023-06-15', '2500.00', '2024-04-01'),
  ],
  charges: [{ id: 'charge-b-april', agreement_id: 'b', rental_month: '2024-04-01', due_date: '2024-04-10', amount: '4500.50', remaining: '4500.50' }],
}

test('lists agreements missing the selected month with the database due-date rule', () => {
  assert.deepEqual(missingMonthlyCharges(data, '2024-02').map(item => [item.agreement.id, item.dueDate, item.amount]),
    [['b', '2024-02-10', '4500.50'], ['ended-april', '2024-02-15', '2500.00'], ['ended-march', '2024-02-15', '2500.00'], ['a', '2024-02-29', '5000.00']])
})

test('skips charged months, agreements not yet started, and months after move-out', () => {
  assert.deepEqual(missingMonthlyCharges(data, '2024-04').map(item => item.agreement.id), ['c', 'ended-april', 'a'],
    'b is already charged; ended-march ended before April; ended-april ends on April 1 so April is a full month')
  assert.deepEqual(missingMonthlyCharges(data, '2024-03').map(item => item.agreement.id), ['b', 'ended-april', 'ended-march', 'a'])
  assert.deepEqual(missingMonthlyCharges(data, '2024-13'), [])
})
