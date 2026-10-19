import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'
import { text, type Language } from '../i18n'

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

const statusTextCeb: Record<Attempt['status'], string> = {
  prepared: 'Wala pa gipadala: wala pa nagsugod ang provider call',
  dispatching: 'Wala masiguro: posibleng nagsugod ang provider call',
  issued: 'Gikumpirma sa provider ang paghimo; wala makumpirma ang pag-abot sa email',
  rejected: 'Gisalikway sa provider ang hangyo',
  uncertain: 'Wala masiguro: dili matino ang resulta sa provider',
  accepted: 'Gikumpirma sa account ang email',
}

const statusNextStepCeb: Record<Attempt['status'], string> = {
  prepared: 'Wala pa nagsugod ang provider call. Mahimong ipadayon sa tag-iya kausa kining natipig nga hangyo; dili kini bag-ong hangyo.',
  dispatching: 'Ayaw ipadala pag-usab. Susiha ang ebidensya sa Auth ug lokal nga Mailpit; kung dili kini makapamatuod, irekord ang pagsusi sa tag-iya ug bilin nga wala masiguro.',
  issued: 'Gikumpirma sa Auth ang paghimo, dili ang pag-abot sa inbox. Hulata ang nakadawat o susiha ang ebidensya. Ayaw paghimo og laing imbitasyon niini nga email.',
  rejected: 'Gisalikway kini sa provider. Wala magamit ang pagpadala pag-usab; susiha ang HTTP status apan ayaw paghimo og laing hangyo niini nga email.',
  uncertain: 'Ayaw ipadala pag-usab. Susiha ang ebidensya sa Auth ug lokal nga Mailpit; ang paglungtad sa account dili pamatuod nga kini nga hangyo gipadala.',
  accepted: 'Gikumpirma sa Auth user nga nalangkit sa tubag sa provider ang email. Dili kini mohatag og access; lahi nga desisyon sa tag-iya ang pag-assign.',
}

const dateTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

