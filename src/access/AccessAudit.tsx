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
      setError(text(languageRef.current, 'Access history could not be loaded. Owner access and MFA are required; refresh and try again.', 'Hindi ma-load ang kasaysayan ng access. Kailangan ang access ng may-ari at MFA; i-refresh at subukan ulit.'))
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { void load() }, [load])

  return <section className="card" aria-labelledby="access-history-heading">
    <p className="eyebrow">{tr('OWNER AUDIT HISTORY', 'KASAYSAYAN NG MAY-ARI')}</p>
    <h2 id="access-history-heading">{tr('Recent account and contact access history', 'Pinakabagong kasaysayan ng access sa account')}</h2>
    <p>{tr('Shows up to 100 recent access changes and invitation dispatch events for this property. Times are shown in Philippine time.', 'Ipinapakita hanggang 100 pinakabagong pagbabago sa access at mga pangyayari sa imbitasyon sa property na ito. Oras ng Pilipinas ang nakikita.')}</p>
    <Feedback message={error} error />
    <Button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? tr('Refreshing history…', 'Nire-refresh ang kasaysayan…') : tr('Refresh access history', 'I-refresh ang kasaysayan ng access')}</Button>
    {!loaded && !error && <LoadingSkeleton label={tr('Loading access history…', 'Nilo-load ang kasaysayan ng access…')} rows={3} shape="table" />}
    {loaded && events.length === 0 && <div className="empty-state"><h3>{tr('No access changes recorded', 'Walang pagbabago sa access')}</h3><p>{tr('Invitation and account changes for this property will appear here when recorded.', 'Makikita rito ang mga imbitasyon at pagbabago sa account kapag naitala na.')}</p></div>}
    {loaded && events.length > 0 && <ol className="records">{events.map(event => <li key={event.event_id}>
      <div>
        <strong>{language === 'fil' ? ({
          contact_enabled: 'Binigyan ng access ang contact ng umuupa', contact_revoked: 'Inalis ang access ng contact ng umuupa',
          staff_revoked: 'Gikuha ang access sa staff', staff_role_owner: 'Ibinigay ang access ng may-ari', staff_role_clerk: 'Gihatag ang access sa clerk',
          tenant_archived: 'Na-archive ang umuupa at tinapos ang access ng contact', account_invitation_requested: 'Gihangyo ang imbitasyon sa account',
          account_invitation_sent: 'Sinabi ng sistema na naipadala ang imbitasyon', account_invitation_failed: 'Napakyas ang pagpadala sa imbitasyon',
          account_invitation_dispatch_started: 'Posibleng nagsugod ang pagpadala sa imbitasyon', account_invitation_provider_issued: 'Kinumpirma ng provider ang paggawa; hindi nakumpirma ang pagdating ng email',
          account_invitation_provider_rejected: 'Tinanggihan ng provider ang kahilingan ng imbitasyon', account_invitation_outcome_uncertain: 'Hindi tiyak ang resulta ng imbitasyon',
          account_invitation_accepted: 'Kinumpirma ng account ang email', account_invitation_reviewed: 'Sinuri ng may-ari ang kahilingan ng imbitasyon',
        } as Record<string, string>)[event.action] ?? 'Hitabo sa access sa account' : actionLabels[event.action] ?? 'Account access event'}</strong>
        <p><time dateTime={event.occurred_at}>{eventTime.format(new Date(event.occurred_at))} {tr('Philippine time', 'Oras ng Pilipinas')}</time></p>
        <p>{tr('Changed by:', 'Binago ni:')} {event.actor_email}</p>
        {event.target_email && <p>{tr('Account:', 'Account:')} {event.target_email}</p>}
        {event.tenant_name && <p>{tr('Tenant:', 'Umuupa:')} {event.tenant_name}</p>}
        <p>{tr('Reason:', 'Dahilan:')} {event.reason}</p>
      </div>
    </li>)}</ol>}
    {loaded && events.length === 100 && <p>{tr('Showing the most recent 100 events.', 'Ipinapakita ang 100 pinakabagong pangyayari.')}</p>}
  </section>
}
