import assert from 'node:assert/strict'
import test from 'node:test'
import { appError } from '../src/i18n.ts'

test('application errors are displayed in the selected language', () => {
  assert.match(appError('en', 'link-invalid'), /invalid, expired or already used/)
  assert.match(appError('ceb', 'link-invalid'), /Dili balido/)
  assert.match(appError('ceb', 'access-verification'), /Gitago ang mga rekord/)
  assert.equal(appError('en', 'unknown-error'), 'unknown-error')
})
