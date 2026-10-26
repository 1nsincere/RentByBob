import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterWorklist, fromCents, planOldestFirst, toCents, worklistRows } from '../src/access/simple-payments-model.ts'
import type { RentWorkspaceSnapshot } from '../src/access/saved-payments-model.ts'

test('cash plan covers the oldest unpaid month first in exact centavos and refuses advance payment', () => {
  const charges = [
    { id: 'b', rental_month: '2026-10-01', due_date: '2026-10-05', remaining: '3500.00' },
    { id: 'a', rental_month: '2026-09-01', due_date: '2026-09-05', remaining: '0.10' },
    { id: 'c', rental_month: '2026-08-01', due_date: '2026-08-05', remaining: '0.00' },
  ]
  assert.deepEqual(planOldestFirst(charges, '0.30'), [{ month: '2026-09', amount: '0.10', settles: true }, { month: '2026-10', amount: '0.20', settles: false }])
  assert.deepEqual(planOldestFirst(charges, '3500.10'), [{ month: '2026-09', amount: '0.10', settles: true }, { month: '2026-10', amount: '3500.00', settles: true }])
  assert.throws(() => planOldestFirst(charges, '3500.11'), /Advance payments/)
  assert.throws(() => planOldestFirst(charges, '0'), /greater than zero/)
  assert.throws(() => planOldestFirst(charges, '1.234'), /like 2500/)
  assert.equal(fromCents(toCents('1234567.8')), '1234567.80')
})

test('worklist shows one row per agreement and filters waiting, unpaid and not-set-up accounts', () => {
  const data = {
    agreements: [
      { id: 'g1', tenant_id: 't1', unit_id: 'u1', move_in: '2026-09-05', rent: '3500.00', balance: '3500.00', ended_on: null, end_reason: null },
      { id: 'g2', tenant_id: 't2', unit_id: 'u2', move_in: '2026-10-01', rent: '2500.00', balance: '0.00', ended_on: null, end_reason: null },
    ],
    units: [{ id: 'u1', label: 'Room 01', building_id: 'b1' }, { id: 'u2', label: 'Room 02', building_id: 'b1' }],
    buildings: [{ id: 'b1', label: "Bob's house" }],
    charges: [{ id: 'c1', agreement_id: 'g1', rental_month: '2026-10-01', due_date: '2026-10-05', amount: '3500.00', remaining: '3500.00' }],
    cash: [{ id: 'k1', agreement_id: 'g1', amount: '100.00', received_on: '2026-10-06', collector: 'Bob', confirmed_at: null, acknowledgment: null }],
    verifiers: [], checks: [], handovers: [], clerks: [],
  } as unknown as RentWorkspaceSnapshot
  const rows = worklistRows(data, [{ id: 't1', display_name: 'Sample Renter' }, { id: 't2', display_name: 'Sample Shop' }])
  assert.deepEqual(rows[0], { agreementId: 'g1', tenant: 'Sample Renter', location: "Bob's house · Room 01", balance: '3500.00', pending: 1, charges: 1, ended: false })
  assert.deepEqual(filterWorklist(rows, 'pending', '').map(r => r.agreementId), ['g1'])
  assert.deepEqual(filterWorklist(rows, 'unpaid', '').map(r => r.agreementId), ['g1'])
  assert.deepEqual(filterWorklist(rows, 'setup', '').map(r => r.agreementId), ['g2'])
  assert.deepEqual(filterWorklist(rows, 'all', 'room 02').map(r => r.agreementId), ['g2'])
})
