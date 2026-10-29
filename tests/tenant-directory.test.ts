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

test('tenant directory searches rooms, filters by building or no room, and sorts by name or room', async () => {
  const { currentTenantRooms } = await import('../src/access/tenant-directory-model.ts')
  const rooms = currentTenantRooms({
    agreements: [
      { tenant_id: 'tenant-a', unit_id: 'u2', ended_on: null },
      { tenant_id: 'tenant-b', unit_id: 'u10', ended_on: '2026-10-31' },
      { tenant_id: 'tenant-c', unit_id: 'u1', ended_on: '2026-09-30' },
    ],
    units: [{ id: 'u1', label: 'Room 1', building_id: 'b1' }, { id: 'u2', label: 'Room 2', building_id: 'b1' }, { id: 'u10', label: 'Room 10', building_id: 'b2' }],
    buildings: [{ id: 'b1', label: 'Building 1' }, { id: 'b2', label: "Bob's house" }],
  }, '2026-10-27')
  assert.deepEqual(Object.keys(rooms).sort(), ['tenant-a', 'tenant-b'], 'an agreement that already ended frees the tenant')
  assert.deepEqual(filterTenantDirectory(tenants, "bob's", 'all', 'all', { rooms }).map(t => t.id), ['tenant-b'])
  assert.deepEqual(filterTenantDirectory(tenants, '', 'all', 'all', { rooms, building: 'b1' }).map(t => t.id), ['tenant-a'])
  assert.deepEqual(filterTenantDirectory(tenants, '', 'all', 'all', { rooms, building: 'none' }).map(t => t.id), ['tenant-c'])
  assert.deepEqual(filterTenantDirectory(tenants, '', 'all', 'all', { sort: 'name' }).map(t => t.id), ['tenant-b', 'tenant-a', 'tenant-c'])
  assert.deepEqual(filterTenantDirectory(tenants, '', 'all', 'all', { rooms, sort: 'room' }).map(t => t.id), ['tenant-b', 'tenant-a', 'tenant-c'], "Bob's house sorts before Building 1; no room last")
})
