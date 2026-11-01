import { useId, useMemo, useState } from 'react'
import { Button } from '../components/atoms'
import { text, type Language } from '../i18n'

type PickerTenant = { id: string; display_name: string; kind: string }
const shownAtOnce = 6

// Search-and-pick for long tenant lists (replaces a dropdown that grows with every tenant): type part of a name or
// room, choose from a short list, and the choice shows as a chip with "Change". Works with a form through the "name" prop.
export function TenantPicker({ label, tenants, value, onChange, rooms = {}, notes = {}, name, language = 'en' }: {
  label: string; tenants: PickerTenant[]; value: string; onChange: (tenantId: string) => void
  // notes: an extra word per tenant, for example "Has a sign-in" on the access screen.
  rooms?: Record<string, string>; notes?: Record<string, string>; name?: string; language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const id = useId()
  const [query, setQuery] = useState('')
  const sorted = useMemo(() => [...tenants].sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base', numeric: true })), [tenants])
  const needle = query.trim().toLocaleLowerCase()
  const matches = needle ? sorted.filter(tenant => `${tenant.display_name} ${rooms[tenant.id] ?? ''}`.toLocaleLowerCase().includes(needle)) : sorted
  const chosen = tenants.find(tenant => tenant.id === value)
  const kind = (tenant: PickerTenant) => tenant.kind === 'business' ? tr('Business', 'Negosyo') : tr('Individual', 'Indibidwal')

  return <div className="tenant-picker">
    {name && <input type="hidden" name={name} value={value} />}
    {chosen ? <>
      <p className="tenant-picker-label" id={`${id}-label`}>{label}</p>
      <div className="tenant-picker-chosen" aria-labelledby={`${id}-label`}>
        <span className="tenant-picker-avatar" aria-hidden="true">{chosen.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span>
        <span><strong>{chosen.display_name}</strong><small>{kind(chosen)}{rooms[chosen.id] ? ` · ${rooms[chosen.id]}` : ''}{notes[chosen.id] ? ` · ${notes[chosen.id]}` : ''}</small></span>
        <Button type="button" className="secondary-button" aria-label={`${tr('Change', 'Baguhin')} ${label.toLocaleLowerCase()}`} onClick={() => { onChange(''); setQuery('') }}>{tr('Change', 'Baguhin')}</Button>
      </div>
    </> : <>
      <label htmlFor={`${id}-search`}>{label}</label>
      <input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" aria-controls={`${id}-results`} aria-describedby={`${id}-count`} placeholder={tr('Type a name or room', 'Isulat ang pangalan o kuwarto')} />
      <p className="field-help" id={`${id}-count`} aria-live="polite">{matches.length ? `${matches.length} ${tr(matches.length === 1 ? 'tenant found' : 'tenants found', 'umuupang nakita')}${matches.length > shownAtOnce ? ` · ${tr('showing the first', 'ipinapakita ang unang')} ${shownAtOnce}; ${tr('keep typing to narrow', 'magpatuloy sa pagsulat para paliitin')}` : ''}` : tr('No tenants match. Check the spelling.', 'Walang tugma. Suriin ang spelling.')}</p>
      <ul className="tenant-picker-results" id={`${id}-results`}>
        {matches.slice(0, shownAtOnce).map(tenant => <li key={tenant.id}>
          <button type="button" onClick={() => onChange(tenant.id)} aria-label={`${tr('Choose', 'Piliin')} ${tenant.display_name}`}>
            <span className="tenant-picker-avatar" aria-hidden="true">{tenant.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span>
            <span><strong>{tenant.display_name}</strong><small>{kind(tenant)}{rooms[tenant.id] ? ` · ${rooms[tenant.id]}` : ''}{notes[tenant.id] ? ` · ${notes[tenant.id]}` : ''}</small></span>
          </button>
        </li>)}
      </ul>
    </>}
  </div>
}
