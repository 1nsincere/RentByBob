import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'
import { copy, text, type Language } from '../i18n'

type Building = { id: string; label: string; archived_at: string | null }
type Unit = Building & { building_id: string }

function LocationMaintenance({
  propertyId, locationId, label, archivedAt, building, onSaved, language,
}: {
  propertyId: string
  locationId: string
  label: string
  archivedAt: string | null
  building: boolean
  onSaved: () => void
  language: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [name, setName] = useState(label)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => setName(label), [label])

  async function save(action: 'rename' | 'archive') {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error } = await supabase!.rpc('manage_property_location', {
        p_property_id: propertyId,
        p_location_id: locationId,
        p_action: action,
        p_label: action === 'rename' ? name.trim() : null,
        p_reason: reason.trim(),
      })
      if (error) {
        setError(error.code === '23505'
          ? tr('That active name is already in use. Choose another location name.', 'Gigamit na ang maong aktibong ngalan. Pagpili og laing ngalan.')
          : error.code === '42501'
            ? tr('Owner access and MFA are required to change locations.', 'Kinahanglan ang access sa tag-iya ug MFA aron usbon ang lokasyon.')
            : tr('Change could not be confirmed. Refresh the directory before retrying; archived records cannot be changed.', 'Wala makumpirma ang kausaban. I-refresh una ang lista; dili mausab ang gi-archive nga rekord.'))
        return
      }
      setReason('')
      setMessage(action === 'rename' ? tr('Location renamed.', 'Gi-usab ang ngalan sa lokasyon.') : tr('Location archived; its history is retained.', 'Gi-archive ang lokasyon ug gipabilin ang kasaysayan niini.'))
      onSaved()
    } catch {
      setError(tr('Change could not be confirmed. Refresh the directory before retrying; archived records cannot be changed.', 'Wala makumpirma ang kausaban. I-refresh una ang lista; dili mausab ang gi-archive nga rekord.'))
    } finally {
      setConfirmArchive(false)
      setBusy(false)
    }
  }

  if (archivedAt) return <p className="small">{tr('Archived; retained for history.', 'Gi-archive; gipabilin ang kasaysayan.')}</p>

  const nameId = `location-name-${locationId}`
  const reasonId = `location-reason-${locationId}`
  const labelForKind = building ? tr('building or section', 'bilding o seksyon') : tr('unit', 'kwarto')

  return <div className="divider">
    <Feedback message={error} error />
    <Feedback message={message} />
    <label htmlFor={nameId}>{tr('Location name', 'Ngalan sa lokasyon')}</label>
    <input id={nameId} value={name} maxLength={200} onChange={event => { setName(event.target.value); setConfirmArchive(false) }} />
    <label htmlFor={reasonId}>{tr('Reason for this change', 'Rason sa kausaban')}</label>
    <input id={reasonId} value={reason} maxLength={500} onChange={event => { setReason(event.target.value); setConfirmArchive(false) }} required />
    <Button disabled={busy || !name.trim() || !reason.trim()} onClick={() => void save('rename')}>
      {busy ? tr('Saving…', 'Gi-save…') : `${tr('Save', 'I-save')} ${labelForKind} ${tr('name', 'nga ngalan')}`}
    </Button>
    {confirmArchive && <div className="notice archive-confirmation" role="group" aria-label={tr('Archive confirmation', 'Kumpirmasyon sa pag-archive')}>
      <h3>{tr('Confirm archive:', 'Kumpirmaha ang pag-archive:')} {label}</h3>
      <p>{building
        ? `${tr('This will archive', 'I-archive niini ang')} “${label}” ${tr('and every unit within it. The building, units and their history remain in the directory. This cannot be undone in the app.', 'ug tanang kwarto niini. Magpabilin sa lista ang bilding, mga kwarto ug kasaysayan niini. Dili kini ma-undo sa app.')}`
        : `${tr('This will archive', 'I-archive niini ang')} “${label}”. ${tr('The unit and its history remain in the directory. This cannot be undone in the app.', 'Magpabilin sa lista ang kwarto ug kasaysayan niini. Dili kini ma-undo sa app.')}`}</p>
    </div>}
    <Button disabled={busy || !reason.trim()} onClick={() => {
      if (confirmArchive) void save('archive')
      else setConfirmArchive(true)
    }}>
      {confirmArchive ? tr('Confirm archive', 'Kumpirmaha ang pag-archive') : building ? tr('Archive building and all its units', 'I-archive ang bilding ug tanang kwarto niini') : tr('Archive unit', 'I-archive ang kwarto')}
    </Button>
  </div>
}

