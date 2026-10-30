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
    return { tenant: tenants.find(item => item.id === agreement?.tenant_id)?.display_name ?? tr('Tenant unavailable', 'Walang talaan ng umuupa'), space: `${building?.label ?? tr('Building unavailable', 'Walang gusali')} / ${unit?.label ?? tr('Room unavailable', 'Walang kuwarto')}` }
  }
  async function addAll() {
    let added = 0
    for (const item of missing) {
      if (!await addMonth(item.agreement.id, item.month)) break
      added++
    }
    setConfirming(false)
    setResult(added === missing.length
      ? tr(`Added ${added} rent charge(s) for ${month}.`, `Naidagdag ang ${added} singil sa upa para sa ${month}.`)
      : tr(`Added ${added} of ${missing.length}. The rest were not added; check the message above and try again.`, `Naidagdag ang ${added} sa ${missing.length}. Hindi naidagdag ang iba; suriin ang mensahe sa itaas at subukan ulit.`))
  }
  return <section className="card monthly-rent-batch" aria-labelledby="monthly-rent-heading">
    <div className="section-heading"><div><h3 id="monthly-rent-heading">{tr('Add monthly rent', 'Idagdag ang buwanang upa')}</h3>
      <p>{tr('Review which rooms are missing rent for a month, then add them together. Nothing is charged until you confirm.', 'Tingnan kung aling mga kuwarto ang walang upa sa isang buwan, saka idagdag ang lahat. Walang sisingilin hangga\'t hindi mo kinukumpirma.')}</p></div></div>
    <label htmlFor="batch-month">{tr('Rent month', 'Buwan ng upa')}</label>
    <input id="batch-month" type="month" value={month} disabled={busy} onChange={event => { if (!event.target.value) return; setMonth(event.target.value); setConfirming(false); setResult('') }} />
    {result && <p className="notice" role="status">{result}</p>}
    {missing.length ? <>
      <ul className="monthly-rent-list">{missing.map(item => { const names = label(item.agreement.id); return <li key={item.agreement.id}>
        <div><strong>{names.tenant}</strong><span>{names.space}</span></div>
        <div><strong>{decimalPesos(item.amount)}</strong><span>{tr('Due', 'Takdang araw')} {item.dueDate}</span></div>
      </li> })}</ul>
      {!confirming
        ? <Button className="primary" disabled={busy} onClick={() => { setConfirming(true); setResult('') }}>{tr(`Review adding ${missing.length} charge(s)`, `Suriin ang pagdagdag ng ${missing.length} singil`)}</Button>
        : <div className="notice monthly-rent-confirm" role="group" aria-labelledby="monthly-rent-confirm-text">
          <p id="monthly-rent-confirm-text"><strong>{tr(`Add ${missing.length} rent charge(s) for ${month}?`, `Idugang ang ${missing.length} ka bayranan sa abang para sa ${month}?`)}</strong> {tr('Each uses the saved agreement rent and its move-in due date. Existing charges are not changed.', 'Bawat isa ay gagamit ng naka-save na upa at takdang araw batay sa paglipat. Hindi mababago ang mga singil na naroon na.')}</p>
          <div className="person-actions"><Button className="primary" disabled={busy} onClick={() => void addAll()}>{tr('Add charges', 'Idagdag ang mga singil')}</Button><Button disabled={busy} onClick={() => setConfirming(false)}>{tr('Cancel', 'Kanselahin')}</Button></div>
        </div>}
    </> : <p className="field-help" role="status">{tr('Every active agreement already has rent recorded for this month.', 'Lahat ng aktibong kasunduan ay may naitala nang upa ngayong buwan.')}</p>}
  </section>
}
