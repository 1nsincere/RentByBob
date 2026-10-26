import { useCallback, useEffect, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { BuildingArt, BuildingFacade } from './BuildingDrawings'
import type { Building as DrawnBuilding, Floor, Room } from './property-preview-store'
import { sketchPositions, type SketchSlot } from './property-sketch.ts'
import { philippineToday } from './payment-preview-model.ts'
import { supabase } from './client'
import { text, type Language } from '../i18n'

type DbBuilding = { id: string; label: string; sketch_slot: SketchSlot | null }
type DbUnit = { id: string; label: string; building_id: string; floor_label: string | null; kind: 'room' | 'apartment' | 'shared' | 'house' | 'commercial' }
const drawnKind: Record<DbUnit['kind'], string> = { room: 'Room', apartment: 'Apartment', shared: 'Shared space', house: 'House', commercial: 'Commercial' }
const floorOrder = (label: string | null) => label === 'Ground floor' ? 0 : label === 'Second floor' ? 1 : label ? 2 : -1

// Converts saved buildings/rooms into the drawing model: one floor band per saved floor label.
function toDrawn(building: DbBuilding, units: DbUnit[], language: Language): DrawnBuilding {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const own = units.filter(unit => unit.building_id === building.id)
  const labels = [...new Set(own.map(unit => unit.floor_label))].sort((a, b) => floorOrder(a) - floorOrder(b))
  const floors: Floor[] = labels.map(label => {
    const rooms: Room[] = own.filter(unit => unit.floor_label === label).map(unit => ({ id: unit.id, label: unit.label, kind: drawnKind[unit.kind] }))
    return { label: label ?? tr('Rooms', 'Mga kwarto'), count: rooms.filter(room => room.kind === 'Room').length, rooms }
  })
  return { id: building.id, name: building.label, floors: floors.length ? floors : [{ label: tr('No rooms yet', 'Wala pay kwarto'), count: null, rooms: [] }] }
}

// Real property map: fixed sketch positions, building front views, Occupied/Vacant from current agreements only.
export function RealPropertyMap({ propertyId, owner, startAgreement, language = 'en' }: { propertyId: string; owner: boolean; startAgreement?: (unitId: string) => void; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [buildings, setBuildings] = useState<DbBuilding[]>([])
  const [units, setUnits] = useState<DbUnit[]>([])
  const [occupied, setOccupied] = useState<Set<string> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [entered, setEntered] = useState('')
  const [floorIndex, setFloorIndex] = useState(0)
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    try {
      const [b, u] = await Promise.all([
        supabase!.from('buildings').select('id,label,sketch_slot').eq('property_id', propertyId).is('archived_at', null).order('label'),
        supabase!.from('units').select('id,label,building_id,floor_label,kind').eq('property_id', propertyId).is('archived_at', null).order('label'),
      ])
      if (b.error || u.error) throw b.error || u.error
      setBuildings(b.data as DbBuilding[]); setUnits(u.data as DbUnit[])
      const rent = await supabase!.rpc('read_rent_workspace', { p_property_id: propertyId })
      if (rent.error) setOccupied(null)
      else {
        const today = philippineToday()
        setOccupied(new Set((rent.data.agreements as { unit_id: string; move_in: string; ended_on?: string | null }[])
          .filter(agreement => agreement.move_in <= today && (!agreement.ended_on || agreement.ended_on >= today)).map(agreement => agreement.unit_id)))
      }
      setState('ready')
    } catch { setState('failed') }
  }, [propertyId])
  useEffect(() => { void load() }, [load])

  async function runSetup() {
    setBusy(true); setMessage(null)
    const { data, error } = await supabase!.rpc('setup_property_from_sketch', { p_property_id: propertyId })
    setBusy(false); setReviewing(false)
    if (error) { setMessage({ text: error.code === '42501' ? tr('Only the owner with an active authenticator session can set up the layout.', 'Ang tag-iya lang nga naay aktibo nga authenticator ang maka-set up sa layout.') : tr('The layout could not be created. Nothing was changed.', 'Wala mahimo ang layout. Walay nausab.'), error: true }); return }
    setMessage({ text: tr(`Layout ready: ${data.buildings_created} buildings and ${data.units_created} rooms created; existing ones kept.`, `Andam na ang layout: ${data.buildings_created} ka bilding ug ${data.units_created} ka kwarto ang nahimo; gitipigan ang naa na.`), error: false })
    await load()
  }

  if (state === 'failed') return <p className="notice notice--error" role="alert">{tr('The property map could not be loaded. The layout migration must be applied and your staff session must be active.', 'Wala ma-load ang mapa. Kinahanglan ma-apply ang layout migration ug aktibo ang imong staff session.')}</p>
  if (state === 'loading') return <LoadingSkeleton label={tr('Loading property map…', 'Gikarga ang mapa…')} rows={3} />
  const placed = buildings.filter(building => building.sketch_slot)
  const unplaced = buildings.filter(building => !building.sketch_slot)
  const isOccupied = (unitId: string) => occupied?.has(unitId) ?? false
  const statusFor = (unit: DbUnit) => unit.kind === 'shared' ? tr('Shared space', 'Gipaambit nga lugar') : occupied === null ? tr('Status unavailable', 'Wala makita ang kahimtang') : isOccupied(unit.id) ? tr('Occupied', 'Giokupahan') : tr('Vacant', 'Bakante')
  const summary = (building: DbBuilding) => {
    const rentable = units.filter(unit => unit.building_id === building.id && unit.kind !== 'shared')
    const taken = rentable.filter(unit => isOccupied(unit.id)).length
    if (!rentable.length) return tr('No rooms yet', 'Wala pay kwarto')
    if (rentable.length === 1) return statusFor(rentable[0])
    return occupied === null ? `${rentable.length} ${tr('spaces', 'ka lugar')}` : `${taken} ${tr('of', 'sa')} ${rentable.length} ${tr('occupied', 'giokupahan')}`
  }
  const current = buildings.find(building => building.id === entered)

  return <section className="property-visual real-property-map" aria-labelledby="real-map-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('YOUR PROPERTY, AT A GLANCE', 'IMONG PROPIEDAD, SA USA KA TAN-AW')}</p><h2 id="real-map-heading">{tr('Property map', 'Mapa sa propiedad')}</h2>
      <p>{tr('Rooms show Occupied when they have a current agreement. No renter names appear on the map.', 'Ang kwarto nga naay kasabotan karon makita nga Giokupahan. Walay ngalan sa nag-abang sa mapa.')}</p></div></div>
    {message && <p className={`notice ${message.error ? 'notice--error' : 'notice--success'}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    {occupied === null && <p className="notice" role="note">{tr('Occupancy could not be loaded, so rooms are shown without Occupied/Vacant status.', 'Wala ma-load ang kahimtang sa kwarto, busa walay Giokupahan/Bakante.')}</p>}

    {!placed.length && <div className="card layout-setup">
      <h3>{tr('Set up buildings and rooms from your sketch', 'I-set up ang mga bilding ug kwarto gikan sa imong drawing')}</h3>
      <p>{tr('Creates Building 1 (Apartment + Rooms 01–03 on the ground floor, Rooms 04–09 on the second), Building 2 (Gym + Rooms 01–03, Rooms 04–08), Bob\'s house (Rooms 01–06), House 1 (whole house), Yamaha property and Stores 1–3. Existing buildings and rooms with the same names are kept, never duplicated. You can rename rooms afterwards.', 'Mohimo sa Building 1, Building 2, balay ni Bob, House 1, Yamaha property ug Stores 1–3. Ang naa nang bilding ug kwarto nga parehas og ngalan dili doblehon. Mahimo nimong usbon ang ngalan sa kwarto human.')}</p>
      {!owner ? <p className="field-help">{tr('Only the owner can set up the layout.', 'Ang tag-iya lang ang maka-set up sa layout.')}</p>
        : !reviewing ? <Button className="primary" onClick={() => setReviewing(true)}>{tr('Review layout', 'Susiha ang layout')}</Button>
        : <div className="notice" role="group" aria-label={tr('Confirm layout setup', 'Kumpirmaha ang pag-setup')}><p><strong>{tr('Create these buildings and rooms now?', 'Himoon na kining mga bilding ug kwarto?')}</strong> {tr('This adds records to your saved property. It can be run again safely.', 'Modugang kini og rekord sa imong propiedad. Luwas kining usbon pagpadagan.')}</p>
          <div className="person-actions"><Button className="primary" disabled={busy} onClick={() => void runSetup()}>{busy ? tr('Creating…', 'Gihimo…') : tr('Create layout', 'Himoa ang layout')}</Button><Button disabled={busy} onClick={() => setReviewing(false)}>{tr('Cancel', 'Kanselahon')}</Button></div></div>}
    </div>}

    {current ? <section className="card building-entry" aria-labelledby="real-building-heading">
      <div className="building-entry-toolbar"><Button className="secondary-button" onClick={() => { setEntered(''); setFloorIndex(0) }}>{tr('Back to property map', 'Balik sa mapa')}</Button><span className="preview-pill">{summary(current)}</span></div>
      <div className="building-entry-title"><div><p className="eyebrow">{tr('FRONT VIEW', 'ATUBANGAN')}</p><h3 id="real-building-heading">{current.label}</h3></div></div>
      {(() => {
        const drawn = toDrawn(current, units, language)
        const floor = drawn.floors[Math.min(floorIndex, drawn.floors.length - 1)]
        return <>
          <figure className="building-facade"><BuildingFacade building={drawn} selectedRoom="" language={language} isOccupied={isOccupied} />
            <figcaption>{tr('Drawn from the saved rooms on each floor: one door per space, shaded when occupied. Not a surveyed plan.', 'Gikan sa na-save nga kwarto matag andana: usa ka pultahan matag lugar, may kolor kon giokupahan. Dili sukod nga plano.')}</figcaption></figure>
          {drawn.floors.length > 1 && <div className="floor-tabs" role="group" aria-label={tr('Choose floor', 'Pilia ang andana')}>{drawn.floors.map((item, index) => <Button key={item.label} aria-pressed={item === floor} onClick={() => setFloorIndex(index)}>{item.label}</Button>)}</div>}
          <div className="room-grid">{floor.rooms.map(room => { const unit = units.find(item => item.id === room.id)!
            return <div key={room.id} className={`room-tile ${isOccupied(room.id) ? 'occupied' : ''} ${unit.kind === 'shared' ? 'shared' : ''}`}><strong>{room.label}</strong><span>{tr(drawnKind[unit.kind], drawnKind[unit.kind])}</span><span className={`status ${unit.kind === 'shared' ? '' : isOccupied(room.id) ? 'status--pending' : 'status--ready'}`}>{statusFor(unit)}</span>{startAgreement && unit.kind !== 'shared' && occupied !== null && !isOccupied(room.id) && <Button className="secondary-button" aria-label={`${tr('Start agreement for', 'Sugdi ang kasabotan para sa')} ${current.label} ${room.label}`} onClick={() => startAgreement(room.id)}>{tr('Start agreement', 'Sugdi ang kasabotan')}</Button>}</div> })}</div>
        </>
      })()}
    </section> : placed.length > 0 && <div className="map-scroll" tabIndex={0} role="region" aria-label={tr('Property sketch. Scroll sideways on small screens.', 'Drawing sa propiedad. I-scroll pahalang sa gamay nga screen.')}><div className="property-plan">
      <svg viewBox="0 0 1000 650" preserveAspectRatio="none" className="plan-roads" aria-hidden="true"><path d="M0 400H1000M230 400V650" stroke="#343c38" strokeWidth="58" /><path d="M0 400H1000M230 440V650" stroke="#d4d9d3" strokeWidth="2" strokeDasharray="12 12" /></svg>
      <span className="road-label">{tr('ACCESS ROAD', 'AGIANAN')}</span>
      {placed.map(building => { const position = sketchPositions[building.sketch_slot!]
        return <button type="button" key={building.id} className={`plan-building ${building.sketch_slot!.startsWith('store') ? 'store-building' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${position.w}%`, height: `${position.h}%` }}
          aria-label={`${tr('Explore', 'Tan-awa')} ${building.label}, ${summary(building)}`} onClick={() => { setEntered(building.id); setFloorIndex(0) }}>
          <BuildingArt building={toDrawn(building, units, language)} /><strong>{building.label}</strong>{!building.sketch_slot!.startsWith('store') && <span>{summary(building)}</span>}
        </button> })}
    </div></div>}
    {!current && unplaced.length > 0 && <div className="unplaced-buildings"><h3>{tr('Not placed on the sketch', 'Wala sa drawing')}</h3>{unplaced.map(building => <Button key={building.id} onClick={() => { setEntered(building.id); setFloorIndex(0) }}>{building.label} · {summary(building)}</Button>)}</div>}
  </section>
}
