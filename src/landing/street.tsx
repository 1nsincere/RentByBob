import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { text, type Language } from '../i18n'
import './facade.css'

// Site plan of the rentable homes, placed as on the owner's sketch: B. Zubiri St in front, Mariano Abella St beside
// Bob's house. Stores and the Yamaha space are private negotiations and are never shown publicly (owner decision
// 27 Oct 2026). Every rentable space is drawn; it glows when the public listing shows it open right now.
export type Site = { label: string; kind: 'block' | 'house'; spaces: number; x: number; y: number; w: number; h: number }
export const SITE: Site[] = [
  { label: 'Building 1', kind: 'block', spaces: 10, x: 3, y: 3, w: 32, h: 47 },
  { label: 'Building 2', kind: 'block', spaces: 8, x: 37, y: 3, w: 28, h: 47 },
  { label: 'House 1', kind: 'house', spaces: 1, x: 69, y: 3, w: 26, h: 47 },
  { label: "Bob's house", kind: 'house', spaces: 6, x: 30, y: 66.5, w: 20.5, h: 31 },
]
export const TOTAL_SPACES = SITE.reduce((sum, site) => sum + site.spaces, 0)

// Front of each home, floor by floor (top floor first, cells left to right), following the owner's sketches
// (27 Oct 2026). Building 1: second-floor rooms open onto a balcony walkway, numbered from the stairs end, every other
// one with a window beside its door; the apartment has its own arched door; Rooms 01-03 are inside, along the hallway
// behind the gate where the stairs go up (drawn cut away). Building 2: Rooms 04-07 each have a window just left of the
// door; Room 08 sits in a wing on the left (its window in the wing, its door at the end of the walkway); downstairs the
// gym's double doors, a door to the stairs, and a door leading to Rooms 01-03 inside. Bob's house rooms are inside the
// house, so they show as windows. room = the unit label in the records; "*" matches any open space in that home.
type Cell = { kind: 'door' | 'apartment' | 'shared' | 'stairs' | 'gate' | 'window' | 'front' | 'entry'; room?: string; window?: 'left' | 'right'; inside?: boolean; rise?: 'left' | 'right' }
type Plan = { roof: 'hip' | 'gable'; walkway: boolean; wing?: string; floors: Cell[][] }
const door = (room: string, window?: 'left' | 'right'): Cell => ({ kind: 'door', room, window })
const inner = (room: string): Cell => ({ kind: 'door', room, inside: true })
const PLANS: Record<string, Plan> = {
  'Building 1': { roof: 'hip', walkway: true, floors: [
    [door('Room 09'), door('Room 08', 'right'), door('Room 07'), door('Room 06', 'right'), door('Room 05'), door('Room 04', 'right')],
    [{ kind: 'apartment', room: 'Apartment' }, inner('Room 01'), inner('Room 02'), inner('Room 03'), { kind: 'stairs', inside: true, rise: 'left' }, { kind: 'gate' }],
  ] },
  'Building 2': { roof: 'hip', walkway: true, wing: 'Room 08', floors: [
    [door('Room 08'), door('Room 07', 'left'), door('Room 06', 'left'), door('Room 05', 'left'), door('Room 04', 'left')],
    [{ kind: 'shared' }, { kind: 'entry' }, { kind: 'stairs', inside: true, rise: 'right' }, { kind: 'entry' }, inner('Room 01'), inner('Room 02'), inner('Room 03')],
  ] },
  'House 1': { roof: 'gable', walkway: false, floors: [[door('*', 'right')]] },
  "Bob's house": { roof: 'gable', walkway: false, floors: [
    [{ kind: 'window', room: 'Room 04' }, { kind: 'window', room: 'Room 05' }, { kind: 'window', room: 'Room 06' }],
    [{ kind: 'window', room: 'Room 01' }, { kind: 'front' }, { kind: 'window', room: 'Room 02' }, { kind: 'window', room: 'Room 03' }],
  ] },
}
const CELL = { door: 25, window: 28, apartment: 30, shared: 38, stairs: 26, gate: 38, front: 26, entry: 24 }
const cellWidth = (cell: Cell) => cell.kind === 'door' && cell.window ? 42 : CELL[cell.kind]
const FLOOR = 34, PARAPET = 5, WING = 34
function measure(plan: Plan) {
  const wallW = Math.max(...plan.floors.map(row => row.reduce((sum, cell) => sum + cellWidth(cell), 0))) + 10
  const roofH = plan.roof === 'hip' ? 15 : 24
  const wing = plan.wing ? WING : 0
  return { wallW, roofH, wing, W: wallW + wing + 20, H: roofH + plan.floors.length * FLOOR + 7 }
}
// The same drawing scale for every home: Building 1 fills its plot; the others take their share of its width.
const UNIT = measure(PLANS['Building 1']).W / SITE[0].w
export const facadeWidth = (site: Site) => Math.min(100, measure(PLANS[site.label]).W / UNIT / site.w * 100)

// Where a listed room is, in words for the public rooms page (null when the drawing does not place it).
export type RoomPlace = 'upstairs' | 'wing' | 'inside' | 'street' | 'house'
export function roomPlace(building: string, room: string): RoomPlace | null {
  const plan = PLANS[building]
  if (!plan) return null
  if (plan.wing === room) return 'wing'
  for (const [f, row] of plan.floors.entries()) for (const cell of row) if (cell.room === room) {
    if (cell.kind === 'window') return 'house'
    if (cell.inside) return 'inside'
    return plan.walkway && f < plan.floors.length - 1 ? 'upstairs' : 'street'
  }
  return null
}

// Which spaces glow: the open rooms by their record label; any open space whose label is not drawn still lights
// the next unlit space, so the count always matches the live listing.
function litRooms(plan: Plan, open: string[]) {
  const spaces = plan.floors.flat().filter(cell => cell.room).map(cell => cell.room!)
  const lit = new Set(open.filter(label => spaces.includes(label)))
  let extra = open.length - lit.size
  for (const room of spaces) { if (extra <= 0) break; if (!lit.has(room)) { lit.add(room); extra-- } }
  return lit
}

