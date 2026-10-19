import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'
import { text, type Language } from '../i18n'

type AccessAuditEvent = {
  event_id: number
  occurred_at: string
  action: string
  actor_email: string
  target_email: string | null
  tenant_name: string | null
  reason: string
}

const actionLabels: Record<string, string> = {
  contact_enabled: 'Tenant contact access enabled',
  contact_revoked: 'Tenant contact access disabled',
  staff_revoked: 'Staff access disabled',
  staff_role_owner: 'Owner access assigned',
  staff_role_clerk: 'Clerk access assigned',
  tenant_archived: 'Tenant archived and contact access ended',
  account_invitation_requested: 'Account invitation requested',
  account_invitation_sent: 'Invitation dispatch reported as sent',
  account_invitation_failed: 'Invitation dispatch reported as failed',
  account_invitation_dispatch_started: 'Invitation provider call may have started',
  account_invitation_provider_issued: 'Provider confirmed invitation issuance; delivery is not confirmed',
  account_invitation_provider_rejected: 'Provider definitively rejected the invitation request',
  account_invitation_outcome_uncertain: 'Invitation provider outcome is unresolved',
  account_invitation_accepted: 'Invitation-linked account confirmed its email',
  account_invitation_reviewed: 'Owner reviewed an invitation attempt',
}

const eventTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

export function AccessAudit({ propertyId, language = 'en' }: { propertyId: string; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const languageRef = useRef(language)
  useEffect(() => { languageRef.current = language }, [language])
  const [events, setEvents] = useState<AccessAuditEvent[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase!.rpc('read_access_audit', { p_property_id: propertyId })
      if (error) throw error
      setEvents(data as AccessAuditEvent[])
      setLoaded(true)
      setError('')
    } catch {
      setEvents([])
      setLoaded(false)
      setError(text(languageRef.current, 'Access history could not be loaded. Owner access and MFA are required; refresh and try again.', 'Wala makarga ang kasaysayan sa access. Kinahanglan ang access sa tag-iya ug MFA; i-refresh ug sulayi pag-usab.'))
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { void load() }, [load])

  return <section className="card" aria-labelledby="access-history-heading">
    <p className="eyebrow">{tr('OWNER AUDIT HISTORY', 'KASAYSAYAN SA TAG-IYA')}</p>
    <h2 id="access-history-heading">{tr('Recent account and contact access history', 'Bag-ong kasaysayan sa access sa account')}</h2>
    <p>{tr('Shows up to 100 recent access changes and invitation dispatch events for this property. Times are shown in Philippine time.', 'Nagpakita hangtod 100 ka bag-ong kausaban sa access ug mga panghitabo sa imbitasyon niining propiedad. Oras sa Pilipinas ang gipakita.')}</p>
    <Feedback message={error} error />
    <Button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? tr('Refreshing history…', 'Gi-refresh ang kasaysayan…') : tr('Refresh access history', 'I-refresh ang kasaysayan sa access')}</Button>
    {!loaded && !error && <LoadingSkeleton label={tr('Loading access history…', 'Gikarga ang kasaysayan sa access…')} rows={3} />}
    {loaded && events.length === 0 && <div className="empty-state"><h3>{tr('No access changes recorded', 'Walay kausaban sa access')}</h3><p>{tr('Invitation and account changes for this property will appear here when recorded.', 'Makita dinhi ang mga imbitasyon ug kausaban sa account kung marekord na.')}</p></div>}
    {loaded && events.length > 0 && <ol className="records">{events.map(event => <li key={event.event_id}>
      <div>
        <strong>{language === 'ceb' ? ({
          contact_enabled: 'Gihatagan og access ang contact sa nag-abang', contact_revoked: 'Gikuha ang access sa contact sa nag-abang',
          staff_revoked: 'Gikuha ang access sa staff', staff_role_owner: 'Gihatag ang access sa tag-iya', staff_role_clerk: 'Gihatag ang access sa clerk',
          tenant_archived: 'Gi-archive ang nag-abang ug gitapos ang access sa contact', account_invitation_requested: 'Gihangyo ang imbitasyon sa account',
          account_invitation_sent: 'Miingon ang sistema nga gipadala ang imbitasyon', account_invitation_failed: 'Napakyas ang pagpadala sa imbitasyon',
          account_invitation_dispatch_started: 'Posibleng nagsugod ang pagpadala sa imbitasyon', account_invitation_provider_issued: 'Gikumpirma sa provider ang paghimo; wala makumpirma ang pag-abot sa email',
          account_invitation_provider_rejected: 'Gibalibaran sa provider ang hangyo sa imbitasyon', account_invitation_outcome_uncertain: 'Wala masiguro ang resulta sa imbitasyon',
          account_invitation_accepted: 'Gikumpirma sa account ang email', account_invitation_reviewed: 'Gisusi sa tag-iya ang hangyo sa imbitasyon',
        } as Record<string, string>)[event.action] ?? 'Hitabo sa access sa account' : actionLabels[event.action] ?? 'Account access event'}</strong>
        <p><time dateTime={event.occurred_at}>{eventTime.format(new Date(event.occurred_at))} {tr('Philippine time', 'Oras sa Pilipinas')}</time></p>
        <p>{tr('Changed by:', 'Gi-usab ni:')} {event.actor_email}</p>
        {event.target_email && <p>{tr('Account:', 'Account:')} {event.target_email}</p>}
        {event.tenant_name && <p>{tr('Tenant:', 'Nag-abang:')} {event.tenant_name}</p>}
        <p>{tr('Reason:', 'Rason:')} {event.reason}</p>
      </div>
    </li>)}</ol>}
    {loaded && events.length === 100 && <p>{tr('Showing the most recent 100 events.', 'Gipakita ang pinakabag-ong 100 ka hitabo.')}</p>}
  </section>
}
