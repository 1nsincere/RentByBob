import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RentWorkspaceSnapshot } from '../src/access/saved-payments-model.ts'
import { buildSavedPaidRentReport, moneyFromMinor } from '../src/access/saved-paid-rent-report-model.ts'

const snapshot: RentWorkspaceSnapshot = {
  agreements: [
    { id: 'agreement-a', tenant_id: 'tenant-a', unit_id: 'unit-a', move_in: '2024-01-16', rent: '1000.00', balance: '700.40' },
    { id: 'agreement-b', tenant_id: 'tenant-b', unit_id: 'unit-b', move_in: '2024-01-16', rent: '800.00', balance: '100.00' },
  ],
  units: [
    { id: 'unit-a', label: 'Room 1', building_id: 'building-a' },
    { id: 'unit-b', label: 'Room 2', building_id: 'building-a' },
  ],
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
  ],
  verifiers: [],
  checks: [{
    id: 'check-cleared',
    agreement_id: 'agreement-b',
    reference: 'CHK-0001',
    amount: '700.00',
    received_on: '2024-04-20',
    check_date: '2024-04-19',
    collector: 'James',
    status: 'cleared',
    received_by: 'clerk-id',
    received_at: '2024-04-20T00:00:00Z',
    events: [],
  }],
  handovers: [],
  clerks: [],
}

const tenants = [
  { id: 'tenant-a', display_name: 'Fictional renter A', property_id: 'property-a', kind: 'individual', archived_at: null },
  { id: 'tenant-b', display_name: 'Fictional renter B', property_id: 'property-a', kind: 'individual', archived_at: null },
]

const labels = {
  tenantUnavailable: 'Tenant unavailable',
  buildingUnavailable: 'Building unavailable',
  roomUnavailable: 'Room unavailable',
}

test('saved paid report uses actual receipt month and excludes pending cash', () => {
  const april = buildSavedPaidRentReport(snapshot, tenants, '2024-04', '2024-04', labels)
  assert.deepEqual(april.confirmed.map(payment => payment.id), ['cash-a', 'cash-b'])
  assert.equal(moneyFromMinor(april.cashTotal), '20.30')
  assert.equal(april.paidTenantIds.size, 1)
  assert.equal(april.confirmed.length, 2)

  const march = buildSavedPaidRentReport(snapshot, tenants, '2024-03', '2024-04', labels)
  assert.deepEqual(march.confirmed.map(payment => payment.id), ['cash-march'])
})

test('saved paid report separates rent month, positive recorded balances, and distinct arrears months', () => {
  const april = buildSavedPaidRentReport(snapshot, tenants, '2024-04', '2024-04', labels)
  assert.deepEqual(april.outstanding.map(row => row.charge.id), ['charge-april-a', 'charge-april-b'])
  assert.equal(moneyFromMinor(april.outstandingTotal), '500.10')
  assert.equal(april.arrears.length, 1)
  assert.deepEqual(april.arrears[0].periods, ['2024-03-01', '2024-04-01'])
  assert.equal(moneyFromMinor(april.arrears[0].total), '700.40')

  const may = buildSavedPaidRentReport(snapshot, tenants, '2024-05', '2024-05', labels)
  assert.equal(may.outstanding.length, 0)
  assert.equal(moneyFromMinor(may.outstandingTotal), '0.00')
})

test('saved report money formatting retains exact centavos', () => {
  assert.equal(moneyFromMinor(99999999999999n), '999999999999.99')
})
