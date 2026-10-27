import type { CSSProperties } from 'react'
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
  { label: "Bob's house", kind: 'house', spaces: 6, x: 27, y: 66.5, w: 40, h: 31 },
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

// Top-view vehicles (drawn facing east in an L×20 box, then turned for their lane). Philippine traffic keeps right.
type Heading = 'e' | 'w' | 'n' | 's'
type Ride = { kind: 'car' | 'moto' | 'jeep'; heading: Heading; color: string; duration: number; delay: number; rest: number }
const LENGTH = { car: 40, moto: 30, jeep: 60 }
const TRAFFIC: Ride[] = [
  { kind: 'car', heading: 'e', color: '#f4efe2', duration: 18, delay: -2, rest: 8 },
  { kind: 'moto', heading: 'e', color: '#e2725b', duration: 18, delay: -8, rest: 40 },
  { kind: 'car', heading: 'e', color: '#6cc3b0', duration: 18, delay: -14, rest: 74 },
  { kind: 'jeep', heading: 'w', color: '#dfe5e1', duration: 24, delay: -5, rest: 55 },
  { kind: 'moto', heading: 'w', color: '#f2c230', duration: 24, delay: -16, rest: 22 },
  { kind: 'moto', heading: 'n', color: '#6cc3b0', duration: 10, delay: -3, rest: 45 },
  { kind: 'car', heading: 's', color: '#f2c230', duration: 12, delay: -7, rest: 20 },
]
function Vehicle({ ride }: { ride: Ride }) {
  const L = LENGTH[ride.kind]
  const vertical = ride.heading === 'n' || ride.heading === 's'
  const turn = { e: undefined, w: `translate(${L},0) scale(-1,1)`, n: `translate(0,${L}) rotate(-90)`, s: `translate(20,0) rotate(90)` }[ride.heading]
  return <span className={`lp-lane lp-lane--${ride.heading}`} style={{ '--dur': `${ride.duration}s`, '--delay': `${ride.delay}s`, '--rest': `${ride.rest}%` } as CSSProperties}>
    <svg viewBox={vertical ? `0 0 20 ${L}` : `0 0 ${L} 20`} aria-hidden="true" focusable="false"><g transform={turn}>
      {ride.kind === 'car' && <>
        <rect x="1" y="2" width="38" height="16" rx="6" fill={ride.color} />
        <rect className="v-roof" x="12" y="4" width="12" height="12" rx="2" />
        <rect className="v-glass" x="25" y="3.5" width="7" height="13" rx="2.5" />
        <rect className="v-glass" x="6" y="4.5" width="5" height="11" rx="2" />
        <circle className="v-light" cx="38" cy="5" r="1.4" /><circle className="v-light" cx="38" cy="15" r="1.4" />
        <rect className="v-tail" x="0.8" y="3.5" width="1.6" height="3" /><rect className="v-tail" x="0.8" y="13.5" width="1.6" height="3" />
      </>}
      {ride.kind === 'moto' && <>
        <rect className="v-tyre" x="2" y="8.5" width="8" height="3" rx="1.5" /><rect className="v-tyre" x="20" y="8.5" width="8" height="3" rx="1.5" />
        <rect x="7" y="7" width="15" height="6" rx="3" fill={ride.color} />
        <line className="v-bar" x1="21" y1="4.5" x2="21" y2="15.5" />
        <ellipse className="v-rider" cx="13" cy="10" rx="4.5" ry="5.5" />
        <circle cx="14.5" cy="10" r="3.2" fill={ride.color} stroke="#1c2a23" strokeWidth="0.8" />
        <circle className="v-light" cx="29" cy="10" r="1.3" />
      </>}
      {ride.kind === 'jeep' && <>
        <rect x="1" y="2" width="58" height="16" rx="3" fill={ride.color} />
        <rect className="v-stripe-a" x="6" y="4" width="40" height="3" /><rect className="v-stripe-b" x="6" y="8.5" width="40" height="3" /><rect className="v-stripe-c" x="6" y="13" width="40" height="3" />
        <rect className="v-hood" x="47" y="3" width="11" height="14" rx="2" />
        <rect className="v-glass" x="47" y="4" width="3.5" height="12" rx="1" />
        <circle className="v-light" cx="58" cy="5" r="1.4" /><circle className="v-light" cx="58" cy="15" r="1.4" />
        <rect className="v-tail" x="0.8" y="3.5" width="1.6" height="3" /><rect className="v-tail" x="0.8" y="13.5" width="1.6" height="3" />
      </>}
    </g></svg>
  </span>
}

