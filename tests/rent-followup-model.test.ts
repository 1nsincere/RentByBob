import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRentFollowUp, reminderText } from '../src/access/rent-followup-model.ts'
import type { RentWorkspaceSnapshot } from '../src/access/saved-payments-model.ts'

const id = (n: number) => '87000000-0000-4000-8000-' + String(n).padStart(12, '0')
const agreement = (n: number, tenant: number, unit: number, ended: string | null = null) => ({ id: id(n), tenant_id: id(tenant), unit_id: id(unit), move_in: '2026-01-05', rent: '3500.00', balance: '0.00', ended_on: ended, end_reason: ended ? 'Fictional' : null })
const charge = (n: number, agreementId: number, month: string, due: string, remaining: string) => ({ id: id(n), agreement_id: id(agreementId), rental_month: `${month}-01`, due_date: due, amount: '3500.00', remaining })
const data = {
  agreements: [agreement(10, 1, 20), agreement(11, 2, 21), agreement(12, 3, 22, '2026-09-30'), agreement(13, 4, 23)],
  units: [20, 21, 22, 23].map(n => ({ id: id(n), label: `Room 0${n - 19}`, building_id: id(30) })),
  buildings: [{ id: id(30), label: 'Building 1' }],
  charges: [
    charge(40, 10, '2026-09', '2026-09-05', '3500.00'), charge(41, 10, '2026-10', '2026-10-05', '1000.50'), charge(42, 10, '2026-11', '2026-11-05', '3500.00'),
    charge(43, 11, '2026-10', '2026-10-27', '3500.00'), // due today: not late, due soon
    charge(44, 12, '2026-09', '2026-09-10', '0.01'),
    charge(45, 13, '2026-10', '2026-10-20', '0.00'), charge(46, 13, '2026-11', '2026-11-03', '3500.00'),
  ],
  cash: [{ id: id(50), agreement_id: id(10), amount: '500.25', received_on: '2026-10-26', collector: 'Bob', confirmed_at: null }, { id: id(51), agreement_id: id(10), amount: '9.99', received_on: '2026-10-01', collector: 'Bob', confirmed_at: '2026-10-01T01:00:00Z' }],
  verifiers: [], checks: [], handovers: [], clerks: [],
} as unknown as RentWorkspaceSnapshot
const tenants = [1, 2, 3, 4].map(n => ({ id: id(n), display_name: `Sample Renter ${n}` }))

test('late rent lists only past-due months not covered by confirmed payments, oldest first, with pending shown separately', () => {
  const { late, dueSoon } = buildRentFollowUp(data, tenants, '2026-10-27')
  assert.deepEqual(late.map(row => [row.tenant, row.months, row.daysLate, row.overdue, row.pending, row.ended]), [
    ['Sample Renter 1', ['2026-09', '2026-10'], 52, '4500.50', '500.25', false],
    ['Sample Renter 3', ['2026-09'], 47, '0.01', '0.00', true],
  ])
  assert.equal(late[0].room, 'Building 1 · Room 01')
  assert.deepEqual(dueSoon.map(row => [row.tenant, row.dueDate, row.amount]), [['Sample Renter 2', '2026-10-27', '3500.00'], ['Sample Renter 4', '2026-11-03', '3500.00']])
  assert.deepEqual(buildRentFollowUp(data, tenants, '2026-10-27', 0).dueSoon.map(row => row.tenant), ['Sample Renter 2'])
})

test('reminder text contains only the renter\'s own figures in the chosen language', () => {
  const [row] = buildRentFollowUp(data, tenants, '2026-10-27').late
  const pesos = (value: string) => `PHP ${value}`
  const english = reminderText(row, 'en', pesos, month => month, day => day)
  assert.match(english, /^Hi Sample Renter 1, .*Building 1 · Room 01 of PHP 4500.50 \(2026-09, 2026-10\).*due 2026-09-05/)
  assert.doesNotMatch(english, /Sample Renter [234]|500\.25/)
  assert.match(reminderText(row, 'fil', pesos, month => month, day => day), /paalala mula sa RentByBob/)
})
