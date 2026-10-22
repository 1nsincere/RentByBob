export type Building = { id: string; label: string; archived_at: string | null }
export type Unit = Building & { building_id: string }

export type BuildingWithUnits = Building & { units: Unit[] }

export function searchPropertyDirectory(
  buildings: readonly Building[],
  units: readonly Unit[],
  search: string,
): BuildingWithUnits[] {
  const query = search.trim().toLowerCase()
  return buildings.flatMap(building => {
    const children = units.filter(unit => unit.building_id === building.id)
    if (!query || building.label.toLowerCase().includes(query)) {
      return [{ ...building, units: children }]
    }
    const matchingUnits = children.filter(unit => unit.label.toLowerCase().includes(query))
    return matchingUnits.length > 0 ? [{ ...building, units: matchingUnits }] : []
  })
}

export function countPropertyLocations(buildings: readonly BuildingWithUnits[]): number {
  return buildings.reduce((count, building) => count + 1 + building.units.length, 0)
}