// onPick makes glowing rooms clickable (pointer convenience only: pages must also offer buttons for each room);
// focus marks one room (for example the card under the pointer).
export function Facade({ site, open, width = facadeWidth(site), onPick, focus }: { site: Site; open: string[]; width?: number; onPick?: (room: string) => void; focus?: string }) {
  const plan = PLANS[site.label]
  const { wallW, roofH, wing, W, H } = measure(plan)
  const x0 = 10 + wing, right = x0 + wallW, groundY = roofH + plan.floors.length * FLOOR
  const lit = litRooms(plan, open)
  const glow = (room?: string) => room && lit.has(room) ? ` is-lit${room === focus ? ' is-focus' : ''}` : ''
  const pick = (room?: string) => onPick && room && lit.has(room) ? { onClick: () => onPick(room), className: 'fx-pick' } : {}
  const roofLeft = x0 - wing
  const ridges = Array.from({ length: Math.floor((wallW + wing + 6) / 6) }, (_, i) => roofLeft - 1 + i * 6)
  // Top of the hip roof at x, so the corrugation lines stay inside the sloped ends.
  const roofTop = (x: number) => roofH + 2 - (roofH - 2) * Math.min(1, Math.min(x - (roofLeft - 6), right + 6 - x) / 14)
  let delay = 0
  const windowAt = (x: number, y: number, room: string | undefined, d: number) => <g>
    <rect className="fx-frame" x={x - 1.5} y={y - 1.5} width={16} height={12} rx={0.8} />
    <rect className={`fx-glass${glow(room)}`} x={x} y={y} width={13} height={9} style={{ transitionDelay: `${d}ms` } as CSSProperties} />
    {glow(room) ? <rect className="fx-curtain" x={x} y={y} width={4} height={9} /> : <line className="fx-glint" x1={x + 2} y1={y + 7} x2={x + 7} y2={y + 2} />}
    <line className="fx-mullion" x1={x + 6.5} y1={y} x2={x + 6.5} y2={y + 9} />
  </g>
  return <svg className="lp-facade" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" style={{ width: `${width}%` } as CSSProperties} aria-hidden="true" focusable="false">
    <ellipse className="fx-shadow" cx={W / 2} cy={H - 3} rx={W / 2} ry={3.5} />
    <rect className="fx-wall" x={x0} y={roofH} width={wallW} height={groundY - roofH} />
    <rect className="fx-wall-shade" x={right - 6} y={roofH} width={6} height={groundY - roofH} />
    {plan.wing && <g {...pick(plan.wing)}>
      <rect className="fx-wall" x={x0 - wing} y={roofH} width={wing} height={FLOOR} />
      <rect className="fx-wall-shade" x={x0 - wing} y={roofH + FLOOR - 3} width={wing} height={3} />
      <line className="fx-divider" x1={x0} y1={roofH} x2={x0} y2={roofH + FLOOR} />
      {windowAt(x0 - wing / 2 - 6.5, roofH + 11, plan.wing, delay++ * 70)}
    </g>}
    {plan.roof === 'hip' ? <>
      <polygon className="fx-roof" points={`${roofLeft - 6},${roofH + 1} ${right + 6},${roofH + 1} ${right - 8},3 ${roofLeft + 8},3`} />
      {ridges.filter(x => roofTop(x) < roofH - 3).map(x => <line key={x} className="fx-ridge" x1={x} y1={roofTop(x)} x2={x} y2={roofH - 1} />)}
      <rect className="fx-eave" x={roofLeft - 6} y={roofH - 1} width={wallW + wing + 12} height={3} />
    </> : <>
      <polygon className="fx-gable" points={`${x0},${roofH + 1} ${x0 + wallW / 2},6 ${right},${roofH + 1}`} />
      <circle className="fx-vent" cx={x0 + wallW / 2} cy={roofH - 6} r={2.6} />
      <polyline className="fx-roof-line" points={`${x0 - 5},${roofH + 3} ${x0 + wallW / 2},2 ${right + 5},${roofH + 3}`} />
    </>}
    {plan.floors.map((row, f) => {
      const top = roofH + f * FLOOR, bottom = top + FLOOR, upper = plan.walkway && f < plan.floors.length - 1
      const floorLine = upper ? bottom - PARAPET : bottom
      const natural = row.reduce((sum, cell) => sum + cellWidth(cell), 0)
      const stretch = (wallW - 10) / natural
      let x = x0 + 5
      const cells = row.map(cell => { const w = cellWidth(cell) * stretch, at = x; x += w; return { cell, x: at, w } })
      // Cut-away sections: each run of neighbouring cells that are inside the building.
      const runs: { x: number; w: number }[] = []
      cells.forEach(({ cell, x: cx, w }, i) => { if (!cell.inside) return; const last = runs[runs.length - 1]; if (last && cells[i - 1]?.cell.inside) last.w = cx + w - last.x; else runs.push({ x: cx, w }) })
      return <g key={f}>
        {runs.map(run => <rect key={run.x} className="fx-inside" x={run.x} y={top + 3} width={run.w} height={bottom - top - 3} />)}
        {cells.map(({ cell, x: cx, w }, i) => {
          const mid = cx + w / 2
          if (cell.kind === 'door') {
            const total = 11 + (cell.window ? 17 : 0), start = mid - total / 2, dy = floorLine - 19
            const dx = cell.window === 'left' ? start + 17 : start
            const d = delay++ * 70
            return <g key={i} {...pick(cell.room)}>
              {upper && i > 0 && <line className="fx-divider" x1={cx} y1={top + 2} x2={cx} y2={floorLine} />}
              <rect className={`fx-door-room${glow(cell.room)}`} x={dx} y={dy} width={11} height={19} rx={0.8} style={{ transitionDelay: `${d}ms` } as CSSProperties} />
              <circle className="fx-knob" cx={dx + 8.5} cy={dy + 10.5} r={0.9} />
              {cell.window && windowAt(cell.window === 'left' ? start + 1.5 : dx + 17, dy + 3, cell.room, d)}
            </g>
          }
          if (cell.kind === 'apartment') return <g key={i} {...pick(cell.room)}>
            <path className={`fx-door-room fx-arch${glow(cell.room)}`} d={`M${mid - 7} ${bottom} V${bottom - 15} A7 7 0 0 1 ${mid + 7} ${bottom - 15} V${bottom} Z`} />
            <circle className="fx-knob" cx={mid + 4} cy={bottom - 9} r={0.9} />
          </g>
          if (cell.kind === 'shared') return <g key={i}>
            <rect className="fx-frame" x={mid - 13} y={bottom - 22} width={26} height={22} rx={0.8} />
            <rect className="fx-door-double" x={mid - 11.5} y={bottom - 20.5} width={11} height={20.5} />
            <rect className="fx-door-double" x={mid + 0.5} y={bottom - 20.5} width={11} height={20.5} />
            <circle className="fx-knob" cx={mid - 2} cy={bottom - 10} r={0.9} /><circle className="fx-knob" cx={mid + 2} cy={bottom - 10} r={0.9} />
          </g>
          if (cell.kind === 'entry') return <g key={i}>
            <rect className="fx-door" x={mid - 6} y={bottom - 21} width={12} height={21} rx={0.8} />
            <circle className="fx-knob" cx={mid + 3.5} cy={bottom - 10} r={1} />
          </g>
          if (cell.kind === 'stairs') {
            const steps = 7, rise = (bottom - top) / steps, run = (w - 6) / steps
            const leftward = cell.rise !== 'right'
            const d = leftward
              ? `M${cx + w - 2} ${bottom} ${Array.from({ length: steps }, () => `v-${rise.toFixed(2)} h-${run.toFixed(2)}`).join(' ')} V${bottom} Z`
              : `M${cx + 2} ${bottom} ${Array.from({ length: steps }, () => `v-${rise.toFixed(2)} h${run.toFixed(2)}`).join(' ')} V${bottom} Z`
            return <g key={i}>
              <path className="fx-stair" d={d} />
              <line className="fx-rail" x1={leftward ? cx + w - 2 : cx + 2} y1={bottom - 9} x2={leftward ? cx + 4 : cx + w - 4} y2={top - 9} />
            </g>
          }
          if (cell.kind === 'gate') return <g key={i}>
            <rect className="fx-gate" x={cx + 3} y={bottom - 25} width={w - 6} height={25} rx={1} />
            {Array.from({ length: Math.floor((w - 8) / 3.5) }, (_, b) => <line key={b} className="fx-gate-bar" x1={cx + 5 + b * 3.5} y1={bottom - 23} x2={cx + 5 + b * 3.5} y2={bottom - 1} />)}
            <line className="fx-gate-split" x1={mid} y1={bottom - 25} x2={mid} y2={bottom} />
          </g>
          if (cell.kind === 'front') return <g key={i}>
            <rect className="fx-door" x={mid - 6} y={bottom - 21} width={12} height={21} rx={1} />
            <circle className="fx-knob" cx={mid + 3.5} cy={bottom - 10} r={1} />
            <polygon className="fx-awning" points={`${mid - 9},${bottom - 22} ${mid + 9},${bottom - 22} ${mid + 6},${bottom - 26} ${mid - 6},${bottom - 26}`} />
          </g>
          const d = delay++ * 70
          return <g key={i} {...pick(cell.room)}>
            <rect className="fx-frame" x={mid - 8.5} y={top + 7.5} width={17} height={18} rx={1} />
            <rect className={`fx-glass${glow(cell.room)}`} x={mid - 7} y={top + 9} width={14} height={15} style={{ transitionDelay: `${d}ms` } as CSSProperties} />
            {glow(cell.room) ? <rect className="fx-curtain" x={mid - 7} y={top + 9} width={5} height={15} /> : <line className="fx-glint" x1={mid - 4} y1={top + 21} x2={mid + 3} y2={top + 12} />}
            <line className="fx-mullion" x1={mid} y1={top + 9} x2={mid} y2={top + 24} />
            <rect className="fx-sill" x={mid - 9.5} y={top + 24.5} width={19} height={2} />
          </g>
        })}
        {upper && <>
          <rect className="fx-trim" x={x0 - 4} y={bottom - PARAPET} width={wallW + 8} height={PARAPET} />
          <line className="fx-rail" x1={x0 - 4} y1={bottom - PARAPET} x2={right + 4} y2={bottom - PARAPET} />
        </>}
      </g>
    })}
    <circle className="fx-bush" cx={x0 + 2} cy={groundY - 2} r={4} />
    <rect className="fx-ground" x={0} y={groundY} width={W} height={2.5} />
  </svg>
}

