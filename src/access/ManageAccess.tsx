import { useState, type FormEvent, useEffect } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { Feedback } from './AuthForms'
import { hostedDevelopment, supabase, stateLabels, type Account, type Tenant } from './client'
import { copy, text, type Language } from '../i18n'
import { TenantPicker } from './TenantPicker'
import { currentTenantRooms } from './tenant-directory-model'
import { philippineToday } from './payment-preview-model'

// The invitation service names why it refused when nothing was saved: the email already has an account, an earlier
// invitation to it is still open, or invitations are switched off for this project.
async function refusalReason(error: unknown): Promise<'account_exists' | 'open_attempt' | 'switched_off' | null> {
  const response = (error as { context?: unknown } | null)?.context
  if (!(response instanceof Response)) return null
  try {
    const body = await response.clone().json() as { reason?: unknown }
    return body.reason === 'account_exists' || body.reason === 'open_attempt' || body.reason === 'switched_off' ? body.reason : null
  } catch { return null }
}

export function Invitations({ propertyId, owner, language = 'en' }: { propertyId: string; owner: boolean; language?: Language }) {
  const t = copy[language]
  const invitationStatusText: Record<string, string> = language === 'fil' ? {
    prepared: 'Hindi pa naipadala',
    dispatching: 'Hindi tiyak — posibleng pinoproseso ng provider',
    issued: 'Kinumpirma ng Supabase Auth ang paggawa; hindi nakumpirma ang pagdating ng email o access sa app',
    rejected: 'Tinanggihan ng Supabase Auth ang kahilingan',
    uncertain: 'Hindi tiyak ang resulta; huwag ipadala ulit at hilingin sa may-ari na suriin',
    accepted: 'Kinumpirma ng account ang email; hiwalay na desisyon ng may-ari ang access sa property',
  } : {}
  const invitationMessages: Record<string, string> = language === 'fil' ? {
    prepared: 'Na-save ang kahilingan; hindi pa tinatawag ang provider.',
    dispatching: 'Posibleng naproseso na ito ng provider. Huwag ipadala ulit; hilingin sa may-ari na suriin.',
    issued: 'Kinumpirma ng Supabase Auth ang paggawa. Hindi nito kinukumpirma na dumating ito sa inbox o na-assign ang access.',
    rejected: 'Tinanggihan ng Supabase Auth ang kahilingan. Suriin ang dahilan bago maghanda ng ibang imbitasyon.',
    uncertain: 'Hindi tiyak ang resulta ng provider. Huwag ipadala ulit; kailangan itong suriin ng may-ari.',
    accepted: 'Kinumpirma ng account na nakaugnay sa imbitasyon ang email. Hiwalay na desisyon ng may-ari ang access sa property.',
  } : {}
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(false)
  const [attempted, setAttempted] = useState(false); const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState('tenant'); const [attemptId, setAttemptId] = useState(() => crypto.randomUUID())
  const [attemptStatus, setAttemptStatus] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setAttempted(true); setMessage(''); setError(false)
    try {
      const { data, error } = await supabase!.functions.invoke('invite-account', {
        body: { propertyId, accountType, email, attemptId },
      })
      // Refusals that happen before anything is saved (no attempt exists), so the form opens again for a fix.
      const reason = await refusalReason(error)
      if (reason) {
        setAttempted(false); setAttemptStatus(''); setAttemptId(crypto.randomUUID()); setError(true)
        setMessage(reason === 'account_exists' ? t.inviteAccountExists : reason === 'open_attempt' ? t.inviteOpenAttempt : t.inviteSwitchedOff)
        return
      }
      if (error || !data?.status || !data?.message) {
        setAttemptStatus('unconfirmed')
        setError(true)
        setMessage(t.invitationFailed)
        return
      }
      setAttemptStatus(String(data.status))
      setMessage(invitationMessages[String(data.status)] ?? String(data.message))
    } catch {
      setAttemptStatus('unconfirmed')
      setError(true)
      setMessage(t.invitationFailed)
    } finally { setBusy(false) }
  }
  if (hostedDevelopment) return <section className="card" aria-labelledby="invite-account-heading"><h2 id="invite-account-heading">{text(language, 'Account invitations', 'Mga imbitasyon sa account')}</h2><p>{t.hostedInviteUnavailable}</p></section>
  return <section className="card form-card" aria-labelledby="invite-account-heading"><p className="eyebrow">{t.invitationHeading}</p><h2 id="invite-account-heading">{t.invitationTitle}</h2><p>{t.invitationSetup}</p>
    <Feedback message={message} error={error} />
    <form onSubmit={submit}>
      <label htmlFor="invite-email">{t.invitationEmailLabel}</label><input id="invite-email" name="invite-email" type="email" autoComplete="email" required disabled={busy || attempted} value={email} onChange={event => setEmail(event.target.value)} placeholder="tenant@gmail.com" aria-describedby="invite-email-help" />
      <p className="field-help" id="invite-email-help">{t.inviteEmailHelp}</p>
      <label htmlFor="account-type">{t.accountType}</label><select id="account-type" name="account-type" disabled={busy || attempted} value={accountType} onChange={event => setAccountType(event.target.value)}><option value="tenant">{t.renterContact}</option>{owner && <option value="staff">{t.staff}</option>}</select>
      <Button className="primary" disabled={busy}>{busy ? t.checkingAttempt : attempted ? t.continueAttempt : t.startInvitation}</Button>
    </form>
    {attempted && <><p>{t.invitationReference}: <code>{attemptId}</code></p>{attemptStatus && <p>{t.attemptStatus}: {invitationStatusText[attemptStatus] ?? attemptStatus}</p>}
      <p>{t.sameAttemptHelp}</p>
      <Button disabled={busy} onClick={() => { setAttempted(false); setMessage(''); setError(false); setAttemptStatus(''); setEmail(''); setAccountType('tenant'); setAttemptId(crypto.randomUUID()) }}>{t.prepareDifferent}</Button>
    </>}
  </section>
}

