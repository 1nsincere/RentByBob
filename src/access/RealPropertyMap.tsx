import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { BuildingArt, BuildingFacade } from './BuildingDrawings'
import { sketchPositions } from './property-sketch.ts'
import { drawnKind, toDrawn, type DbBuilding, type DbUnit } from './property-drawn'
import { philippineToday } from './payment-preview-model.ts'
import { supabase } from './client'
import { text, type Language } from '../i18n'

// Real property map: fixed sketch positions, building front views, Occupied/Vacant from current agreements only.
// Selecting a room shows its details and actions (add tenant, open payments, owner rename). No renter names are shown.
export function RealPropertyMap({ propertyId, owner, startAgreement, locate = null, openPaymentsForUnit, language = 'en' }: {
  propertyId: string; owner: boolean; startAgreement?: (unitId: string) => void; language?: Language
  locate?: { unitId: string; nonce: number } | null; openPaymentsForUnit?: (tenantId: string) => void
}) {
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
  const [selected, setSelected] = useState('')
  const [tenantByUnit, setTenantByUnit] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState(false), [newLabel, setNewLabel] = useState(''), [renameReason, setRenameReason] = useState('')
  const panelHeading = useRef<HTMLHeadingElement>(null)
  const located = useRef(0)

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
        const current = (rent.data.agreements as { unit_id: string; tenant_id: string; move_in: string; ended_on?: string | null }[])
          .filter(agreement => agreement.move_in <= today && (!agreement.ended_on || agreement.ended_on >= today))
        setOccupied(new Set(current.map(agreement => agreement.unit_id)))
        setTenantByUnit(Object.fromEntries(current.map(agreement => [agreement.unit_id, agreement.tenant_id])))
      }
      setState('ready')
    } catch { setState('failed') }
  }, [propertyId])
  useEffect(() => { void load() }, [load])
  // "Locate room" from the tenant directory: reload, open that building on the room's floor and select the room.
  useEffect(() => { if (locate) void load() }, [locate, load])
  useEffect(() => {
    if (!locate || state !== 'ready' || located.current === locate.nonce) return
    const unit = units.find(item => item.id === locate.unitId)
    const building = unit && buildings.find(item => item.id === unit.building_id)
    if (!unit || !building) return
    located.current = locate.nonce
    const floors = toDrawn(building, units, language).floors
    setEntered(building.id); setFloorIndex(Math.max(0, floors.findIndex(floor => floor.rooms.some(room => room.id === unit.id)))); selectRoom(unit.id)
  }, [locate, state, units, buildings])
  function selectRoom(unitId: string) { setSelected(unitId); setRenaming(false); requestAnimationFrame(() => panelHeading.current?.focus()) }
  async function rename(unitId: string) {
    if (!newLabel.trim() || !renameReason.trim()) { setMessage({ text: tr('Enter the new room name and a reason.', 'Isulod ang bag-ong ngalan sa kwarto ug rason.'), error: true }); return }
    setBusy(true); setMessage(null)
    const { error } = await supabase!.rpc('manage_property_location', { p_property_id: propertyId, p_location_id: unitId, p_action: 'rename', p_label: newLabel.trim(), p_reason: renameReason.trim() })
    setBusy(false)
    if (error) { setMessage({ text: error.code === '23505' ? tr('Another room in this building already has that name. Nothing changed.', 'Naa nay laing kwarto niini nga bilding nga ingon ana og ngalan. Walay nausab.') : error.code === '42501' ? tr('Only the owner with an active authenticator session can rename rooms.', 'Ang tag-iya lang nga naay aktibo nga authenticator ang makausab sa ngalan.') : tr('The room could not be renamed. Nothing changed.', 'Wala mausab ang ngalan sa kwarto. Walay nausab.'), error: true }); return }
    setRenaming(false); setMessage({ text: `${tr('Room renamed to', 'Giilisan ang ngalan sa kwarto ngadto sa')} ${newLabel.trim()}.`, error: false })
    await load(); requestAnimationFrame(() => panelHeading.current?.focus())
  }

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
      <div className="building-entry-toolbar"><Button className="secondary-button" onClick={() => { setEntered(''); setFloorIndex(0); setSelected('') }}>{tr('Back to property map', 'Balik sa mapa')}</Button><span className="preview-pill">{summary(current)}</span></div>
      <div className="building-entry-title"><div><p className="eyebrow">{tr('FRONT VIEW', 'ATUBANGAN')}</p><h3 id="real-building-heading">{current.label}</h3></div></div>
      {(() => {
        const drawn = toDrawn(current, units, language)
        const floor = drawn.floors[Math.min(floorIndex, drawn.floors.length - 1)]
        return <>
          <figure className="building-facade"><BuildingFacade building={drawn} selectedRoom={selected} language={language} isOccupied={isOccupied} onPick={id => { setFloorIndex(Math.max(0, drawn.floors.findIndex(item => item.rooms.some(room => room.id === id)))); selectRoom(id) }} />
            <figcaption>{tr('Drawn from the saved rooms on each floor: one door per space, shaded when occupied. Not a surveyed plan.', 'Gikan sa na-save nga kwarto matag andana: usa ka pultahan matag lugar, may kolor kon giokupahan. Dili sukod nga plano.')}</figcaption></figure>
          {drawn.floors.length > 1 && <div className="floor-tabs" role="group" aria-label={tr('Choose floor', 'Pilia ang andana')}>{drawn.floors.map((item, index) => <Button key={item.label} aria-pressed={item === floor} onClick={() => { setFloorIndex(index); setSelected('') }}>{item.label}</Button>)}</div>}
          {drawn.floors.length > 1 && <p className="field-help">{tr('Choose a floor, then select a room to see its details.', 'Pilia ang andana, dayon pilia ang kwarto aron makita ang detalye.')}</p>}
          <div className="room-grid">{floor.rooms.map(room => { const unit = units.find(item => item.id === room.id)!
            return <button type="button" key={room.id} aria-pressed={selected === room.id} aria-label={`${room.label}, ${tr(drawnKind[unit.kind], drawnKind[unit.kind])}, ${statusFor(unit)}`} onClick={() => selectRoom(room.id)} className={`room-tile ${isOccupied(room.id) ? 'occupied' : ''} ${unit.kind === 'shared' ? 'shared' : ''} ${selected === room.id ? 'selected' : ''}`}><strong>{room.label}</strong><span>{tr(drawnKind[unit.kind], drawnKind[unit.kind])}</span><span className={`status ${unit.kind === 'shared' ? '' : isOccupied(room.id) ? 'status--pending' : 'status--ready'}`}>{statusFor(unit)}</span></button> })}</div>
          {(() => { const unit = units.find(item => item.id === selected && item.building_id === current.id); if (!unit) return <p className="field-help selected-space-empty">{tr('Select a space above to view its details.', 'Pilia ang lugar sa ibabaw aron makita ang detalye.')}</p>
            const taken = isOccupied(unit.id), tenantId = tenantByUnit[unit.id]
            return <section className="card selected-space" aria-labelledby="selected-space-heading"><p className="eyebrow">{tr('SELECTED SPACE', 'NAPILING LUGAR')}</p><h4 id="selected-space-heading" ref={panelHeading} tabIndex={-1}>{current.label} · {unit.label}</h4>
              <dl className="selected-space-facts"><div><dt>{tr('Type', 'Klase')}</dt><dd>{tr(drawnKind[unit.kind], drawnKind[unit.kind])}</dd></div><div><dt>{tr('Floor', 'Andana')}</dt><dd>{unit.floor_label ?? tr('Not set', 'Wala pa')}</dd></div><div><dt>{tr('Status', 'Kahimtang')}</dt><dd>{statusFor(unit)}</dd></div></dl>
              {unit.kind === 'shared' ? <p className="field-help">{tr('Shared space for everyone; it cannot be rented or listed.', 'Gipaambit nga lugar; dili kini paabangan o i-lista.')}</p>
                : taken ? <p className="field-help">{tr('Occupied. Tenant names are not shown on the map; open the payments account to see who rents it.', 'Giokupahan. Walay ngalan sa nag-abang sa mapa; ablihi ang account sa bayad aron makita kinsa.')}</p>
                : occupied !== null && <p className="field-help">{tr('Vacant: no current agreement. An upcoming move-in may still be saved.', 'Bakante: walay kasabotan karon. Basin naay umaabot nga pagsulod nga na-save.')}</p>}
              <div className="person-actions">
                {startAgreement && unit.kind !== 'shared' && occupied !== null && !taken && <Button className="primary" aria-label={`${tr('Add tenant to', 'Idugang og nag-abang sa')} ${current.label} ${unit.label}`} onClick={() => startAgreement(unit.id)}>{tr('Add tenant to this space', 'Idugang og nag-abang niini nga lugar')}</Button>}
                {openPaymentsForUnit && taken && tenantId && <Button className="secondary-button" onClick={() => openPaymentsForUnit(tenantId)}>{tr('View rent and payments', 'Tan-awa ang abang ug bayad')}</Button>}
                {owner && !renaming && <Button className="secondary-button" onClick={() => { setRenaming(true); setNewLabel(unit.label); setRenameReason(''); setMessage(null) }}>{tr('Rename room', 'Usba ang ngalan sa kwarto')}</Button>}
              </div>
              {renaming && <form className="rent-setup rename-room" onSubmit={event => { event.preventDefault(); void rename(unit.id) }}>
                <label htmlFor="rename-room-label">{tr('New room name', 'Bag-ong ngalan sa kwarto')}</label><input id="rename-room-label" value={newLabel} maxLength={200} onChange={event => setNewLabel(event.target.value)} />
                <label htmlFor="rename-room-reason">{tr('Reason (required)', 'Rason (kinahanglan)')}</label><input id="rename-room-reason" value={renameReason} maxLength={500} onChange={event => setRenameReason(event.target.value)} placeholder={tr('Example: match the number on the door', 'Pananglitan: ipares sa numero sa pultahan')} />
                <div className="person-actions"><Button className="primary" disabled={busy}>{busy ? tr('Saving…', 'Gi-save…') : tr('Save room name', 'I-save ang ngalan')}</Button><Button type="button" disabled={busy} onClick={() => setRenaming(false)}>{tr('Cancel', 'Kanselahon')}</Button></div>
              </form>}
            </section> })()}
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