export function PropertyDirectory({ propertyId, owner, language = 'en' }: { propertyId: string; owner: boolean; language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const languageRef = useRef(language)
  useEffect(() => { languageRef.current = language }, [language])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('building')
  const requestId = useRef(crypto.randomUUID())
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, u] = await Promise.all([
        supabase!.from('buildings').select('id,label,archived_at').eq('property_id', propertyId).order('label'),
        supabase!.from('units').select('id,label,building_id,archived_at').eq('property_id', propertyId).order('label'),
      ])
      if (b.error || u.error) throw b.error || u.error
      setBuildings(b.data)
      setUnits(u.data)
      setLoaded(true)
      setError('')
    } catch {
      setBuildings([])
      setUnits([])
      setError(text(languageRef.current, 'Property directory could not be loaded. No sample locations are substituted.', 'Wala makarga ang lista sa propiedad. Walay sample nga gipuli.'))
      setLoaded(false)
    } finally {
      setLoading(false)
    }
  }, [propertyId])
  useEffect(() => { void load() }, [load])

  return <section className="card form-card" aria-labelledby="property-locations-heading">
    <p className="eyebrow">{language === 'ceb' ? 'LISTA SA PROPIEDAD' : 'PROPERTY DIRECTORY'}</p>
    <h2 id="property-locations-heading">{t.buildings}</h2>
    <p>{t.propertyDirectory}</p>
    <Feedback message={error} error />
    <Feedback message={message} />
    {loading && !loaded && !error && <LoadingSkeleton label={tr('Loading property locations…', 'Gikarga ang mga lokasyon…')} rows={3} />}
    <Button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? tr('Refreshing locations…', 'Gi-refresh ang mga lokasyon…') : tr('Refresh locations', 'I-refresh ang mga lokasyon')}</Button>
    {loaded && <ul className="records">{buildings.map(building => {
      const children = units.filter(unit => unit.building_id === building.id)
      return <li key={building.id}><article className={`location-record ${building.archived_at ? 'location-record--archived' : ''}`}>
        <div className="location-heading">
        <strong>{building.label}</strong>
        <span className={`status status--${building.archived_at ? 'archived' : 'ready'}`}>{building.archived_at ? tr('Archived building or section', 'Gi-archive nga bilding o seksyon') : tr('Active building or section', 'Aktibong bilding o seksyon')}</span>
        </div>
        {children.length > 0
          ? <ul className="unit-list">{children.map(unit => <li key={unit.id} className={unit.archived_at ? 'location-record--archived' : ''}>
            <div className="unit-heading">
              <strong>{unit.label}</strong>
              <span className={`status status--${unit.archived_at ? 'archived' : 'ready'}`}>{unit.archived_at ? tr('Archived unit', 'Gi-archive nga kwarto') : tr('Active unit', 'Aktibong kwarto')}</span>
              {owner && <LocationMaintenance
                propertyId={propertyId}
                locationId={unit.id}
                label={unit.label}
                archivedAt={unit.archived_at}
                building={false}
                language={language}
                onSaved={() => void load()}
              />}
            </div>
          </li>)}</ul>
          : <p>{tr('No units recorded in this building/section.', 'Walay kwarto nga narekord niini nga bilding/seksyon.')}</p>}
        {owner && <LocationMaintenance
          propertyId={propertyId}
          locationId={building.id}
          label={building.label}
          archivedAt={building.archived_at}
          building
          language={language}
          onSaved={() => void load()}
        />}
      </article></li>
    })}</ul>}
    {loaded && buildings.length === 0 && <div className="empty-state">
      <h3>{tr('No locations recorded yet', 'Wala pay lokasyon nga narekord')}</h3>
      <p>{tr('Add a building or section when you are ready to organize this property directory. Locations do not define occupancy or rent.', 'Idugang ang bilding o seksyon kung andam na nga ihan-ay ang lista. Ang lokasyon wala magbuot sa nagpuyo o abang.')}</p>
    </div>}
    {owner && <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const form = event.currentTarget
      const values = new FormData(form)
      setBusy(true)
      setMessage('')
      setError('')
      try {
        const { error } = await supabase!.rpc('create_property_location', {
          p_property_id: propertyId,
          p_id: requestId.current,
          p_label: String(values.get('location-label')).trim(),
          p_building_id: kind === 'unit' ? String(values.get('building-id')) : null,
        })
        if (error) throw error
        requestId.current = crypto.randomUUID()
        form.reset()
        setMessage(tr('Location saved without occupancy or billing rules.', 'Na-save ang lokasyon nga walay lagda sa nagpuyo o bayranan.'))
        await load()
      } catch {
        setError(tr('Save could not be confirmed. Keep the same details when retrying; duplicate labels and archived buildings are rejected.', 'Wala makumpirma ang pag-save. Gamita gihapon ang mao nga detalye kung mosulay pag-usab; dili dawaton ang ngalan nga doble o gi-archive nga bilding.'))
      } finally {
        setBusy(false)
      }
    }}>
      <fieldset disabled={busy} className="form-section">
      <legend>{tr('Add a location', 'Idugang ang lokasyon')}</legend>
      <label htmlFor="location-kind">{tr('Location type', 'Klase sa lokasyon')}</label>
      <select id="location-kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="building">{tr('Building or section', 'Bilding o seksyon')}</option>
        <option value="unit">{tr('Unit within a building/section', 'Kwarto sulod sa bilding/seksyon')}</option>
      </select>
      {kind === 'unit' && <><label htmlFor="building-id">{tr('Parent building or section', 'Gikanan nga bilding o seksyon')}</label>
        <select id="building-id" name="building-id" required>
          <option value="">{tr('Choose an active building/section', 'Pagpili og aktibong bilding/seksyon')}</option>
          {buildings.filter(building => !building.archived_at).map(building =>
            <option key={building.id} value={building.id}>{building.label}</option>)}
        </select>
        {buildings.every(building => building.archived_at) &&
          <p>{tr('Create an active building or section before adding a unit.', 'Paghimo og aktibong bilding o seksyon una magdugang og kwarto.')}</p>}
      </>}
      <label htmlFor="location-label">{tr('Location label', 'Ngalan sa lokasyon')}</label>
      <input id="location-label" name="location-label" maxLength={200} required />
      </fieldset>
      <Button className="primary" disabled={busy}>{busy ? tr('Saving location…', 'Gi-save ang lokasyon…') : tr('Create location', 'Paghimo og lokasyon')}</Button>
    </form>}
  </section>
}