export function ManageAccess({ propertyId, tenants, changed, owner = true, language = 'en' }: { propertyId: string; tenants: Tenant[]; changed: () => void; owner?: boolean; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [account, setAccount] = useState<Account | null>(null); const [email, setEmail] = useState('')
  const [kind, setKind] = useState('contact'); const [role, setRole] = useState('clerk'); const [tenant, setTenant] = useState('')
  const [enabled, setEnabled] = useState(true); const [reason, setReason] = useState(''); const [confirmation, setConfirmation] = useState('')
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(false)
  const activeTenants = tenants.filter(t => !t.archived_at && !t.removed_at)
  // Current room per tenant, shown in the tenant picker (staff-authorized rent data; empty if unavailable).
  const [rooms, setRooms] = useState<Record<string, string>>({})
  useEffect(() => {
    let live = true
    void supabase!.rpc('read_rent_workspace', { p_property_id: propertyId }).then(({ data, error }) => {
      if (!live || error || !data) return
      setRooms(Object.fromEntries(Object.entries(currentTenantRooms(data, philippineToday())).map(([tenantId, room]) => [tenantId, room.label])))
    }, () => undefined)
    return () => { live = false }
  }, [propertyId])
  // Sign-in accounts the owner may act on (202610300002): pick one instead of typing the email. Optional: if the list
  // cannot load (older database), typing the exact email still works.
  type Candidate = { email: string; confirmed: boolean; last_sign_in_at: string | null; access: string }
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [filter, setFilter] = useState('')
  const loadCandidates = () => {
    void supabase!.rpc('list_access_candidates', { p_property_id: propertyId })
      .then(({ data, error }) => setCandidates(!error && Array.isArray(data) ? data as Candidate[] : []), () => setCandidates([]))
  }
  useEffect(loadCandidates, [propertyId])
  const accessLabel = (access: string) => ({ owner: tr('Owner', 'May-ari'), clerk: tr('Clerk', 'Clerk'), tenant: tr('Tenant', 'Umuupa'), disabled: tr('Access off', 'Naka-off'), none: tr('No access yet', 'Wala pang access') } as Record<string, string>)[access] ?? access
  const signedIn = (c: Candidate) => {
    if (!c.confirmed) return tr('Email not confirmed', 'Hindi nakumpirma ang email')
    if (!c.last_sign_in_at) return tr('Never signed in', 'Hindi pa nakapag-sign in')
    const when = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(c.last_sign_in_at))
    return `${tr('Last sign-in', 'Huling pag-sign in')} ${when}`
  }
  async function choose(candidate: Candidate) {
    setEmail(candidate.email); setReview(false); setConfirmation(''); setMessage(''); setBusy(true)
    try {
      const { data, error } = await supabase!.rpc('find_account_for_assignment', { p_property_id: propertyId, p_email: candidate.email })
      if (error) throw error
      setAccount(data as Account | null); setError(false)
    } catch { setError(true); setMessage(tr('Account lookup failed. Owner access and MFA are required. No assignment was made.', 'Nabigo ang paghahanap ng account. Kailangan ang access ng may-ari at MFA. Walang access na na-assign.')) }
    finally { setBusy(false) }
  }
  async function lookup() {
    const { data, error } = await supabase!.rpc('find_account_for_assignment', { p_property_id: propertyId, p_email: email.trim() })
    if (error) throw error
    setAccount(data as Account | null)
    return data
  }
  return <section className="card form-card" aria-labelledby="manage-access-heading"><p className="eyebrow">{owner ? tr('OWNER APPROVAL', 'PAG-APRUBA NG MAY-ARI') : tr('STAFF ACCESS', 'ACCESS NG STAFF')}</p>{!owner && <p className="notice">{tr('As a clerk you can give or remove tenant access and clerk access. Owner access, and your own access, can only be changed by the owner. Every change is kept in the access history.', 'Bilang clerk, maaari mong ibigay o tanggalin ang access ng umuupa at ng clerk. Ang access ng may-ari at ang sarili mong access ay ang may-ari lang ang makapagbabago. Bawat pagbabago ay nakatala sa kasaysayan ng access.')}</p>}<h2 id="manage-access-heading">{tr('Assign or disable account access', 'Ibigay o tanggalin ang access sa account')}</h2>
    <p>{tr('Confirm the intended person’s email with them outside this app. Look up that exact address, review the account and target below, then retype the email. A verified email proves mailbox access, not a person’s real-world identity.', 'Kumpirmahin ang email ng tao sa labas ng app na ito. Hanapin ang eksaktong email, suriin ang account at target, saka isulat ulit ang email. Pinatutunayan lang ng email na nagagamit niya ang mailbox, hindi ang tunay niyang pagkakakilanlan.')}</p>
    <Feedback message={message} error={error} />
    {candidates === null && <LoadingSkeleton label={tr('Loading accounts that can sign in…', 'Nilo-load ang mga account na makakapag-sign in…')} rows={3} shape="list" />}
    {candidates && candidates.length > 0 && <div className="access-candidates">
      <h3>{tr('Accounts that can sign in', 'Mga account na makakapag-sign in')}</h3>
      <p className="field-help">{tr('Newest sign-in first. People waiting for access show "No access yet". Choose one to review it below.', 'Pinakabagong nag-sign in muna. Ang naghihintay ng access ay "Wala pang access". Piliin para masuri sa ibaba.')}</p>
      {candidates.length > 6 && <><label htmlFor="candidate-filter">{tr('Filter by email', 'Hanapin gamit ang email')}</label><input id="candidate-filter" type="search" value={filter} onChange={e => setFilter(e.target.value)} autoComplete="off" /></>}
      <ul className="access-candidate-list">
        {candidates.filter(c => c.email.toLowerCase().includes(filter.trim().toLowerCase())).map(c => <li key={c.email}>
          <span className="access-candidate-email">{c.email}</span>
          <span className="access-candidate-meta"><span className={`status status--${c.access === 'none' ? 'pending' : c.access === 'disabled' ? 'archived' : 'ready'}`}>{accessLabel(c.access)}</span> {signedIn(c)}</span>
          <Button variant="secondary" size="sm" disabled={busy} aria-label={`${tr('Choose', 'Piliin')} ${c.email}`} onClick={() => void choose(c)}>{tr('Choose', 'Piliin')}</Button>
        </li>)}
      </ul>
    </div>}
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      setBusy(true); setMessage(''); setAccount(null); setReview(false); setConfirmation('')
      try { const data = await lookup(); setError(false); if (!data) setMessage(tr('No account matches this exact email. Check the address or invite the intended person first.', 'Walang account na tugma sa eksaktong email. Suriin ang address o imbitahan muna ang tao.')) }
      catch { setError(true); setMessage(tr('Account lookup failed. Owner access and MFA are required. No assignment was made.', 'Nabigo ang paghahanap ng account. Kailangan ang access ng may-ari at MFA. Walang access na na-assign.')) }
      finally { setBusy(false) }
    }}><label htmlFor="lookup-email">{tr('Exact account email', 'Eksaktong email ng account')}</label><input id="lookup-email" type="email" autoComplete="email" required value={email} onChange={e => { setEmail(e.target.value); setAccount(null); setReview(false) }} /><Button className="secondary-button" disabled={busy}>{busy ? tr('Searching…', 'Hinahanap…') : tr('Find account', 'Hanapin ang account')}</Button></form>
    {account && <div className="divider"><h3>{tr('Matched account', 'Nakitang account')}</h3>
      <div className="notice" role="status">
        <strong>{tr('Assignment summary', 'Buod ng assignment')}</strong>
        <p>{tr('Email matched:', 'Katugmang email:')} <strong>{account.email}</strong></p>
        <p>{tr('Access state:', 'Katayuan ng access:')} <strong>{language === 'fil' ? ({pending:'Naghihintay',disabled:'Naka-off',unassigned:'Hindi na-assign',ready:'Handa'} as Record<string,string>)[account.state] ?? tr('Unknown access state','Hindi kilalang katayuan ng access') : stateLabels[account.state] ?? tr('Unknown access state','Hindi kilalang katayuan ng access')}</strong></p>
        <p>{tr('Invitation status:', 'Katayuan ng imbitasyon:')} <strong>{account.accepted ? tr('Accepted', 'Tinanggap') : tr('Still waiting for acceptance', 'Naghihintay pa ng pagtanggap')}</strong></p>
      </div>
      <p>{tr('Current staff access:', 'Kasalukuyang access ng staff:')} {account.staff_role ? (language === 'fil' ? account.staff_role === 'owner' ? 'Tag-iya' : 'Klerk' : account.staff_role) : tr('None', 'Wala')}</p>
      <ul>{account.contacts.map(c => <li key={c.tenant_id}>{c.name}: {c.enabled ? tr('Enabled', 'Aktibo') : tr('Disabled', 'Naka-off')}</li>)}</ul>
      {!account.accepted ? <p>{tr('Wait for invitation acceptance before assigning access.', 'Hintaying tanggapin muna ang imbitasyon bago mag-assign ng access.')}</p> : <form onSubmit={async e => {
        e.preventDefault(); if (busy) return
        if (!review && kind === 'contact' && !tenant) { setError(true); setMessage(tr('Choose the tenant record first.', 'Piliin muna ang talaan ng umuupa.')); return }
        if (!review) { setReview(true); setMessage(tr('Review the assignment and retype the matched email before confirming.', 'Suriin ang assignment at isulat ulit ang email ng account bago kumpirmahin.')); setError(false); return }
        setBusy(true); setMessage('')
        try {
          const { error } = await supabase!.rpc('assign_account_access', {
            p_property_id: propertyId, p_user_id: account.id, p_expected_email: confirmation.trim(),
            p_kind: kind, p_tenant_id: kind === 'contact' ? tenant : null,
            p_role: kind === 'staff' && enabled ? role : null, p_enabled: enabled, p_reason: reason.trim(),
          })
          if (error) throw error
          setError(false); setMessage(tr('Access change saved. The account’s next access check will use the new permissions.', 'Na-save ang pagbabago sa access. Gagamitin sa susunod na pagsusuri ng account ang bagong pahintulot.')); setReview(false); setConfirmation(''); await lookup(); loadCandidates(); changed()
        } catch { setError(true); setMessage(tr('Access was not confirmed. Refresh the account before retrying. Check the verified email, owner MFA, target tenant and last-owner protection.', 'Hindi makumpirma ang access. I-refresh muna ang account. Suriin ang kumpirmadong email, MFA ng staff, napiling umuupa at proteksyon ng huling may-ari.')); setReview(false) }
        finally { setBusy(false) }
      }}>
        <fieldset disabled={busy || review}><legend>{tr('Choose access','Pagpili ng access')}</legend>
          <label htmlFor="assignment-kind">{tr('Access type','Uri ng access')}</label><select id="assignment-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="contact">{tr('Tenant/contact','Umuupa/contact')}</option><option value="staff">{tr('Property staff','Staff ng property')}</option></select>
          {kind === 'contact' ? <TenantPicker label={tr('Tenant record','Talaan ng umuupa')} tenants={activeTenants} value={tenant} onChange={setTenant} rooms={rooms} language={language} /> : <><label htmlFor="assignment-role">{tr('Staff role','Tungkulin ng staff')}</label><select id="assignment-role" value={role} onChange={e => setRole(e.target.value)}><option value="clerk">{tr('Clerk','Clerk')}</option>{owner && <option value="owner">{tr('Owner','May-ari')}</option>}</select></>}
          <label htmlFor="assignment-action">{tr('Action','Aksyon')}</label><select id="assignment-action" value={enabled ? 'enable' : 'disable'} onChange={e => setEnabled(e.target.value === 'enable')}><option value="enable">{tr('Enable access','Ibigay ang access')}</option><option value="disable">{tr('Disable access','Tanggalin ang access')}</option></select>
          <label htmlFor="assignment-reason">{tr('Reason for this change','Dahilan ng pagbabago')}</label><input id="assignment-reason" value={reason} onChange={e => setReason(e.target.value)} required maxLength={500} aria-describedby="assignment-reason-help" />
          <p className="field-help" id="assignment-reason-help">{tr('This reason is retained in the property access history.','Mananatili ang dahilang ito sa kasaysayan ng access ng property.')}</p>
        </fieldset>
        {review && <div className="notice access-review" aria-labelledby="access-review-heading"><h3 id="access-review-heading">{tr('Review before saving','Suriin muna bago i-save')}</h3><p>{enabled ? tr('Enable','Ibigay') : tr('Disable','Tanggalin')} {kind === 'contact' ? `${tr('contact access to','ang access sa contact para kay')} ${activeTenants.find(t => t.id === tenant)?.display_name}` : `${role === 'owner' ? tr('owner','may-ari') : tr('clerk','clerk')} ${tr('access to this property','na access sa property na ito')}`} {tr('for','para sa')} <strong>{account.email}</strong>.</p>
          {!enabled && <p>{tr('Disabling removes this selected access. Other tenant or property memberships are unchanged; access history is retained. An owner can enable access again with a new reviewed change.','Tatanggalin ang napiling access. Hindi mababago ang ibang pahintulot ng umuupa o property; mananatili ang kasaysayan. Maaaring ibigay ulit pagkatapos ng panibagong pagsusuri.')}</p>}
          <p>{tr('Reason:', 'Dahilan:')} {reason}</p><label htmlFor="confirm-email">{tr('Retype the matched account email','Isulat ulit ang email ng account')}</label><input id="confirm-email" type="email" required value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" aria-describedby="confirm-email-help" /><p className="field-help" id="confirm-email-help">{tr('This extra check helps prevent changes to the wrong account.','Nakakatulong ang dagdag na pagsusuring ito para hindi mabago ang maling account.')}</p><Button type="button" className="secondary-button" onClick={() => { setReview(false); setMessage('') }}>{tr('Edit assignment','Baguhin ang assignment')}</Button></div>}
        <Button className="primary" disabled={busy}>{busy ? tr('Saving…','Sine-save…') : review ? tr('Confirm access change','Kumpirmahin ang pagbabago sa access') : tr('Review assignment','Suriin ang assignment')}</Button>
      </form>}
    </div>}
  </section>
}
