import { test } from 'node:test'
import assert from 'node:assert/strict'
import { earliestReportDate, parsePaymentReports, reportDraftError } from '../src/access/payment-reports-model.ts'

const row = { id: '86000000-0000-4000-8000-000000000040', agreement_id: '86000000-0000-4000-8000-000000000020', amount: '3500.00', paid_on: '2026-10-20', paid_to: 'Bob', note: '', status: 'new', handled_note: null, created_at: '2026-10-20T03:00:00.000+00:00' }

test('renter report drafts mirror the database limits with exact amounts', () => {
  const today = '2026-10-27'
  const ok = { amount: '3500.50', paidOn: today, paidTo: 'Bob' as const, note: '' }
  assert.equal(reportDraftError(ok, today), null)
  assert.equal(reportDraftError({ ...ok, amount: '0' }, today), 'amount')
  assert.equal(reportDraftError({ ...ok, amount: '1,000' }, today), 'amount')
  assert.equal(reportDraftError({ ...ok, amount: '10.005' }, today), 'amount')
  assert.equal(reportDraftError({ ...ok, paidOn: '2026-10-28' }, today), 'date')
  assert.equal(earliestReportDate(today), '2026-07-29')
  assert.equal(reportDraftError({ ...ok, paidOn: '2026-07-29' }, today), null)
  assert.equal(reportDraftError({ ...ok, paidOn: '2026-07-28' }, today), 'date')
  assert.equal(reportDraftError({ ...ok, paidOn: '2026-02-30' }, today), 'date')
  assert.equal(reportDraftError({ ...ok, note: 'x'.repeat(301) }, today), 'note')
})

test('payment report lists are rejected whole when any row is malformed', () => {
  assert.equal(parsePaymentReports([row]).length, 1)
  assert.throws(() => parsePaymentReports({}))
  assert.throws(() => parsePaymentReports([{ ...row, amount: 3500 }]))
  assert.throws(() => parsePaymentReports([{ ...row, paid_to: 'Mallory' }]))
  assert.throws(() => parsePaymentReports([row, { ...row, status: 'paid' }]))
})
