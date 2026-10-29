import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePublicListings, roomCount } from '../src/access/public-listings-model.ts'

const listing = () => ({ properties: [{ name: 'Fictional boarding houses', buildings: [
  { label: 'Building 1', rooms: [{ unit_id: '50000000-0000-4000-8000-000000000008', room: 'Room 01', asking_rent: '3500.00', description: 'Second floor' }] },
  { label: "Bob's house", rooms: [{ unit_id: '50000000-0000-4000-8000-000000000009', room: 'Room 04', asking_rent: '2800.50', description: '' }] },
] }] })

test('accepts the public listing shape and counts rooms', () => {
  assert.equal(roomCount(parsePublicListings(listing())), 2)
  assert.deepEqual(parsePublicListings({ properties: [] }), { properties: [] })
})

test('rejects extra (possibly private) fields, malformed rent and empty buildings', () => {
  const mutations: Array<[string, (value: any) => void]> = [
    ['extra private field', value => { value.properties[0].buildings[0].rooms[0].tenant = 'Sample Tenant' }],
    ['numeric rent', value => { value.properties[0].buildings[0].rooms[0].asking_rent = 3500 }],
    ['zero rent', value => { value.properties[0].buildings[0].rooms[0].asking_rent = '0.00' }],
    ['three decimals', value => { value.properties[0].buildings[0].rooms[0].asking_rent = '1.005' }],
    ['long description', value => { value.properties[0].buildings[0].rooms[0].description = 'x'.repeat(301) }],
    ['empty building', value => { value.properties[0].buildings[0].rooms = [] }],
  ]
  for (const [name, mutate] of mutations) {
    const value = listing(); mutate(value)
    assert.throws(() => parsePublicListings(value), /Invalid public listings response/, name)
  }
})

test('a room listed automatically without a price is accepted (shown as "Ask for the price")', async () => {
  const { parsePublicListings } = await import('../src/access/public-listings-model.ts')
  const parsed = parsePublicListings({ properties: [{ name: 'Fictional', buildings: [{ label: "Bob's house", rooms: [{ unit_id: '50000000-0000-4000-8000-000000000010', room: 'Room 05', asking_rent: null, description: '' }] }] }] })
  assert.equal(parsed.properties[0].buildings[0].rooms[0].asking_rent, null)
})
