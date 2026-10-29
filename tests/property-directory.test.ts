import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countPropertyLocations, searchPropertyDirectory, type Building, type Unit } from '../src/access/property-directory-model.ts'

const buildings: Building[] = [
  { id: 'building-a', label: 'North Building', archived_at: null },
  { id: 'building-b', label: 'Market Section', archived_at: '2026-09-01T00:00:00Z' },
]

const units: Unit[] = [
  { id: 'unit-a1', building_id: 'building-a', label: 'Room 1', archived_at: null },
  { id: 'unit-a2', building_id: 'building-a', label: 'Room 2', archived_at: null },
  { id: 'unit-b1', building_id: 'building-b', label: 'Shop A', archived_at: '2026-09-01T00:00:00Z' },
]

test('property directory search defaults to all locations and counts buildings plus units', () => {
  const results = searchPropertyDirectory(buildings, units, '')
  assert.deepEqual(results.map(building => [building.id, building.units.map(unit => unit.id)]), [
    ['building-a', ['unit-a1', 'unit-a2']],
    ['building-b', ['unit-b1']],
  ])
  assert.equal(countPropertyLocations(results), 5)
})

test('property directory search matches a building name and retains its units', () => {
  const results = searchPropertyDirectory(buildings, units, ' NORTH ')
  assert.deepEqual(results.map(building => [building.id, building.units.map(unit => unit.id)]), [
    ['building-a', ['unit-a1', 'unit-a2']],
  ])
})

test('property directory search matches unit labels and keeps only matching units under their building', () => {
  const results = searchPropertyDirectory(buildings, units, 'room 2')
  assert.deepEqual(results.map(building => [building.id, building.units.map(unit => unit.id)]), [
    ['building-a', ['unit-a2']],
  ])
  assert.equal(countPropertyLocations(results), 2)
})

test('property directory search includes archived location names and returns no false matches', () => {
  assert.deepEqual(searchPropertyDirectory(buildings, units, 'shop a').map(building => building.id), ['building-b'])
  assert.deepEqual(searchPropertyDirectory(buildings, units, 'unknown'), [])
})
