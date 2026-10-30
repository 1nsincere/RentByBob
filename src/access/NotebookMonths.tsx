import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase } from './client'
import { decimalPesos } from './CashAcknowledgment'
import { fromCents, toCents } from './simple-payments-model'
import { philippineToday } from './payment-preview-model.ts'
import { notebookMonthRange, parseRentReview, type WaitingMonth } from './notebook-months-model.ts'
import { text, type Language } from '../i18n'

const monthText = (month: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'))

// Past rent months copied from the paper notebook (202610280001). They wait here, outside every balance, late list and
// reminder, until a different staff member double checks them against the notebook; only then do they become ordinary
// rent charges. The same panel flags a move-in date that is only a best guess.
export function NotebookMonths({ propertyId, agreementId, moveIn, endedOn, chargedMonths, userId, onChanged, language = 'en' }: {
  propertyId: string; agreementId: string; moveIn: string; endedOn: string | null; chargedMonths: string[]; userId: string
  onChanged: () => void; language?: Language
}) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [waiting, setWaiting] = useState<WaitingMonth[]>([])
  const [estimatedBy, setEstimatedBy] = useState<string | null | undefined>(undefined)
  const [names, setNames] = useState<Record<string, string>>({})
  const today = philippineToday().slice(0, 7)
  const first = moveIn.slice(0, 7), last = endedOn && endedOn.slice(0, 7) < today ? endedOn.slice(0, 7) : today
  const [from, setFrom] = useState(first), [to, setTo] = useState(() => { const previous = new Date(today + '-01T00:00:00Z'); previous.setUTCMonth(previous.getUTCMonth() - 1); const value = previous.toISOString().slice(0, 7); return value < first ? first : value })
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<'confirm' | 'remove' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [review, staff] = await Promise.all([supabase!.rpc('read_rent_review', { p_property_id: propertyId }), supabase!.rpc('read_staff_names', { p_property_id: propertyId })])
      if (review.error) { setState('unavailable'); return }
      const parsed = parseRentReview(review.data)
      setWaiting(parsed.drafts.filter(item => item.agreementId === agreementId))
      setEstimatedBy(agreementId in parsed.estimated ? parsed.estimated[agreementId] : undefined)
      setNames(!staff.error && staff.data && typeof staff.data === 'object' ? staff.data as Record<string, string> : {})
      setState('ready')
    } catch { setState('unavailable') }
  }, [propertyId, agreementId])
  useEffect(() => { setState('loading'); setMessage(''); setError(''); setChecked(new Set()); setConfirming(null); void load() }, [load])
  useEffect(() => { setChecked(new Set(waiting.filter(item => item.enteredBy !== userId).map(item => item.id))) }, [waiting, userId])

  const who = (id: string) => id === userId ? tr('you', 'ikaw') : names[id] ?? tr('another staff member', 'ibang staff')
  const planned = notebookMonthRange(from, to, first, last).filter(month => !chargedMonths.includes(month) && !waiting.some(item => item.month === month))
  const skipped = notebookMonthRange(from, to, first, last).length - planned.length
  const spanMonths = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5)) + 1
  const chosen = waiting.filter(item => checked.has(item.id))
  const total = fromCents(chosen.reduce((sum, item) => sum + toCents(item.rent), 0n))

  async function run(action: () => PromiseLike<{ error: { code?: string; message: string } | null; data?: unknown }>, done: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await action()
      if (result.error) {
        setError(result.error.code === '42501' && /different staff/.test(result.error.message) ? tr('A different staff member must double check these. Nothing was changed.', 'Ibang staff ang kailangang mag-double check nito. Walang nabago.')
          : result.error.code === '42501' ? tr('Your staff session needs the authenticator code again. Nothing was changed.', 'Kailangan ulit ang authenticator code. Walang nabago.')
          : /already charged/.test(result.error.message) ? tr('One of these months already has rent charged. Remove that entry and try again. Nothing was changed.', 'May singil na ang isa sa mga buwang ito. Tanggalin ang entry at subukan ulit. Walang nabago.')
          : tr('This could not be saved. Check the months and notes, then try again. Nothing was changed.', 'Hindi ito na-save. Suriin ang mga buwan at tala, saka subukan ulit. Walang nabago.'))
      } else { setMessage(done); setNote(''); setReason(''); setConfirming(null); await load(); onChanged() }
    } catch { setError(tr('Connection interrupted. Reload to see whether it was saved.', 'Naputol ang koneksyon. I-reload para makita kung na-save.')) }
    setBusy(false)
  }

  if (state === 'unavailable') return null
  if (state === 'loading') return <p className="field-help" role="status">{tr('Loading notebook months…', 'Nilo-load ang mga buwan mula sa kuwaderno…')}</p>
  return <section className="card notebook-months" aria-labelledby={`notebook-heading-${agreementId}`}>
    <div className="section-heading"><div><h3 id={`notebook-heading-${agreementId}`}>{tr('Months owed from the notebook', 'Mga buwang utang mula sa kuwaderno')}</h3>
      <p>{tr('Tenants already living here before this app? Copy their unpaid months from the notebook. These wait for a double check by a different staff member and do not count as owed, in balances or in reminders, until then.', 'Nandito na ang mga umuupa bago pa ang app? Kopyahin ang kanilang hindi nabayarang buwan mula sa kuwaderno. Maghihintay ito ng double check ng ibang staff at hindi ituturing na utang, sa balanse o sa paalala, hanggang matapos.')}</p></div></div>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}

    {estimatedBy !== undefined
      ? <div className="notice notice--warning" role="status"><p><span className="status status--pending">{tr('Move-in date is a best guess', 'Tantiya lang ang petsa ng paglipat')}</span> {tr('Due days follow this date, so check it against the notebook.', 'Ang araw ng bayad ay sumusunod dito, kaya suriin sa kuwaderno.')}</p>
        {estimatedBy === userId
          ? <p className="field-help">{tr('Another staff member must double check the move-in date.', 'Ibang staff ang kailangang mag-double check ng petsa ng paglipat.')}</p>
          : <Button variant="approve" disabled={busy} onClick={() => void run(() => supabase!.rpc('confirm_move_in_date', { p_property_id: propertyId, p_agreement_id: agreementId }), tr('Move-in date double checked.', 'Na-double check na ang petsa ng paglipat.'))}>{tr('I checked the move-in date in the notebook', 'Sinuri ko ang petsa ng paglipat sa kuwaderno')}</Button>}
      </div>
      : <details className="move-in-guess"><summary>{tr('The move-in date here is a guess', 'Tantiya lang ang petsa ng paglipat dito')}</summary>
        <p className="field-help">{tr('Mark it so another staff member double checks it against the notebook. This changes no rent or balance.', 'Markahan para masuri ng ibang staff sa kuwaderno. Walang mababago sa upa o balanse.')}</p>
        <Button className="secondary-button" disabled={busy} onClick={() => void run(() => supabase!.rpc('flag_move_in_estimate', { p_property_id: propertyId, p_agreement_id: agreementId }), tr('Marked as a best guess. Another staff member will double check it.', 'Namarkahang tantiya. Susuriin ng ibang staff.'))}>{tr('Mark move-in date as a best guess', 'Markahang tantiya ang petsa ng paglipat')}</Button></details>}

    <form className="rent-setup notebook-form" onSubmit={event => { event.preventDefault(); if (!planned.length) { setError(tr('Choose at least one month that is not already listed.', 'Pumili ng kahit isang buwan na hindi pa nakalista.')); return }
      void run(() => supabase!.rpc('draft_rent_months', { p_property_id: propertyId, p_agreement_id: agreementId, p_months: planned.map(month => month + '-01'), p_note: note.trim() }), tr(`${planned.length} month(s) saved. They are waiting for a double check by a different staff member.`, `${planned.length} buwan ang na-save. Naghihintay sila ng double check ng ibang staff.`)) }}>
      <div className="form-grid">
        <div><label htmlFor={`nb-from-${agreementId}`}>{tr('First unpaid month', 'Unang hindi nabayarang buwan')}</label><input id={`nb-from-${agreementId}`} type="month" min={first} max={last} value={from} onChange={event => setFrom(event.target.value)} required /></div>
        <div><label htmlFor={`nb-to-${agreementId}`}>{tr('Last unpaid month', 'Huling hindi nabayarang buwan')}</label><input id={`nb-to-${agreementId}`} type="month" min={first} max={last} value={to} onChange={event => setTo(event.target.value)} required /></div>
      </div>
      <label htmlFor={`nb-note-${agreementId}`}>{tr('Which notebook notes are these from?', 'Saang tala sa kuwaderno ito galing?')} <span className="required-label">{tr('Required', 'Kailangan')}</span></label>
      <textarea id={`nb-note-${agreementId}`} value={note} onChange={event => setNote(event.target.value)} maxLength={440} rows={2} required placeholder={tr('Example: Notebook 2, page 14, written by James', 'Halimbawa: Kuwaderno 2, pahina 14, isinulat ni James')} />
      <p className="field-help" role="status">{planned.length ? `${planned.length} ${tr('month(s) will be saved for a double check:', 'buwan ang ise-save para sa double check:')} ${planned.map(monthText).join(', ')}.` : tr('No new months in this range.', 'Walang bagong buwan sa saklaw na ito.')}{skipped > 0 && ` ${skipped} ${tr('already added or waiting, skipped.', 'naidagdag na o naghihintay, nilaktawan.')}`}</p>
      {spanMonths > 36 && <p className="notice notice--warning" role="status">{tr('Only 36 months can be saved at a time. Save these, then enter the rest.', 'Hanggang 36 buwan lang ang maise-save sa isang pagkakataon. I-save ito, saka ilagay ang natitira.')}</p>}
      {note.trim().length < 3 && <p className="field-help">{tr('Write where in the notebook these come from (at least 3 characters) to save.', 'Isulat kung saan sa kuwaderno ito galing (hindi bababa sa 3 titik) para ma-save.')}</p>}
      <Button className="primary" disabled={busy || !planned.length || note.trim().length < 3}>{tr('Save for double check', 'I-save para sa double check')}</Button>
    </form>

    {waiting.length > 0 && <div className="notebook-waiting">
      <h4>{tr('Waiting for a double check', 'Naghihintay ng double check')}</h4>
      <ul className="notebook-list">{waiting.map(item => { const mine = item.enteredBy === userId
        return <li key={item.id}><label className="notebook-row"><input type="checkbox" checked={checked.has(item.id)} disabled={busy}
          onChange={event => setChecked(previous => { const next = new Set(previous); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next })} />
          <span><strong>{monthText(item.month)}</strong> · {decimalPesos(item.rent)}<small>{tr('From', 'Mula sa')}: {item.sourceNote} · {tr('entered by', 'inilagay ni')} {who(item.enteredBy)}{mine && ` · ${tr('you cannot double check your own entry', 'hindi mo maaaring i-double check ang sarili mong entry')}`}</small></span></label></li> })}</ul>
      {confirming === null && <div className="person-actions">
        <Button variant="approve" disabled={busy || !chosen.length || chosen.some(item => item.enteredBy === userId)} onClick={() => setConfirming('confirm')}>{tr('I checked the notebook: make these final', 'Sinuri ko ang kuwaderno: gawin itong pinal')}</Button>
        <Button variant="danger-quiet" disabled={busy || !chosen.length} onClick={() => setConfirming('remove')}>{tr('Remove checked entries', 'Tanggalin ang naka-check')}</Button></div>}
      {confirming === 'confirm' && <div className="notice" role="group" aria-label={tr('Confirm double check', 'Kumpirmahin ang double check')}>
        <p>{tr(`${chosen.length} month(s) totalling ${decimalPesos(total)} will become unpaid rent on this account. Any advance credit pays them first. Continue?`, `${chosen.length} buwan na ${decimalPesos(total)} ang magiging hindi nabayarang upa sa account na ito. Uunahing ibabayad ang advance credit kung mayroon. Ituloy?`)}</p>
        <div className="person-actions"><Button variant="approve" disabled={busy} onClick={() => void run(() => supabase!.rpc('confirm_rent_month_drafts', { p_property_id: propertyId, p_draft_ids: chosen.map(item => item.id) }), tr('Double checked. These months are now rent charges on the account.', 'Na-double check na. Mga singil na ito sa account.'))}>{tr('Yes, make them final', 'Oo, gawing pinal')}</Button><Button className="secondary-button" disabled={busy} onClick={() => setConfirming(null)}>{tr('Cancel', 'Kanselahin')}</Button></div></div>}
      {confirming === 'remove' && <form className="notice rent-setup" onSubmit={event => { event.preventDefault(); void run(() => supabase!.rpc('remove_rent_month_drafts', { p_property_id: propertyId, p_draft_ids: chosen.map(item => item.id), p_reason: reason.trim() }), tr('Entries removed.', 'Natanggal ang mga entry.')) }}>
        <label htmlFor={`nb-reason-${agreementId}`}>{tr('Why are they removed?', 'Bakit tinanggal?')}</label>
        <input id={`nb-reason-${agreementId}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required />
        <div className="person-actions"><Button variant="danger" disabled={busy || !reason.trim()}>{tr('Remove', 'Tanggalin')}</Button><Button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirming(null)}>{tr('Cancel', 'Kanselahin')}</Button></div></form>}
    </div>}
  </section>
}
