import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentSeason } from '../src/landing/season.ts'

// Halloween runs Oct 24 to Nov 23, by the Cebu (UTC+8) date.
test('Halloween season follows the Cebu calendar and can be previewed or hidden', () => {
  const at = (iso: string) => currentSeason(new Date(iso), '')
  assert.equal(at('2026-10-23T15:59:00Z'), null, 'Oct 23, 11:59 pm Cebu')
  assert.equal(at('2026-10-23T16:00:00Z'), 'halloween', 'Oct 24, midnight Cebu')
  assert.equal(at('2026-11-01T04:00:00Z'), 'halloween')
  assert.equal(at('2026-11-23T15:59:00Z'), 'halloween', 'Nov 23, 11:59 pm Cebu')
  assert.equal(at('2026-11-23T16:00:00Z'), null, 'Nov 24 in Cebu: off, 7 days before December')
  assert.equal(currentSeason(new Date('2026-07-01T00:00:00Z'), '#theme=halloween'), 'halloween')
  assert.equal(currentSeason(new Date('2026-11-01T00:00:00Z'), '#theme=none'), null)
})

test('Christmas season runs Dec 1 to Jan 6 by the Cebu date', () => {
  const at = (iso: string) => currentSeason(new Date(iso), '')
  assert.equal(at('2026-11-30T15:59:00Z'), null, 'Nov 30, 11:59 pm Cebu')
  assert.equal(at('2026-11-30T16:00:00Z'), 'christmas', 'Dec 1, midnight Cebu')
  assert.equal(at('2026-12-25T04:00:00Z'), 'christmas')
  assert.equal(at('2027-01-06T15:59:00Z'), 'christmas', 'Jan 6, Three Kings')
  assert.equal(at('2027-01-06T16:00:00Z'), null, 'Jan 7 in Cebu: off')
  assert.equal(currentSeason(new Date('2026-07-01T00:00:00Z'), '#theme=christmas'), 'christmas')
})
