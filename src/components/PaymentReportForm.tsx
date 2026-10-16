import { useEffect, useRef, useState } from 'react'
import { Button } from './atoms'
import { displayBusinessDate, formatPesos, manilaDate, parsePesos, validateReport } from '../domain/payment-report'
import type { ReportDraft, ReportErrors } from '../domain/payment-report'

const emptyDraft: ReportDraft = { method: 'Cash', amount: '', date: '', collector: '', reference: '', months: '', note: '' }

export function PaymentReportForm() {
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft)
  const [errors, setErrors] = useState<ReportErrors>({})
  const [review, setReview] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const previouslyReviewed = useRef(false)
  useEffect(() => {
    if (review) heading.current?.focus()
    else if (previouslyReviewed.current) editButton.current?.focus()
    previouslyReviewed.current = review
  }, [review])
  useEffect(() => { if (Object.keys(errors).length) errorSummary.current?.focus() }, [errors])

  const update = (field: keyof ReportDraft, value: string) => setDraft(current => ({ ...current, [field]: value }))
  const attributes = (field: keyof ReportDraft) => ({
    id: `report-${field}`, name: field, value: draft[field],
    'aria-invalid': errors[field] ? true as const : undefined,
    'aria-describedby': errors[field] ? `error-${field}` : undefined,
    onChange: (event: { target: { value: string } }) => update(field, event.target.value),
  })
  const error = (field: keyof ReportDraft) => errors[field] && <p className="error" id={`error-${field}`}>{errors[field]}</p>
  return <section className="card" aria-labelledby="report-heading">
    <h2 id="report-heading">Report a payment · Preview only</h2>
    <p>This website does not accept payments. Report money or a check already handed to an authorized collector.</p>
    <p className="notice">Use fictional details only. Nothing is sent or saved. Your draft is cleared when you leave this screen or reload.</p>
    {review ? <div>
      <h3 ref={heading} tabIndex={-1}>Review your example report</h3>
      <dl className="report-summary">
        <dt>Method</dt><dd>{draft.method}</dd>
        <dt>Amount</dt><dd>{formatPesos(parsePesos(draft.amount)!)}</dd>
        <dt>Actual handover date</dt><dd>{displayBusinessDate(draft.date)}</dd>
        <dt>Handed to</dt><dd>{draft.collector.trim()}</dd>
        <dt>Paper reference</dt><dd>{draft.reference.trim() || 'Not provided'}</dd>
        <dt>Intended rental months</dt><dd>{draft.months.trim()}</dd>
        <dt>Note</dt><dd>{draft.note.trim() || 'Not provided'}</dd>
      </dl>
      <p>{draft.method === 'Check' ? 'A reported check will not reduce the recorded balance. Physical receipt and bank-confirmed clearance are separate steps.' : 'A cash report will await verification and will not immediately reduce the recorded balance.'}</p>
      <Button className="primary" onClick={() => setReview(false)}>Edit details</Button>
      <p>Submission is unavailable in this prototype. No payment acknowledgment has been issued.</p>
    </div> : <form noValidate onSubmit={event => {
      event.preventDefault()
      const nextErrors = validateReport(draft)
      setErrors(nextErrors)
      if (!Object.keys(nextErrors).length) setReview(true)
    }}>
      {Object.keys(errors).length > 0 && <div className="notice" role="alert" ref={errorSummary} tabIndex={-1}>
        <h3>Please check your report</h3><ul>{Object.entries(errors).map(([field, message]) => <li key={field}><a href={`#report-${field}`}>{message}</a></li>)}</ul>
      </div>}
      <div className="form-grid">
        <div><label htmlFor="report-method">Payment method</label><select {...attributes('method')}><option>Cash</option><option>Check</option></select>{error('method')}</div>
        <div><label htmlFor="report-amount">Amount in pesos</label><input {...attributes('amount')} required inputMode="decimal" placeholder="Example: 4000.00" />{error('amount')}</div>
        <div><label htmlFor="report-date">Actual handover date</label><input {...attributes('date')} required type="date" max={manilaDate()} />{error('date')}</div>
        <div><label htmlFor="report-collector">Handed to</label><input {...attributes('collector')} required maxLength={200} placeholder="Collector’s name" />{error('collector')}</div>
        <div><label htmlFor="report-reference">Paper reference (optional)</label><input {...attributes('reference')} maxLength={200} />{error('reference')}</div>
        <div><label htmlFor="report-months">Intended rental months</label><input {...attributes('months')} required maxLength={200} placeholder="Example: September 2026" />{error('months')}</div>
      </div>
      <label htmlFor="report-note">Note (optional)</label><textarea {...attributes('note')} rows={3} maxLength={1000} />{error('note')}
      <button className="button primary" ref={editButton} type="submit">Review example report</button>
    </form>}
  </section>
}
