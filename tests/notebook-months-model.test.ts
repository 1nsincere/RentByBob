import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notebookMonthRange, parseRentReview } from '../src/access/notebook-months-model.ts'

test('notebook month range is inclusive, clamped to the allowed months and capped at 36', () => {
  assert.deepEqual(notebookMonthRange('2026-01', '2026-03', '2026-01', '2026-10'), ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(notebookMonthRange('2025-11', '2026-02', '2026-01', '2026-10'), ['2026-01', '2026-02'], 'months before move-in are dropped')
  assert.deepEqual(notebookMonthRange('2026-09', '2026-12', '2026-01', '2026-10'), ['2026-09', '2026-10'], 'months after this month or move-out are dropped')
  assert.deepEqual(notebookMonthRange('2025-12', '2026-01', '2025-01', '2026-10'), ['2025-12', '2026-01'], 'year boundary')
  assert.deepEqual(notebookMonthRange('2026-03', '2026-01', '2026-01', '2026-10'), [], 'reversed range')
  assert.deepEqual(notebookMonthRange('2026-1', '2026-03', '2026-01', '2026-10'), [], 'malformed month')
  assert.equal(notebookMonthRange('2020-01', '2026-10', '2020-01', '2026-10').length, 36)
})

test('rent review data is read strictly', () => {
  const ok = { drafts: [{ id: 'a', agreement_id: 'b', month: '2026-02', rent: '3500.00', source_note: 'Notebook 2', entered_by: 'c', entered_at: '2026-10-28T01:00:00Z' }], estimated: { b: 'c', d: null } }
  const parsed = parseRentReview(ok)
  assert.deepEqual(parsed.drafts[0], { id: 'a', agreementId: 'b', month: '2026-02', rent: '3500.00', sourceNote: 'Notebook 2', enteredBy: 'c', enteredAt: '2026-10-28T01:00:00Z' })
  assert.deepEqual(parsed.estimated, { b: 'c', d: null })
  assert.throws(() => parseRentReview({ ...ok, drafts: [{ ...ok.drafts[0], rent: 3500 }] }), /Unexpected/)
  assert.throws(() => parseRentReview({ ...ok, drafts: [{ ...ok.drafts[0], month: '2026-13' }] }), /Unexpected/)
  assert.throws(() => parseRentReview({ drafts: 'x', estimated: {} }), /Unexpected/)
  assert.throws(() => parseRentReview(null), /Unexpected/)
})
