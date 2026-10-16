import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'

type Attempt = {
  attempt_id: string
  account_type: 'tenant' | 'staff'
  masked_recipient: string
  status: 'prepared' | 'dispatching' | 'issued' | 'rejected' | 'uncertain' | 'accepted'
  created_at: string
  dispatch_started_at: string | null
  updated_at: string
  provider_http_status: number | null
  auth_account_matches: boolean
  provider_account_confirmed: boolean
  review_count: number
  last_review_at: string | null
  last_review_reason: string | null
  last_evidence_source: string | null
}

const statusText: Record<Attempt['status'], string> = {
  prepared: 'Not sent: provider call has not started',
  dispatching: 'Unresolved: provider call may have started',
  issued: 'Provider confirmed issuance; email delivery is not confirmed',
  rejected: 'Provider definitively rejected this request',
  uncertain: 'Unresolved: provider outcome could not be established',
  accepted: 'Invitation-linked account confirmed its email',
}

const statusNextStep: Record<Attempt['status'], string> = {
  prepared: 'No provider call has started. An owner can explicitly continue this saved request once; this does not create a new attempt.',
  dispatching: 'Do not resend. Check relevant Auth and local Mailpit evidence; if it does not establish this attempt, record an owner review and leave it unresolved.',
  issued: 'Auth confirmed issuance, not inbox delivery. Wait for the recipient or review delivery evidence. Do not issue another invitation to this address from this property.',
  rejected: 'The provider definitively rejected this request. Reissue is disabled pending an approved retry policy; review the HTTP status, but do not create another attempt for this address.',
  uncertain: 'Do not resend. Check relevant Auth and local Mailpit evidence; account existence alone cannot prove this attempt was issued.',
  accepted: 'The Auth user linked to the provider response confirmed email after issuance. This grants no application access; any assignment remains a separate owner action.',
}

const dateTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

