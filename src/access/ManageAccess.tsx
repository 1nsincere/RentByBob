import { useState, type FormEvent } from 'react'
import { Button } from '../components/atoms'
import { Feedback } from './AuthForms'
import { hostedDevelopment, supabase, stateLabels, type Account, type Tenant } from './client'

export function Invitations({ propertyId, owner }: { propertyId: string; owner: boolean }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(false)
  const [attempted, setAttempted] = useState(false); const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState('tenant'); const [attemptId, setAttemptId] = useState(() => crypto.randomUUID())
  const [attemptStatus, setAttemptStatus] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!email.toLowerCase().endsWith('.invalid')) {
      setError(true); setMessage('Use a fictional .invalid address for this local application.'); return
    }
    setBusy(true); setAttempted(true); setMessage(''); setError(false)
    try {
      const { data, error } = await supabase!.functions.invoke('invite-account', {
        body: { propertyId, accountType, email, attemptId },
      })
      if (error || !data?.status || !data?.message) {
        setAttemptStatus('unconfirmed')
        setError(true)
        setMessage('The current attempt could not be confirmed. Keep its reference and ask an owner to review it. Do not start another send.')
        return
      }
      setAttemptStatus(String(data.status))
      setMessage(String(data.message))
    } catch {
      setAttemptStatus('unconfirmed')
      setError(true)
      setMessage('The current attempt could not be confirmed. Keep its reference and ask an owner to review it. Do not start another send.')
    } finally { setBusy(false) }
  }
  if (hostedDevelopment) return <section className="card" aria-labelledby="invite-account-heading"><h2 id="invite-account-heading">Account invitations</h2><p>Email invitations are unavailable in hosted development. Ask the development administrator to create a fictional test account. An owner must assign its access separately.</p></section>
  return <section className="card form-card" aria-labelledby="invite-account-heading"><p className="eyebrow">ACCOUNT INVITATION</p><h2 id="invite-account-heading">Invite an account</h2><p>Invitation delivery does not grant property or tenant access. An owner must approve each assignment separately.</p>
    <Feedback message={message} error={error} />
    <form onSubmit={submit}>
      <label htmlFor="invite-email">Invitation email</label><input id="invite-email" name="invite-email" type="email" autoComplete="email" required disabled={busy || attempted} value={email} onChange={event => setEmail(event.target.value)} placeholder="person@example.invalid" aria-describedby="invite-email-help" />
      <p className="field-help" id="invite-email-help">Local testing accepts fictional addresses ending in .invalid only.</p>
      <label htmlFor="account-type">Account type</label><select id="account-type" name="account-type" disabled={busy || attempted} value={accountType} onChange={event => setAccountType(event.target.value)}><option value="tenant">Renter/contact</option>{owner && <option value="staff">Staff</option>}</select>
      <Button className="primary" disabled={busy}>{busy ? 'Checking same attempt…' : attempted ? 'Check or continue this same attempt' : 'Start invitation attempt'}</Button>
    </form>
    {attempted && <><p>Attempt reference: <code>{attemptId}</code></p>{attemptStatus && <p>Attempt status: {attemptStatus}</p>}
      <p>Checking again uses the same reference. It will continue only a request known not to have reached the provider; it will not repeat a provider call whose outcome is uncertain.</p>
      <Button disabled={busy} onClick={() => { setAttempted(false); setMessage(''); setError(false); setAttemptStatus(''); setEmail(''); setAccountType('tenant'); setAttemptId(crypto.randomUUID()) }}>Prepare a different invitation</Button>
    </>}
  </section>
}

