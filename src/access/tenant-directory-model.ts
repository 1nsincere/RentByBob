import type { Tenant } from './client'

export type TenantStatusFilter = 'all' | 'active' | 'archived'
export type TenantKindFilter = 'all' | 'individual' | 'business'
// Current room per tenant (from open or not-yet-ended agreements). Absent = no current room.
export type TenantRoom = { unitId: string; buildingId: string; label: string }
export type TenantDirectoryOptions = {
  rooms?: Readonly<Record<string, TenantRoom>>
  building?: 'all' | 'none' | string
  sort?: 'name' | 'room'
}

export function filterTenantDirectory<T extends Pick<Tenant, 'display_name' | 'kind' | 'archived_at'> & { id?: string }>(
  tenants: readonly T[],
  search: string,
  status: TenantStatusFilter,
  kind: TenantKindFilter,
  options: TenantDirectoryOptions = {},
): T[] {
  const query = search.trim().toLowerCase()
  const room = (tenant: T) => (tenant.id && options.rooms?.[tenant.id]) || undefined
  const shown = tenants.filter(tenant => {
    if (query && !`${tenant.display_name} ${room(tenant)?.label ?? ''}`.toLowerCase().includes(query)) return false
    if (status === 'active' && tenant.archived_at !== null) return false
    if (status === 'archived' && tenant.archived_at === null) return false
    if (kind !== 'all' && tenant.kind !== kind) return false
    if (options.building === 'none' && room(tenant)) return false
    if (options.building && options.building !== 'all' && options.building !== 'none' && room(tenant)?.buildingId !== options.building) return false
    return true
  })
  if (!options.sort) return shown
  const byName = (a: T, b: T) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base', numeric: true })
  return [...shown].sort(options.sort === 'name' ? byName : (a, b) => {
    const left = room(a)?.label, right = room(b)?.label
    if (left && right) return left.localeCompare(right, undefined, { numeric: true }) || byName(a, b)
    return left ? -1 : right ? 1 : byName(a, b)
  })
}

// Builds the room map from read_rent_workspace data; ended agreements free the tenant from that room on the day after.
export function currentTenantRooms(workspace: { agreements: { tenant_id: string; unit_id: string; ended_on?: string | null }[]; units: { id: string; label: string; building_id: string }[]; buildings: { id: string; label: string }[] }, today: string) {
  const rooms: Record<string, TenantRoom> = {}
  for (const agreement of workspace.agreements.filter(item => !item.ended_on || item.ended_on >= today)) {
    const unit = workspace.units.find(item => item.id === agreement.unit_id)
    const building = unit && workspace.buildings.find(item => item.id === unit.building_id)
    if (unit) rooms[agreement.tenant_id] = { unitId: unit.id, buildingId: unit.building_id, label: `${building?.label ?? ''} · ${unit.label}` }
  }
  return rooms
}
