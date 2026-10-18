import { useSyncExternalStore } from 'react'

export type Room = { id: string; label: string; kind: string }
export type Floor = { label: string; count: number | null; rooms: Room[] }
export type Building = { id: string; name: string; floors: Floor[]; x?: number; y?: number; w?: number; h?: number }
export const rooms = (prefix: string, count: number): Room[] => Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i + 1}`, label: `Room ${String(i + 1).padStart(2, '0')}`, kind: 'Room' }))
const special = (id: string, label: string, kind = label): Room => ({ id, label, kind })
const initial: Building[] = [
  { id: 'bob', name: "Bob's house", x: 26, y: 68, w: 25, h: 25, floors: [{ label: 'Rooms for rent', count: 6, rooms: rooms('bob', 6) }] },
  { id: 'b1', name: 'Building 1', x: 26, y: 32, w: 24, h: 24, floors: [{ label: 'Ground floor', count: null, rooms: [special('apartment', 'Apartment')] }, { label: 'Second floor', count: null, rooms: [] }] },
  { id: 'b2', name: 'Building 2', x: 52, y: 32, w: 24, h: 24, floors: [{ label: 'Ground floor', count: null, rooms: [special('gym', 'Gym', 'Shared space')] }, { label: 'Second floor', count: null, rooms: [] }] },
  { id: 'house', name: 'House 1', x: 78, y: 32, w: 20, h: 24, floors: [{ label: 'Whole house', count: 0, rooms: [special('house-unit', 'Whole house', 'House')] }] },
  { id: 'yamaha', name: 'Yamaha property', x: 43, y: 3, w: 20, h: 25, floors: [{ label: 'Commercial space', count: 0, rooms: [special('yamaha-unit', 'Commercial unit', 'Commercial')] }] },
  ...[3, 2, 1].map((n, i): Building => ({ id: `store${n}`, name: `Store ${n}`, x: 15 + i * 9, y: 3, w: 8, h: 25, floors: [{ label: 'Shop', count: 0, rooms: [special(`shop-${n}`, `Shop ${n}`, 'Commercial')] }] })),
]
export type PreviewTenant = { id: string; name: string; initials: string; building: string; room: string; active: boolean; type: string; email: string; since: string; people: string[] }
const initialTenants: PreviewTenant[] = [
  { id: 'alex', name: 'Sample Alex Santos', initials: 'AS', building: 'bob', room: 'bob-1', active: true, type: 'Individual', email: 'alex@example.invalid', since: '01 Sep 2026', people: ['Sample Alex Santos', 'Sample Jamie Santos'] },
  { id: 'mara', name: 'Sample Mara Reyes', initials: 'MR', building: 'bob', room: 'bob-3', active: true, type: 'Individual', email: 'mara@example.invalid', since: '15 Aug 2026', people: ['Sample Mara Reyes', 'Sample Leo Reyes'] },
  { id: 'shop', name: 'Sample Corner Shop', initials: 'CS', building: 'store1', room: 'shop-1', active: true, type: 'Business', email: 'shop@example.invalid', since: '01 Jul 2026', people: [] },
  { id: 'archived', name: 'Sample Former Tenant', initials: 'FT', building: 'house', room: 'house-unit', active: false, type: 'Individual', email: 'former@example.invalid', since: '01 Jan 2026', people: ['Sample Former Tenant'] },
]
let state = { buildings: initial, tenants: initialTenants, selected: 'bob', paymentTenant: '', room: '', notice: '', draftLocation: null as { building: string; room: string } | null }
const listeners = new Set<() => void>()
export function change(next: Partial<typeof state>) { state = { ...state, ...next }; listeners.forEach(fn => fn()) }
export function useProperty() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => state) }
export function occupants(id: string) { return state.tenants.filter(t => t.room === id && t.active) }
export function roomPeople(id: string) { return occupants(id).flatMap(t => t.people) }
export function occupant(id: string) { const list = occupants(id); return list.length ? { name: list.length === 1 ? list[0].name : `${list[0].name} + ${list.length - 1} more` } : undefined }
export function addPreviewTenant(tenant: PreviewTenant) {
  if (state.tenants.some(t => t.id === tenant.id)) return
  if (!tenant.name.trim() || (tenant.email && !/^[^\s@]+@[^\s@]+\.invalid$/i.test(tenant.email))) throw new Error('Use a name and an optional fictional .invalid email.')
  if (tenant.room && !state.buildings.find(b => b.id === tenant.building)?.floors.some(f => f.rooms.some(r => r.id === tenant.room && r.kind !== 'Shared space'))) throw new Error('Select an existing rental space.')
  const selectedRoom = state.buildings.find(b => b.id === tenant.building)?.floors.flatMap(f => f.rooms).find(r => r.id === tenant.room)
  if (selectedRoom?.kind === 'Room' && roomPeople(selectedRoom.id).length + tenant.people.length < 2) throw new Error('At least two named occupants are required for a rental room in this preview.')
  if (new Set(tenant.people.map(p => p.toLowerCase().trim())).size !== tenant.people.length) throw new Error('List each occupant once.')
  change({ tenants: [...state.tenants, tenant], notice: `${tenant.name} added to the preview directory.` })
}