export function InvitationReconciliation({ propertyId }: { propertyId: string }) {
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({})
  const [evidenceSource, setEvidenceSource] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc('read_invitation_attempts', { p_property_id: propertyId })
    if (error) {
      setAttempts([])
      setLoaded(false)
      setError(error.code === '42501'
        ? 'Owner access and MFA are required to review invitation attempts.'
        : 'Invitation attempts could not be loaded. Refresh and try again.')
      return
    }
    setAttempts(data as Attempt[])
    setLoaded(true)
    setError('')
  }, [propertyId])

  useEffect(() => { void load() }, [load])

  async function recordReview(attempt: Attempt) {
    if (busyId) return
    const reason = reviewReason[attempt.attempt_id]?.trim() ?? ''
    const source = evidenceSource[attempt.attempt_id]?.trim() ?? ''
    setBusyId(attempt.attempt_id)
    setMessage('')
    setError('')
    try {
      const { error } = await supabase!.rpc('record_invitation_attempt_review', {
        p_property_id: propertyId,
        p_attempt_id: attempt.attempt_id,
        p_reason: reason,
        p_evidence_source: source,
      })
      if (error) throw error
      setMessage('Owner review recorded. The original invitation status and uncertainty were not changed; no invitation was sent.')
      await load()
    } catch {
      setError('Review was not confirmed. Check owner access, MFA and both required fields, then refresh before retrying.')
    } finally {
      setBusyId('')
    }
  }

  async function continuePrepared(attempt: Attempt) {
    if (busyId) return
    setBusyId(attempt.attempt_id)
    setMessage('')
    setError('')
    try {
      const { data, error } = await supabase!.functions.invoke('invite-account', {
        body: { attemptId: attempt.attempt_id, resume: true },
      })
      if (error) throw error
      setMessage(data?.message ?? 'The saved attempt was checked. Refresh to see its persisted status.')
      await load()
    } catch {
      setError('The saved attempt response was not confirmed. Refresh the attempt list before taking any further action; an uncertain send is never repeated.')
      await load()
    } finally {
      setBusyId('')
    }
  }

  return <section className="card" aria-labelledby="invitation-review-heading">
    <p className="eyebrow">OWNER REVIEW</p>
    <h2 id="invitation-review-heading">Invitation attempts and reconciliation</h2>
    <p>Only masked addresses and the minimum status evidence are shown. Provider issuance does not prove email delivery. Account existence does not prove that a particular invitation attempt succeeded. No review action sends an invitation or assigns access.</p>
    <Feedback message={error} error />
    <Feedback message={message} />
    <Button className="secondary-button" disabled={!!busyId} onClick={() => void load()}>Refresh invitation attempts</Button>
    {!loaded && !error && <p role="status" className="loading-state">Loading invitation attempts…</p>}
    {loaded && attempts.length === 0 && <div className="empty-state"><h3>No invitation attempts to review</h3><p>Attempts initiated for this property will appear here with their recorded status.</p></div>}
    {loaded && attempts.length > 0 && <ol className="records">{attempts.map(attempt => <li key={attempt.attempt_id}>
      <article>
        <h3>{attempt.account_type === 'tenant' ? 'Renter/contact invitation' : 'Staff invitation'}</h3>
        <p><strong>Status: {statusText[attempt.status]}</strong></p>
        <p>Recipient: {attempt.masked_recipient}</p>
        <p>Request recorded: <time dateTime={attempt.created_at}>{dateTime.format(new Date(attempt.created_at))} Philippine time</time></p>
        {attempt.dispatch_started_at && <p>Provider call may have started: <time dateTime={attempt.dispatch_started_at}>{dateTime.format(new Date(attempt.dispatch_started_at))} Philippine time</time></p>}
        {attempt.provider_http_status && <p>Provider HTTP status: {attempt.provider_http_status}</p>}
        {attempt.auth_account_matches && <p>A matching Auth account exists. This alone does not prove this attempt was issued or accepted.</p>}
        {attempt.provider_account_confirmed && attempt.status !== 'accepted' && <p>The provider-linked Auth account is confirmed; reload to reconcile its current status.</p>}
        <p>{statusNextStep[attempt.status]}</p>
        {attempt.status === 'prepared' && <Button disabled={!!busyId}
          onClick={() => void continuePrepared(attempt)}>
          {busyId === attempt.attempt_id ? 'Continuing saved attempt…' : 'Continue this unsent attempt'}
        </Button>}
        {attempt.review_count > 0 && <div className="notice">
          <p>Owner reviews recorded: {attempt.review_count}. The latest review does not change the attempt status.</p>
          {attempt.last_review_at && <p>Latest review: <time dateTime={attempt.last_review_at}>{dateTime.format(new Date(attempt.last_review_at))} Philippine time</time></p>}
          {attempt.last_evidence_source && <p>Evidence source: {attempt.last_evidence_source}</p>}
          {attempt.last_review_reason && <p>Review note: {attempt.last_review_reason}</p>}
        </div>}
        {(attempt.status === 'dispatching' || attempt.status === 'uncertain') && <form onSubmit={event => { event.preventDefault(); void recordReview(attempt) }}>
          <label htmlFor={`evidence-source-${attempt.attempt_id}`}>Evidence source checked</label>
          <input id={`evidence-source-${attempt.attempt_id}`} required maxLength={200}
            value={evidenceSource[attempt.attempt_id] ?? ''}
            onChange={event => setEvidenceSource(previous => ({ ...previous, [attempt.attempt_id]: event.target.value }))} />
          <label htmlFor={`review-reason-${attempt.attempt_id}`}>What did you find?</label>
          <textarea id={`review-reason-${attempt.attempt_id}`} required maxLength={500}
            value={reviewReason[attempt.attempt_id] ?? ''}
            onChange={event => setReviewReason(previous => ({ ...previous, [attempt.attempt_id]: event.target.value }))} />
          <p>Keep the status unresolved if the evidence is inconclusive. Do not paste links, tokens, passwords, secrets or full provider responses.</p>
          <Button disabled={!!busyId || !reviewReason[attempt.attempt_id]?.trim() || !evidenceSource[attempt.attempt_id]?.trim()}>
            {busyId === attempt.attempt_id ? 'Recording review…' : 'Record review without changing status'}
          </Button>
        </form>}
      </article>
    </li>)}</ol>}
    {loaded && attempts.length === 100 && <p>Showing the 100 most recent attempts.</p>}
  </section>
}
