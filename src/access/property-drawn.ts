import type { Building as DrawnBuilding, Floor, Room } from './property-preview-store'
import type { SketchSlot } from './property-sketch.ts'
import { text, type Language } from '../i18n'

// Saved buildings/rooms (database rows) and their conversion to the drawing model shared by the map and pickers.
export type DbBuilding = { id: string; label: string; sketch_slot?: SketchSlot | null }
export type DbUnit = { id: string; label: string; building_id: string; floor_label: string | null; kind: 'room' | 'apartment' | 'shared' | 'house' | 'commercial' }
export const drawnKind: Record<DbUnit['kind'], string> = { room: 'Room', apartment: 'Apartment', shared: 'Shared space', house: 'House', commercial: 'Commercial' }
export const floorOrder = (label: string | null) => label === 'Ground floor' ? 0 : label === 'Second floor' ? 1 : label ? 2 : -1

// One floor band per saved floor label, ground floor first.
export function toDrawn(building: DbBuilding, units: DbUnit[], language: Language): DrawnBuilding {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const own = units.filter(unit => unit.building_id === building.id)
  const labels = [...new Set(own.map(unit => unit.floor_label))].sort((a, b) => floorOrder(a) - floorOrder(b))
  const floors: Floor[] = labels.map(label => {
    const rooms: Room[] = own.filter(unit => unit.floor_label === label).map(unit => ({ id: unit.id, label: unit.label, kind: drawnKind[unit.kind] }))
    return { label: label ?? tr('Rooms', 'Mga kwarto'), count: rooms.filter(room => room.kind === 'Room').length, rooms }
  })
  return { id: building.id, name: building.label, floors: floors.length ? floors : [{ label: tr('No rooms yet', 'Wala pay kwarto'), count: null, rooms: [] }] }
}
