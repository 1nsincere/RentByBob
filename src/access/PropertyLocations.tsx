import { useState } from 'react'
import { Button } from '../components/atoms'
import { PropertyDirectory } from './PropertyDirectory'
import { RealPropertyMap } from './RealPropertyMap'
import { text, type Language } from '../i18n'

// Buildings and units: the visual map first, with the existing management list (create/rename/archive) one tab away.
export function PropertyLocations({ propertyId, owner, startAgreement, language = 'en' }: { propertyId: string; owner: boolean; startAgreement?: (unitId: string) => void; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [view, setView] = useState<'map' | 'manage'>('map')
  return <div className="property-locations">
    <div className="segmented-control" role="group" aria-label={tr('Property views', 'Mga paagi sa pagtan-aw')}>
      <Button aria-pressed={view === 'map'} onClick={() => setView('map')}>{tr('Property map', 'Mapa sa propiedad')}</Button>
      <Button aria-pressed={view === 'manage'} onClick={() => setView('manage')}>{tr('Manage buildings and rooms', 'Dumalaa ang bilding ug kwarto')}</Button>
    </div>
    {view === 'map' ? <RealPropertyMap key={`map:${propertyId}`} propertyId={propertyId} owner={owner} startAgreement={startAgreement} language={language} />
      : <PropertyDirectory key={`locations:${propertyId}`} propertyId={propertyId} owner={owner} language={language} />}
  </div>
}