// Top-view street life (drawn facing east in an L×20 box, then turned for their lane). B. Zubiri St is an ordinary
// neighbourhood street, so it carries motorbikes only: Move It riders (red helmets), J&T riders loaded with parcels
// and the pandesal cart (a green sidecar cart behind a motorbike, like the one that passes the houses), crawling.
type Heading = 'e' | 'w' | 'n' | 's'
type Ride = { kind: 'moveit' | 'jt' | 'pandesal'; heading: Heading; duration: number; delay: number; rest: number; pillion?: boolean; stops?: boolean }
const LENGTH = { moveit: 36, jt: 58, pandesal: 60 }
// Riders in one lane share a pace so they never drive through each other; the pandesal cart sets the pace of its lane.
// The near (eastbound) lane belongs to the malunggay pandesal cart alone: once a minute it pulls up in front of Bob's
// house and waits while the student buys a bag (its timing is the shared 60 s street loop in landing.css).
const TRAFFIC: Ride[] = [
  { kind: 'moveit', heading: 'w', duration: 16, delay: -2, rest: 8, pillion: true },
  { kind: 'jt', heading: 'w', duration: 16, delay: -8, rest: 40 },
  { kind: 'moveit', heading: 'w', duration: 16, delay: -13, rest: 74 },
  { kind: 'pandesal', heading: 'e', duration: 60, delay: 0, rest: 45, stops: true },
]
// A motorbike from above, drawn facing east inside a 36×20 box, shifted right by x: both wheels, the tank and seat,
// forks, handlebar with mirrors and a headlight, the rider's shoulders, arms and knees, and a helmet with a visor
// (red for Move It, dark for J&T). The pillion passenger sits behind the rider.
function Motorbike({ x, pillion, jt }: { x: number; pillion?: boolean; jt?: boolean }) {
  return <g transform={`translate(${x},0)`}>
    <rect className="v-tyre" x="0.5" y="8.2" width="9" height="3.6" rx="1.8" /><rect className="v-hub" x="3.2" y="9.2" width="3.6" height="1.6" rx="0.8" />
    <rect className="v-tyre" x="26" y="8.2" width="9" height="3.6" rx="1.8" /><rect className="v-hub" x="28.7" y="9.2" width="3.6" height="1.6" rx="0.8" />
    <path className="v-bike" d="M5 8.9 Q9 7.5 15 7.1 Q22 6.7 27.5 8.8 L27.5 11.2 Q22 13.3 15 12.9 Q9 12.5 5 11.1 Z" />
    <path className={jt ? 'v-stripe v-stripe--jt' : 'v-stripe'} d="M12 8.2 Q18 7.6 24 8.6 L24 9.3 Q18 8.5 12 9 Z M12 11.8 Q18 12.4 24 11.4 L24 10.7 Q18 11.5 12 11 Z" />
    <rect className="v-seat" x="7.5" y="8.3" width="8.5" height="3.4" rx="1.7" />
    <line className="v-fork" x1="25.5" y1="10" x2="31" y2="10" />
    <line className="v-bar" x1="25" y1="3.6" x2="25" y2="16.4" /><circle className="v-mirror" cx="24" cy="3" r="1.1" /><circle className="v-mirror" cx="24" cy="17" r="1.1" />
    <rect className="v-tail" x="0" y="9" width="1.6" height="2" rx="0.6" /><ellipse className="v-light" cx="34.8" cy="10" rx="1.2" ry="2" />
    {pillion && <>
      <ellipse className="v-jacket-m" cx="11.5" cy="10" rx="3.1" ry="5" />
      <ellipse className="v-pants" cx="14" cy="5.9" rx="3.4" ry="1.7" /><ellipse className="v-pants" cx="14" cy="14.1" rx="3.4" ry="1.7" />
      <circle className={jt ? 'v-helmet v-helmet--dark' : 'v-helmet'} cx="12" cy="10" r="2.9" /><ellipse className="v-visor" cx="13.9" cy="10" rx="1" ry="2" />
    </>}
    <ellipse className="v-pants" cx="19.5" cy="5.6" rx="4" ry="1.9" /><ellipse className="v-pants" cx="19.5" cy="14.4" rx="4" ry="1.9" />
    <line className="v-arm" x1="20.8" y1="5.4" x2="25" y2="3.8" /><line className="v-arm" x1="20.8" y1="14.6" x2="25" y2="16.2" />
    <ellipse className={jt ? 'v-jacket-jt' : 'v-jacket-m'} cx="20.2" cy="10" rx="3.5" ry="5.4" />
    <circle className={jt ? 'v-helmet v-helmet--dark' : 'v-helmet'} cx="21.8" cy="10" r="3.5" /><ellipse className="v-visor" cx="24" cy="10" rx="1.2" ry="2.5" />
    <ellipse className="v-shine" cx="20.6" cy="8.4" rx="1.5" ry="0.9" />
  </g>
}

function RideArt({ kind, pillion }: { kind: Ride['kind']; pillion?: boolean }) {
  return <>
      {kind === 'moveit' && <>
        <Motorbike x={0} pillion={pillion} />
      </>}
      {kind === 'jt' && <>
        <rect className="v-cart-jt" x="1" y="1.5" width="24" height="17" rx="1.6" />
        <rect className="v-cart-floor" x="2.6" y="3.1" width="20.8" height="13.8" rx="1" />
        <rect className="v-jtbox" x="4" y="4.4" width="8" height="5.4" rx="0.8" /><line className="v-jttape" x1="8" y1="4.4" x2="8" y2="9.8" />
        <rect className="v-jtbox v-jtbox--b" x="13.6" y="4.8" width="7.6" height="6" rx="0.8" /><line className="v-jttape" x1="17.4" y1="4.8" x2="17.4" y2="10.8" />
        <rect className="v-jtbox v-jtbox--c" x="5" y="11.2" width="7.2" height="4.6" rx="0.8" /><line className="v-jttape" x1="5" y1="13.5" x2="12.2" y2="13.5" />
        <rect className="v-jtbox" x="13.4" y="12.2" width="8.4" height="3.8" rx="0.8" /><line className="v-jttape" x1="17.6" y1="12.2" x2="17.6" y2="16" />
        <line className="v-hitch" x1="25" y1="10" x2="30" y2="10" />
        <Motorbike x={22} jt />
      </>}
      {kind === 'pandesal' && <>
        <circle className="v-tank" cx="3.6" cy="5.6" r="3.2" /><circle className="v-tank" cx="3.6" cy="14.4" r="3.2" />
        <rect className="v-cart" x="7" y="1.5" width="28" height="17" rx="2" />
        {[11, 15, 19, 23, 27, 31].map(x => <line key={x} className="v-rib" x1={x} y1="2.5" x2={x} y2="17.5" />)}
        <rect className="v-banner" x="9" y="3" width="24" height="3" rx="0.6" />
        <line className="v-hitch" x1="35" y1="10" x2="40" y2="10" />
        <rect className="v-tyre" x="39" y="8.5" width="8" height="3" rx="1.5" /><rect className="v-tyre" x="51" y="8.5" width="8" height="3" rx="1.5" />
        <rect className="v-bike" x="42" y="7" width="14" height="6" rx="3" />
        <line className="v-bar" x1="55" y1="4.5" x2="55" y2="15.5" />
        <ellipse className="v-vendor" cx="49" cy="10" rx="3.6" ry="5.2" /><circle className="v-hair" cx="50.4" cy="10" r="2.9" />
        <circle className="v-light" cx="59" cy="10" r="1.2" />
      </>}
  </>
}

function Vehicle({ ride, extra, vendorLine }: { ride: Ride; extra?: boolean; vendorLine?: string }) {
  const L = LENGTH[ride.kind]
  const vertical = ride.heading === 'n' || ride.heading === 's'
  const turn = { e: undefined, w: `translate(${L},0) scale(-1,1)`, n: `translate(0,${L}) rotate(-90)`, s: `translate(20,0) rotate(90)` }[ride.heading]
  return <span className={`lp-lane lp-lane--${ride.heading}${extra ? ' lp-lane--extra' : ''}${ride.stops ? ' lp-lane--stop' : ''}`} style={{ '--dur': `${ride.duration}s`, '--delay': `${ride.delay}s`, '--rest': `${ride.rest}%` } as CSSProperties}>
    <svg viewBox={vertical ? `2 0 16 ${L}` : `0 2 ${L} 16`} aria-hidden="true" focusable="false"><g transform={turn}>
      <RideArt kind={ride.kind} pillion={ride.pillion} />
    </g></svg>
    {ride.stops && vendorLine && <span className="lp-say lp-say--vendor" aria-hidden="true">{vendorLine}</span>}
  </span>
}

