import { useState } from 'react'
import { Button } from '../components/atoms'
import { decimalPesos } from './CashAcknowledgment'
import { missingMonthlyCharges } from './monthly-rent-batch-model.ts'
import { philippineToday } from './payment-preview-model.ts'
import type { RentWorkspaceSnapshot } from './saved-payments-model'
import type { Tenant } from './client'
import { text, type Language } from '../i18n'

// Staff review, then one-click add: each charge goes through the existing idempotent add_rent_month RPC,
// one at a time, stopping at the first failure so nothing is charged twice or silently skipped.
export function MonthlyRentBatch({ data, tenants, busy, addMonth, language = 'en' }: {
  data: RentWorkspaceSnapshot; tenants: Tenant[]; busy: boolean
  addMonth: (agreementId: string, month: string) => Promise<unknown>
  language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [month, setMonth] = useState(() => philippineToday().slice(0, 7))
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState('')
  const missing = missingMonthlyCharges(data, month)
  const label = (agreementId: string) => {
    const agreement = data.agreements.find(item => item.id === agreementId)
    const unit = agreement && data.units.find(item => item.id === agreement.unit_id)
    const building = unit && data.buildings.find(item => item.id === unit.building_id)
    return { tenant: tenants.find(item => item.id === agreement?.tenant_id)?.display_name ?? tr('Tenant unavailable', 'Walay rekord sa nag-abang'), space: `${building?.label ?? tr('Building unavailable', 'Walay bilding')} / ${unit?.label ?? tr('Room unavailable', 'Walay kwarto')}` }
  }
  async function addAll() {
    let added = 0
    for (const item of missing) {
      if (!await addMonth(item.agreement.id, item.month)) break
      added++
    }
    setConfirming(false)
    setResult(added === missing.length
      ? tr(`Added ${added} rent charge(s) for ${month}.`, `Nadugang ang ${added} ka bayranan sa abang para sa ${month}.`)
      : tr(`Added ${added} of ${missing.length}. The rest were not added; check the message above and try again.`, `Nadugang ang ${added} sa ${missing.length}. Wala nadugang ang uban; susiha ang mensahe sa taas ug sulayi pag-usab.`))
  }
  return <section className="card monthly-rent-batch" aria-labelledby="monthly-rent-heading">
    <div className="section-heading"><div><h3 id="monthly-rent-heading">{tr('Add monthly rent', 'Idugang ang binulan nga abang')}</h3>
      <p>{tr('Review which rooms are missing rent for a month, then add them together. Nothing is charged until you confirm.', 'Susiha kung unsang mga kwarto ang walay abang sa usa ka bulan, dayon idugang kini tanan. Walay masingil hangtod mokumpirma ka.')}</p></div></div>
    <label htmlFor="batch-month">{tr('Rent month', 'Bulan sa abang')}</label>
    <input id="batch-month" type="month" value={month} disabled={busy} onChange={event => { if (!event.target.value) return; setMonth(event.target.value); setConfirming(false); setResult('') }} />
    {result && <p className="notice" role="status">{result}</p>}
    {missing.length ? <>
      <ul className="monthly-rent-list">{missing.map(item => { const names = label(item.agreement.id); return <li key={item.agreement.id}>
        <div><strong>{names.tenant}</strong><span>{names.space}</span></div>
        <div><strong>{decimalPesos(item.amount)}</strong><span>{tr('Due', 'Takdang adlaw')} {item.dueDate}</span></div>
      </li> })}</ul>
      {!confirming
        ? <Button className="primary" disabled={busy} onClick={() => { setConfirming(true); setResult('') }}>{tr(`Review adding ${missing.length} charge(s)`, `Susiha ang pagdugang sa ${missing.length} ka bayranan`)}</Button>
        : <div className="notice monthly-rent-confirm" role="group" aria-labelledby="monthly-rent-confirm-text">
          <p id="monthly-rent-confirm-text"><strong>{tr(`Add ${missing.length} rent charge(s) for ${month}?`, `Idugang ang ${missing.length} ka bayranan sa abang para sa ${month}?`)}</strong> {tr('Each uses the saved agreement rent and its move-in due date. Existing charges are not changed.', 'Ang matag usa mogamit sa na-save nga abang ug takdang adlaw base sa pagsulod. Dili mausab ang naa nang bayranan.')}</p>
          <div className="person-actions"><Button className="primary" disabled={busy} onClick={() => void addAll()}>{tr('Add charges', 'Idugang ang mga bayranan')}</Button><Button disabled={busy} onClick={() => setConfirming(false)}>{tr('Cancel', 'Kanselahon')}</Button></div>
        </div>}
    </> : <p className="field-help" role="status">{tr('Every active agreement already has rent recorded for this month.', 'Ang tanang aktibong kasabotan naa nay abang nga narekord niining bulana.')}</p>}
  </section>
}
