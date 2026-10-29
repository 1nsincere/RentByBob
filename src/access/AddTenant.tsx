import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { WorkspaceIcon } from '../components/WorkspaceIcon'
import { RoomPicker } from './RoomPicker'
import type { DbBuilding as Building, DbUnit as Unit } from './property-drawn'
import { decimalPesos } from './CashAcknowledgment'
import { philippineToday } from './payment-preview-model.ts'
import { supabase } from './client'
import { text, type Language } from '../i18n'

type Draft = { name: string; kind: 'individual' | 'business'; building: string; room: string; moveIn: string; rent: string; guess: boolean }
const empty = (): Draft => ({ name: '', kind: 'individual', building: '', room: '', moveIn: philippineToday(), rent: '', guess: false })

// One-step tenant registration (same layout as the preview): details, optional vacant room with move-in date and
// rent, review, then a single transactional save (register_tenant). No occupant names are collected.
export function AddTenant({ propertyId, preselect, assignTenant, done, openDirectory, openPayments, language = 'en' }: {
  propertyId: string; preselect?: { unitId: string; nonce: number } | null; done: () => void
  // Opened from a directory card: give an existing tenant (no current room) a room instead of creating a new record.
  assignTenant?: { id: string; name: string; kind: 'individual' | 'business'; nonce: number } | null
  openDirectory: () => void; openPayments: () => void; language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [occupied, setOccupied] = useState<Set<string>>(new Set())
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [draft, setDraft] = useState<Draft>(empty)
  const [step, setStep] = useState<'form' | 'review' | 'saved'>('form')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ids = useRef({ tenant: crypto.randomUUID(), agreement: crypto.randomUUID() })
  const panel = useRef<HTMLDivElement>(null)
  const applied = useRef(0)
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [b, u, rent] = await Promise.all([
        supabase!.from('buildings').select('id,label').eq('property_id', propertyId).is('archived_at', null).order('label'),
        supabase!.from('units').select('id,label,building_id,floor_label,kind').eq('property_id', propertyId).is('archived_at', null).order('label'),
        supabase!.rpc('read_rent_workspace', { p_property_id: propertyId }),
      ])
      if (b.error || u.error || rent.error) throw b.error || u.error || rent.error
      const today = philippineToday()
      setBuildings(b.data); setUnits(u.data as Unit[])
      setOccupied(new Set((rent.data.agreements as { unit_id: string; ended_on?: string | null }[]).filter(a => !a.ended_on || a.ended_on >= today).map(a => a.unit_id)))
      setState('ready')
    } catch { setState('failed') }
  }, [propertyId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!preselect || state !== 'ready' || applied.current === preselect.nonce) return
    const unit = units.find(item => item.id === preselect.unitId)
    if (unit) { applied.current = preselect.nonce; setExisting(null); setDraft(previous => ({ ...(step === 'saved' ? empty() : previous), building: unit.building_id, room: unit.id })); setStep('form'); setError(''); ids.current = { tenant: crypto.randomUUID(), agreement: crypto.randomUUID() } }
  }, [preselect, state, units])
  useEffect(() => { if (preselect) void load() }, [preselect, load])
  useEffect(() => {
    if (!assignTenant) return
    setExisting({ id: assignTenant.id, name: assignTenant.name }); setDraft({ ...empty(), name: assignTenant.name, kind: assignTenant.kind }); setStep('form'); setError('')
    ids.current = { tenant: crypto.randomUUID(), agreement: crypto.randomUUID() }; void load()
  }, [assignTenant, load])
  useEffect(() => { if (step !== 'form' || error) panel.current?.focus() }, [step, error])

  const unit = units.find(item => item.id === draft.room)
  const building = buildings.find(item => item.id === draft.building)
  const edit = (patch: Partial<Draft>) => { setDraft(previous => ({ ...previous, ...patch })); setError('') }
  function problem() {
    if (!draft.name.trim()) return tr('Enter the tenant or business name.', 'Isulod ang ngalan sa nag-abang o negosyo.')
    if (existing && !unit) return tr('Choose the building and vacant room for this tenant.', 'Pilia ang bilding ug bakante nga kwarto para niini nga nag-abang.')
    if (draft.building && !unit) return tr('Choose a vacant room, or choose "Assign a room later".', 'Pagpili og bakante nga kwarto, o pilia ang "I-assign unya".')
    if (unit && !/^\d{4}-\d{2}-\d{2}$/.test(draft.moveIn)) return tr('Choose the move-in date.', 'Pilia ang petsa sa pagsulod.')
    if (unit && (!/^\d{1,12}(\.\d{1,2})?$/.test(draft.rent.trim()) || Number(draft.rent) <= 0)) return tr('Enter the monthly rent, for example 3500 or 3500.50.', 'Isulod ang binulan nga abang, pananglitan 3500 o 3500.50.')
    return ''
  }
  async function save() {
    setBusy(true); setError('')
    const { error: rpcError } = existing && unit
      ? await supabase!.rpc('create_rental_agreement', { p_property_id: propertyId, p_id: ids.current.agreement, p_tenant_id: existing.id, p_unit_id: unit.id, p_move_in: draft.moveIn, p_rent: draft.rent.trim() })
      : await supabase!.rpc('register_tenant', {
        p_property_id: propertyId, p_tenant_id: ids.current.tenant, p_display_name: draft.name.trim(), p_kind: draft.kind,
        p_agreement_id: unit ? ids.current.agreement : null, p_unit_id: unit?.id ?? null, p_move_in: unit ? draft.moveIn : null, p_rent: unit ? draft.rent.trim() : null,
      })
    let flagFailed = false
    if (!rpcError && unit && draft.guess) flagFailed = !!(await supabase!.rpc('flag_move_in_estimate', { p_property_id: propertyId, p_agreement_id: ids.current.agreement })).error
    setBusy(false)
    if (rpcError) {
      setError(rpcError.code === '42501' ? tr('Your staff session needs the authenticator code again. Nothing was saved.', 'Kinahanglan na usab ang authenticator code. Walay na-save.')
        : /already has an agreement/.test(rpcError.message) ? tr('That room was just taken by another agreement. Nothing was saved; choose another room.', 'Naay laing kasabotan sa maong kwarto. Walay na-save; pagpili og lain.')
        : tr('The tenant could not be saved. Nothing was changed; check the details and try again.', 'Wala ma-save ang nag-abang. Walay nausab; susiha ang detalye ug sulayi pag-usab.'))
      setStep('form'); return
    }
    if (flagFailed) setError(tr('The tenant was saved, but the move-in date could not be marked as a best guess. Mark it from Payments > Rent by month.', 'Na-save ang nag-abang, apan wala mamarkahan nga hinuhaan ang petsa sa pagsulod. Markahi sa Payments > Abang kada bulan.'))
    setStep('saved'); done(); void load()
  }
  function reset() { setExisting(null); setDraft(empty()); setStep('form'); setError(''); ids.current = { tenant: crypto.randomUUID(), agreement: crypto.randomUUID() } }

  if (state === 'failed') return <p className="notice notice--error" role="alert">{tr('Rooms could not be loaded. Check your connection and staff session, then reload.', 'Wala ma-load ang mga kwarto. Susiha ang koneksyon ug staff session, dayon i-reload.')}</p>
  if (state === 'loading') return <LoadingSkeleton label={tr('Loading rooms…', 'Gikarga ang mga kwarto…')} rows={3} />
  return <section className="add-tenant-preview add-tenant" aria-labelledby="add-tenant-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('DIRECTORY MANAGEMENT', 'PAGDUMALA SA LISTA')}</p><h2 id="add-tenant-heading">{existing ? tr('Assign a room', 'Hatagi og kwarto') : tr('Add tenant record', 'Idugang ang nag-abang')}</h2><p>{existing ? tr('Choose the vacant room, move-in date and monthly rent for this tenant.', 'Pilia ang bakante nga kwarto, petsa sa pagsulod ug binulan nga abang para niini nga nag-abang.') : tr('Add the person or business and, if they are moving in, their room and rent in one step.', 'Idugang ang tawo o negosyo ug, kon mosulod na, ang ilang kwarto ug abang sa usa ka lakang.')}</p></div></div>
    <ol className="form-progress" aria-label={tr('Form progress', 'Pag-uswag sa porma')}>
      <li aria-current={step === 'form' ? 'step' : undefined}><span>1</span>{tr('Tenant & room', 'Nag-abang ug kwarto')}</li>
      <li aria-current={step === 'review' ? 'step' : undefined}><span>2</span>{tr('Review details', 'Susiha ang detalye')}</li>
      <li aria-current={step === 'saved' ? 'step' : undefined}><span>3</span>{tr('Added', 'Nadugang')}</li>
    </ol>
    <div ref={panel} tabIndex={-1} className="form-feedback">{error && <p role="alert" className="notice notice--error">{error}</p>}</div>
    {step === 'saved' ? <section className="card tenant-success"><span className="success-mark" aria-hidden="true">✓</span><h3>{existing ? tr('Room assigned', 'Na-assign ang kwarto') : tr('Tenant added', 'Nadugang ang nag-abang')}</h3>
      <p><strong>{draft.name.trim()}</strong> {unit ? `${tr('is now in', 'naa na sa')} ${building?.label} · ${unit.label}, ${tr('rent', 'abang')} ${decimalPesos(draft.rent.trim())} ${tr('per month from', 'matag bulan sugod')} ${draft.moveIn}.` : tr('was added without a room. Assign a room any time from here or the property map.', 'nadugang nga walay kwarto. Mahimong i-assign unya dinhi o sa mapa.')}</p>
      <div className="person-actions"><Button className="primary" onClick={reset}>{tr('Add another tenant', 'Idugang og lain')}</Button><Button onClick={openDirectory}>{tr('View tenant directory', 'Tan-awa ang lista')}</Button>{unit && <Button onClick={openPayments}>{tr('Go to payments', 'Adto sa bayad')}</Button>}</div>
    </section> : step === 'review' ? <section className="card tenant-review" aria-labelledby="tenant-review-heading"><h3 id="tenant-review-heading">{tr('Review tenant details', 'Susiha ang detalye sa nag-abang')}</h3>
      <dl><><dt>{tr('Name', 'Ngalan')}</dt><dd>{draft.name.trim()}</dd></><><dt>{tr('Type', 'Klase')}</dt><dd>{draft.kind === 'business' ? tr('Business', 'Negosyo') : tr('Individual', 'Indibidwal')}</dd></>
        <><dt>{tr('Room', 'Kwarto')}</dt><dd>{unit ? `${building?.label} · ${unit.label}${unit.floor_label ? ` (${unit.floor_label})` : ''}` : tr('Assign later', 'I-assign unya')}</dd></>
        {unit && <><><dt>{tr('Move-in date', 'Petsa sa pagsulod')}</dt><dd>{draft.moveIn}{draft.guess && ` (${tr('best guess, needs a double check', 'hinuhaan, kinahanglan og double check')})`}</dd></><><dt>{tr('Monthly rent', 'Binulan nga abang')}</dt><dd>{decimalPesos(draft.rent.trim())}</dd></></>}</dl>
      {unit && <p className="field-help">{tr('Saving creates the tenant and their room agreement together. Monthly rent is then added from Payments; nothing is charged yet.', 'Ang pag-save mohimo sa nag-abang ug sa kasabotan sa kwarto. Idugang ang binulan nga abang sa Payments; walay masingil pa.')}</p>}
      <div className="form-actions"><Button className="secondary-button" disabled={busy} onClick={() => setStep('form')}>{tr('Edit details', 'Usba ang detalye')}</Button><Button className="primary" disabled={busy} onClick={() => void save()}>{busy ? tr('Saving…', 'Gi-save…') : existing ? tr('Confirm and assign room', 'Kumpirmaha ug i-assign') : tr('Confirm and add tenant', 'Kumpirmaha ug idugang')}</Button></div>
    </section> : <div className="tenant-form-layout"><form className="card tenant-entry-form" onSubmit={e => { e.preventDefault(); const message = problem(); if (message) { setError(message); return } setStep('review') }}>
      <fieldset><legend><span>01</span> {tr('Tenant details', 'Detalye sa nag-abang')}</legend>
        {existing ? <><p className="existing-tenant"><strong>{existing.name}</strong> · {tr('existing tenant record', 'naa nay rekord')}</p><Button type="button" className="secondary-button" onClick={reset}>{tr('Add a new tenant instead', 'Idugang hinuon og bag-ong nag-abang')}</Button></> : <>
        <label htmlFor="tenant-name">{tr('Tenant or business name', 'Ngalan sa nag-abang o negosyo')} <span className="required-label">{tr('Required', 'Kinahanglan')}</span></label>
        <input id="tenant-name" value={draft.name} onChange={e => edit({ name: e.target.value })} maxLength={200} autoComplete="off" placeholder={tr('Example: Juan Dela Cruz or Barbershop', 'Pananglitan: Juan Dela Cruz o Barbershop')} />
        <label htmlFor="tenant-kind">{tr('Record type', 'Klase sa rekord')}</label>
        <select id="tenant-kind" value={draft.kind} onChange={e => edit({ kind: e.target.value as Draft['kind'] })}><option value="individual">{tr('Individual', 'Indibidwal')}</option><option value="business">{tr('Business (store or shop)', 'Negosyo (tindahan)')}</option></select>
        </>}
      </fieldset>
      <fieldset><legend><span>02</span> {tr('Room', 'Kwarto')}</legend>
        <p className="field-help">{existing ? tr('Choose the building, then a glowing (vacant) door or room.', 'Pilia ang bilding, dayon ang nagsiga (bakante) nga pultahan o kwarto.') : tr('Choose the building, then a glowing (vacant) door or room. Or assign a room later.', 'Pilia ang bilding, dayon ang nagsiga (bakante) nga pultahan o kwarto. O i-assign unya.')}</p>
        <RoomPicker buildings={buildings} units={units} occupied={occupied} building={draft.building} room={draft.room} allowLater={!existing} language={language} onChange={(building, room) => edit({ building, room })} />
        {draft.building && <>
          {unit && <div className="form-grid"><div><label htmlFor="tenant-move-in">{tr('Move-in date', 'Petsa sa pagsulod')}</label><input id="tenant-move-in" type="date" value={draft.moveIn} onChange={e => edit({ moveIn: e.target.value })} /></div>
            <div><label htmlFor="tenant-rent">{tr('Monthly rent (PHP)', 'Binulan nga abang (PHP)')}</label><input id="tenant-rent" inputMode="decimal" value={draft.rent} onChange={e => edit({ rent: e.target.value })} placeholder="3500.00" /></div></div>}
          {unit && <><label className="duplicate-warning" htmlFor="tenant-guess"><input id="tenant-guess" type="checkbox" checked={draft.guess} onChange={e => edit({ guess: e.target.checked })} /> {tr('I do not know the exact move-in date (it is a best guess)', 'Wala ko kahibalo sa eksaktong petsa sa pagsulod (hinuhaan lang)')}</label>
            {draft.guess && <p className="field-help">{tr('Choose the earliest date they could have moved in. Another staff member will double check it later. Unpaid months from the notebook are added afterwards in Payments, and also wait for a double check.', 'Pilia ang pinakaaga nga petsa nga pwede silang misulod. Susihon unya sa laing staff. Ang mga wala mabayri nga bulan gikan sa kuwaderno idugang sa Payments, ug maghulat usab og double check.')}</p>}</>}
          <p className="field-help">{tr('Rent is due on the same day each month as the move-in date (the last day in shorter months).', 'Ang abang bayran sa parehong adlaw matag bulan sama sa petsa sa pagsulod (kataposang adlaw sa mubo nga bulan).')}</p>
        </>}
      </fieldset>
      <div className="form-actions"><Button className="secondary-button" type="button" onClick={openDirectory}>{tr('Back to directory', 'Balik sa lista')}</Button><Button className="primary">{tr('Review tenant record', 'Susiha ang rekord')}</Button></div>
    </form>
    <aside className="card tenant-live-preview" aria-label={tr('Record preview', 'Sample sa rekord')}><p className="eyebrow">{tr('RECORD PREVIEW', 'SAMPLE SA REKORD')}</p><span className="tenant-avatar"><WorkspaceIcon kind="people" /></span>
      <h3>{draft.name.trim() || tr('New tenant', 'Bag-ong nag-abang')}</h3><p>{draft.kind === 'business' ? tr('Business record', 'Rekord sa negosyo') : tr('Individual record', 'Indibidwal nga rekord')}</p>
      <div className="tenant-place"><WorkspaceIcon kind="building" /><div><strong>{building?.label ?? tr('Building not selected', 'Wala pay bilding')}</strong><span>{unit ? `${unit.label}${unit.floor_label ? ` · ${unit.floor_label}` : ''}` : tr('Room assignment pending', 'Naghulat og kwarto')}</span></div></div>
      {unit && draft.rent && <p><strong>{/^\d{1,12}(\.\d{1,2})?$/.test(draft.rent.trim()) ? decimalPesos(draft.rent.trim()) : '—'}</strong> {tr('per month', 'matag bulan')}</p>}
      <p className="field-help">{tr('A tenant record does not create a sign-in account. Invite the renter separately if they should see their payments.', 'Ang rekord sa nag-abang dili mohimo og account. Dapita sila nga bulag kon gusto nila makita ang ilang bayad.')}</p>
    </aside></div>}
  </section>
}
