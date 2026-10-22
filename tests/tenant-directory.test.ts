import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterTenantDirectory } from '../src/access/tenant-directory-model.ts'

const tenants = [
  { id: 'tenant-a', display_name: 'Aster Santos', kind: 'individual', archived_at: null },
  { id: 'tenant-b', display_name: 'Aster Auto Supply', kind: 'business', archived_at: null },
  { id: 'tenant-c', display_name: 'Harbor Barber Shop', kind: 'business', archived_at: '2026-10-01T00:00:00Z' },
]

test('tenant directory search matches names without case sensitivity or surrounding spaces', () => {
  assert.deepEqual(
    filterTenantDirectory(tenants, '  ASTER ', 'all', 'all').map(tenant => tenant.id),
    ['tenant-a', 'tenant-b'],
  )
})

test('tenant directory filters active and archived records without changing the default list', () => {
  assert.deepEqual(filterTenantDirectory(tenants, '', 'all', 'all'), tenants)
  assert.deepEqual(filterTenantDirectory(tenants, '', 'active', 'all').map(tenant => tenant.id), ['tenant-a', 'tenant-b'])
  assert.deepEqual(filterTenantDirectory(tenants, '', 'archived', 'all').map(tenant => tenant.id), ['tenant-c'])
})

test('tenant directory combines record type, status, and name filters', () => {
  assert.deepEqual(
    filterTenantDirectory(tenants, 'aster', 'active', 'business').map(tenant => tenant.id),
    ['tenant-b'],
  )
  assert.deepEqual(filterTenantDirectory(tenants, '', 'archived', 'individual'), [])
})
