import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maintenanceTotal, parseMaintenance, validAmountInput } from '../src/access/maintenance-model.ts'

test('maintenance totals are exact in centavos', () => {
  assert.equal(maintenanceTotal([]), '0.00')
  assert.equal(maintenanceTotal([{ amount: '0.10' }, { amount: '0.20' }]), '0.30', 'no floating point drift')
  assert.equal(maintenanceTotal([{ amount: '1250.50' }, { amount: '300.00' }, { amount: '0.05' }]), '1550.55')
  assert.equal(maintenanceTotal([{ amount: '999999999.99' }, { amount: '0.01' }]), '1000000000.00')
})

test('amount input accepts pesos with up to two decimals above zero only', () => {
  for (const ok of ['1', '1250', '1250.5', '1250.50', ' 12.30 ']) assert.equal(validAmountInput(ok), true, ok)
  for (const bad of ['', '0', '0.00', '-5', '1,250', '12.345', 'abc', '1e3', '1234567890']) assert.equal(validAmountInput(bad), false, bad)
})

test('maintenance data from the database is read strictly', () => {
  const row = { id: 'a', month: '2026-10', description: 'Fix roof', place: null, amount: '1250.50', recorded_by: 'u', recorded_at: '2026-10-28T01:00:00Z' }
  assert.deepEqual(parseMaintenance([row])[0], { id: 'a', month: '2026-10', description: 'Fix roof', place: null, amount: '1250.50', recordedBy: 'u', recordedAt: '2026-10-28T01:00:00Z' })
  assert.deepEqual(parseMaintenance([]), [])
  assert.throws(() => parseMaintenance([{ ...row, amount: 1250.5 }]), /Unexpected/)
  assert.throws(() => parseMaintenance([{ ...row, month: '2026-13' }]), /Unexpected/)
  assert.throws(() => parseMaintenance({}), /Unexpected/)
})

test('paid rent minus maintenance is exact and shows a shortfall as negative', async () => {
  const { netAfterMaintenance } = await import('../src/access/maintenance-model.ts')
  assert.deepEqual(netAfterMaintenance(910050n, ['1250.50', '0.10']), { maintenance: '1250.60', net: '7849.90', negative: false })
  assert.deepEqual(netAfterMaintenance(10n, ['0.20']), { maintenance: '0.20', net: '0.10', negative: true }, 'maintenance above the cash received')
  assert.deepEqual(netAfterMaintenance(0n, []), { maintenance: '0.00', net: '0.00', negative: false })
  assert.deepEqual(netAfterMaintenance(100000000000n, ['999999999.99']), { maintenance: '999999999.99', net: '0.01', negative: false }, 'large amounts stay exact')
})
