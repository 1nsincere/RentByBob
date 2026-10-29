import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { supabase } from './client'
import { decimalPesos } from './CashAcknowledgment'
import { maintenanceTotal, parseMaintenance, validAmountInput, type MaintenanceExpense } from './maintenance-model.ts'
import { philippineToday } from './payment-preview-model.ts'
import { text, type Language } from '../i18n'

const monthName = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'))

// What was spent on upkeep in a month and how much. The same entries are added to that month's PDF report. They are
// expenses only: they never change a tenant's balance. Mistakes are voided with a reason (never edited or deleted) by any staff member.
export function Maintenance({ propertyId, userId, language = 'en' }: { propertyId: string; userId: string; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const today = philippineToday().slice(0, 7)
  const [month, setMonth] = useState(today)
  const [items, setItems] = useState<MaintenanceExpense[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [names, setNames] = useState<Record<string, string>>({})
  const [what, setWhat] = useState(''), [place, setPlace] = useState(''), [amount, setAmount] = useState('')
  const [voiding, setVoiding] = useState<string | null>(null), [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const request = useRef<{ key: string; id: string } | null>(null)
  const loadSeq = useRef(0) // a slow answer for a month the user already left must not overwrite the list

  const load = useCallback(async () => {
    const mine = ++loadSeq.current
    try {
      const first = month + '-01'
      const [list, staff] = await Promise.all([supabase!.rpc('read_maintenance_expenses', { p_property_id: propertyId, p_from: first, p_to: first }), supabase!.rpc('read_staff_names', { p_property_id: propertyId })])
      if (mine !== loadSeq.current) return
      if (list.error) { setFailed(true); return }
      setItems(parseMaintenance(list.data)); setFailed(false)
      setNames(!staff.error && staff.data && typeof staff.data === 'object' ? staff.data as Record<string, string> : {})
    } catch { if (mine === loadSeq.current) setFailed(true) }
  }, [propertyId, month])
  useEffect(() => { setItems(null); setVoiding(null); setMessage(''); setError(''); void load() }, [load])

  async function add() {
    const key = JSON.stringify([month, what.trim(), place.trim(), amount.trim()])
    if (!request.current || request.current.key !== key) request.current = { key, id: crypto.randomUUID() }
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: rpcError } = await supabase!.rpc('record_maintenance_expense', { p_property_id: propertyId, p_id: request.current.id, p_month: month + '-01', p_description: what.trim(), p_place: place.trim() || null, p_amount: amount.trim() })
      if (rpcError) setError(rpcError.code === '42501' ? tr('Your staff session needs the authenticator code again. Nothing was saved.', 'Kinahanglan na usab ang authenticator code. Walay na-save.') : tr('This could not be saved. Check what it was for and the amount, then try again. Nothing was saved.', 'Wala ma-save kini. Susiha kung para saan ug ang kantidad, dayon sulayi pag-usab. Walay na-save.'))
      else { request.current = null; setWhat(''); setPlace(''); setAmount(''); setMessage(tr('Saved. It is included in this month\'s report.', 'Na-save. Apil kini sa report niining bulana.')); await load() }
    } catch { setError(tr('Connection interrupted. Retry unchanged to avoid a duplicate.', 'Naputol ang koneksyon. Sulayi pag-usab nga walay usba aron dili madoble.')) }
    setBusy(false)
  }
  async function voidEntry(item: MaintenanceExpense) {
    setBusy(true); setError(''); setMessage('')
    let rpcError: { code?: string } | null
    try { rpcError = (await supabase!.rpc('void_maintenance_expense', { p_property_id: propertyId, p_id: item.id, p_reason: reason.trim() })).error }
    catch { rpcError = { code: 'network' } }
    finally { setBusy(false) }
    if (rpcError) { setError(rpcError.code === '42501' ? tr('Your staff session needs the authenticator code again. Nothing changed.', 'Kinahanglan na usab ang authenticator code. Walay nausab.') : tr('This entry could not be removed. Nothing changed.', 'Wala matangtang ang entry. Walay nausab.')); return }
    setVoiding(null); setReason(''); setMessage(tr('Entry removed. The reason is kept in the audit log.', 'Natangtang ang entry. Nahabilin ang rason sa audit log.')); await load()
  }

  const who = (id: string) => id === userId ? tr('you', 'ikaw') : names[id] ?? tr('another staff member', 'laing staff')
  const problem = !what.trim() ? tr('Write what the maintenance was for.', 'Isulat kung para saan ang maintenance.') : !validAmountInput(amount) ? tr('Enter the amount, for example 1250 or 1250.50.', 'Isulod ang kantidad, pananglitan 1250 o 1250.50.') : ''
  return <section className="maintenance" aria-labelledby="maintenance-heading">
    <div className="section-heading"><div><p className="eyebrow">{tr('UPKEEP', 'PAG-ATIMAN')}</p><h2 id="maintenance-heading">{tr('Maintenance', 'Maintenance')}</h2>
      <p>{tr('Write down what was spent on repairs and upkeep for a month and how much. These are added to that month\'s PDF report (Payments → Paid rent report). They do not change any tenant\'s balance.', 'Isulat kung unsa ang gasto sa pag-ayo ug upkeep sa usa ka bulan ug pila. Idugang kini sa PDF report sa maong bulan (Payments → Bayad sa abang). Dili kini mo-usab sa balanse sa bisan kinsa nga nag-abang.')}</p></div></div>
    <div className="card maintenance-toolbar"><label htmlFor="maintenance-month">{tr('Maintenance month', 'Bulan sa maintenance')}</label>
      <input id="maintenance-month" type="month" value={month} max={today} min="2000-01" onChange={event => event.target.value && setMonth(event.target.value)} /></div>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    {failed ? <p className="notice notice--error" role="alert">{tr('Maintenance records could not be loaded. Check your connection and staff session, then reload.', 'Wala ma-load ang mga rekord sa maintenance. Susiha ang koneksyon ug staff session, dayon i-reload.')}</p>
      : items === null ? <LoadingSkeleton label={tr('Loading maintenance…', 'Gikarga ang maintenance…')} rows={2} />
      : <section className="card maintenance-list" aria-labelledby="maintenance-list-heading">
        <div className="maintenance-total"><h3 id="maintenance-list-heading">{monthName(month)}</h3><p><span>{tr('Total maintenance', 'Kinatibuk-ang maintenance')}</span> <strong>{decimalPesos(maintenanceTotal(items))}</strong></p></div>
        {!items.length ? <p role="status">{tr('Nothing recorded for this month yet.', 'Wala pay narekord niining bulana.')}</p> : <ul className="maintenance-rows">{items.map(item => <li key={item.id} className="maintenance-row">
          <div><strong>{item.description}</strong>{item.place && <span> · {item.place}</span>}<small>{tr('Entered by', 'Gisulod ni')} {who(item.recordedBy)}</small></div>
          <strong className="maintenance-amount">{decimalPesos(item.amount)}</strong>
          {voiding !== item.id && <Button variant="danger-quiet" size="sm" aria-label={`${tr('Remove', 'Tangtanga')} ${item.description} ${decimalPesos(item.amount)}`} disabled={busy} onClick={() => { setVoiding(item.id); setReason(''); setError('') }}>{tr('Remove', 'Tangtanga')}</Button>}
          {voiding === item.id && <form className="maintenance-void" onSubmit={event => { event.preventDefault(); void voidEntry(item) }}>
            <label htmlFor={`maintenance-reason-${item.id}`}>{tr('Why is it removed? (required)', 'Ngano gitangtang? (kinahanglan)')}</label>
            <input id={`maintenance-reason-${item.id}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} autoFocus />
            <div className="person-actions"><Button variant="danger" disabled={busy || !reason.trim()}>{tr('Remove entry', 'Tangtanga ang entry')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setVoiding(null)}>{tr('Cancel', 'Kanselahon')}</Button></div></form>}
        </li>)}</ul>}
      </section>}
    <form className="card maintenance-form" onSubmit={event => { event.preventDefault(); if (problem) { setError(problem); return } void add() }}>
      <h3>{tr('Add maintenance for', 'Dugangi og maintenance para sa')} {monthName(month)}</h3>
      <label htmlFor="maintenance-what">{tr('What was it for?', 'Para saan kini?')} <span className="required-label">{tr('Required', 'Kinahanglan')}</span></label>
      <input id="maintenance-what" value={what} onChange={event => { setWhat(event.target.value); setError('') }} maxLength={200} autoComplete="off" placeholder={tr('Example: Fixed roof leak', 'Pananglitan: Giayo ang tulo sa atop')} />
      <label htmlFor="maintenance-place">{tr('Where? (optional)', 'Asa? (opsyonal)')}</label>
      <input id="maintenance-place" value={place} onChange={event => { setPlace(event.target.value); setError('') }} maxLength={100} autoComplete="off" placeholder={tr('Example: Building 1, Room 04', 'Pananglitan: Building 1, Room 04')} />
      <label htmlFor="maintenance-amount">{tr('Amount spent (PHP)', 'Kantidad nga gasto (PHP)')} <span className="required-label">{tr('Required', 'Kinahanglan')}</span></label>
      <input id="maintenance-amount" inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); setError('') }} placeholder="1250.00" autoComplete="off" />
      <div className="form-actions"><Button className="primary" disabled={busy}>{busy ? tr('Saving…', 'Gi-save…') : tr('Save maintenance', 'I-save ang maintenance')}</Button></div>
    </form>
  </section>
}
