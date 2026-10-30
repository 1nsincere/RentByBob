import { useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { BuildingArt, BuildingFacade } from './BuildingDrawings'
import { drawnKind, toDrawn, type DbBuilding, type DbUnit } from './property-drawn'
import { text, type Language } from '../i18n'

// Visual room chooser for adding or assigning a tenant: pick the building from its drawing, then a vacant door on
// the building's front view (mouse/touch) or the matching room button below (keyboard and screen readers).
// Occupied and shared spaces are visible for orientation but cannot be chosen. No tenant names are shown.
export function RoomPicker({ buildings, units, occupied, building, room, onChange, allowLater, language = 'en' }: {
  buildings: DbBuilding[]; units: DbUnit[]; occupied: Set<string>; building: string; room: string
  onChange: (building: string, room: string) => void; allowLater: boolean; language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [floorIndex, setFloorIndex] = useState(0)
  const rentable = (unit: DbUnit) => unit.kind !== 'shared'
  const vacantIn = (buildingId: string) => units.filter(unit => unit.building_id === buildingId && rentable(unit) && !occupied.has(unit.id)).length
  const current = buildings.find(item => item.id === building)
  const drawn = current ? toDrawn(current, units, language) : null
  // Open the floor that holds the chosen room (for example when a room arrives preselected from the map).
  useEffect(() => {
    if (!drawn || !room) return
    const index = drawn.floors.findIndex(floor => floor.rooms.some(item => item.id === room))
    if (index >= 0) setFloorIndex(index)
  }, [building, room])
  const floor = drawn?.floors[Math.min(floorIndex, drawn.floors.length - 1)]
  const pickable = (id: string) => { const unit = units.find(item => item.id === id); return !!unit && rentable(unit) && !occupied.has(id) }
  const choose = (id: string) => { if (pickable(id)) onChange(building, id) }

  return <div className="room-picker">
    <div className="room-picker-buildings" role="group" aria-label={tr('Choose a building', 'Pumili ng gusali')}>
      {buildings.map(item => { const free = vacantIn(item.id)
        return <button type="button" key={item.id} className="room-picker-building" aria-pressed={item.id === building}
          aria-label={`${item.label}, ${free} ${tr(free === 1 ? 'vacant room' : 'vacant rooms', 'bakanteng kuwarto')}`}
          onClick={() => { setFloorIndex(0); onChange(item.id, '') }}>
          <BuildingArt building={toDrawn(item, units, language)} /><strong>{item.label}</strong>
          <span className={`status ${free ? 'status--ready' : ''}`}>{free ? `${free} ${tr('vacant', 'bakante')}` : tr('Full', 'Puno')}</span>
        </button> })}
      {allowLater && <button type="button" className="room-picker-building room-picker-later" aria-pressed={!building} onClick={() => onChange('', '')}>
        <strong>{tr('Assign a room later', 'I-assign ang kuwarto mamaya')}</strong><span>{tr('Add the record now', 'Idagdag ang talaan ngayon')}</span>
      </button>}
    </div>
    {drawn && floor && <div className="room-picker-building-view" key={building}>
      {drawn.floors.length > 1 && <div className="floor-tabs" role="group" aria-label={tr('Choose floor', 'Piliin ang palapag')}>{drawn.floors.map((item, index) => <Button key={item.label} type="button" aria-pressed={item === floor} onClick={() => setFloorIndex(index)}>{item.label}</Button>)}</div>}
      <figure className="building-facade room-picker-facade"><BuildingFacade building={{ ...drawn, floors: [floor] }} selectedRoom={room} language={language} isOccupied={id => occupied.has(id)} pickable={pickable} onPick={choose} />
        <figcaption>{tr('Glowing doors are vacant. Click a door, or choose a room below.', 'Bakante ang umiilaw na pinto. I-click ang pinto, o piliin ang kuwarto sa ibaba.')}</figcaption></figure>
      <div className="room-grid room-picker-rooms" role="group" aria-label={`${tr('Rooms on', 'Mga kuwarto sa')} ${floor.label}`}>
        {floor.rooms.map(item => { const unit = units.find(row => row.id === item.id)!; const free = pickable(item.id)
          const status = unit.kind === 'shared' ? tr('Shared space', 'Pinaghahatiang lugar') : occupied.has(item.id) ? tr('Occupied', 'Okupado') : tr('Vacant', 'Bakante')
          return <button type="button" key={item.id} disabled={!free} aria-pressed={item.id === room} onClick={() => choose(item.id)}
            aria-label={`${item.label}, ${tr(drawnKind[unit.kind], drawnKind[unit.kind])}, ${status}`}
            className={`room-tile ${occupied.has(item.id) ? 'occupied' : ''} ${unit.kind === 'shared' ? 'shared' : ''} ${item.id === room ? 'selected' : ''}`}>
            <strong>{item.label}</strong><span>{tr(drawnKind[unit.kind], drawnKind[unit.kind])}</span><span className={`status ${free ? 'status--ready' : unit.kind === 'shared' ? '' : 'status--pending'}`}>{status}</span>
          </button> })}
      </div>
      {!vacantIn(building) && <p className="notice" role="status">{tr('This building has no vacant rooms. Choose another building.', 'Walang bakanteng kuwarto sa gusaling ito. Pumili ng iba.')}</p>}
    </div>}
  </div>
}
