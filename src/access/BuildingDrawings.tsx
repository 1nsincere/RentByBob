import { useId } from 'react'
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

// Front view drawn from the entered layout, following the owner's sketch of Building 1 (27 Oct 2026): a hip tin roof;
// upper floors open onto a balcony walkway, rooms numbered from the stairs end (right) with a window beside every
// other door; on a ground floor below other floors, the apartment or shared space keeps its own street door, and the
// rentable rooms are inside, along the hallway behind the gate where the stairs go up (drawn cut away).
// One door per space, wrapping into rows; width grows with the busiest floor.
// Occupancy is supplied by the caller: the fictional preview store, or current agreements on the real map.
// With onPick, vacant doors are clickable for mouse/touch; pickers must also offer room buttons for keyboard users.
type FacadeItem = { type: 'door'; room: Room; window: boolean; inside: boolean } | { type: 'stairs'; inside: boolean } | { type: 'gate' }
const DOOR_W = 60, WINDOW_W = 64, GAP = 26, STAIRS_W = 96, GATE_W = 150
const itemWidth = (item: FacadeItem) => item.type === 'door' ? DOOR_W + (item.window ? WINDOW_W + 14 : 0) : item.type === 'stairs' ? STAIRS_W : GATE_W
function facadeRows(building: Building, floor: Floor, index: number, perRow: number): FacadeItem[][] {
  const multi = building.floors.length > 1
  const door = (room: Room, window = false, inside = false): FacadeItem => ({ type: 'door', room, window, inside })
  const hallway = index === 0 && multi && floor.rooms.some(isRentalRoom)
  const items = index > 0 ? floor.rooms.map((room, i) => door(room, i % 2 === 0)).reverse()
    : hallway ? [...floor.rooms.filter(room => !isRentalRoom(room)).map(room => door(room)), ...floor.rooms.filter(isRentalRoom).map(room => door(room, false, true))]
      : floor.rooms.map(room => door(room))
  const rows: FacadeItem[][] = []
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow))
  if (index === 0 && multi && rows.length) rows[rows.length - 1].push({ type: 'stairs', inside: hallway }, { type: 'gate' })
  return rows
}
const rowWidth = (row: FacadeItem[]) => row.reduce((sum, item) => sum + itemWidth(item), 0) + GAP * Math.max(0, row.length - 1)