const TREES = [[1, 71, 9], [6, 86, 6], [70, 70, 7], [79, 79, 10], [90, 68, 7], [89, 87, 7], [71, 87, 5]]
const LAMPS = [[9, 'top'], [33, 'top'], [66, 'top'], [96, 'top'], [25, 'bottom'], [52, 'bottom'], [78, 'bottom']] as const

export const statusText = (language: Language, known: boolean, lit: number) => !known ? text(language, 'Checking…', 'Gisusi…') : lit ? `${lit} ${text(language, 'open now', 'bakante karon')}` : text(language, 'Full right now', 'Puno karon')

// The whole street: roads, lamps, trees, traffic and the four homes (each a link to the open rooms).
export function StreetPlan({ openByBuilding, known, active, setActive, language }: { openByBuilding: Map<string, string[]>; known: boolean; active: string; setActive: (label: string) => void; language: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  return <div className="lp-plan" role="group" aria-label={tr('Site plan on B. Zubiri St and Mariano Abella St. Glowing doors and windows are spaces open now. Choose a home to see rooms.', 'Plano sa B. Zubiri St ug Mariano Abella St. Ang nagsiga nga pultahan ug bintana bakante karon. Pilia ang balay aron makita ang kwarto.')}>
    <span className="lp-plan-road lp-plan-road--main" aria-hidden="true"><b>B. ZUBIRI ST.</b></span>
    <span className="lp-plan-road lp-plan-road--side" aria-hidden="true"><b><span className="lp-road-long">MARIANO ABELLA ST.</span><span className="lp-road-short">M. ABELLA ST.</span></b></span>
    {LAMPS.map(([left, side]) => <span key={`${left}${side}`} className={`lp-lamp lp-lamp--${side}`} style={{ left: `${left}%` } as CSSProperties} aria-hidden="true" />)}
    {TREES.map(([left, top, size]) => <svg key={`${left}:${top}`} className="lp-tree" viewBox="0 0 40 40" style={{ left: `${left}%`, top: `${top}%`, width: `${size}%` } as CSSProperties} aria-hidden="true" focusable="false">
      <circle className="lp-tree-shadow" cx="23" cy="24" r="16" /><circle className="lp-tree-crown" cx="20" cy="20" r="16" />
      <circle className="lp-tree-leaf" cx="14" cy="15" r="7" /><circle className="lp-tree-leaf" cx="25" cy="23" r="6" /><circle className="lp-tree-leaf" cx="15" cy="26" r="5" />
    </svg>)}
    {TRAFFIC.map((ride, index) => <Vehicle key={index} ride={ride} />)}
    {SITE.map(site => {
      const open = (openByBuilding.get(site.label) ?? []).slice(0, site.spaces)
      const lit = open.length
      const status = statusText(language, known, lit)
      return <a key={site.label} className={`lp-plot lp-plot--${site.kind}${active === site.label ? ' is-active' : ''}${lit ? ' has-open' : ''}`} href="/rooms" data-cursor={tr('Rooms', 'Kwarto')}
        aria-label={`${site.label}: ${status}`} onMouseEnter={() => setActive(site.label)} onFocus={() => setActive(site.label)}
        style={{ left: `${site.x}%`, top: `${site.y}%`, width: `${site.w}%`, height: `${site.h}%` } as CSSProperties}>
        <span className="lp-plot-tag" aria-hidden="true"><span className="lp-plot-name">{site.label}</span><span className={`lp-plot-status${lit ? ' is-open' : ''}`}>{status}</span></span>
        <Facade site={site} open={open} />
      </a>
    })}
    <span className="lp-compass" aria-hidden="true">N</span>
  </div>
}
