import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RentWorkspaceSnapshot } from '../src/access/saved-payments-model.ts'
import { buildCollectionsOverview } from '../src/access/collections-overview-model.ts'

const snapshot: RentWorkspaceSnapshot = {
  agreements: [
    { id: 'agreement-a', tenant_id: 'tenant-a', unit_id: 'unit-a', move_in: '2024-01-16', rent: '1000.00', balance: '700.40' },
    { id: 'agreement-b', tenant_id: 'tenant-b', unit_id: 'unit-b', move_in: '2024-01-16', rent: '800.00', balance: '100.00' },
  ],
  units: [{ id: 'unit-a', label: 'Room 1', building_id: 'building-a' }, { id: 'unit-b', label: 'Room 2', building_id: 'building-a' }],
  buildings: [{ id: 'building-a', label: 'Building A' }],
  charges: [
    { id: 'charge-april-a', agreement_id: 'agreement-a', rental_month: '2024-04-01', due_date: '2024-04-16', amount: '1000.00', remaining: '400.10' },
    { id: 'charge-march-a', agreement_id: 'agreement-a', rental_month: '2024-03-01', due_date: '2024-03-16', amount: '500.00', remaining: '300.30' },
    { id: 'charge-april-b', agreement_id: 'agreement-b', rental_month: '2024-04-01', due_date: '2024-04-16', amount: '800.00', remaining: '100.00' },
  ],
  cash: [
    { id: 'cash-a', agreement_id: 'agreement-a', amount: '20.10', received_on: '2024-04-30', collector: 'James', confirmed_at: '2024-05-02T00:00:00Z', acknowledgment: null },
    { id: 'cash-b', agreement_id: 'agreement-a', amount: '0.20', received_on: '2024-04-01', collector: 'James', confirmed_at: '2024-04-03T00:00:00Z', acknowledgment: null },
    { id: 'cash-march', agreement_id: 'agreement-b', amount: '90.00', received_on: '2024-03-31', collector: 'James', confirmed_at: '2024-04-01T00:00:00Z', acknowledgment: null },
    { id: 'cash-pending', agreement_id: 'agreement-b', amount: '999.99', received_on: '2024-04-20', collector: 'Bob', confirmed_at: null, acknowledgment: null },
    { id: 'cash-pending-2', agreement_id: 'agreement-a', amount: '0.02', received_on: '2024-04-21', collector: 'Bob', confirmed_at: null, acknowledgment: null },
  ],
  verifiers: [],
  checks: [
    { id: 'check-cleared', agreement_id: 'agreement-b', reference: 'CHK-0001', amount: '700.00', received_on: '2024-04-20', check_date: '2024-04-19', collector: 'James', status: 'cleared', received_by: 'clerk-id', received_at: '2024-04-20T00:00:00Z', events: [] },
    { id: 'check-received', agreement_id: 'agreement-a', reference: 'CHK-0002', amount: '50.05', received_on: '2024-04-22', check_date: '2024-04-22', collector: 'Bob', status: 'received', received_by: 'clerk-id', received_at: '2024-04-22T00:00:00Z', events: [] },
    { id: 'check-deposited', agreement_id: 'agreement-b', reference: 'CHK-0003', amount: '10.00', received_on: '2024-04-23', check_date: '2024-04-23', collector: 'Bob', status: 'deposited', received_by: 'clerk-id', received_at: '2024-04-23T00:00:00Z', events: [] },
    { id: 'check-returned', agreement_id: 'agreement-b', reference: 'CHK-0004', amount: '5.00', received_on: '2024-04-24', check_date: '2024-04-24', collector: 'Bob', status: 'returned', received_by: 'clerk-id', received_at: '2024-04-24T00:00:00Z', events: [] },
  ],
  handovers: [],
  clerks: [],
}
const tenants = [{ id: 'tenant-a', display_name: 'Sample A' }, { id: 'tenant-b', display_name: 'Sample B' }]

test('dashboard collections use report definitions and keep unconfirmed money separate', () => {
  const april = buildCollectionsOverview(snapshot, tenants, '2024-04')
  assert.deepEqual(april, {
    month: '2024-04',
    confirmedCash: '20.30',
    confirmedPayments: 2,
    pendingCash: { count: 2, total: '1000.01' },
    unclearedChecks: { count: 2, total: '60.05' },
    dueThisMonth: { renters: 2, total: '500.10' },
    multipleMonthsRenters: 1,
  })
})

test('a month without recorded charges or receipts reports zero, not unpaid', () => {
  const june = buildCollectionsOverview(snapshot, tenants, '2024-06')
  assert.equal(june.confirmedCash, '0.00')
  assert.deepEqual(june.dueThisMonth, { renters: 0, total: '0.00' })
  assert.equal(june.multipleMonthsRenters, 1, 'arrears count is across recorded months, not the selected month')
})
