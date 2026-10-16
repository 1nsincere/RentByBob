import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePesos, formatPesos, manilaDate, isBusinessDate, displayBusinessDate, validateReport } from '../src/domain/payment-report.ts'

test('money retains exact centavos, including the database maximum', () => {
  assert.equal(parsePesos('0.10')! + parsePesos('0.20')!, 30n)
  assert.equal(parsePesos('999999999999.99'), 99999999999999n)
  assert.equal(formatPesos(99999999999999n), '₱999,999,999,999.99')
  assert.equal(formatPesos(1n), '₱0.01')
  assert.equal(formatPesos(-101n), '-₱1.01')
  assert.equal(parsePesos(' 4000.5 '), 400050n)
})
test('invalid and lossy amounts cannot enter a report preview', () => {
  for (const amount of ['', '0', '0.00', '-1', '1.001', '1e3', 'NaN', 'Infinity', '4,000', '1000000000000', '.5', '1.']) assert.equal(parsePesos(amount), null, amount)
})
test('Philippine business day changes at 16:00 UTC regardless of viewer zone', () => {
  assert.equal(manilaDate(new Date('2026-10-15T15:59:59Z')), '2026-10-15')
  assert.equal(manilaDate(new Date('2026-10-15T16:00:00Z')), '2026-10-16')
  assert.equal(manilaDate(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
})
test('calendar validation rejects rollover dates and preserves displayed business dates', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '', '0000-01-01']) assert.equal(isBusinessDate(date), false)
  assert.equal(isBusinessDate('2028-02-29'), true)
  assert.equal(displayBusinessDate('2026-10-16'), '16 Oct 2026')
})
const draft = { method: 'Cash', amount: '4000', date: '2026-10-14', collector: 'Sample collector', reference: '', months: 'September 2026', note: '' }
test('September paid in October is accepted without inventing allocation rules', () => {
  assert.deepEqual(validateReport(draft, '2026-10-16'), {})
  assert.deepEqual(validateReport({ ...draft, method: 'Check' }, '2026-10-16'), {})
})
test('future handovers, blank collectors, unsupported methods and oversized notes are rejected', () => {
  const errors = validateReport({ ...draft, method: 'Card', date: '2026-10-17', collector: ' ', months: ' ', note: 'x'.repeat(1001) }, '2026-10-16')
  assert.deepEqual(Object.keys(errors).sort(), ['collector', 'date', 'method', 'months', 'note'])
})
