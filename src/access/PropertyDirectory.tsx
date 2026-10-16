import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'

type Building = { id: string; label: string; archived_at: string | null }
type Unit = Building & { building_id: string }

function LocationMaintenance({
  propertyId, locationId, label, archivedAt, building, onSaved,
}: {
  propertyId: string
  locationId: string
  label: string
  archivedAt: string | null
  building: boolean
  onSaved: () => void
}) {
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
          ? 'That active name is already in use. Choose another location name.'
          : error.code === '42501'
            ? 'Owner access and MFA are required to change locations.'
            : 'Change could not be confirmed. Refresh the directory before retrying; archived records cannot be changed.')
        return
      }
      setReason('')
      setMessage(action === 'rename' ? 'Location renamed.' : 'Location archived; its history is retained.')
      onSaved()
    } catch {
      setError('Change could not be confirmed. Refresh the directory before retrying; archived records cannot be changed.')
    } finally {
      setConfirmArchive(false)
      setBusy(false)
    }
  }

  if (archivedAt) return <p className="small">Archived; retained for history.</p>

  const nameId = `location-name-${locationId}`
  const reasonId = `location-reason-${locationId}`
  const labelForKind = building ? 'building or section' : 'unit'

  return <div className="divider">
    <Feedback message={error} error />
    <Feedback message={message} />
    <label htmlFor={nameId}>Location name</label>
    <input id={nameId} value={name} maxLength={200} onChange={event => { setName(event.target.value); setConfirmArchive(false) }} />
    <label htmlFor={reasonId}>Reason for this change</label>
    <input id={reasonId} value={reason} maxLength={500} onChange={event => { setReason(event.target.value); setConfirmArchive(false) }} required />
    <Button disabled={busy || !name.trim() || !reason.trim()} onClick={() => void save('rename')}>
      {busy ? 'Saving…' : `Save ${labelForKind} name`}
    </Button>
    {confirmArchive && <p className="notice">
      {building ? 'Archiving this building will also archive every unit in it. History is retained and this cannot be undone here.' : 'This unit will remain in the directory as archived history and cannot be reactivated here.'}
    </p>}
    <Button disabled={busy || !reason.trim()} onClick={() => {
      if (confirmArchive) void save('archive')
      else setConfirmArchive(true)
    }}>
      {confirmArchive ? 'Confirm archive' : building ? 'Archive building and all its units' : 'Archive unit'}
    </Button>
  </div>
}

export function PropertyDirectory({ propertyId, owner }: { propertyId: string; owner: boolean }) {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('building')
  const requestId = useRef(crypto.randomUUID())
  const load = useCallback(async () => {
    const [b, u] = await Promise.all([
      supabase!.from('buildings').select('id,label,archived_at').eq('property_id', propertyId).order('label'),
      supabase!.from('units').select('id,label,building_id,archived_at').eq('property_id', propertyId).order('label'),
    ])
    if (b.error || u.error) {
      setBuildings([])
      setUnits([])
      setError('Property directory could not be loaded. No sample locations are substituted.')
      setLoaded(false)
      return
    }
    setBuildings(b.data)
    setUnits(u.data)
    setLoaded(true)
    setError('')
  }, [propertyId])
  useEffect(() => { void load() }, [load])

  return <section className="card">
    <h2>Buildings, sections and units</h2>
    <p>Directory labels only. These records do not assign occupants, set capacity or create rent charges.</p>
    <Feedback message={error} error />
    <Feedback message={message} />
    <Button onClick={() => void load()}>Refresh locations</Button>
    {loaded && <ul className="records">{buildings.map(building => {
      const children = units.filter(unit => unit.building_id === building.id)
      return <li key={building.id}><div>
        <strong>{building.label}</strong>
        <p>{building.archived_at ? 'Archived building or section' : 'Active building or section'}</p>
        {children.length > 0
          ? <ul>{children.map(unit => <li key={unit.id}>
            <div>
              <strong>{unit.label}</strong>
              <p>{unit.archived_at ? 'Archived unit' : 'Active unit'}</p>
              {owner && <LocationMaintenance
                propertyId={propertyId}
                locationId={unit.id}
                label={unit.label}
                archivedAt={unit.archived_at}
                building={false}
                onSaved={() => void load()}
              />}
            </div>
          </li>)}</ul>
          : <p>No units recorded in this building/section.</p>}
        {owner && <LocationMaintenance
          propertyId={propertyId}
          locationId={building.id}
          label={building.label}
          archivedAt={building.archived_at}
          building
          onSaved={() => void load()}
        />}
      </div></li>
    })}</ul>}
    {loaded && buildings.length === 0 && <p>No buildings or sections recorded yet.</p>}
    {owner && <form onSubmit={async event => {
      event.preventDefault()
      const form = event.currentTarget
      const values = new FormData(form)
      setBusy(true)
      setMessage('')
      setError('')
      const { error } = await supabase!.rpc('create_property_location', {
        p_property_id: propertyId,
        p_id: requestId.current,
        p_label: String(values.get('location-label')).trim(),
        p_building_id: kind === 'unit' ? String(values.get('building-id')) : null,
      })
      if (error) {
        setError('Save could not be confirmed. Keep the same details when retrying; duplicate labels and archived buildings are rejected.')
      } else {
        requestId.current = crypto.randomUUID()
        form.reset()
        setMessage('Location saved without occupancy or billing rules.')
        await load()
      }
      setBusy(false)
    }}>
      <label htmlFor="location-kind">Location type</label>
      <select id="location-kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="building">Building or section</option>
        <option value="unit">Unit within a building/section</option>
      </select>
      {kind === 'unit' && <><label htmlFor="building-id">Parent building or section</label>
        <select id="building-id" name="building-id" required>
          <option value="">Choose an active building/section</option>
          {buildings.filter(building => !building.archived_at).map(building =>
            <option key={building.id} value={building.id}>{building.label}</option>)}
        </select>
        {buildings.every(building => building.archived_at) &&
          <p>Create an active building or section before adding a unit.</p>}
      </>}
      <label htmlFor="location-label">Location label</label>
      <input id="location-label" name="location-label" maxLength={200} required />
      <Button disabled={busy}>{busy ? 'Saving…' : 'Create location'}</Button>
    </form>}
  </section>
}
