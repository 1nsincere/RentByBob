import type { Building, Floor, Room } from './property-preview-store'
import { type Language } from '../i18n'

// Building drawings shared by the fictional preview and the real property map. No preview data is imported here.
export const isRentalRoom = (room: Room) => room.kind === 'Room'
// Door labels must fit under one door: drop a leading "Room" and shorten long names (full names are on the room cards).
const spaceShort = (room: Room) => {
  const label = room.kind === 'Room' ? room.label.replace(/^Room\s*/i, '') : room.label
  return label.length > 7 ? `${label.slice(0, 6)}…` : label
}

// Map/list thumbnail: one band per floor (up to 4) with a window per space, so the icon tracks the entered layout.
export function BuildingArt({ building }: { building: Building }) {
  const floors = building.floors.slice(-4)
  const bandHeight = 34 / floors.length
  return <svg viewBox="0 0 120 72" className="building-art" aria-hidden="true">
    <path d="M10 25 60 5 110 25V29H10Z" className="building-art-roof" />
    <rect x="18" y="28" width="84" height="39" rx="3" className="building-art-wall" />
    {[...floors].reverse().map((floor, band) => {
      const windows = Math.min(8, Math.max(1, floor.rooms.length))
      const width = Math.min(8, 66 / windows - 2.5)
      const top = 31 + band * bandHeight
      return <g key={floor.label}>{Array.from({ length: windows }, (_, i) =>
        <rect key={i} x={60 - (windows * (width + 2.5) - 2.5) / 2 + i * (width + 2.5)} y={top + 2} width={width} height={Math.max(3, bandHeight - 6)} rx="1" className="building-art-window" />)}</g>
    })}
    <path d="M12 68H108" strokeWidth="3" className="building-art-ground" />
  </svg>
}