// Bob: short, bald and always with his sungkod (walking stick). Drawn from above, facing east; he strolls the shoulder
// in front of his house, stopping now and then to look around.
// A string of Christmas lights: a wire drooping in swags between hooks, with glass bulbs in red, gold and green that
// twinkle in turn. Drawn in a 600x40 box and stretched to its container's width.
export function Garland({ className, swags = 4 }: { className?: string; swags?: number }) {
  const w = 600, sag = 18, step = w / swags, bulbs: { x: number; y: number; c: number }[] = []
  let d = 'M0 4'
  for (let i = 0; i < swags; i++) {
    const x0 = i * step, x1 = x0 + step
    d += ` Q${x0 + step / 2} ${4 + sag * 2} ${x1} 4`
    for (let k = 1; k < 7; k++) { const t = k / 7, x = x0 + step * t, y = 4 + sag * 4 * t * (1 - t); bulbs.push({ x, y, c: (i * 6 + k) % 3 }) }
  }
  return <svg className={['xm-garland', className].filter(Boolean).join(' ')} viewBox={`0 0 ${w} 40`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path className="xm-wire" d={d} />
    {bulbs.map((b, i) => <g key={i} className={`xm-bulb xm-bulb--${b.c}`} style={{ animationDelay: `${(i % 5) * 0.35}s` } as CSSProperties}>
      <rect x={b.x - 1.2} y={b.y - .5} width="2.4" height="2.4" rx=".5" className="xm-socket" /><ellipse cx={b.x} cy={b.y + 5} rx="2.6" ry="3.8" />
    </g>)}
  </svg>
}

// A corner spider web for Halloween (thin silk lines, a tiny spider hanging on a thread).
export function SpiderWeb({ className }: { className?: string }) {
  const rays = [0, 18, 36, 54, 72, 90].map(a => [Math.cos(a * Math.PI / 180) * 100, Math.sin(a * Math.PI / 180) * 100])
  const ring = (r: number) => rays.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * r / 100).toFixed(1)} ${(y * r / 100).toFixed(1)}`).join(' ')
  return <svg className={['hw-web', className].filter(Boolean).join(' ')} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    {rays.map(([x, y], i) => <line key={i} x1="0" y1="0" x2={x} y2={y} />)}
    {[25, 45, 65, 85].map(r => <path key={r} d={ring(r)} fill="none" />)}
    <line className="hw-thread" x1="58" y1="44" x2="58" y2="72" /><g className="hw-spider"><ellipse cx="58" cy="75" rx="3.4" ry="4" /><circle cx="58" cy="70.4" r="2.2" /><path d="M54.5 73l-4-2.5M54.5 76l-4.5 1M61.5 73l4-2.5M61.5 76l4.5 1" /></g>
  </svg>
}

// A parol, the Filipino Christmas star lantern: a five-point star in a round frame with two long tails; glows at night.
export function Parol({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg className={['xm-parol', className].filter(Boolean).join(' ')} style={style} viewBox="0 0 40 56" aria-hidden="true" focusable="false">
    <line className="xm-cord" x1="20" y1="0" x2="20" y2="4" />
    <circle className="xm-ring" cx="20" cy="20" r="15.5" />
    <path className="xm-star" d="M20 5.5 23.9 15.2 34.3 15.6 26.2 22.2 29 32.3 20 26.6 11 32.3 13.8 22.2 5.7 15.6 16.1 15.2Z" />
    <path className="xm-star-in" d="M20 12 21.9 17 27.2 17.2 23 20.5 24.5 25.6 20 22.7 15.5 25.6 17 20.5 12.8 17.2 18.1 17Z" />
    <circle className="xm-heart" cx="20" cy="20" r="2.4" />
    <path className="xm-tail" d="M15.5 33.5c-1.5 7-4 12-7 20M24.5 33.5c1.5 7 4 12 7 20" />
    <path className="xm-tail xm-tail--b" d="M18 34.6c-.6 7-1.6 12-3 19M22 34.6c.6 7 1.6 12 3 19" />
  </svg>
}

// A small jack-o'-lantern (Halloween season): orange body, stem, and a carved face that glows.
export function Pumpkin({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg className={['hw-pumpkin', className].filter(Boolean).join(' ')} style={style} viewBox="0 0 24 22" aria-hidden="true" focusable="false">
    <path className="hw-stem" d="M11.4 4.6c0-2 .6-3.4 2.2-4.1l.9 1c-1 .7-1.4 1.6-1.4 3.1Z" />
    <ellipse className="hw-body" cx="7.6" cy="13" rx="6.2" ry="7.6" /><ellipse className="hw-body" cx="16.4" cy="13" rx="6.2" ry="7.6" />
    <ellipse className="hw-body hw-body--mid" cx="12" cy="13" rx="6.4" ry="8.2" />
    <path className="hw-face" d="M7 10.2 9.6 9l.4 2.8Zm10 0L14.4 9l-.4 2.8ZM6.8 14.6c1.6 2.6 8.8 2.6 10.4 0l-1.6.6-1-1-1.2 1.2-1.4-1.2-1.4 1.2-1.2-1.2-1 1Z" />
  </svg>
}

const BobArt = () => <>
      <ellipse className="bob-shadow" cx="12" cy="11" rx="10" ry="8.5" />
      <ellipse className="bob-foot bob-foot--a" cx="11" cy="6.6" rx="3" ry="1.7" /><ellipse className="bob-foot bob-foot--b" cx="11" cy="13.4" rx="3" ry="1.7" />
      <ellipse className="bob-shirt" cx="12" cy="10" rx="4.2" ry="7.6" />
      <ellipse className="bob-arm" cx="12.4" cy="3.6" rx="2.6" ry="1.6" /><ellipse className="bob-arm" cx="12.4" cy="16.4" rx="2.6" ry="1.6" />
      <g className="bob-cane"><line x1="14" y1="17" x2="25" y2="17" /><circle cx="25" cy="17" r="0.9" /><circle className="bob-hand" cx="14" cy="17" r="1.5" /></g>
      <circle className="bob-ear" cx="12.6" cy="5.9" r="1.1" /><circle className="bob-ear" cx="12.6" cy="14.1" r="1.1" />
      <circle className="bob-head" cx="13" cy="10" r="4.4" /><ellipse className="bob-shine" cx="11.8" cy="8.4" rx="1.8" ry="1.1" />
</>
function Bob({ label, line, bless, farewell, hat }: { label: string; line: string; bless?: string; farewell?: string; hat?: 'witch' | 'santa' | false }) {
  return <span className="lp-bob" tabIndex={0} role="img" aria-label={label}>
    <span className="lp-bob-bubble" aria-hidden="true">{label}</span>
    <span className="lp-say lp-say--bob" aria-hidden="true">{line}</span>
    {bless && <span className="lp-say lp-say--bless" aria-hidden="true">{bless}</span>}
    {farewell && <span className="lp-say lp-say--farewell" aria-hidden="true">{farewell}</span>}
    <svg viewBox="0 0 26 20" aria-hidden="true" focusable="false">
      <BobArt />
      {hat === 'santa' && <g className="xm-hat"><circle cx="13" cy="10" r="5.6" className="xm-hat-fur" /><circle cx="13.4" cy="10" r="4.2" className="xm-hat-red" /><circle cx="9.2" cy="12.6" r="1.5" className="xm-hat-fur" /></g>}
      {hat === 'witch' && <g className="hw-hat"><circle cx="13" cy="10" r="6.6" className="hw-hat-brim" /><circle cx="13" cy="10" r="3.6" className="hw-hat-band" /><circle cx="13.6" cy="9.6" r="2.4" className="hw-hat-top" /><circle cx="14.2" cy="9.2" r="0.9" className="hw-hat-tip" /></g>}
    </svg>
  </span>
}

// The developer, who is also a tenant: a student with black hair, a gray polo and dark gray pants. A day on the street, on
// sidewalks and yards only (never the road): out of Bob's house, Bantay the dog runs over to be petted, the malunggay
// pandesal cart stops and he buys a bag, offers some to Sir Bob, then home again. Bob, the student, Bantay and the cart
// share one 60-second loop (landing.css).
const StudentArt = () => <>
      <ellipse className="bob-shadow" cx="12" cy="11" rx="10" ry="8.5" />
      <ellipse className="st-leg bob-foot bob-foot--a" cx="11" cy="7" rx="4.2" ry="2.1" /><ellipse className="st-leg bob-foot bob-foot--b" cx="11" cy="13" rx="4.2" ry="2.1" />
      <ellipse className="st-polo" cx="12" cy="10" rx="4" ry="7.4" />
      <ellipse className="st-polo" cx="12.4" cy="3.8" rx="2.6" ry="1.7" /><ellipse className="st-polo" cx="12.4" cy="16.2" rx="2.6" ry="1.7" />
      <circle className="st-hand" cx="14.6" cy="3.6" r="1.1" /><circle className="st-hand" cx="14.6" cy="16.4" r="1.1" />
      <path className="st-collar" d="M14.4 7 L16 10 L14.4 13" />
      <circle className="st-hair" cx="13" cy="10" r="4.4" /><ellipse className="st-hair-shine" cx="11.8" cy="8.6" rx="1.7" ry="1" />
</>

// The developer's profile card (opened from the walking student). Fill in or change anything here.
type Bilingual = { en: string; bis: string }
export const DEVELOPER = {
  name: 'Ace Grant Kyamko',
  photo: '/developer.jpg',
  photoHover: '/developer-hover.jpg',
  links: [
    { kind: 'facebook', label: 'Facebook', href: 'https://www.facebook.com/sheluvsalas' },
    { kind: 'email', label: 'acegrantk@gmail.com', href: 'mailto:acegrantk@gmail.com' },
    { kind: 'github', label: 'GitHub', href: 'https://github.com/1nsincere' },
  ] as { kind: 'facebook' | 'email' | 'github'; label: string; href: string }[],
  photoAlt: { en: 'Ace Grant Kyamko standing in a night-lit garden path, head bowed, arms crossed', bis: 'Si Ace Grant Kyamko na nakatayo sa daan sa hardin sa gabi, nakayuko at naka-cross ang braso' },
  role: { en: 'Developer of RentByBob', bis: 'Developer ng RentByBob' } as Bilingual,
  study: { en: 'Computer Engineer · CIT University', bis: 'Computer Engineer · CIT University' } as Bilingual,
  aim: { en: 'Work in progress', bis: 'Ginagawa pa' } as Bilingual,
  note: { en: "Also a tenant at Bob's house", bis: 'Umuupa rin sa bahay ni Bob' } as Bilingual,
  groups: [
    { title: { en: 'Software', bis: 'Software' } as Bilingual, items: ['PHP', 'HTML', 'CSS', 'React', 'TypeScript', 'Supabase', 'JS', 'Node.js', 
'Git' ] },
    { title: { en: 'Hardware and networking', bis: 'Hardware at networking' } as Bilingual, items: ['Mimosa P2P', 'Ubuntu Server', 'PfSense Server', 'Ubiquiti', 'Internet Service Technician'] },
    { title: { en: 'Off the clock', bis: 'Libangan' } as Bilingual, items: ['Gym', 'Gaming', 'Guitar', 'Hiking', 'Cooking', 'and more'] },
  ],
}

// Bantay, the street's dog: brown with a darker back, drawn from above facing east; the tail wags.
const DogArt = () => <>
      <ellipse className="bob-shadow" cx="12" cy="11" rx="10" ry="6.5" />
      <g className="dog-tail"><path d="M5.2 10 Q2 8.6 0.8 6.4" /></g>
      <ellipse className="dog-leg bob-foot bob-foot--a" cx="9" cy="6.4" rx="1.8" ry="1.1" /><ellipse className="dog-leg bob-foot bob-foot--b" cx="9" cy="13.6" rx="1.8" ry="1.1" />
      <ellipse className="dog-leg bob-foot bob-foot--b" cx="15" cy="6.6" rx="1.7" ry="1.1" /><ellipse className="dog-leg bob-foot bob-foot--a" cx="15" cy="13.4" rx="1.7" ry="1.1" />
      <ellipse className="dog-body" cx="11" cy="10" rx="6.8" ry="3.9" />
      <ellipse className="dog-back" cx="10.2" cy="10" rx="4.2" ry="2.1" />
      <ellipse className="dog-ear" cx="18.2" cy="7.1" rx="1.7" ry="1.2" /><ellipse className="dog-ear" cx="18.2" cy="12.9" rx="1.7" ry="1.2" />
      <circle className="dog-body" cx="19.2" cy="10" r="3.3" />
      <ellipse className="dog-snout" cx="22.3" cy="10" rx="1.6" ry="1.3" /><circle className="dog-nose" cx="23.7" cy="10" r="0.65" />
</>
function Dog({ heart, bark, hat }: { heart: string; bark: string; hat?: 'pumpkin' | 'bow' | false }) {
  return <div className="lp-roam lp-roam--dog" aria-hidden="true">
    <span className="lp-dog"><svg viewBox="0 0 26 20" focusable="false"><DogArt />{hat === 'bow' && <g className="xm-bow"><path d="M17.4 8.6 15.2 7.2v5.6l2.2-1.4 2.2 1.4V7.2Z" /><circle cx="17.4" cy="10" r=".9" /></g>}{hat === 'pumpkin' && <g className="hw-dog-hat" transform="translate(15.4 5.6) scale(0.34)"><ellipse className="hw-body" cx="7.6" cy="13" rx="6.2" ry="7.6" /><ellipse className="hw-body" cx="16.4" cy="13" rx="6.2" ry="7.6" /><ellipse className="hw-body hw-body--mid" cx="12" cy="13" rx="6.4" ry="8.2" /><path className="hw-stem" d="M11.4 4.6c0-2 .6-3.4 2.2-4.1l.9 1c-1 .7-1.4 1.6-1.4 3.1Z" /></g>}</svg></span>
    <span className="lp-say lp-say--heart">{heart}</span>
    <span className="lp-say lp-say--bark">{bark}</span>
  </div>
}

function Student({ label, open, onToggle, tr }: { label: string; open: boolean; onToggle: () => void; tr: (english: string, bisaya: string) => string }) {
  return <div className="lp-roam lp-roam--student">
    <button type="button" className={`lp-student${open ? ' is-open' : ''}`} aria-label={`${label}. ${tr('Show profile', 'Ipakita ang profile')}`} aria-expanded={open} aria-controls="lp-dev-card" onClick={onToggle}>
    <span className="lp-bob-bubble" aria-hidden="true">{label}</span>
    <svg viewBox="0 0 26 20" aria-hidden="true" focusable="false">
      <StudentArt />
    </svg>
    </button>
    <span className="lp-say lp-say--pet" aria-hidden="true">{tr('Hi, Bantay!', 'Hi, Bantay!')}</span>
    <span className="lp-say lp-say--buy" aria-hidden="true">{tr('Papalita ko ya!', 'Papalita ko ya!')}</span>
    <span className="lp-say lp-say--hello" aria-hidden="true">{tr('Pandesal, Sir Bob?', 'Pandesal, Sir Bob?')}</span>
    <span className="lp-say lp-say--ace-hi" aria-hidden="true">{tr('Hi Kuya James! Kuya Jake!', 'Uy Kuya James! Kuya Jake!')}</span>
    <span className="lp-say lp-say--ace-bye" aria-hidden="true">{tr('Drive safe, Kuyas!', 'Ingat, mga Kuya!')}</span>
  </div>
}

const LinkIcon = ({ kind }: { kind: 'facebook' | 'email' | 'github' }) => kind === 'github'
  ? <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
  : kind === 'facebook'
    ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="currentColor"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.7c0-.9.3-1.5 1.5-1.5h1.6V4.5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.1H7.8v3h2.6V21h3.1z" /></svg>
    : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 8 6 8-6" /></svg>

// The landonorris.com hero, adapted. Moving the pointer over the photo paints the second photo with one liquid stroke: a
// springy chain of points follows the pointer, the stroke swells with speed and tapers to the tail, and when the pointer
// stops it thins and slides back to nothing in about a second. Smooth curved edges, frame-rate independent, drawn on a
// canvas only while it is moving. When the card opens, one stroke sweeps across by itself. Pointer screens only, and not
// on lite phones or with reduced motion; those flip the photo on tap instead (CSS).
function useTrailReveal(figureRef: { current: HTMLElement | null }, canvasRef: { current: HTMLCanvasElement | null }, src: string, off: boolean) {
  useEffect(() => {
    const figure = figureRef.current, canvas = canvasRef.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!figure || !canvas || off || reduced || !window.matchMedia?.('(hover: hover)').matches || document.documentElement.dataset.perf === 'lite') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const photo = new Image()
    photo.src = src
    const COUNT = 26
    let w = 0, h = 0, frame = 0, then = 0, energy = 0, live = false
    const target = { x: 0, y: 0 }
    const chain = Array.from({ length: COUNT }, () => ({ x: 0, y: 0 }))
    const fit = () => {
      const box = figure.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      if (Math.round(box.width) === w && Math.round(box.height) === h) return
      w = Math.round(box.width); h = Math.round(box.height)
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const place = (x: number, y: number) => { target.x = x; target.y = y; if (!live) { chain.forEach(p => { p.x = x; p.y = y }); live = true } }
    const follow = (rate: number, dt: number) => 1 - (1 - rate) ** (dt / 16.67) // the same feel at 60 or 120 frames a second
    const shape = () => {
      const max = Math.min(w, h) * 0.62 // widest part of the stroke
      const left: { x: number; y: number }[] = [], right: { x: number; y: number }[] = []
      for (let i = 0; i < COUNT; i++) {
        const p = chain[i], q = chain[Math.min(COUNT - 1, i + 1)], o = chain[Math.max(0, i - 1)]
        let dx = o.x - q.x, dy = o.y - q.y
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len
        const taper = (1 - i / (COUNT - 1)) ** 0.7
        const half = max * energy * taper * 0.5
        left.push({ x: p.x - dy * half, y: p.y + dx * half }); right.push({ x: p.x + dy * half, y: p.y - dx * half })
      }
      const path = new Path2D()
      const outline = [...left, ...right.reverse()]
      path.moveTo((outline[0].x + outline[1].x) / 2, (outline[0].y + outline[1].y) / 2)
      for (let i = 1; i < outline.length; i++) {
        const p = outline[i], n = outline[(i + 1) % outline.length]
        path.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2)
      }
      path.closePath()
      path.ellipse(chain[0].x, chain[0].y, max * energy * 0.5, max * energy * 0.5, 0, 0, Math.PI * 2) // round head
      return path
    }
    const tick = (now: number) => {
      const dt = Math.min(48, now - (then || now - 16.67)); then = now
      const head = chain[0], before = { x: head.x, y: head.y }
      const k = follow(0.3, dt)
      head.x += (target.x - head.x) * k; head.y += (target.y - head.y) * k
      const link = follow(0.42, dt)
      for (let i = 1; i < COUNT; i++) { chain[i].x += (chain[i - 1].x - chain[i].x) * link; chain[i].y += (chain[i - 1].y - chain[i].y) * link }
      const speed = Math.hypot(head.x - before.x, head.y - before.y) / dt // px per ms
      const want = Math.min(1, speed / 0.45)
      energy += (want - energy) * follow(want > energy ? 0.16 : 0.07, dt)
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, w, h)
      if (energy > 0.004 && photo.complete && photo.naturalWidth) {
        ctx.fillStyle = '#000'
        ctx.fill(shape())
        const scale = Math.min(w / photo.naturalWidth, h / photo.naturalHeight)
        const pw = photo.naturalWidth * scale, ph = photo.naturalHeight * scale
        ctx.globalCompositeOperation = 'source-in'
        ctx.drawImage(photo, (w - pw) / 2, (h - ph) / 2, pw, ph)
      }
      const tail = chain[COUNT - 1]
      const settling = energy > 0.004 || Math.hypot(target.x - tail.x, target.y - tail.y) > 0.5
      if (settling) frame = requestAnimationFrame(tick)
      else { frame = 0; then = 0; energy = 0 }
    }
    const run = () => { if (!frame) frame = requestAnimationFrame(tick) }
    const move = (event: PointerEvent) => {
      fit()
      const box = figure.getBoundingClientRect()
      place(event.clientX - box.left, event.clientY - box.top)
      run()
    }
    const leave = () => { live = false }
    // One stroke by itself when the card opens.
    let teaser = 0
    const tease = window.setTimeout(() => {
      fit()
      const start = performance.now(), from = { x: w * 0.02, y: h * 0.26 }, to = { x: w * 0.98, y: h * 0.4 }
      live = false
      place(from.x, from.y)
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / 900), e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2
        target.x = from.x + (to.x - from.x) * e; target.y = from.y + (to.y - from.y) * e
        run()
        if (p < 1) teaser = requestAnimationFrame(step); else live = false
      }
      teaser = requestAnimationFrame(step)
    }, 650)
    figure.addEventListener('pointermove', move)
    figure.addEventListener('pointerleave', leave)
    return () => {
      window.clearTimeout(tease); cancelAnimationFrame(teaser); cancelAnimationFrame(frame)
      figure.removeEventListener('pointermove', move); figure.removeEventListener('pointerleave', leave)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [figureRef, canvasRef, src, off])
}

function ProfileCard({ onClose, tr, language }: { onClose: () => void; tr: (english: string, bisaya: string) => string; language: Language }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus() } // the close button is the only control
    }
    window.addEventListener('keydown', keys)
    return () => { window.removeEventListener('keydown', keys); opener?.focus?.() }
  }, [onClose])
  const t = (value: Bilingual) => text(language, value.en, value.bis)
  const [flipped, setFlipped] = useState(false)
  const photoRef = useRef<HTMLElement>(null)
  const trailRef = useRef<HTMLCanvasElement>(null)
  useTrailReveal(photoRef, trailRef, DEVELOPER.photoHover, flipped)
  return createPortal(<div className="dev-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section id="lp-dev-card" className="dev-card" role="dialog" aria-modal="true" aria-label={tr('Developer profile', 'Profile ng developer')}>
      <button type="button" className="dev-close" ref={closeRef} onClick={onClose} aria-label={tr('Close profile', 'Isara ang profile')}><span aria-hidden="true">×</span></button>
      <figure ref={photoRef} className={`dev-photo${flipped ? ' is-flipped' : ''}`} onClick={() => setFlipped(value => !value)}>
        <img className="dev-photo-main" src={DEVELOPER.photo} alt={t(DEVELOPER.photoAlt)} width="520" height="780" />
        <img className="dev-photo-ghost" src={DEVELOPER.photoHover} alt="" aria-hidden="true" width="520" height="780" />
        <img className="dev-photo-hover" src={DEVELOPER.photoHover} alt="" aria-hidden="true" width="520" height="780" />
        <canvas ref={trailRef} className="dev-photo-trail" aria-hidden="true" />
        <span className="dev-photo-frame" aria-hidden="true" />
        <span className="dev-photo-hint" aria-hidden="true">{flipped ? tr('Tap to go back', 'I-tap para bumalik') : tr('Hover or tap me', 'I-hover o i-tap ako')}</span>
        <figcaption><span className="dev-tag">{t(DEVELOPER.note)}</span></figcaption>
      </figure>
      <div className="dev-body">
        <p className="dev-eyebrow">{t(DEVELOPER.role)}</p>
        <h2 className="dev-name">{DEVELOPER.name}</h2>
        <p className="dev-study">{t(DEVELOPER.study)}</p>
        <p className="dev-aim">{t(DEVELOPER.aim)}</p>
        <ul className="dev-links" aria-label={tr('Find me online', 'Hanapin ako online')}>
          {DEVELOPER.links.map(link => <li key={link.kind}><a href={link.href} className={`dev-link dev-link--${link.kind}`} {...(link.kind === 'email' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
            <LinkIcon kind={link.kind} /><span>{link.label}</span>{link.kind !== 'email' && <span className="visually-hidden"> ({tr('opens in a new tab', 'magbubukas sa bagong tab')})</span>}
          </a></li>)}
        </ul>
        {DEVELOPER.groups.map(group => <div key={group.title.en} className="dev-group">
          <h3>{t(group.title)}</h3>
          <ul>{group.items.map(item => <li key={item}>{item === 'and more' ? tr('and more', 'at iba pa') : item}</li>)}</ul>
        </div>)}
      </div>
    </section>
  </div>, document.body)
}

// James and Jake run the place with Sir Bob (the RentByBob team). They drive in on Mariano Abella St in a 2016 Toyota Wigo, park beside Bob's house, walk the
// sidewalk to him and greet him with "Mano po", then drive off again (one 60 s loop with everyone else, landing.css).
// Their photos and Facebook pages are public here, shared by the owner (30 Oct 2026).
export const HELPERS = {
  james: { name: 'James', photo: '/james.jpg', facebook: 'https://www.facebook.com/jameslee.gica.1', alt: { en: 'James at the beach in sunglasses and a black sleeveless shirt', bis: 'Si James sa beach, naka-sunglasses at itim na sleeveless' } as Bilingual },
  jake: { name: 'Jake', photo: '/jake.jpg', facebook: 'https://www.facebook.com/ja.ke.477316', alt: { en: 'Jake taking a selfie with a peace sign', bis: 'Si Jake na nagse-selfie na may peace sign' } as Bilingual },
}
type HelperId = keyof typeof HELPERS

// A 2016 Toyota Wigo from above, facing east: compact five-door hatchback, short bonnet, big glass, red.
const WigoArt = () => <>
      <ellipse className="bob-shadow" cx="31" cy="16" rx="30" ry="13" />
      <rect className="wigo-body" x="3" y="3.5" width="54" height="23" rx="8" />
      <rect className="wigo-mirror" x="38" y="1.2" width="3.2" height="3" rx="1" /><rect className="wigo-mirror" x="38" y="25.8" width="3.2" height="3" rx="1" />
      <path className="wigo-glass" d="M40 6.5 Q46 7 47.5 9 L47.5 21 Q46 23 40 23.5 Z" />
      <rect className="wigo-roof" x="14" y="6.2" width="26" height="17.6" rx="3.5" />
      <path className="wigo-glass" d="M14 6.6 Q9.5 7.5 8.5 10 L8.5 20 Q9.5 22.5 14 23.4 Z" />
      <line className="wigo-line" x1="27" y1="6.4" x2="27" y2="23.6" />
      <rect className="wigo-lamp" x="53.4" y="5" width="2.6" height="4.6" rx="1.2" /><rect className="wigo-lamp" x="53.4" y="20.4" width="2.6" height="4.6" rx="1.2" />
      <rect className="wigo-tail" x="3.4" y="5.2" width="2" height="4.2" rx="0.8" /><rect className="wigo-tail" x="3.4" y="20.6" width="2" height="4.2" rx="0.8" />
      <rect className="wigo-grille" x="55.6" y="11.5" width="1.4" height="7" rx="0.6" />
</>
// James: black sleeveless shirt and sunglasses. Jake: dark green shirt.
const HelperArt = ({ who }: { who: HelperId }) => <>
      <ellipse className="bob-shadow" cx="12" cy="11" rx="10" ry="8.5" />
      <ellipse className="st-leg bob-foot bob-foot--a" cx="11" cy="7" rx="4.2" ry="2.1" /><ellipse className="st-leg bob-foot bob-foot--b" cx="11" cy="13" rx="4.2" ry="2.1" />
      <ellipse className={`hp-shirt hp-shirt--${who}`} cx="12" cy="10" rx="4" ry="7.4" />
      {who === 'james' ? <><circle className="st-hand" cx="12.4" cy="3.4" r="1.6" /><circle className="st-hand" cx="12.4" cy="16.6" r="1.6" /></>
        : <><ellipse className="hp-shirt hp-shirt--jake" cx="12.4" cy="3.8" rx="2.6" ry="1.7" /><ellipse className="hp-shirt hp-shirt--jake" cx="12.4" cy="16.2" rx="2.6" ry="1.7" /></>}
      <circle className="st-hand" cx="14.6" cy="3.6" r="1.1" /><circle className="st-hand" cx="14.6" cy="16.4" r="1.1" />
      <circle className="st-hair" cx="13" cy="10" r="4.4" />
      {who === 'james' && <rect className="hp-shades" x="15.4" y="6.6" width="1.6" height="6.8" rx="0.8" />}
</>

function Wigo() {
  return <div className="lp-car" aria-hidden="true"><svg viewBox="0 0 60 30" focusable="false"><WigoArt /></svg></div>
}

function Helper({ who, label, line, extra, open, onOpen, tr }: { who: HelperId; label: string; line: string; extra: { name: string; text: string }[]; open: boolean; onOpen: () => void; tr: (english: string, bisaya: string) => string }) {
  return <div className={`lp-roam lp-roam--${who}`}>
    <button type="button" className={`lp-student lp-helper${open ? ' is-open' : ''}`} aria-label={`${label}. ${tr('Show contact', 'Ipakita ang contact')}`} aria-haspopup="dialog" onClick={onOpen}>
      <span className="lp-bob-bubble" aria-hidden="true">{label}</span>
      <svg viewBox="0 0 26 20" aria-hidden="true" focusable="false"><HelperArt who={who} /></svg>
    </button>
    <span className={`lp-say lp-say--mano-${who}`} aria-hidden="true">{line}</span>
    {extra.map(say => <span key={say.name} className={`lp-say lp-say--${say.name}`} aria-hidden="true">{say.text}</span>)}
  </div>
}

function HelperCard({ who, onClose, tr, language }: { who: HelperId; onClose: () => void; tr: (english: string, bisaya: string) => string; language: Language }) {
  const helper = HELPERS[who]
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', keys)
    return () => { window.removeEventListener('keydown', keys); opener?.focus?.() }
  }, [onClose])
  return createPortal(<div className="dev-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="dev-card helper-card" role="dialog" aria-modal="true" aria-label={`${helper.name} · ${tr('contact', 'contact')}`}>
      <button type="button" className="dev-close" ref={closeRef} onClick={onClose} aria-label={tr('Close', 'Isara')}><span aria-hidden="true">×</span></button>
      <figure className="dev-photo helper-photo"><img src={helper.photo} alt={text(language, helper.alt.en, helper.alt.bis)} width="520" height="780" /></figure>
      <div className="dev-body">
        <p className="dev-eyebrow">{tr('RentByBob team · Property assistant', 'RentByBob team · Property assistant')}</p>
        <h2 className="dev-name">{helper.name}</h2>
        <p className="dev-study">{tr("Part of the team that keeps Sir Bob's homes running: he welcomes new tenants, keeps the rent records and gets repairs done. Message him on Facebook about rooms, payments or anything that needs fixing.", 'Bahagi ng team na nagpapatakbo sa mga bahay ni Sir Bob: siya ang sumasalubong sa bagong umuupa, nag-aasikaso ng talaan ng upa at nagpapaayos ng sira. Mag-message sa kanya sa Facebook tungkol sa kuwarto, bayad o anumang kailangang ayusin.')}</p>
        <ul className="dev-links" aria-label={tr('Contact', 'Contact')}>
          <li><a href={helper.facebook} className="dev-link dev-link--facebook" target="_blank" rel="noopener noreferrer"><LinkIcon kind="facebook" /><span>{tr('Message on Facebook', 'Mag-message sa Facebook')}</span><span className="visually-hidden"> ({tr('opens in a new tab', 'magbubukas sa bagong tab')})</span></a></li>
        </ul>
      </div>
    </section>
  </div>, document.body)
}

// Who is who on the street, drawn with the same pictures that move on the plan.
function Legend({ tr, onDeveloper, onHelper }: { tr: (english: string, bisaya: string) => string; onDeveloper: () => void; onHelper: (who: HelperId) => void }) {
  const bike = (kind: Ride['kind'], width: number, pillion?: boolean) => <svg viewBox={`0 2 ${width} 16`} aria-hidden="true" focusable="false"><RideArt kind={kind} pillion={pillion} /></svg>
  const person = (art: ReactNode) => <svg viewBox="0 0 26 20" aria-hidden="true" focusable="false">{art}</svg>
  // Open on wide screens; collapsed on phones, where the plan is too small to spare the room.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(min-width: 48rem)').matches)
  return <details className="lp-legend" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{tr('Who is who', 'Sino-sino')}</summary>
    <ul>
      <li><span className="lp-legend-icon">{bike('moveit', 36, true)}</span>{tr('Move It rider', 'Move It rider')}</li>
      <li><span className="lp-legend-icon lp-legend-icon--wide">{bike('jt', 58)}</span>{tr('J&T rider with parcels', 'J&T rider na may parcel')}</li>
      <li><span className="lp-legend-icon lp-legend-icon--wide">{bike('pandesal', 60)}</span>{tr('Malunggay pandesal cart', 'Kariton ng malunggay pandesal')}</li>
      <li><span className="lp-legend-icon">{person(<BobArt />)}</span>{tr('Bob, with his sungkod', 'Si Bob, may tungkod')}</li>
      <li><span className="lp-legend-icon">{person(<DogArt />)}</span>{tr('Bantay, the street dog', 'Si Bantay, ang aso sa kalye')}</li>
      <li><button type="button" className="lp-legend-dev" onClick={() => onHelper('james')}><span className="lp-legend-icon">{person(<HelperArt who="james" />)}</span>{tr('James (tap)', 'Si James (i-tap)')}</button></li>
      <li><button type="button" className="lp-legend-dev" onClick={() => onHelper('jake')}><span className="lp-legend-icon">{person(<HelperArt who="jake" />)}</span>{tr('Jake (tap)', 'Si Jake (i-tap)')}</button></li>
      <li><button type="button" className="lp-legend-dev" onClick={onDeveloper}><span className="lp-legend-icon">{person(<StudentArt />)}</span>{tr('Developer and tenant (tap)', 'Developer at umuupa (i-tap)')}</button></li>
    </ul>
  </details>
}

const TREES = [[1, 71, 9], [6, 86, 6], [70, 70, 7], [79, 79, 10], [90, 68, 7], [89, 87, 7], [71, 87, 5]]
const LAMPS = [[9, 'top'], [33, 'top'], [66, 'top'], [96, 'top'], [25, 'bottom'], [52, 'bottom'], [78, 'bottom']] as const

export const statusText = (language: Language, known: boolean, lit: number) => !known ? text(language, 'Checking…', 'Sinusuri…') : lit ? `${lit} ${text(language, 'open now', 'bakante ngayon')}` : text(language, 'Full right now', 'Puno ngayon')

// The whole street: roads, lamps, trees, traffic and the four homes (each a link to the open rooms).
export function StreetPlan({ openByBuilding, known, active, setActive, language, season = null }: { openByBuilding: Map<string, string[]>; known: boolean; active: string; setActive: (label: string) => void; language: Language; season?: 'halloween' | 'christmas' | null }) {
  const spooky = season === 'halloween', festive = season === 'christmas'
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [profile, setProfile] = useState(false)
  const [helper, setHelper] = useState<HelperId | null>(null)
  const planRef = useRef<HTMLDivElement>(null)
  // A device set to reduce motion (iPhone Reduce Motion, Android Remove animations, some battery savers) sees the street
  // standing still, as it should; a button lets that person choose to watch it move (remembered on this device). The
  // choice sets data-street-motion on the landing root, which lifts the reduced-motion rules for the street only.
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [streetMotion, setStreetMotion] = useState(() => { try { return localStorage.getItem('rentbybob-street-motion') === 'on' } catch { return false } })
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const change = () => setReduceMotion(query.matches)
    query.addEventListener?.('change', change)
    return () => query.removeEventListener?.('change', change)
  }, [])
  useEffect(() => {
    const root = planRef.current?.closest('.lp')
    if (!root) return
    if (streetMotion) root.setAttribute('data-street-motion', 'on'); else root.removeAttribute('data-street-motion')
    try { localStorage.setItem('rentbybob-street-motion', streetMotion ? 'on' : 'off') } catch { /* not remembered */ }
  }, [streetMotion])
  // Everything on the plan stands still while it is scrolled out of view (saves battery and work on phones).
  useEffect(() => {
    const plan = planRef.current
    if (!plan || typeof IntersectionObserver === 'undefined') return
    const watcher = new IntersectionObserver(([entry]) => plan.classList.toggle('is-offscreen', !entry.isIntersecting), { rootMargin: '120px' })
    watcher.observe(plan)
    return () => watcher.disconnect()
  }, [])
  useEffect(() => {
    if (!profile) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfile(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [profile])
  // On a phone the plan is wider than the screen and scrolls sideways inside its frame (so it can be drawn larger); the
  // legend stays put over it and the profile card is a page-level dialog.
  return <div className="lp-plan-wrap">
    <Legend tr={tr} onDeveloper={() => setProfile(true)} onHelper={setHelper} />
    {helper && <HelperCard who={helper} onClose={() => setHelper(null)} tr={tr} language={language} />}
    {profile && <ProfileCard onClose={() => setProfile(false)} tr={tr} language={language} />}
    <div className="lp-plan-scroll">
    <div ref={planRef} className={`lp-plan${profile ? ' has-profile' : ''}`} role="group" aria-label={tr('Site plan on B. Zubiri St and Mariano Abella St. Glowing doors and windows are spaces open now. Choose a home to see rooms.', 'Plano ng B. Zubiri St at Mariano Abella St. Bakante ngayon ang umiilaw na pinto at bintana. Piliin ang bahay para makita ang kuwarto.')}>
    <span className="lp-plan-road lp-plan-road--main" aria-hidden="true"><b>B. ZUBIRI ST.</b></span>
    <span className="lp-plan-road lp-plan-road--side" aria-hidden="true"><b><span className="lp-road-long">MARIANO ABELLA ST.</span><span className="lp-road-short">M. ABELLA ST.</span></b></span>
    {LAMPS.map(([left, side]) => <span key={`${left}${side}`} className={`lp-lamp lp-lamp--${side}`} style={{ left: `${left}%` } as CSSProperties} aria-hidden="true" />)}
    {TREES.map(([left, top, size], index) => <svg key={`${left}:${top}`} className="lp-tree" viewBox="0 0 40 40" style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, '--i': index } as CSSProperties} aria-hidden="true" focusable="false">
      <circle className="lp-tree-shadow" cx="23" cy="24" r="16" /><circle className="lp-tree-crown" cx="20" cy="20" r="16" />
      <circle className="lp-tree-leaf" cx="14" cy="15" r="7" /><circle className="lp-tree-leaf" cx="25" cy="23" r="6" /><circle className="lp-tree-leaf" cx="15" cy="26" r="5" />
    </svg>)}
    {TRAFFIC.map((ride, index) => <Vehicle key={index} ride={ride} extra={index >= 4} vendorLine={tr('Malunggay Pandesal, init pa with cheese, tag singko lang!', 'Malunggay Pandesal, init pa with cheese, tag singko lang!')} />)}
    {spooky && [[7, 48], [38, 48], [66, 48], [86, 48], [27.5, 95], [47, 95], [58, 72]].map(([left, top], i) => <Pumpkin key={i} className="lp-hw-map" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${i * -0.6}s` }} />)}
    {festive && <Garland className="lp-xm-map-garland lp-xm-map-garland--top" swags={6} />}
    {festive && <Garland className="lp-xm-map-garland lp-xm-map-garland--bottom" swags={6} />}
    {festive && [[2.2, 27], [35.5, 31], [66.5, 31], [96.5, 33], [53, 68]].map(([left, top], i) => <Parol key={i} className="lp-xm-map" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${i * -0.9}s` }} />)}
    <Bob hat={spooky ? 'witch' : festive ? 'santa' : false} label={tr('This is Bob', 'Ito si Bob')} line={tr('Thank you, iho!', "Salamat, iho!")} bless={tr('God bless you both!', 'Pagpalain kayo ng Diyos!')} farewell={tr('Take care, you two!', 'Ingat kayo, mga iho!')} />
    <Dog hat={spooky ? 'pumpkin' : festive ? 'bow' : false} heart="♥" bark={tr('Arf!', 'Aw aw!')} />
    <span className="lp-driveway" aria-hidden="true" />
    <Wigo />
    <Helper who="james" label={tr('James, RentByBob team', 'Si James, RentByBob team')} line={tr('Mano po, Sir Bob!', 'Mano po, Sir Bob!')} extra={[{ name: 'james-ace', text: tr('Hey Ace! How is the code?', 'Uy Ace! Kumusta ang code?') }, { name: 'james-bye', text: tr('See you, Sir Bob!', 'Paalam, Sir Bob!') }]} open={helper === 'james'} onOpen={() => setHelper('james')} tr={tr} />
    <Helper who="jake" label={tr('Jake, RentByBob team', 'Si Jake, RentByBob team')} line={tr('Mano po!', 'Mano po!')} extra={[{ name: 'jake-ace', text: tr('Pandesal for us too?', 'May pandesal pa ba para sa amin?') }]} open={helper === 'jake'} onOpen={() => setHelper('jake')} tr={tr} />
    <Student label={tr('The developer, and a tenant here too', 'Ang developer, at umuupa rin dito')} open={profile} onToggle={() => setProfile(open => !open)} tr={tr} />
    {SITE.map(site => {
      const open = (openByBuilding.get(site.label) ?? []).slice(0, site.spaces)
      const lit = open.length
      const status = statusText(language, known, lit)
      // Homes on the map are for looking and playing, not links (owner request 30 Oct 2026): pointing, tapping or
      // focusing one selects it (its status shows beside the map). The buttons under the map and See open rooms still go to the rooms page.
      return <div key={site.label} role="img" tabIndex={0} className={`lp-plot lp-plot--${site.kind}${active === site.label ? ' is-active' : ''}${lit ? ' has-open' : ''}`}
        aria-label={`${site.label}: ${status}`} onMouseEnter={() => setActive(site.label)} onFocus={() => setActive(site.label)} onClick={() => setActive(site.label)}
        style={{ left: `${site.x}%`, top: `${site.y}%`, width: `${site.w}%`, height: `${site.h}%` } as CSSProperties}>
        <span className="lp-plot-tag" aria-hidden="true"><span className="lp-plot-name">{site.label}</span><span className={`lp-plot-status${lit ? ' is-open' : ''}`}>{status}</span></span>
        <Facade site={site} open={open} />
      </div>
    })}
    <span className="lp-cloud lp-cloud--a" aria-hidden="true" /><span className="lp-cloud lp-cloud--b" aria-hidden="true" />
    <span className="lp-compass" aria-hidden="true">N</span>
    </div>
    </div>
    {reduceMotion && <p className="lp-motion-note">
      <span>{streetMotion ? tr('The street is moving.', 'Gumagalaw ang kalye.') : tr('The street is still because this device asks for less motion.', 'Nakatigil ang kalye dahil humihingi ang device na ito ng mas kaunting galaw.')}</span>
      <button type="button" className="lp-motion-toggle" aria-pressed={streetMotion} onClick={() => setStreetMotion(value => !value)}>
        {streetMotion ? tr('Stop the motion', 'Itigil ang galaw') : tr('Play the street', 'Patakbuhin ang kalye')}
      </button>
    </p>}
  </div>
}

// The same four homes as plain buttons under the map: easy to tap on a phone, and they light up with the map.
export function StreetSummary({ openByBuilding, known, active, setActive, language }: { openByBuilding: Map<string, string[]>; known: boolean; active: string; setActive: (label: string) => void; language: Language }) {
  return <ul className="lp-plan-chips" aria-label={text(language, 'Homes on the street', 'Mga bahay sa kalye')}>
    {SITE.map(site => {
      const lit = (openByBuilding.get(site.label) ?? []).slice(0, site.spaces).length
      return <li key={site.label}><a href="/rooms" className={`lp-chip${active === site.label ? ' is-active' : ''}${lit ? ' has-open' : ''}`} onMouseEnter={() => setActive(site.label)} onFocus={() => setActive(site.label)}>
        <span className="lp-chip-name">{site.label}</span><span className="lp-chip-status">{statusText(language, known, lit)}</span>
      </a></li>
    })}
  </ul>
}
