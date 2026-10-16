import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { Feedback } from './AuthForms'
import { supabase } from './client'

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

export function AccessAudit({ propertyId }: { propertyId: string }) {
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
      setError('Access history could not be loaded. Owner access and MFA are required; refresh and try again.')
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { void load() }, [load])

  return <section className="card" aria-labelledby="access-history-heading">
    <p className="eyebrow">OWNER AUDIT HISTORY</p>
    <h2 id="access-history-heading">Recent account and contact access history</h2>
    <p>Shows up to 100 recent access changes and invitation dispatch events for this property. Times are shown in Philippine time.</p>
    <Feedback message={error} error />
    <Button className="secondary-button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing history…' : 'Refresh access history'}</Button>
    {!loaded && !error && <p role="status" className="loading-state">Loading access history…</p>}
    {loaded && events.length === 0 && <div className="empty-state"><h3>No access changes recorded</h3><p>Invitation and account changes for this property will appear here when recorded.</p></div>}
    {loaded && events.length > 0 && <ol className="records">{events.map(event => <li key={event.event_id}>
      <div>
        <strong>{actionLabels[event.action] ?? 'Account access event'}</strong>
        <p><time dateTime={event.occurred_at}>{eventTime.format(new Date(event.occurred_at))} Philippine time</time></p>
        <p>Changed by: {event.actor_email}</p>
        {event.target_email && <p>Account: {event.target_email}</p>}
        {event.tenant_name && <p>Tenant: {event.tenant_name}</p>}
        <p>Reason: {event.reason}</p>
      </div>
    </li>)}</ol>}
    {loaded && events.length === 100 && <p>Showing the most recent 100 events.</p>}
  </section>
}