export function BuildingFacade({ building, selectedRoom, language = 'en', isOccupied, pickable, onPick }: { building: Building; selectedRoom: string; language?: Language; isOccupied: (roomId: string) => boolean; pickable?: (roomId: string) => boolean; onPick?: (roomId: string) => void }) {
  const tr = (en: string, ceb: string) => language === 'ceb' ? ceb : en
  // Each drawing needs its own gradient ids: a shared id breaks when the first copy on the page is hidden.
  const uid = useId().replace(/:/g, '')
  const perRow = 10, doorWidth = DOOR_W, doorHeight = 100, rowHeight = 148, storyTop = 42
  const layout = building.floors.map((floor, index) => facadeRows(building, floor, index, perRow))
  const rowsFor = (index: number) => Math.max(1, layout[index].length)
  const wallWidth = Math.max(520, ...layout.flat().map(row => rowWidth(row) + 140))
  const width = wallWidth + 120, left = 60, right = left + wallWidth, centre = width / 2
  const roofPeak = 14, wallTop = 104
  let cursor = wallTop
  // Upper floors are drawn above lower ones; the first listed floor sits at ground level.
  const placed = building.floors.map((floor, index) => ({ floor, index, height: storyTop + rowsFor(index) * rowHeight })).reverse()
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
      <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="facade-wall-stop-top" /><stop offset="1" className="facade-wall-stop-bottom" /></linearGradient>
      <linearGradient id={`${uid}-roof`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="facade-roof-stop-top" /><stop offset="1" className="facade-roof-stop-bottom" /></linearGradient>
    </defs>
    <path className="facade-roof-shape" fill={`url(#${uid}-roof)`} d={`M${left - 30} ${wallTop + 10} ${left + 70} ${roofPeak + 18} ${right - 70} ${roofPeak + 18} ${right + 30} ${wallTop + 10}Z`} />
    {Array.from({ length: Math.floor((wallWidth - 120) / 26) }, (_, i) => <path key={i} className="facade-roof-rib" d={`M${left + 80 + i * 26} ${roofPeak + 22}V${wallTop + 4}`} />)}
    <path className="facade-wall" fill={`url(#${uid}-wall)`} d={`M${left} ${wallTop + 10}H${right}V${wallBottom}H${left}Z`} />
    {placed.map(({ floor, top, height, index }) => {
      const spaces = floor.rooms
      const upper = index > 0
      return <g className="facade-story" key={floor.label}>
        <text className="facade-floor-label" x={left + 22} y={top + 28}>{floor.label}</text>
        {!spaces.length && <g className="facade-unset">
          <rect x={left + 40} y={top + storyTop} width={wallWidth - 80} height={rowHeight - 40} rx="12" />
          <text x={centre} y={top + storyTop + (rowHeight - 40) / 2 + 6} textAnchor="middle">{floor.count === null ? tr('Room count not set', 'Wala pa matino ang ihap') : tr('No spaces yet', 'Wala pay lugar')}</text>
        </g>}
        {layout[index].map((row, rowIndex) => {
          const y = top + storyTop + rowIndex * rowHeight
          let x = centre - rowWidth(row) / 2
          const placedItems = row.map(item => { const at = x; x += itemWidth(item) + GAP; return { item, x: at } })
          const inside = placedItems.filter(({ item }) => item.type !== 'gate' && item.inside)
          return <g key={rowIndex}>
            {inside.length > 0 && <g className="facade-inside">
              <rect x={inside[0].x - 16} y={y - 22} width={inside[inside.length - 1].x + itemWidth(inside[inside.length - 1].item) - inside[0].x + 26} height={doorHeight + 50} rx="8" />
              <text x={inside[0].x - 6} y={y - 6}>{tr('Inside, past the gate', 'Sa sulod, lapas sa ganghaan')}</text>
            </g>}
            {placedItems.map(({ item, x: ix }) => {
              if (item.type === 'stairs') return <g key="stairs" className="facade-stairs" transform={`translate(${ix} ${y})`}>
                <path d={`M${STAIRS_W} ${doorHeight} ${Array.from({ length: 8 }, () => `v-${(doorHeight + 40) / 8} h-${STAIRS_W / 8}`).join(' ')} V${doorHeight} Z`} />
                <path className="facade-stairs-rail" d={`M${STAIRS_W} ${doorHeight - 28} L6 -62`} />
                <text className="facade-door-label" x={STAIRS_W / 2} y={doorHeight + 24} textAnchor="middle">{tr('Stairs', 'Hagdan')}</text>
              </g>
              if (item.type === 'gate') return <g key="gate" className="facade-gate" transform={`translate(${ix} ${y})`}>
                <rect y={doorHeight - 120} width={GATE_W} height={120} rx="6" />
                {Array.from({ length: 12 }, (_, b) => <path key={b} className="facade-gate-bar" d={`M${12 + b * 11.5} ${doorHeight - 112}V${doorHeight - 8}`} />)}
                <path className="facade-gate-split" d={`M${GATE_W / 2} ${doorHeight - 120}V${doorHeight}`} />
                <text className="facade-door-label" x={GATE_W / 2} y={doorHeight + 24} textAnchor="middle">{tr('Gate', 'Ganghaan')}</text>
              </g>
              const room = item.room
              const kind = isRentalRoom(room) ? 'room' : room.kind === 'Shared space' ? 'shared' : 'unit'
              // Clickable: any door when onPick is given (unless pickable says no). Glowing (is-pickable): only doors a picker offers.
              const canPick = Boolean(onPick && (pickable ? pickable(room.id) : true)), glow = Boolean(onPick && pickable?.(room.id))
              return <g key={room.id}>
                <g transform={`translate(${ix} ${y})`} onClick={canPick ? () => onPick!(room.id) : undefined}
                  className={`facade-room-door facade-space--${kind} ${isOccupied(room.id) ? 'is-occupied' : ''} ${room.id === selectedRoom ? 'is-selected' : ''} ${canPick ? 'is-clickable' : ''} ${glow ? 'is-pickable' : ''}`}>
                  {kind === 'unit' ? <path className="facade-door-frame" d={`M0 ${doorHeight}V${doorWidth / 2}A${doorWidth / 2} ${doorWidth / 2} 0 0 1 ${doorWidth} ${doorWidth / 2}V${doorHeight}Z`} />
                    : <rect className="facade-door-frame" width={doorWidth} height={doorHeight} rx="9" />}
                  {kind === 'room' ? <>
                    <rect className="facade-door-panel" x="8" y="8" width={doorWidth - 16} height={doorHeight - 16} rx="5" />
                    <circle className="facade-door-knob" cx={doorWidth - 15} cy={doorHeight * 0.58} r="3" />
                    {isOccupied(room.id) && <g className="facade-occupant-mark"><circle cx={doorWidth / 2} cy="30" r="7" /><path d={`M${doorWidth / 2 - 12} 54a12 12 0 0 1 24 0`} /></g>}
                  </> : <>
                    <rect className="facade-door-glass" x="7" y={kind === 'unit' ? 34 : 8} width={doorWidth - 14} height="30" rx="4" />
                    <path className="facade-door-panel-line" d={`M${doorWidth / 2} ${kind === 'unit' ? 68 : 46}V${doorHeight - 8}`} />
                  </>}
                  <text className="facade-door-label" x={doorWidth / 2} y={doorHeight + 24} textAnchor="middle">{spaceShort(room)}</text>
                </g>
                {item.window && <g className="facade-window" transform={`translate(${ix + doorWidth + 14} ${y + 10})`}>
                  <rect width={WINDOW_W} height={48} rx="4" />
                  <path d={`M${WINDOW_W / 2} 4V44M4 24H${WINDOW_W - 4}`} />
                </g>}
              </g>
            })}
          </g>
        })}
        {upper && <g className="facade-walkway">
          <rect x={left - 14} y={top + height - 14} width={wallWidth + 28} height={14} rx="2" />
        </g>}
      </g>
    })}
    <path className="facade-foundation" d={`M${left - 10} ${wallBottom}H${right + 10}V${wallBottom + 12}H${left - 10}Z`} />
    <path className="facade-ground-line" d={`M${left - 40} ${wallBottom + 18}H${right + 40}`} />
  </svg>
}

