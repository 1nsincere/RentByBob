import { useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { useProperty, change, occupant, roomPeople, rooms, type Building } from './property-preview-store'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { type Language } from '../i18n'

function BuildingArt({ building }: { building: Building }) {
  const count = building.floors.reduce((n, f) => n + f.rooms.length, 0)
  return <svg viewBox="0 0 120 72" className="building-art" aria-hidden="true">
    <path d="M12 23 60 5 108 23V28H12Z" fill="currentColor" opacity=".7" />
    <rect x="20" y="28" width="80" height="39" rx="3" fill="currentColor" opacity=".18" />
    {Array.from({ length: Math.min(12, Math.max(2, count)) }, (_, i) => <rect key={i} x={29 + (i % 6) * 11} y={34 + Math.floor(i / 6) * 14} width="7" height="9" rx="1" fill="currentColor" />)}
    <path d="M14 68H106" stroke="currentColor" strokeWidth="3" />
  </svg>
}

function BuildingFacade({ building }: { building: Building }) {
  const storyHeight = 180
  const wallTop = 91
  const wallBottom = wallTop + building.floors.length * storyHeight
  const height = wallBottom + 30
  return <svg className="facade-art" viewBox={`0 0 720 ${height}`} role="img" aria-label={`${building.floors.length}-floor illustrative facade with decorative room doors; door symbols do not indicate room count`}>
    <path className="facade-roof-shape" d="M34 91 360 12 686 91 678 108 360 39 42 108Z" />
    <path className="facade-roof-edge" d="M40 91 360 16 680 91" />
    <path className="facade-wall" d={`M68 96 360 34 652 96V${wallBottom}H68Z`} />
    <path className="facade-gable-detail" d="M112 88 360 38 608 88" />
    {building.floors.map((floor, floorIndex) => {
      const rowTop = wallTop + floorIndex * storyHeight
      const doorY = rowTop + 34
      return <g className="facade-story" key={floor.label}>
        {floorIndex > 0 && <path className="facade-story-line" d={`M72 ${rowTop}H648`} />}
        <text className="facade-floor-label" x="82" y={rowTop + 17}>{floor.label}</text>
        {Array.from({ length: 6 }, (_, doorIndex) => {
          const x = 145 + doorIndex * 82
          return <g className="facade-room-door" key={doorIndex} transform={`translate(${x} ${doorY})`}>
            <rect className="facade-door-frame" width="58" height="110" rx="2" />
            <rect className="facade-door-panel" x="6" y="6" width="46" height="98" rx="1" />
            <path className="facade-door-panel-line" d="M8 66H50" />
            <circle className="facade-door-knob" cx="45" cy="78" r="2.5" />
          </g>
        })}
      </g>
    })}
    <path className="facade-foundation" d={`M58 ${wallBottom}H662V${wallBottom + 12}H58Z`} />
    <path className="facade-ground-line" d={`M38 ${wallBottom + 16}H682`} />
  </svg>
}

export function TenantDirectoryPreview({ openMap, addTenant, openPayments, language = 'en' }: { openMap: () => void; addTenant: () => void; openPayments: () => void; language?: Language }) {
  const bi = language === 'ceb'
  const tr = (en: string, ceb: string) => bi ? ceb : en
  const { buildings, tenants, notice } = useProperty()
  const [sort, setSort] = useState('name')
  useEffect(() => { if (notice) { setSearch(''); setBuildingId('all'); setFilter('active') } }, [notice])
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('active'), [buildingId, setBuildingId] = useState('all'), [expanded, setExpanded] = useState('')
  const filtered = tenants.filter(t => (filter === 'all' || (filter === 'active') === t.active) && (buildingId === 'all' || t.building === buildingId) && `${t.name} ${buildings.find(b => b.id === t.building)?.name} ${buildings.find(b => b.id === t.building)?.floors.flatMap(f => f.rooms).find(r => r.id === t.room)?.label}`.toLowerCase().includes(search.toLowerCase().trim())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (buildings.find(x => x.id === a.building)?.name ?? '').localeCompare(buildings.find(x => x.id === b.building)?.name ?? ''))
  return <section className="visual-directory" aria-labelledby="visual-tenants-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('PEOPLE & PLACES','MGA TAWO UG LUGAR')}</p><h2 id="visual-tenants-heading">{tr('Tenant directory','Lista sa mga nag-abang')}</h2><p>{tr('Find tenants, view their space, and keep records organized.','Pangitaa ang mga nag-abang, tan-awa ang ilang lugar, ug han-aya ang mga rekord.')}</p></div><Button className="primary" onClick={addTenant}>+ {tr('Add tenant','Idugang ang nag-abang')}</Button></div>
    {notice && <p className="notice" role="status">{notice} <Button className="quiet-button" onClick={() => change({ notice: '' })}>Dismiss</Button></p>}
    <div className="directory-stats"><div><strong>{tenants.filter(t => t.active).length}</strong><span>{tr('Active tenants','Aktibo nga mga nag-abang')}</span></div><div><strong>{buildings.length}</strong><span>{tr('Buildings & spaces','Mga bilding ug lugar')}</span></div><div><strong>{tenants.filter(t => t.active && !t.room).length}</strong><span>{tr('Awaiting room assignment','Naghulat og kwarto')}</span></div></div>
    <div className="card directory-filters"><div><label htmlFor="visual-search">{tr('Search name, building or room','Pangitaa ang ngalan, bilding o kwarto')}</label><input id="visual-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("Try Bob's house or Room 01","Sulayi ang balay ni Bob o Room 01")} /></div><div><label htmlFor="visual-building">{tr('Building','Bilding')}</label><select id="visual-building" value={buildingId} onChange={e => setBuildingId(e.target.value)}><option value="all">{tr('All buildings','Tanang bilding')}</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div><label htmlFor="visual-status">{tr('Tenant status','Kahimtang sa nag-abang')}</label><select id="visual-status" value={filter} onChange={e => setFilter(e.target.value)}><option value="active">{tr('Active tenants','Aktibo nga mga nag-abang')}</option><option value="archived">{tr('Archived tenants','Gi-archive nga mga nag-abang')}</option><option value="all">{tr('All tenants','Tanang nag-abang')}</option></select></div></div>
    <div className="directory-results-bar"><p className="field-help" role="status">{filtered.length} {filtered.length === 1 ? 'tenant' : 'tenants'} shown</p><div><label htmlFor="tenant-sort">Sort by</label><select id="tenant-sort" value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name A–Z</option><option value="building">Building</option></select></div></div>
    <div className="tenant-card-grid">{filtered.map(t => {
      const building = buildings.find(b => b.id === t.building)
      const floor = building?.floors.find(f => f.rooms.some(r => r.id === t.room))
      const room = floor?.rooms.find(r => r.id === t.room)
      return <article className="card tenant-person-card" key={t.id}>
        <div className="person-card-top"><span className="tenant-avatar">{t.initials}</span><span className="status">{t.active ? 'Active' : 'Archived'}</span></div>
        <h3>{t.name}</h3><p className="field-help">{t.type} tenant</p>
        <div className="tenant-place">{building && <BuildingArt building={building} />}<div><strong>{building?.name ?? 'No building assigned'}</strong><span>{room ? `${floor?.label} · ${room.label}` : 'Room assignment pending'}</span></div></div>
        <p className="occupant-count"><WorkspaceIcon kind="people" />{t.people.length} named {t.people.length === 1 ? 'occupant' : 'occupants'}</p>
        <div className="person-actions"><Button className="secondary-button" aria-expanded={expanded === t.id} onClick={() => setExpanded(expanded === t.id ? '' : t.id)}>{expanded === t.id ? 'Hide details' : 'View details'}</Button><Button className="quiet-button" disabled={!room} onClick={() => { change({ selected: t.building, room: t.room }); openMap() }}>Locate room ↗</Button></div>
        <Button className="quiet-button" onClick={() => { change({ paymentTenant: t.id }); openPayments() }}>View rent and payments</Button>
        {expanded === t.id && <div className="tenant-details"><h4>Occupants</h4>{t.people.length ? <ul className="occupant-roster">{t.people.map((name, i) => <li key={i}><WorkspaceIcon kind="people" /><span>{name}</span></li>)}</ul> : <p>No people recorded.</p>}<dl><dt>Example contact</dt><dd>{t.email || 'Not provided'}</dd><dt>Example start date</dt><dd>{t.since || 'Not recorded'}</dd><dt>Rental space</dt><dd>{room?.kind ?? 'Not assigned'}</dd></dl></div>}
      </article>
    })}</div>
    {!filtered.length && <div className="card empty-state"><h3>No matching tenants</h3><Button onClick={() => { setSearch(''); setBuildingId('all'); setFilter('active') }}>Clear filters</Button></div>}
  </section>
}

export function PropertyMapPreview({ addTenant, language = 'en' }: { addTenant: () => void; language?: Language }) {
  const bi = language === 'ceb'
  const tr = (en: string, ceb: string) => bi ? ceb : en
  const { buildings, selected, room } = useProperty()
  const [floorIndex, setFloorIndex] = useState(0), [view, setView] = useState('map'), [adding, setAdding] = useState(false)
  const [enteredBuilding, setEnteredBuilding] = useState('')
  const [message, setMessage] = useState('')
  const building = buildings.find(b => b.id === selected) ?? buildings[0]
  const selectedFloor = building.floors.findIndex(f => f.rooms.some(r => r.id === room))
  const index = selectedFloor >= 0 ? selectedFloor : Math.min(floorIndex, building.floors.length - 1)
  const floor = building.floors[index]
  function select(id: string) { change({ selected: id, room: '' }); setFloorIndex(0); setEnteredBuilding(''); setMessage('') }
  function explore(id: string) {
    select(id)
    if (['bob', 'b1', 'b2'].includes(id)) setEnteredBuilding(id)
  }
  function update(next: Building) { change({ buildings: buildings.map(b => b.id === next.id ? next : b) }) }
  const selectedRoom = floor.rooms.find(r => r.id === room)
  const floorCountLabel = (count: number | null) => count === null ? 'Not set' : `${count} ${count === 1 ? 'rentable room' : 'rentable rooms'}`
  const totalRoomCount = building.floors.some(item => item.count === null) ? null : building.floors.reduce((total, item) => total + (item.count ?? 0), 0)
  const roomLayout = <div className="floor-layout"><div className="floor-rooms"><div className="room-legend"><span>● Occupied example</span><span>□ Unassigned</span><span>▧ Shared space</span></div>
    {floor.count === null && <p className="notice">Rentable room count: Not set. Add a count when it is confirmed.</p>}
    <div className="room-grid">{floor.rooms.map(r => <button type="button" key={r.id} className={`room-tile ${occupant(r.id) ? 'occupied' : ''} ${r.kind === 'Shared space' ? 'shared' : ''}`} aria-pressed={room === r.id} onClick={() => change({ room: r.id })}><span className="room-door" aria-hidden="true">{r.kind === 'Room' ? '▤' : '▧'}</span><strong>{r.label}</strong>{r.kind !== 'Shared space' && <span className="occupant-count"><WorkspaceIcon kind="people" />{roomPeople(r.id).length} people</span>}<span>{occupant(r.id)?.name ?? (r.kind === 'Shared space' ? 'Shared space' : 'Unassigned')}</span></button>)}</div>
    {!floor.rooms.length && floor.count !== null && <p className="empty-state">No spaces on this floor yet.</p>}
    <p className="floor-caption">{floor.label} · Diagram only; room sizes and door positions are illustrative.</p>
  </div><form className="floor-settings" key={`${building.id}-${index}-${floor.count}`} onSubmit={e => {
    e.preventDefault(); const values = new FormData(e.currentTarget); const count = Number(values.get('count')); const existing = floor.rooms.filter(r => r.kind === 'Room');
    if (existing.slice(count).some(r => occupant(r.id))) { setMessage('Keep occupied example rooms. Choose a count that retains their assignments.'); return }
    const nextRooms = Array.from({ length: count }, (_, i) => existing[i] ?? rooms(`${building.id}-floor${index}`, count)[i]);
    const nextFloors = building.floors.map((f, i) => i === index ? { ...f, count, rooms: [...nextRooms, ...f.rooms.filter(r => r.kind !== 'Room')] } : f);
    update({ ...building, name: String(values.get('building-name')).trim(), floors: nextFloors }); change({ room: '' }); setMessage('Preview layout updated. Reloading restores the original sketch.');
  }}><h4>Edit this floor</h4><label htmlFor="edit-building-name">Building name</label><input id="edit-building-name" name="building-name" defaultValue={building.name} required pattern=".*\S.*" maxLength={80} /><label htmlFor="room-count">Rentable rooms on this floor</label><input id="room-count" name="count" type="number" min={0} max={40} defaultValue={floor.count ?? ''} placeholder="Not set" required /><p className="field-help">Only enter a count when confirmed. Apartments, shops and shared spaces stay separate. Maximum 40 rooms per floor in this preview.</p><Button className="primary">Update preview layout</Button></form></div>
  const roomEditor = selectedRoom && <form className="room-editor" key={selectedRoom.id} onSubmit={e => { e.preventDefault(); const label = String(new FormData(e.currentTarget).get('room-label')).trim(); update({ ...building, floors: building.floors.map((f, i) => i === index ? { ...f, rooms: f.rooms.map(r => r.id === selectedRoom.id ? { ...r, label } : r) } : f) }); setMessage('Room label updated in this preview.') }}><div><p className="eyebrow">SELECTED SPACE</p><h4>{selectedRoom.label}</h4><p>{occupant(selectedRoom.id)?.name ?? 'No tenant assigned'} · {selectedRoom.kind}</p></div><div><label htmlFor="room-label">Room or space label</label><input id="room-label" name="room-label" defaultValue={selectedRoom.label} required pattern=".*\S.*" maxLength={60} /></div><Button className="secondary-button">Rename space</Button>{selectedRoom.kind !== 'Shared space' && <Button type="button" className="primary" onClick={() => { change({ draftLocation: { building: building.id, room: selectedRoom.id } }); addTenant() }}>Add tenant to this space</Button>}<div className="room-occupants"><h4 className="occupant-count"><WorkspaceIcon kind="people" />{roomPeople(selectedRoom.id).length} people in this space</h4>{roomPeople(selectedRoom.id).length ? <ul className="occupant-roster">{roomPeople(selectedRoom.id).map((name, i) => <li key={i}><WorkspaceIcon kind="people" /><span>{name}</span></li>)}</ul> : <p>No occupants recorded.</p>}<p className="field-help">Rental rooms: minimum 2 occupants. Maximum capacity has not been confirmed.</p></div></form>
  return <section className="property-visual" aria-labelledby="property-map-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('YOUR PROPERTY, AT A GLANCE','IMONG PROPIEDAD, SA USA KA TAN-AW')}</p><h2 id="property-map-heading">{tr('Buildings and units','Mga bilding ug kwarto')}</h2><p>{tr('Explore the site, select a floor, and manage its rental spaces.','Tan-awa ang lugar, pilia ang andana, ug dumalaa ang mga paabangan.')}</p></div><Button className="primary" onClick={() => setAdding(!adding)} aria-expanded={adding}>+ {tr('Add building','Idugang ang bilding')}</Button></div>
    {adding && <form className="card visual-edit-form" onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); const id = crypto.randomUUID(); change({ buildings: [...buildings, { id, name: String(values.get('name')).trim(), floors: Array.from({ length: Number(values.get('floors')) }, (_, i) => ({ label: i === 0 ? 'Ground floor' : `Floor ${i + 1}`, count: null, rooms: [] })) }], selected: id, room: '' }); setFloorIndex(0); setAdding(false); setMessage('Building added to this preview. Its position on the sketch is not set.') }}><h3>Add a preview building</h3><label htmlFor="new-building">Building name</label><input id="new-building" name="name" required pattern=".*\S.*" maxLength={80} /><label htmlFor="new-floors">Number of floors</label><input id="new-floors" name="floors" type="number" min={1} max={5} defaultValue={1} required /><p className="field-help">New buildings appear below the fixed sketch until their position is confirmed.</p><Button className="primary">Add to preview</Button></form>}
    <div className="map-toolbar"><div className="segmented-control" role="group" aria-label="Property views"><Button aria-pressed={view === 'map'} onClick={() => { setView('map'); setEnteredBuilding('') }}>Property map</Button><Button aria-pressed={view === 'list'} onClick={() => { setView('list'); setEnteredBuilding('') }}>Building list</Button></div><span className="field-help">Illustrative only · Not a surveyed floor plan</span></div>
    {!enteredBuilding && view === 'map' && <div className="map-scroll" tabIndex={0} role="region" aria-label="Property sketch. Scroll horizontally on small screens, or use Building list."><div className="property-plan">
      <svg viewBox="0 0 1000 650" preserveAspectRatio="none" className="plan-roads" aria-hidden="true"><path d="M0 400H1000M230 400V650" stroke="#343c38" strokeWidth="58" /><path d="M0 400H1000M230 440V650" stroke="#d4d9d3" strokeWidth="2" strokeDasharray="12 12" /></svg>
      <span className="road-label">ACCESS ROAD</span><span className="plan-caption">PROPERTY OVERVIEW</span>
      {buildings.filter(b => b.x !== undefined).map(b => <button type="button" key={b.id} className={`plan-building ${b.id === selected ? 'selected' : ''} ${b.id.startsWith('store') ? 'store-building' : ''}`} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }} onClick={() => explore(b.id)} aria-pressed={b.id === selected} aria-label={`Explore ${b.name}`}><BuildingArt building={b} /><strong>{b.name}</strong>{!b.id.startsWith('store') && <span>{b.id === 'bob' ? `${b.floors[0].count ?? '?'} rooms for rent` : b.id === 'b1' ? '2 floors · Apartment' : b.id === 'b2' ? '2 floors · Gym' : b.id === 'house' ? 'Whole-house rental' : 'Commercial space'}</span>}</button>)}
    </div></div>}
    {!enteredBuilding && view === 'list' && <div className="building-list">{buildings.map(b => <button type="button" key={b.id} className={`building-list-card ${b.id === selected ? 'selected' : ''}`} aria-pressed={b.id === selected} onClick={() => explore(b.id)}><BuildingArt building={b} /><strong>{b.name}</strong><span>{b.floors.length} {b.floors.length === 1 ? 'level' : 'levels'}</span></button>)}</div>}
    {!enteredBuilding && view === 'map' && buildings.some(b => b.x === undefined) && <div className="unplaced-buildings"><h3>Not placed on sketch</h3>{buildings.filter(b => b.x === undefined).map(b => <Button key={b.id} aria-pressed={selected === b.id} onClick={() => select(b.id)}>{b.name}</Button>)}</div>}
    {enteredBuilding ? <section className="card building-entry" key={enteredBuilding} aria-labelledby="building-entry-heading">
      <div className="building-entry-toolbar"><Button className="secondary-button" onClick={() => { setEnteredBuilding(''); setView('map'); setFloorIndex(0); change({ room: '' }) }}>Back to property map</Button><span className="preview-pill">Illustrative preview · Not surveyed</span></div>
      <div className="building-entry-title"><div><p className="eyebrow">FRONT VIEW · ILLUSTRATIVE ONLY</p><h3 id="building-entry-heading">{building.name}</h3></div><span className="building-count">{floorCountLabel(totalRoomCount)}</span></div>
      <div className="building-entry-scene">
        <figure className="building-facade">
          <BuildingFacade building={building} />
          <figcaption>Illustrative lodging-house facade. Door symbols are decorative and do not indicate a room count or surveyed layout.</figcaption>
        </figure>
        <div className="floor-count-overview" aria-label="Rentable room counts by floor">{building.floors.map((item, floorNumber) => <article key={item.label} className="floor-count-card"><span>{item.label}</span><strong>{floorCountLabel(item.count)}</strong><small>Floor {floorNumber + 1}</small></article>)}</div>
      </div>
      <div className="building-floor-content"><div className="building-floor-heading"><div><p className="eyebrow">SELECT A FLOOR</p><h4>{floor.label}</h4></div><span className={`status ${floor.count === null ? 'status--warning' : 'status--ready'}`}>Rentable rooms: {floorCountLabel(floor.count)}</span></div>
        <div className="floor-tabs" role="group" aria-label="Choose floor">{building.floors.map((item, i) => <Button key={item.label} aria-pressed={i === index} aria-label={`${item.label}, ${floorCountLabel(item.count)}`} onClick={() => { setFloorIndex(i); change({ room: '' }); setMessage('') }}>{item.label}<small>{floorCountLabel(item.count)}</small></Button>)}</div>
        {roomLayout}
        {roomEditor}
        <p role="status" className="field-help">{message}</p>
      </div>
    </section> : <div className="building-selection">
      {view === 'list' && <p className="field-help">Select a building. Bob’s house, Building 1 and Building 2 open an illustrative front view.</p>}
      <section className="card building-inspector" aria-labelledby="building-detail-heading">
        <div className="section-heading"><div><p className="eyebrow">BUILDING DETAILS</p><h3 id="building-detail-heading">{building.name}</h3></div><span className="preview-pill">{floorCountLabel(totalRoomCount)}</span></div>
        <p className="field-help">{building.floors.filter(f => f.count === null).length ? 'Some room counts still need confirmation.' : 'Select a space below to view its details.'}</p>
        <div className="floor-tabs" role="group" aria-label="Choose floor">{building.floors.map((item, i) => <Button key={item.label} aria-pressed={i === index} onClick={() => { setFloorIndex(i); change({ room: '' }); setMessage('') }}>{item.label}</Button>)}</div>
        {roomLayout}
        {roomEditor}
        <p role="status" className="field-help">{message}</p>
      </section>
    </div>}
  </section>
}