export function ManageAccess({ propertyId, tenants, changed }: { propertyId: string; tenants: Tenant[]; changed: () => void }) {
  const [account, setAccount] = useState<Account | null>(null); const [email, setEmail] = useState('')
  const [kind, setKind] = useState('contact'); const [role, setRole] = useState('clerk'); const [tenant, setTenant] = useState('')
  const [enabled, setEnabled] = useState(true); const [reason, setReason] = useState(''); const [confirmation, setConfirmation] = useState('')
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(false)
  const activeTenants = tenants.filter(t => !t.archived_at)
  async function lookup() {
    const { data, error } = await supabase!.rpc('find_account_for_assignment', { p_property_id: propertyId, p_email: email.trim() })
    if (error) throw error
    setAccount(data as Account | null)
    return data
  }
  return <section className="card form-card" aria-labelledby="manage-access-heading"><p className="eyebrow">OWNER APPROVAL</p><h2 id="manage-access-heading">Assign or disable account access</h2>
    <p>Confirm the intended person’s email with them outside this app. Look up that exact address, review the account and target below, then retype the email. A verified email proves mailbox access, not a person’s real-world identity.</p>
    <Feedback message={message} error={error} />
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      setBusy(true); setMessage(''); setAccount(null); setReview(false); setConfirmation('')
      try { const data = await lookup(); setError(false); if (!data) setMessage('No account matches this exact email. Check the address or invite the intended person first.') }
      catch { setError(true); setMessage('Account lookup failed. Owner access and MFA are required. No assignment was made.') }
      finally { setBusy(false) }
    }}><label htmlFor="lookup-email">Exact account email</label><input id="lookup-email" type="email" autoComplete="email" required value={email} onChange={e => { setEmail(e.target.value); setAccount(null); setReview(false) }} /><Button className="secondary-button" disabled={busy}>{busy ? 'Searching…' : 'Find account'}</Button></form>
    {account && <div className="divider"><h3>Matched account</h3><p><strong>{account.email}</strong></p><p>{stateLabels[account.state]}</p>
      <p>Current staff access: {account.staff_role ?? 'None'}</p>
      <ul>{account.contacts.map(c => <li key={c.tenant_id}>{c.name}: {c.enabled ? 'Enabled' : 'Disabled'}</li>)}</ul>
      {!account.accepted ? <p>Wait for invitation acceptance before assigning access.</p> : <form onSubmit={async e => {
        e.preventDefault(); if (busy) return
        if (!review) { setReview(true); setMessage('Review the assignment and retype the matched email before confirming.'); setError(false); return }
        setBusy(true); setMessage('')
        try {
          const { error } = await supabase!.rpc('assign_account_access', {
            p_property_id: propertyId, p_user_id: account.id, p_expected_email: confirmation.trim(),
            p_kind: kind, p_tenant_id: kind === 'contact' ? tenant : null,
            p_role: kind === 'staff' && enabled ? role : null, p_enabled: enabled, p_reason: reason.trim(),
          })
          if (error) throw error
          setError(false); setMessage('Access change saved. The account’s next access check will use the new permissions.'); setReview(false); setConfirmation(''); await lookup(); changed()
        } catch { setError(true); setMessage('Access was not confirmed. Refresh the account before retrying. Check the verified email, owner MFA, target tenant and last-owner protection.'); setReview(false) }
        finally { setBusy(false) }
      }}>
        <fieldset disabled={busy || review}><legend>Choose access</legend>
          <label htmlFor="assignment-kind">Access type</label><select id="assignment-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="contact">Tenant/contact</option><option value="staff">Property staff</option></select>
          {kind === 'contact' ? <><label htmlFor="assignment-tenant">Tenant record</label><select id="assignment-tenant" required value={tenant} onChange={e => setTenant(e.target.value)}><option value="">Choose a tenant</option>{activeTenants.map(t => <option key={t.id} value={t.id}>{t.display_name} ({t.kind})</option>)}</select></> : <><label htmlFor="assignment-role">Staff role</label><select id="assignment-role" value={role} onChange={e => setRole(e.target.value)}><option value="clerk">Clerk</option><option value="owner">Owner</option></select></>}
          <label htmlFor="assignment-action">Action</label><select id="assignment-action" value={enabled ? 'enable' : 'disable'} onChange={e => setEnabled(e.target.value === 'enable')}><option value="enable">Enable access</option><option value="disable">Disable access</option></select>
          <label htmlFor="assignment-reason">Reason for this change</label><input id="assignment-reason" value={reason} onChange={e => setReason(e.target.value)} required maxLength={500} aria-describedby="assignment-reason-help" />
          <p className="field-help" id="assignment-reason-help">This reason is retained in the property access history.</p>
        </fieldset>
        {review && <div className="notice access-review" aria-labelledby="access-review-heading"><h3 id="access-review-heading">Review before saving</h3><p>{enabled ? 'Enable' : 'Disable'} {kind === 'contact' ? `contact access to ${activeTenants.find(t => t.id === tenant)?.display_name}` : `${role} access to this property`} for <strong>{account.email}</strong>.</p>
          {!enabled && <p>Disabling removes this selected access. Other tenant or property memberships are unchanged; access history is retained. An owner can enable access again with a new reviewed change.</p>}
          <p>Reason: {reason}</p><label htmlFor="confirm-email">Retype the matched account email</label><input id="confirm-email" type="email" required value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" aria-describedby="confirm-email-help" /><p className="field-help" id="confirm-email-help">This extra check helps prevent changes to the wrong account.</p><Button type="button" className="secondary-button" onClick={() => { setReview(false); setMessage('') }}>Edit assignment</Button></div>}
        <Button className="primary" disabled={busy}>{busy ? 'Saving…' : review ? 'Confirm access change' : 'Review assignment'}</Button>
      </form>}
    </div>}
  </section>
}
