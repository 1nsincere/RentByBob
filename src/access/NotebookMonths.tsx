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

  const who = (id: string) => id === userId ? tr('you', 'ikaw') : names[id] ?? tr('another staff member', 'laing staff')
  const planned = notebookMonthRange(from, to, first, last).filter(month => !chargedMonths.includes(month) && !waiting.some(item => item.month === month))
  const skipped = notebookMonthRange(from, to, first, last).length - planned.length
  const chosen = waiting.filter(item => checked.has(item.id))
  const total = fromCents(chosen.reduce((sum, item) => sum + toCents(item.rent), 0n))

  async function run(action: () => PromiseLike<{ error: { code?: string; message: string } | null; data?: unknown }>, done: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await action()
      if (result.error) {
        setError(result.error.code === '42501' && /different staff/.test(result.error.message) ? tr('A different staff member must double check these. Nothing was changed.', 'Laing staff ang kinahanglan mo-double check niini. Walay nausab.')
          : result.error.code === '42501' ? tr('Your staff session needs the authenticator code again. Nothing was changed.', 'Kinahanglan na usab ang authenticator code. Walay nausab.')
          : /already charged/.test(result.error.message) ? tr('One of these months already has rent charged. Remove that entry and try again. Nothing was changed.', 'Ang usa niining mga bulana naay singil na. Tangtanga ang entry ug sulayi pag-usab. Walay nausab.')
          : tr('This could not be saved. Check the months and notes, then try again. Nothing was changed.', 'Wala ma-save kini. Susiha ang mga bulan ug nota, dayon sulayi pag-usab. Walay nausab.'))
      } else { setMessage(done); setNote(''); setReason(''); setConfirming(null); await load(); onChanged() }
    } catch { setError(tr('Connection interrupted. Reload to see whether it was saved.', 'Naputol ang koneksyon. I-reload aron makita kung na-save.')) }
    setBusy(false)
  }

  if (state === 'unavailable') return null
  if (state === 'loading') return <p className="field-help" role="status">{tr('Loading notebook months…', 'Gikarga ang mga bulan gikan sa kuwaderno…')}</p>
  return <section className="card notebook-months" aria-labelledby={`notebook-heading-${agreementId}`}>
    <div className="section-heading"><div><h3 id={`notebook-heading-${agreementId}`}>{tr('Months owed from the notebook', 'Mga bulan nga utang gikan sa kuwaderno')}</h3>
      <p>{tr('Tenants already living here before this app? Copy their unpaid months from the notebook. These wait for a double check by a different staff member and do not count as owed, in balances or in reminders, until then.', 'Naa na ang mga nag-abang una pa ang app? Kopyaha ang ilang wala mabayri nga mga bulan gikan sa kuwaderno. Maghulat kini og double check sa laing staff ug dili isipon nga utang, sa balanse o sa reminder, hangtod mahuman.')}</p></div></div>
    {message && <p className="notice" role="status">{message}</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}

    {estimatedBy !== undefined
      ? <div className="notice notice--warning" role="status"><p><span className="status status--pending">{tr('Move-in date is a best guess', 'Ang petsa sa pagsulod hinuhaan lang')}</span> {tr('Due days follow this date, so check it against the notebook.', 'Ang adlaw sa bayad nagsunod niini, busa susiha sa kuwaderno.')}</p>
        {estimatedBy === userId
          ? <p className="field-help">{tr('Another staff member must double check the move-in date.', 'Laing staff ang kinahanglan mo-double check sa petsa sa pagsulod.')}</p>
          : <Button className="secondary-button" disabled={busy} onClick={() => void run(() => supabase!.rpc('confirm_move_in_date', { p_property_id: propertyId, p_agreement_id: agreementId }), tr('Move-in date double checked.', 'Na-double check ang petsa sa pagsulod.'))}>{tr('I checked the move-in date in the notebook', 'Gisusi nako ang petsa sa pagsulod sa kuwaderno')}</Button>}
      </div>
      : <details className="move-in-guess"><summary>{tr('The move-in date here is a guess', 'Hinuhaan lang ang petsa sa pagsulod dinhi')}</summary>
        <p className="field-help">{tr('Mark it so another staff member double checks it against the notebook. This changes no rent or balance.', 'Markahi aron susihon sa laing staff sa kuwaderno. Walay mausab sa abang o balanse.')}</p>
        <Button className="secondary-button" disabled={busy} onClick={() => void run(() => supabase!.rpc('flag_move_in_estimate', { p_property_id: propertyId, p_agreement_id: agreementId }), tr('Marked as a best guess. Another staff member will double check it.', 'Namarkahan nga hinuhaan. Susihon sa laing staff.'))}>{tr('Mark move-in date as a best guess', 'Markahi nga hinuhaan ang petsa sa pagsulod')}</Button></details>}

    <form className="rent-setup notebook-form" onSubmit={event => { event.preventDefault(); if (!planned.length) { setError(tr('Choose at least one month that is not already listed.', 'Pili og labing menos usa ka bulan nga wala pa nalista.')); return }
      void run(() => supabase!.rpc('draft_rent_months', { p_property_id: propertyId, p_agreement_id: agreementId, p_months: planned.map(month => month + '-01'), p_note: note.trim() }), tr(`${planned.length} month(s) saved. They are waiting for a double check by a different staff member.`, `${planned.length} ka bulan ang na-save. Naghulat sila og double check sa laing staff.`)) }}>
      <div className="form-grid">
        <div><label htmlFor={`nb-from-${agreementId}`}>{tr('First unpaid month', 'Unang wala mabayri nga bulan')}</label><input id={`nb-from-${agreementId}`} type="month" min={first} max={last} value={from} onChange={event => setFrom(event.target.value)} required /></div>
        <div><label htmlFor={`nb-to-${agreementId}`}>{tr('Last unpaid month', 'Kataposang wala mabayri nga bulan')}</label><input id={`nb-to-${agreementId}`} type="month" min={first} max={last} value={to} onChange={event => setTo(event.target.value)} required /></div>
      </div>
      <label htmlFor={`nb-note-${agreementId}`}>{tr('Which notebook notes are these from?', 'Asa nga nota sa kuwaderno gikan kini?')} <span className="required-label">{tr('Required', 'Kinahanglan')}</span></label>
      <textarea id={`nb-note-${agreementId}`} value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} required placeholder={tr('Example: Notebook 2, page 14, written by James', 'Pananglitan: Kuwaderno 2, panid 14, gisulat ni James')} />
      <p className="field-help" role="status">{planned.length ? `${planned.length} ${tr('month(s) will be saved for a double check:', 'ka bulan ang i-save para sa double check:')} ${planned.map(monthText).join(', ')}.` : tr('No new months in this range.', 'Walay bag-ong bulan niini nga range.')}{skipped > 0 && ` ${skipped} ${tr('already added or waiting, skipped.', 'naidugang na o naghulat, gilaktawan.')}`}</p>
      <Button className="primary" disabled={busy || !planned.length || note.trim().length < 3}>{tr('Save for double check', 'I-save para sa double check')}</Button>
    </form>

    {waiting.length > 0 && <div className="notebook-waiting">
      <h4>{tr('Waiting for a double check', 'Naghulat og double check')}</h4>
      <ul className="notebook-list">{waiting.map(item => { const mine = item.enteredBy === userId
        return <li key={item.id}><label className="notebook-row"><input type="checkbox" checked={checked.has(item.id)} disabled={busy}
          onChange={event => setChecked(previous => { const next = new Set(previous); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next })} />
          <span><strong>{monthText(item.month)}</strong> · {decimalPesos(item.rent)}<small>{tr('From', 'Gikan sa')}: {item.sourceNote} · {tr('entered by', 'gisulod ni')} {who(item.enteredBy)}{mine && ` · ${tr('you cannot double check your own entry', 'dili ka maka-double check sa imong kaugalingong entry')}`}</small></span></label></li> })}</ul>
      {confirming === null && <div className="person-actions">
        <Button className="primary" disabled={busy || !chosen.length || chosen.some(item => item.enteredBy === userId)} onClick={() => setConfirming('confirm')}>{tr('I checked the notebook: make these final', 'Gisusi nako ang kuwaderno: himoa kining pinal')}</Button>
        <Button className="secondary-button" disabled={busy || !chosen.length} onClick={() => setConfirming('remove')}>{tr('Remove checked entries', 'Tangtanga ang gi-check')}</Button></div>}
      {confirming === 'confirm' && <div className="notice" role="group" aria-label={tr('Confirm double check', 'Kumpirmaha ang double check')}>
        <p>{tr(`${chosen.length} month(s) totalling ${decimalPesos(total)} will become unpaid rent on this account. Any advance credit pays them first. Continue?`, `${chosen.length} ka bulan nga ${decimalPesos(total)} ang mahimong wala mabayri nga abang niini nga account. Una nga mobayad ang advance credit kon naa. Ipadayon?`)}</p>
        <div className="person-actions"><Button className="primary" disabled={busy} onClick={() => void run(() => supabase!.rpc('confirm_rent_month_drafts', { p_property_id: propertyId, p_draft_ids: chosen.map(item => item.id) }), tr('Double checked. These months are now rent charges on the account.', 'Na-double check na. Mga bayranan na kini sa account.'))}>{tr('Yes, make them final', 'Oo, himoa nga pinal')}</Button><Button className="secondary-button" disabled={busy} onClick={() => setConfirming(null)}>{tr('Cancel', 'Kanselahon')}</Button></div></div>}
      {confirming === 'remove' && <form className="notice rent-setup" onSubmit={event => { event.preventDefault(); void run(() => supabase!.rpc('remove_rent_month_drafts', { p_property_id: propertyId, p_draft_ids: chosen.map(item => item.id), p_reason: reason.trim() }), tr('Entries removed.', 'Natangtang ang mga entry.')) }}>
        <label htmlFor={`nb-reason-${agreementId}`}>{tr('Why are they removed?', 'Ngano gitangtang?')}</label>
        <input id={`nb-reason-${agreementId}`} value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required />
        <div className="person-actions"><Button className="primary" disabled={busy || !reason.trim()}>{tr('Remove', 'Tangtanga')}</Button><Button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirming(null)}>{tr('Cancel', 'Kanselahon')}</Button></div></form>}
    </div>}
  </section>
}