// Front view drawn from the entered layout: one door per space, wrapping into rows; width grows with the busiest floor.
// Occupancy is supplied by the caller: the fictional preview store, or current agreements on the real map.
// With onPick, vacant doors are clickable for mouse/touch; pickers must also offer room buttons for keyboard users.
export function BuildingFacade({ building, selectedRoom, language = 'en', isOccupied, pickable, onPick }: { building: Building; selectedRoom: string; language?: Language; isOccupied: (roomId: string) => boolean; pickable?: (roomId: string) => boolean; onPick?: (roomId: string) => void }) {
  const tr = (en: string, ceb: string) => language === 'ceb' ? ceb : en
  const perRow = 10, slot = 84, doorWidth = 60, doorHeight = 100, rowHeight = 148, storyTop = 42
  const rowsFor = (floor: Floor) => floor.rooms.length ? Math.ceil(floor.rooms.length / perRow) : 1
  const widest = Math.max(4, ...building.floors.map(floor => Math.min(perRow, floor.rooms.length)))
  const wallWidth = Math.max(520, widest * slot + 140)
  const width = wallWidth + 120, left = 60, right = left + wallWidth, centre = width / 2
  const roofPeak = 14, wallTop = 104
  let cursor = wallTop
  // Upper floors are drawn above lower ones; the first listed floor sits at ground level.
  const placed = building.floors.map((floor, index) => ({ floor, index, height: storyTop + rowsFor(floor) * rowHeight })).reverse()
    .map(story => { const top = cursor; cursor += story.height; return { ...story, top } })
  const wallBottom = cursor
  const describe = (floor: Floor) => {
    if (floor.count === null && !floor.rooms.length) return tr('room count not set', 'wala pa matino ang ihap sa kwarto')
    const rentable = floor.rooms.filter(isRentalRoom).length
    const others = floor.rooms.filter(room => !isRentalRoom(room)).map(room => room.label)
    const occupied = floor.rooms.filter(room => isOccupied(room.id)).length
    return [`${rentable} ${tr(rentable === 1 ? 'rentable room' : 'rentable rooms', 'ka kwarto nga paabangan')}`, ...others, `${occupied} ${tr('occupied', 'giokupahan')}`].join(', ')
  }
  const label = `${building.name}, ${tr('illustrative front view', 'hulagway sa atubangan')}: ${building.floors.map(floor => `${floor.label}: ${describe(floor)}`).join('; ')}`
  return <svg className="facade-art" viewBox={`0 0 ${width} ${wallBottom + 34}`} role="img" aria-label={label}>
    <defs>
      <linearGradient id="facade-wall-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="facade-wall-stop-top" /><stop offset="1" className="facade-wall-stop-bottom" /></linearGradient>
      <linearGradient id="facade-roof-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="facade-roof-stop-top" /><stop offset="1" className="facade-roof-stop-bottom" /></linearGradient>
    </defs>
    <path className="facade-roof-shape" fill="url(#facade-roof-fill)" d={`M${left - 26} ${wallTop} ${centre} ${roofPeak} ${right + 26} ${wallTop} ${right + 18} ${wallTop + 14} ${centre} ${roofPeak + 26} ${left - 18} ${wallTop + 14}Z`} />
    <path className="facade-wall" fill="url(#facade-wall-fill)" d={`M${left} ${wallTop + 6} ${centre} ${roofPeak + 30} ${right} ${wallTop + 6}V${wallBottom}H${left}Z`} />
    {placed.map(({ floor, top, height, index }) => {
      const spaces = floor.rooms
      return <g className="facade-story" key={floor.label}>
        {index > 0 && <path className="facade-story-line" d={`M${left + 6} ${top + height}H${right - 6}`} />}
        <text className="facade-floor-label" x={left + 22} y={top + 28}>{floor.label}</text>
        {!spaces.length && <g className="facade-unset">
          <rect x={left + 40} y={top + storyTop} width={wallWidth - 80} height={rowHeight - 40} rx="12" />
          <text x={centre} y={top + storyTop + (rowHeight - 40) / 2 + 6} textAnchor="middle">{floor.count === null ? tr('Room count not set', 'Wala pa matino ang ihap') : tr('No spaces yet', 'Wala pay lugar')}</text>
        </g>}
        {spaces.map((room, spaceIndex) => {
          const row = Math.floor(spaceIndex / perRow)
          const inRow = Math.min(perRow, spaces.length - row * perRow)
          const x = centre - (inRow * slot - (slot - doorWidth)) / 2 + (spaceIndex % perRow) * slot
          const y = top + storyTop + row * rowHeight
          const kind = isRentalRoom(room) ? 'room' : room.kind === 'Shared space' ? 'shared' : 'unit'
          // Clickable: any door when onPick is given (unless pickable says no). Glowing (is-pickable): only doors a picker offers.
          const canPick = Boolean(onPick && (pickable ? pickable(room.id) : true)), glow = Boolean(onPick && pickable?.(room.id))
          return <g key={room.id} transform={`translate(${x} ${y})`} onClick={canPick ? () => onPick!(room.id) : undefined}
            className={`facade-room-door facade-space--${kind} ${isOccupied(room.id) ? 'is-occupied' : ''} ${room.id === selectedRoom ? 'is-selected' : ''} ${canPick ? 'is-clickable' : ''} ${glow ? 'is-pickable' : ''}`}>
            <rect className="facade-door-frame" width={doorWidth} height={doorHeight} rx="9" />
            {kind === 'room' ? <>
              <rect className="facade-door-panel" x="8" y="8" width={doorWidth - 16} height={doorHeight - 16} rx="5" />
              <circle className="facade-door-knob" cx={doorWidth - 15} cy={doorHeight * 0.58} r="3" />
              {isOccupied(room.id) && <g className="facade-occupant-mark"><circle cx={doorWidth / 2} cy="30" r="7" /><path d={`M${doorWidth / 2 - 12} 54a12 12 0 0 1 24 0`} /></g>}
            </> : <>
              <rect className="facade-door-glass" x="7" y="8" width={doorWidth - 14} height="34" rx="4" />
              <path className="facade-door-panel-line" d={`M${doorWidth / 2} 46V${doorHeight - 8}`} />
            </>}
            <text className="facade-door-label" x={doorWidth / 2} y={doorHeight + 24} textAnchor="middle">{spaceShort(room)}</text>
          </g>
        })}
      </g>
    })}
    <path className="facade-foundation" d={`M${left - 10} ${wallBottom}H${right + 10}V${wallBottom + 12}H${left - 10}Z`} />
    <path className="facade-ground-line" d={`M${left - 40} ${wallBottom + 18}H${right + 40}`} />
  </svg>
}

