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
  prepared: 'Hindi pa naipadala: hindi pa nagsisimula ang provider call',
  dispatching: 'Hindi tiyak: posibleng nagsimula ang provider call',
  issued: 'Kinumpirma ng provider ang paggawa; hindi nakumpirma ang pagdating ng email',
  rejected: 'Tinanggihan ng provider ang kahilingan',
  uncertain: 'Hindi tiyak: hindi matiyak ang resulta ng provider',
  accepted: 'Kinumpirma ng account ang email',
}

const statusNextStepCeb: Record<Attempt['status'], string> = {
  prepared: 'Hindi pa nagsisimula ang provider call. Maaaring ituloy ng may-ari nang isang beses ang naka-save na kahilingang ito; hindi ito bagong kahilingan.',
  dispatching: 'Huwag ipadala ulit. Suriin ang ebidensya sa Auth at lokal na Mailpit; kung hindi ito makapagpatunay, itala ang pagsusuri ng may-ari at iwanang hindi tiyak.',
  issued: 'Kinumpirma ng Auth ang paggawa, hindi ang pagdating sa inbox. Hintayin ang tatanggap o suriin ang ebidensya. Huwag gumawa ng ibang imbitasyon para sa email na ito.',
  rejected: 'Tinanggihan ito ng provider. Walang silbi ang pagpapadala ulit; suriin ang HTTP status pero huwag gumawa ng ibang kahilingan para sa email na ito.',
  uncertain: 'Huwag ipadala ulit. Suriin ang ebidensya sa Auth at lokal na Mailpit; ang pagkakaroon ng account ay hindi patunay na naipadala ang kahilingang ito.',
  accepted: 'Kinumpirma ng Auth user na nakaugnay sa sagot ng provider ang email. Hindi ito nagbibigay ng access; hiwalay na desisyon ng may-ari ang pag-assign.',
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
        ? text(languageRef.current, 'Owner access and MFA are required to review invitation attempts.', 'Kailangan ang access ng may-ari at MFA para suriin ang mga imbitasyon.')
        : text(languageRef.current, 'Invitation attempts could not be loaded. Refresh and try again.', 'Hindi ma-load ang mga imbitasyon. I-refresh at subukan ulit.'))
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
      setMessage(tr('Owner review recorded. The original invitation status and uncertainty were not changed; no invitation was sent.', 'Naitala ang pagsusuri ng may-ari. Hindi nabago ang orihinal na katayuan o kawalan ng katiyakan; walang imbitasyong ipinadala.'))
      await load()
    } catch {
      setError(tr('Review was not confirmed. Check owner access, MFA and both required fields, then refresh before retrying.', 'Hindi makumpirma ang pagsusuri. Suriin ang access ng may-ari, MFA at ang dalawang kailangang field, saka i-refresh bago subukan ulit.'))
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
      setMessage(data?.message ?? tr('The saved attempt was checked. Refresh to see its persisted status.', 'Nasuri na ang kahilingan. I-refresh para makita ang naka-save na katayuan.'))
      await load()
    } catch {
      setError(tr('The saved attempt response was not confirmed. Refresh the attempt list before taking any further action; an uncertain send is never repeated.', 'Hindi makumpirma ang sagot sa kahilingan. I-refresh muna ang listahan bago magpatuloy; hindi ipapadala ulit ang hindi tiyak na kahilingan.'))
      await load()
    } finally {
      setBusyId('')
    }
  }

  return <section className="card" aria-labelledby="invitation-review-heading">
    <p className="eyebrow">{tr('OWNER REVIEW', 'PAGSUSURI NG MAY-ARI')}</p>
    <h2 id="invitation-review-heading">{tr('Invitation attempts and reconciliation', 'Mga kahilingan at pagsusuri ng imbitasyon')}</h2>
    <p>{tr('Only masked addresses and the minimum status evidence are shown. Provider issuance does not prove email delivery. Account existence does not prove that a particular invitation attempt succeeded. No review action sends an invitation or assigns access.', 'Mga natakpang address at kailangang ebidensya lang ang ipinapakita. Hindi patunay na dumating ang email ang pag-isyu ng provider. Hindi rin patunay ng tagumpay ng kahilingan ang pagkakaroon ng account. Walang ipinapadala o ina-assign na access sa pagsusuri.')}</p>
    <Feedback message={error} error />
    <Feedback message={message} />
    <Button className="secondary-button" disabled={!!busyId} onClick={() => void load()}>{tr('Refresh invitation attempts', 'I-refresh ang mga imbitasyon')}</Button>
    {!loaded && !error && <LoadingSkeleton label={tr('Loading invitation attempts…', 'Nilo-load ang mga imbitasyon…')} rows={3} />}
    {loaded && attempts.length === 0 && <div className="empty-state"><h3>{tr('No invitation attempts to review', 'Walang imbitasyong susuriin')}</h3><p>{tr('Attempts initiated for this property will appear here with their recorded status.', 'Makikita rito ang katayuan ng mga kahilingan sa property na ito.')}</p></div>}
    {loaded && attempts.length > 0 && <ol className="records">{attempts.map(attempt => <li key={attempt.attempt_id}>
      <article>
        <h3>{attempt.account_type === 'tenant' ? tr('Renter/contact invitation', 'Imbitasyon sa umuupa/contact') : tr('Staff invitation', 'Imbitasyon sa staff')}</h3>
        <p><strong>{tr('Status:', 'Katayuan:')} {language === 'fil' ? statusTextCeb[attempt.status] : statusText[attempt.status]}</strong></p>
        <p>{tr('Recipient:', 'Tatanggap:')} {attempt.masked_recipient}</p>
        <p>{tr('Request recorded:', 'Naitala ang kahilingan:')} <time dateTime={attempt.created_at}>{dateTime.format(new Date(attempt.created_at))} {tr('Philippine time', 'Oras ng Pilipinas')}</time></p>
        {attempt.dispatch_started_at && <p>{tr('Provider call may have started:', 'Posibleng nagsimula ang provider call:')} <time dateTime={attempt.dispatch_started_at}>{dateTime.format(new Date(attempt.dispatch_started_at))} {tr('Philippine time', 'Oras ng Pilipinas')}</time></p>}
        {attempt.provider_http_status && <p>{tr('Provider HTTP status:', 'HTTP status ng provider:')} {attempt.provider_http_status}</p>}
        {attempt.auth_account_matches && <p>{tr('A matching Auth account exists. This alone does not prove this attempt was issued or accepted.', 'May katugmang Auth account. Hindi ito patunay na na-isyu o natanggap ang kahilingan.')}</p>}
        {attempt.provider_account_confirmed && attempt.status !== 'accepted' && <p>{tr('The provider-linked Auth account is confirmed; reload to reconcile its current status.', 'Nakumpirma ang Auth account na nakaugnay sa provider; i-reload para suriin ang katayuan nito.')}</p>}
        <p>{language === 'fil' ? statusNextStepCeb[attempt.status] : statusNextStep[attempt.status]}</p>
        {attempt.status === 'prepared' && <Button disabled={!!busyId}
          onClick={() => void continuePrepared(attempt)}>
          {busyId === attempt.attempt_id ? tr('Continuing saved attempt…', 'Ipinagpapatuloy ang kahilingan…') : tr('Continue this unsent attempt', 'Ituloy ang hindi pa naipadalang kahilingang ito')}
        </Button>}
        {attempt.review_count > 0 && <div className="notice">
          <p>{tr('Owner reviews recorded:', 'Mga pagsusuri ng may-ari:')} {attempt.review_count}. {tr('The latest review does not change the attempt status.', 'Hindi mababago ng pagsusuri ang katayuan ng kahilingan.')}</p>
          {attempt.last_review_at && <p>{tr('Latest review:', 'Pinakabagong pagsusuri:')} <time dateTime={attempt.last_review_at}>{dateTime.format(new Date(attempt.last_review_at))} {tr('Philippine time', 'Oras ng Pilipinas')}</time></p>}
          {attempt.last_evidence_source && <p>{tr('Evidence source:', 'Pinagmulan ng ebidensya:')} {attempt.last_evidence_source}</p>}
          {attempt.last_review_reason && <p>{tr('Review note:', 'Maikling tala:')} {attempt.last_review_reason}</p>}
        </div>}
        {(attempt.status === 'dispatching' || attempt.status === 'uncertain') && <form onSubmit={event => { event.preventDefault(); void recordReview(attempt) }}>
          <label htmlFor={`evidence-source-${attempt.attempt_id}`}>{tr('Evidence source checked', 'Pinagmulan ng ebidensyang sinuri')}</label>
          <input id={`evidence-source-${attempt.attempt_id}`} required maxLength={200}
            value={evidenceSource[attempt.attempt_id] ?? ''}
            onChange={event => setEvidenceSource(previous => ({ ...previous, [attempt.attempt_id]: event.target.value }))} />
          <label htmlFor={`review-reason-${attempt.attempt_id}`}>{tr('What did you find?', 'Ano ang nakita mo?')}</label>
          <textarea id={`review-reason-${attempt.attempt_id}`} required maxLength={500}
            value={reviewReason[attempt.attempt_id] ?? ''}
            onChange={event => setReviewReason(previous => ({ ...previous, [attempt.attempt_id]: event.target.value }))} />
          <p>{tr('Keep the status unresolved if the evidence is inconclusive. Do not paste links, tokens, passwords, secrets or full provider responses.', 'Iwanang hindi tiyak kung hindi malinaw ang ebidensya. Huwag idikit ang link, token, password, sikreto o buong sagot ng provider.')}</p>
          <Button disabled={!!busyId || !reviewReason[attempt.attempt_id]?.trim() || !evidenceSource[attempt.attempt_id]?.trim()}>
            {busyId === attempt.attempt_id ? tr('Recording review…', 'Itinatala ang pagsusuri…') : tr('Record review without changing status', 'Itala ang pagsusuri nang hindi binabago ang katayuan')}
          </Button>
        </form>}
      </article>
    </li>)}</ol>}
    {loaded && attempts.length === 100 && <p>{tr('Showing the 100 most recent attempts.', 'Ipinapakita ang 100 pinakabagong kahilingan.')}</p>}
  </section>
}
