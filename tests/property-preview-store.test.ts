import test from 'node:test'
import assert from 'node:assert/strict'
import { initialBuildings, rooms } from '../src/access/property-preview-store.ts'

test('preview layout matches the counted room schedule and remains expandable', () => {
  const bob = initialBuildings.find(building => building.id === 'bob')!
  assert.equal(bob.floors[0].count, 6)
  assert.equal(bob.floors[0].rooms.length, 6)

  const buildingOne = initialBuildings.find(building => building.id === 'b1')!
  assert.deepEqual(buildingOne.floors.map(floor => floor.count), [3, 6])
  assert.equal(buildingOne.floors[0].rooms.length, 4)
  assert.equal(buildingOne.floors[1].rooms.length, 6)

  const buildingTwo = initialBuildings.find(building => building.id === 'b2')!
  assert.deepEqual(buildingTwo.floors.map(floor => floor.count), [3, 5])
  assert.equal(buildingTwo.floors[0].rooms.length, 4)
  assert.equal(buildingTwo.floors[1].rooms.length, 5)

  const expanded = {
    ...buildingOne.floors[1],
    count: 8,
    rooms: [...buildingOne.floors[1].rooms, ...rooms('b1-second-extra', 2)],
  }
  assert.equal(expanded.count, 8)
  assert.equal(expanded.rooms.length, 8)
})