export function InvitationReconciliation({ propertyId, language = 'en' }: { propertyId: string; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const languageRef = useRef(language)
  useEffect(() => { languageRef.current = language }, [language])
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
        ? text(languageRef.current, 'Owner access and MFA are required to review invitation attempts.', 'Kinahanglan ang access sa tag-iya ug MFA aron susihon ang mga imbitasyon.')
        : text(languageRef.current, 'Invitation attempts could not be loaded. Refresh and try again.', 'Wala makarga ang mga imbitasyon. I-refresh ug sulayi pag-usab.'))
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
      setMessage(tr('Owner review recorded. The original invitation status and uncertainty were not changed; no invitation was sent.', 'Narekord ang pagsusi sa tag-iya. Wala mausab ang orihinal nga kahimtang o kawalay kasigurohan; walay imbitasyon nga gipadala.'))
      await load()
    } catch {
      setError(tr('Review was not confirmed. Check owner access, MFA and both required fields, then refresh before retrying.', 'Wala makumpirma ang pagsusi. Susiha ang access sa tag-iya, MFA ug ang duha ka kinahanglanong field, dayon i-refresh una mosulay pag-usab.'))
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
      setMessage(data?.message ?? tr('The saved attempt was checked. Refresh to see its persisted status.', 'Nasusi na ang hangyo. I-refresh aron makita ang natipig nga kahimtang.'))
      await load()
    } catch {
      setError(tr('The saved attempt response was not confirmed. Refresh the attempt list before taking any further action; an uncertain send is never repeated.', 'Wala makumpirma ang tubag sa hangyo. I-refresh ang lista una mosunod; dili ipadala pag-usab ang wala masiguro nga hangyo.'))
      await load()
    } finally {
      setBusyId('')
    }
  }

  return <section className="card" aria-labelledby="invitation-review-heading">
    <p className="eyebrow">{tr('OWNER REVIEW', 'PAGSUSI SA TAG-IYA')}</p>
    <h2 id="invitation-review-heading">{tr('Invitation attempts and reconciliation', 'Mga hangyo ug pagsusi sa imbitasyon')}</h2>
    <p>{tr('Only masked addresses and the minimum status evidence are shown. Provider issuance does not prove email delivery. Account existence does not prove that a particular invitation attempt succeeded. No review action sends an invitation or assigns access.', 'Mga gitabonan nga address ug gikinahanglang ebidensya lang ang gipakita. Dili pamatuod sa pag-abot sa email ang pag-isyu sa provider. Dili usab pamatuod ang paglungtad sa account nga milampos ang usa ka hangyo. Walay ipadala o i-assign nga access pinaagi sa pagsusi.')}</p>
    <Feedback message={error} error />
    <Feedback message={message} />
    <Button className="secondary-button" disabled={!!busyId} onClick={() => void load()}>{tr('Refresh invitation attempts', 'I-refresh ang mga imbitasyon')}</Button>
    {!loaded && !error && <LoadingSkeleton label={tr('Loading invitation attempts…', 'Gikarga ang mga imbitasyon…')} rows={3} />}
    {loaded && attempts.length === 0 && <div className="empty-state"><h3>{tr('No invitation attempts to review', 'Walay imbitasyon nga susihon')}</h3><p>{tr('Attempts initiated for this property will appear here with their recorded status.', 'Makita dinhi ang kahimtang sa mga hangyo niini nga propiedad.')}</p></div>}
    {loaded && attempts.length > 0 && <ol className="records">{attempts.map(attempt => <li key={attempt.attempt_id}>
      <article>
        <h3>{attempt.account_type === 'tenant' ? tr('Renter/contact invitation', 'Imbitasyon sa nag-abang/contact') : tr('Staff invitation', 'Imbitasyon sa staff')}</h3>
        <p><strong>{tr('Status:', 'Kahimtang:')} {language === 'ceb' ? statusTextCeb[attempt.status] : statusText[attempt.status]}</strong></p>
        <p>{tr('Recipient:', 'Nakadawat:')} {attempt.masked_recipient}</p>
        <p>{tr('Request recorded:', 'Narekord ang hangyo:')} <time dateTime={attempt.created_at}>{dateTime.format(new Date(attempt.created_at))} {tr('Philippine time', 'Oras sa Pilipinas')}</time></p>
        {attempt.dispatch_started_at && <p>{tr('Provider call may have started:', 'Posibleng nagsugod ang provider call:')} <time dateTime={attempt.dispatch_started_at}>{dateTime.format(new Date(attempt.dispatch_started_at))} {tr('Philippine time', 'Oras sa Pilipinas')}</time></p>}
        {attempt.provider_http_status && <p>{tr('Provider HTTP status:', 'HTTP status sa provider:')} {attempt.provider_http_status}</p>}
        {attempt.auth_account_matches && <p>{tr('A matching Auth account exists. This alone does not prove this attempt was issued or accepted.', 'Adunay katugbang nga Auth account. Dili kini pamatuod nga na-isyu o gidawat ang hangyo.')}</p>}
        {attempt.provider_account_confirmed && attempt.status !== 'accepted' && <p>{tr('The provider-linked Auth account is confirmed; reload to reconcile its current status.', 'Gikumpirma ang Auth account nga nalangkit sa provider; i-reload aron susihon ang kahimtang niini.')}</p>}
        <p>{language === 'ceb' ? statusNextStepCeb[attempt.status] : statusNextStep[attempt.status]}</p>
        {attempt.status === 'prepared' && <Button disabled={!!busyId}
          onClick={() => void continuePrepared(attempt)}>
          {busyId === attempt.attempt_id ? tr('Continuing saved attempt…', 'Gipadayon ang hangyo…') : tr('Continue this unsent attempt', 'Ipadayon kining wala pa ipadala nga hangyo')}
        </Button>}
        {attempt.review_count > 0 && <div className="notice">
          <p>{tr('Owner reviews recorded:', 'Mga pagsusi sa tag-iya:')} {attempt.review_count}. {tr('The latest review does not change the attempt status.', 'Dili mausab sa pagsusi ang kahimtang sa hangyo.')}</p>
          {attempt.last_review_at && <p>{tr('Latest review:', 'Pinakabag-ong pagsusi:')} <time dateTime={attempt.last_review_at}>{dateTime.format(new Date(attempt.last_review_at))} {tr('Philippine time', 'Oras sa Pilipinas')}</time></p>}
          {attempt.last_evidence_source && <p>{tr('Evidence source:', 'Gigikanan sa ebidensya:')} {attempt.last_evidence_source}</p>}
          {attempt.last_review_reason && <p>{tr('Review note:', 'Mubo nga nota:')} {attempt.last_review_reason}</p>}
        </div>}
        {(attempt.status === 'dispatching' || attempt.status === 'uncertain') && <form onSubmit={event => { event.preventDefault(); void recordReview(attempt) }}>
          <label htmlFor={`evidence-source-${attempt.attempt_id}`}>{tr('Evidence source checked', 'Gigikanan sa ebidensya nga gisusi')}</label>
          <input id={`evidence-source-${attempt.attempt_id}`} required maxLength={200}
            value={evidenceSource[attempt.attempt_id] ?? ''}
            onChange={event => setEvidenceSource(previous => ({ ...previous, [attempt.attempt_id]: event.target.value }))} />
          <label htmlFor={`review-reason-${attempt.attempt_id}`}>{tr('What did you find?', 'Unsa ang imong nakita?')}</label>
          <textarea id={`review-reason-${attempt.attempt_id}`} required maxLength={500}
            value={reviewReason[attempt.attempt_id] ?? ''}
            onChange={event => setReviewReason(previous => ({ ...previous, [attempt.attempt_id]: event.target.value }))} />
          <p>{tr('Keep the status unresolved if the evidence is inconclusive. Do not paste links, tokens, passwords, secrets or full provider responses.', 'Biyai nga wala masiguro kung dili klaro ang ebidensya. Ayaw idikit ang link, token, password, sekreto o tibuok tubag sa provider.')}</p>
          <Button disabled={!!busyId || !reviewReason[attempt.attempt_id]?.trim() || !evidenceSource[attempt.attempt_id]?.trim()}>
            {busyId === attempt.attempt_id ? tr('Recording review…', 'Girekord ang pagsusi…') : tr('Record review without changing status', 'Irekord ang pagsusi nga walay pag-usab sa kahimtang')}
          </Button>
        </form>}
      </article>
    </li>)}</ol>}
    {loaded && attempts.length === 100 && <p>{tr('Showing the 100 most recent attempts.', 'Gipakita ang 100 ka pinakabag-ong hangyo.')}</p>}
  </section>
}
