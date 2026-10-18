import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmount, remaining, validateReceipt, type Charge, type Receipt } from '../src/access/payment-preview-model.ts'
const charge: Charge = { id: 'c', tenant: 't', room: 'r', period: 'September rent', due: '2026-09-05', cents: 500000n }
const cash: Receipt = { id: 'p', charge: 'c', date: '2026-10-02', cents: 300000n, status: 'Settled cash', reference: '' }
test('exact centavos and invalid monetary input', () => {
  assert.equal(parseAmount('999999999.99'), 99999999999n)
  assert.equal(parseAmount('0.01'), 1n)
  for (const input of ['-1', '0', '1.001', '1e3', 'NaN']) assert.throws(() => parseAmount(input))
})
test('late partial cash applies to its original period; pending/check do not settle', () => {
  assert.equal(remaining(charge, [cash, { ...cash, id: 'pending', status: 'Pending report' }, { ...cash, id: 'check', status: 'Uncleared check' }]), 200000n)
  assert.equal(charge.due, '2026-09-05')
})
test('reject overpayment and duplicate receipt; allow exact remaining amount', () => {
  assert.throws(() => validateReceipt(charge, [cash], { ...cash, id: 'extra' }))
  assert.throws(() => validateReceipt(charge, [cash], { ...cash, cents: 100n }))
  assert.doesNotThrow(() => validateReceipt(charge, [cash], { ...cash, id: 'rest', cents: 200000n }))
})

import { anniversaryDue, oldestFirst } from '../src/access/payment-preview-model.ts'
test('anniversary clamps short months without drifting the original day', () => {
 assert.equal(anniversaryDue('2024-01-31','2024-02'),'2024-02-29')
 assert.equal(anniversaryDue('2024-01-31','2025-02'),'2025-02-28')
 assert.equal(anniversaryDue('2024-01-31','2025-03'),'2025-03-31')
})
test('oldest first splits exact partial payments and excludes pending receipts', () => {
 const next = { ...charge, id:'next', due:'2026-10-05' }
 assert.deepEqual(oldestFirst([next,charge],[cash],250025n), [{charge:'c',cents:200000n},{charge:'next',cents:50025n}])
 assert.throws(() => oldestFirst([charge],[cash],200001n))
})

import { validBusinessDate } from '../src/access/payment-preview-model.ts'
test('reject invalid calendar dates before anniversary or cash processing', () => {
 for (const value of ['2026-02-29','2026-04-31','2026-00-10','2026-13-01','0000-01-01','invalid']) assert.equal(validBusinessDate(value),false)
 assert.equal(validBusinessDate('2024-02-29'),true)
 assert.throws(()=>anniversaryDue('2026-02-31','2026-03'))
 assert.throws(()=>anniversaryDue('2026-01-31','2026-13'))
})

import { confirmedPayments } from '../src/access/payment-preview-model.ts'
test('paid summary uses actual receipt month, excludes pending, groups split allocations', () => {
 const rows = [cash, {...cash,id:'split1',paymentId:'split',cents:200000n}, {...cash,id:'split2',paymentId:'split',charge:'next',cents:50025n}, {...cash,id:'pending',status:'Pending report' as const}, {...cash,id:'check',status:'Uncleared check' as const}]
 const result = confirmedPayments(rows,'2026-10')
 assert.equal(result.length,2)
 assert.equal(result.reduce((sum,p)=>sum+p.cents,0n),550025n)
 assert.equal(result.find(p=>p.id==='split')?.allocations.length,2)
 assert.deepEqual(confirmedPayments(rows,'2026-09'),[])
})
