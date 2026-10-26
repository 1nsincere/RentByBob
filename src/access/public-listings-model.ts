// Public listing view returned by public.read_public_listings(). Only these fields are accepted; anything else
// (or malformed money) is rejected rather than shown to the public.
export type PublicRoom = { unit_id: string; room: string; asking_rent: string; description: string }
export type PublicBuilding = { label: string; rooms: PublicRoom[] }
export type PublicListings = { properties: { name: string; buildings: PublicBuilding[] }[] }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join() === [...keys].sort().join()

function room(value: unknown): value is PublicRoom {
  return record(value) && exactKeys(value, ['unit_id', 'room', 'asking_rent', 'description']) &&
    typeof value.unit_id === 'string' && /^[0-9a-f-]{36}$/i.test(value.unit_id) && text(value.room, 200) &&
    typeof value.asking_rent === 'string' && /^\d{1,12}(\.\d{1,2})?$/.test(value.asking_rent) && Number(value.asking_rent) > 0 &&
    typeof value.description === 'string' && value.description.length <= 300
}

export function parsePublicListings(value: unknown): PublicListings {
  if (!record(value) || !Array.isArray(value.properties) || !value.properties.every(property =>
    record(property) && text(property.name, 200) && Array.isArray(property.buildings) && property.buildings.every(building =>
      record(building) && text(building.label, 200) && Array.isArray(building.rooms) && building.rooms.length > 0 && building.rooms.every(room)))) {
    throw new Error('Invalid public listings response')
  }
  return value as PublicListings
}

export const roomCount = (listings: PublicListings) => listings.properties.reduce((total, property) => total + property.buildings.reduce((sum, building) => sum + building.rooms.length, 0), 0)
