import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { addPreviewTenant, change, roomPeople, useProperty } from './property-preview-store'
import { type Language } from '../i18n'

const empty = { name: '', type: 'Individual', email: '', building: '', room: '', people: '' }
export function AddTenantPreview({ showDirectory, showBuildings, language = 'en' }: { showDirectory: () => void; showBuildings: () => void; language?: Language }) {
  const bi = language === 'ceb'
  const tr = (en: string, ceb: string) => bi ? ceb : en
  const { buildings, draftLocation } = useProperty()
  const [draft, setDraft] = useState(empty), [review, setReview] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState(''), [errorField, setErrorField] = useState('')
  const requestId = useRef(crypto.randomUUID()), panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (draftLocation) {
      setDraft(previous => ({ ...(saved ? empty : previous), ...draftLocation }))
      setReview(false); setSaved(false); setError(''); requestId.current = crypto.randomUUID()
      change({ draftLocation: null })
    }
  }, [draftLocation, saved])
  useEffect(() => { if (review || saved || error) panel.current?.focus() }, [review, saved, error])
  const building = buildings.find(b => b.id === draft.building)
  const units = building?.floors.flatMap(f => f.rooms.filter(r => r.kind !== 'Shared space').map(r => ({ ...r, floor: f.label }))) ?? []
  const unit = units.find(r => r.id === draft.room)
  const people = [...(draft.type === 'Individual' && draft.name.trim() ? [draft.name.trim()] : []), ...draft.people.split('\n').map(s => s.trim()).filter(Boolean)]
  function edit(key: keyof typeof empty, value: string) { setDraft(previous => ({ ...previous, [key]: value })); setError(''); setErrorField('') }
  function report(message: string) {
    setError(message)
    setErrorField(message.includes('email') ? 'preview-tenant-email' : message.includes('two named') || message.includes('occupant') ? 'tenant-people' : message.includes('space') ? 'tenant-room' : 'preview-tenant-name')
  }
  function validate() {
    if (!draft.name.trim()) return 'Enter the tenant or business name.'
    if (draft.email && !/^[^\s@]+@[^\s@]+\.invalid$/i.test(draft.email.trim())) return 'Use a fictional email ending in .invalid, or leave email blank.'
    if (draft.building && !unit) return 'Choose a rental space, or choose Assign later for the building.'
    if (unit?.kind === 'Room' && people.length + roomPeople(unit.id).length < 2) return 'Add at least two named occupants for this room, including the primary tenant.'
    if (new Set(people.map(p => p.toLowerCase())).size !== people.length) return 'Each occupant should be listed once. The primary tenant is already included.'
    if (people.some(p => p.length > 100)) return 'Keep each occupant name within 100 characters.'
    return ''
  }
  function reset() { setDraft(empty); setReview(false); setSaved(false); setError(''); requestId.current = crypto.randomUUID() }
  return <section className="add-tenant-preview" aria-labelledby="add-preview-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('DIRECTORY MANAGEMENT','PAGDUMALA SA LISTA')}</p><h2 id="add-preview-heading">{tr('Add tenant record','Idugang ang nag-abang')}</h2><p>{tr('Start with the person or business, then choose their rental space.','Sugdi sa ngalan sa tawo o negosyo, unya pilia ang ilang giabangan.')}</p></div><span className="preview-pill">{tr('Preview only','Sample lang')}</span></div>
    <ol className="form-progress" aria-label="Form progress"><li aria-current={!review && !saved ? 'step' : undefined}><span>1</span>Tenant & occupants</li><li aria-current={review ? 'step' : undefined}><span>2</span>Review details</li><li aria-current={saved ? 'step' : undefined}><span>3</span>Added to directory</li></ol>
    <div ref={panel} tabIndex={-1} className="form-feedback">{error && <p id="tenant-preview-error" role="alert" className="notice notice--error"><a href={`#${errorField}`} onClick={e => { e.preventDefault(); document.getElementById(errorField)?.focus() }}>{error}</a></p>}</div>
    {saved ? <section className="card tenant-success"><span className="success-mark" aria-hidden="true">✓</span><h3>Tenant added to preview</h3><p><strong>{draft.name}</strong> is now in the directory{unit ? ` under ${building?.name}, ${unit.label}` : ' awaiting room assignment'}.</p><p className="field-help">This is a temporary preview record. Reloading clears it. No account, agreement or charge was created.</p><div className="form-actions"><Button className="primary" onClick={showDirectory}>View tenant directory</Button><Button className="secondary-button" onClick={reset}>Add another tenant</Button></div></section> : review ? <section className="card tenant-review"><h3>Review tenant details</h3><dl><dt>Tenant</dt><dd>{draft.name} · {draft.type}</dd><dt>Email</dt><dd>{draft.email || 'Not provided'}</dd><dt>Location</dt><dd>{unit ? `${building?.name} / ${unit.floor} / ${unit.label}` : 'Assign later'}</dd><dt>Named occupants</dt><dd>{people.length ? people.join(', ') : 'Not recorded'}</dd></dl><p className="notice">Only this preview is updated. No invitation, rent or account access is created.</p><div className="form-actions"><Button className="secondary-button" onClick={() => setReview(false)}>Edit details</Button><Button className="primary" onClick={() => {
      const problem = validate(); if (problem) { report(problem); setReview(false); return }
      try { addPreviewTenant({ id: requestId.current, name: draft.name.trim(), initials: draft.name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(), building: draft.building, room: draft.room, active: true, type: draft.type, email: draft.email.trim(), since: '', people }); setSaved(true); setReview(false) } catch { setError('This preview record could not be added. Review the name, email and selected space.') }
    }}>Confirm preview tenant</Button></div></section> : <div className="tenant-form-layout"><form className="card tenant-entry-form" onSubmit={e => { e.preventDefault(); const problem = validate(); if (problem) report(problem); else setError(''); if (!problem) setReview(true) }}>
      <fieldset><legend><span>01</span> {tr('Tenant details','Detalye sa nag-abang')}</legend><label htmlFor="preview-tenant-name">{tr('Tenant or business name','Ngalan sa nag-abang o negosyo')} <span className="required-label">{tr('Required','Kinahanglan')}</span></label><input id="preview-tenant-name" aria-invalid={!!error && errorField === 'preview-tenant-name'} aria-describedby={errorField === 'preview-tenant-name' ? 'tenant-preview-error' : undefined} value={draft.name} onChange={e => edit('name', e.target.value)} required maxLength={100} autoComplete="off" placeholder="Example: Sample Robin Cruz" /><label htmlFor="preview-tenant-type">{tr('Record type','Klase sa rekord')}</label><select id="preview-tenant-type" value={draft.type} onChange={e => edit('type', e.target.value)}><option>{tr('Individual','Tawo')}</option><option>{tr('Business','Negosyo')}</option></select><label htmlFor="preview-tenant-email">{tr('Email address','Email address')} <span className="optional-label">{tr('Optional','Dili kinahanglan')}</span></label><input id="preview-tenant-email" aria-invalid={!!error && errorField === 'preview-tenant-email'} type="email" value={draft.email} onChange={e => edit('email', e.target.value)} maxLength={200} placeholder="robin@example.invalid" aria-describedby={error && errorField === 'preview-tenant-email' ? 'tenant-preview-error preview-email-help' : 'preview-email-help'} /><p className="field-help" id="preview-email-help">{tr('Use fictional .invalid addresses. No email will be sent.','Gamita ang hinimo-himong email nga matapos sa .invalid. Walay email nga ipadala.')}</p></fieldset>
      <fieldset><legend><span>02</span> Rental space</legend><label htmlFor="tenant-building">Building</label><select id="tenant-building" value={draft.building} onChange={e => { edit('building', e.target.value); edit('room', '') }}><option value="">Assign later</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><label htmlFor="tenant-room">Room or unit</label><select id="tenant-room" aria-invalid={!!error && errorField === 'tenant-room'} aria-describedby={errorField === 'tenant-room' ? 'tenant-preview-error' : undefined} disabled={!building} value={draft.room} onChange={e => edit('room', e.target.value)}><option value="">{building ? 'Choose a rental space' : 'Choose a building first'}</option>{units.map(r => <option key={r.id} value={r.id}>{r.floor} / {r.label}{roomPeople(r.id).length ? ` / ${roomPeople(r.id).length} people already listed` : ''}</option>)}</select>{building && !units.length && <p className="notice">No rental spaces configured. <Button type="button" className="quiet-button" onClick={showBuildings}>Open buildings and units</Button></p>}</fieldset>
      <fieldset><legend><span>03</span> Who lives here?</legend><p className="field-help">{draft.type === 'Individual' ? 'The primary tenant above is included automatically.' : 'List the people occupying this space, if applicable.'} Rooms require at least two occupants. Maximum capacity is not set.</p><label htmlFor="tenant-people">{draft.type === 'Individual' ? 'Other occupants' : 'Occupants'} <span className="optional-label">One name per line</span></label><textarea id="tenant-people" aria-invalid={!!error && errorField === 'tenant-people'} aria-describedby={errorField === 'tenant-people' ? 'tenant-preview-error' : undefined} rows={3} value={draft.people} onChange={e => edit('people', e.target.value)} maxLength={2000} placeholder="Sample Jamie Cruz" /><p className="occupant-count"><WorkspaceIcon kind="people" />{people.length} {people.length === 1 ? 'person' : 'people'} on this record</p></fieldset>
      <div className="form-actions"><Button className="secondary-button" type="button" onClick={showDirectory}>Back to directory</Button><Button className="primary">Review tenant record</Button></div>
    </form><aside className="card tenant-live-preview"><p className="eyebrow">RECORD PREVIEW</p><span className="tenant-avatar"><WorkspaceIcon kind="people" /></span><h3>{draft.name || 'New tenant'}</h3><p>{draft.type} record</p><div className="tenant-place"><WorkspaceIcon kind="building" /><div><strong>{building?.name || 'Building not selected'}</strong><span>{unit ? `${unit.floor} · ${unit.label}` : 'Room assignment pending'}</span></div></div><p className="occupant-count"><WorkspaceIcon kind="people" />{people.length} named occupants</p><p className="field-help">Adding a directory record does not create a login or determine rent.</p></aside></div>}
  </section>
}
