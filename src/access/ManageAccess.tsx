import { useState, type FormEvent, useEffect } from 'react'
import { Button } from '../components/atoms'
import { Feedback } from './AuthForms'
import { hostedDevelopment, supabase, stateLabels, type Account, type Tenant } from './client'
import { copy, text, type Language } from '../i18n'
import { TenantPicker } from './TenantPicker'
import { currentTenantRooms } from './tenant-directory-model'
import { philippineToday } from './payment-preview-model'

export function Invitations({ propertyId, owner, language = 'en' }: { propertyId: string; owner: boolean; language?: Language }) {
  const t = copy[language]
  const invitationStatusText: Record<string, string> = language === 'ceb' ? {
    prepared: 'Wala pa gipadala',
    dispatching: 'Wala masiguro — posibleng giproseso sa provider',
    issued: 'Gikumpirma sa Supabase Auth ang paghimo; wala makumpirma ang pag-abot sa email o access sa app',
    rejected: 'Gisalikway sa Supabase Auth ang hangyo',
    uncertain: 'Wala masiguro ang resulta; ayaw ipadala pag-usab ug hangyoa ang tag-iya nga mosusi',
    accepted: 'Gikumpirma sa account ang email; lahi nga desisyon sa tag-iya ang access sa propiedad',
  } : {}
  const invitationMessages: Record<string, string> = language === 'ceb' ? {
    prepared: 'Na-save ang hangyo; wala pa gitawag ang provider.',
    dispatching: 'Posibleng naproseso na kini sa provider. Ayaw ipadala pag-usab; hangyoa ang tag-iya nga mosusi.',
    issued: 'Gikumpirma sa Supabase Auth ang paghimo. Wala kini magkumpirma nga niabot sa inbox o nga na-assign ang access.',
    rejected: 'Gisalikway sa Supabase Auth ang hangyo. Susiha ang rason sa dili pa mangandam og laing imbitasyon.',
    uncertain: 'Wala masiguro ang resulta sa provider. Ayaw ipadala pag-usab; kinahanglan susihon kini sa tag-iya.',
    accepted: 'Gikumpirma sa account nga nalangkit sa imbitasyon ang email. Lahi nga desisyon sa tag-iya ang access sa propiedad.',
  } : {}
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(false)
  const [attempted, setAttempted] = useState(false); const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState('tenant'); const [attemptId, setAttemptId] = useState(() => crypto.randomUUID())
  const [attemptStatus, setAttemptStatus] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!email.toLowerCase().endsWith('.invalid')) {
      setError(true); setMessage(t.invalidLocalEmail); return
    }
    setBusy(true); setAttempted(true); setMessage(''); setError(false)
    try {
      const { data, error } = await supabase!.functions.invoke('invite-account', {
        body: { propertyId, accountType, email, attemptId },
      })
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
      <label htmlFor="invite-email">{t.invitationEmailLabel}</label><input id="invite-email" name="invite-email" type="email" autoComplete="email" required disabled={busy || attempted} value={email} onChange={event => setEmail(event.target.value)} placeholder="person@example.invalid" aria-describedby="invite-email-help" />
      <p className="field-help" id="invite-email-help">{t.localEmailOnly}</p>
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
      .then(({ data, error }) => setCandidates(!error && Array.isArray(data) ? data as Candidate[] : null), () => setCandidates(null))
  }
  useEffect(loadCandidates, [propertyId])
  const accessLabel = (access: string) => ({ owner: tr('Owner', 'Tag-iya'), clerk: tr('Clerk', 'Klerk'), tenant: tr('Tenant', 'Nag-abang'), disabled: tr('Access off', 'Gipalong'), none: tr('No access yet', 'Wala pay access') } as Record<string, string>)[access] ?? access
  const signedIn = (c: Candidate) => {
    if (!c.confirmed) return tr('Email not confirmed', 'Wala makumpirma ang email')
    if (!c.last_sign_in_at) return tr('Never signed in', 'Wala pa makasulod')
    const when = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(c.last_sign_in_at))
    return `${tr('Last sign-in', 'Katapusang sulod')} ${when}`
  }
  async function choose(candidate: Candidate) {
    setEmail(candidate.email); setReview(false); setConfirmation(''); setMessage(''); setBusy(true)
    try {
      const { data, error } = await supabase!.rpc('find_account_for_assignment', { p_property_id: propertyId, p_email: candidate.email })
      if (error) throw error
      setAccount(data as Account | null); setError(false)
    } catch { setError(true); setMessage(tr('Account lookup failed. Owner access and MFA are required. No assignment was made.', 'Napakyas ang pagpangita sa account. Kinahanglan ang access sa tag-iya ug MFA. Walay access nga gi-assign.')) }
    finally { setBusy(false) }
  }
  async function lookup() {
    const { data, error } = await supabase!.rpc('find_account_for_assignment', { p_property_id: propertyId, p_email: email.trim() })
    if (error) throw error
    setAccount(data as Account | null)
    return data
  }
  return <section className="card form-card" aria-labelledby="manage-access-heading"><p className="eyebrow">{owner ? tr('OWNER APPROVAL', 'APROBADO SA TAG-IYA') : tr('STAFF ACCESS', 'ACCESS SA STAFF')}</p>{!owner && <p className="notice">{tr('As a clerk you can give or remove tenant access and clerk access. Owner access, and your own access, can only be changed by the owner. Every change is kept in the access history.', 'Isip klerk, mahimo nimong ihatag o tangtangon ang access sa nag-abang ug sa klerk. Ang access sa tag-iya ug ang imong kaugalingong access, ang tag-iya ra ang makausab. Ang matag kausaban gitipigan sa kasaysayan sa access.')}</p>}<h2 id="manage-access-heading">{tr('Assign or disable account access', 'Ihatag o tangtangon ang access sa account')}</h2>
    <p>{tr('Confirm the intended person’s email with them outside this app. Look up that exact address, review the account and target below, then retype the email. A verified email proves mailbox access, not a person’s real-world identity.', 'Kumpirmaha ang email sa tawo gawas niining app. Pangitaa ang eksaktong email, susiha ang account ug target, dayon isulat pag-usab ang email. Nagpamatuod lang ang email nga makagamit siya sa mailbox, dili sa iyang tinuod nga identidad.')}</p>
    <Feedback message={message} error={error} />
    {candidates && candidates.length > 0 && <div className="access-candidates">
      <h3>{tr('Accounts that can sign in', 'Mga account nga makasulod')}</h3>
      <p className="field-help">{tr('Newest sign-in first. People waiting for access show "No access yet". Choose one to review it below.', 'Ang pinakabag-o nga nisulod una. Ang naghulat og access kay "Wala pay access". Pilia aron masusi sa ubos.')}</p>
      {candidates.length > 6 && <><label htmlFor="candidate-filter">{tr('Filter by email', 'Pangitaa pinaagi sa email')}</label><input id="candidate-filter" type="search" value={filter} onChange={e => setFilter(e.target.value)} autoComplete="off" /></>}
      <ul className="access-candidate-list">
        {candidates.filter(c => c.email.toLowerCase().includes(filter.trim().toLowerCase())).map(c => <li key={c.email}>
          <span className="access-candidate-email">{c.email}</span>
          <span className="access-candidate-meta"><span className={`status status--${c.access === 'none' ? 'pending' : c.access === 'disabled' ? 'archived' : 'ready'}`}>{accessLabel(c.access)}</span> {signedIn(c)}</span>
          <Button variant="secondary" size="sm" disabled={busy} aria-label={`${tr('Choose', 'Pilia')} ${c.email}`} onClick={() => void choose(c)}>{tr('Choose', 'Pilia')}</Button>
        </li>)}
      </ul>
    </div>}
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      setBusy(true); setMessage(''); setAccount(null); setReview(false); setConfirmation('')
      try { const data = await lookup(); setError(false); if (!data) setMessage(tr('No account matches this exact email. Check the address or invite the intended person first.', 'Walay account nga katugbang sa eksaktong email. Susiha ang address o imbitaha una ang tawo.')) }
      catch { setError(true); setMessage(tr('Account lookup failed. Owner access and MFA are required. No assignment was made.', 'Napakyas ang pagpangita sa account. Kinahanglan ang access sa tag-iya ug MFA. Walay access nga gi-assign.')) }
      finally { setBusy(false) }
    }}><label htmlFor="lookup-email">{tr('Exact account email', 'Eksaktong email sa account')}</label><input id="lookup-email" type="email" autoComplete="email" required value={email} onChange={e => { setEmail(e.target.value); setAccount(null); setReview(false) }} /><Button className="secondary-button" disabled={busy}>{busy ? tr('Searching…', 'Gipangita…') : tr('Find account', 'Pangitaa ang account')}</Button></form>
    {account && <div className="divider"><h3>{tr('Matched account', 'Nakit-an nga account')}</h3>
      <div className="notice" role="status">
        <strong>{tr('Assignment summary', 'Kinatibuk-ang summary sa assignment')}</strong>
        <p>{tr('Email matched:', 'Katugbang nga email:')} <strong>{account.email}</strong></p>
        <p>{tr('Access state:', 'Kahimtang sa access:')} <strong>{language === 'ceb' ? ({pending:'Naghulat',disabled:'Gipalong',unassigned:'Wala ma-assign',ready:'Andam'} as Record<string,string>)[account.state] ?? tr('Unknown access state','Wala mailhi nga kahimtang sa access') : stateLabels[account.state] ?? tr('Unknown access state','Wala mailhi nga kahimtang sa access')}</strong></p>
        <p>{tr('Invitation status:', 'Kahimtang sa imbitasyon:')} <strong>{account.accepted ? tr('Accepted', 'Gidawat') : tr('Still waiting for acceptance', 'Naghulat pa sa pagdawat')}</strong></p>
      </div>
      <p>{tr('Current staff access:', 'Karon nga access sa staff:')} {account.staff_role ? (language === 'ceb' ? account.staff_role === 'owner' ? 'Tag-iya' : 'Klerk' : account.staff_role) : tr('None', 'Wala')}</p>
      <ul>{account.contacts.map(c => <li key={c.tenant_id}>{c.name}: {c.enabled ? tr('Enabled', 'Aktibo') : tr('Disabled', 'Gipalong')}</li>)}</ul>
      {!account.accepted ? <p>{tr('Wait for invitation acceptance before assigning access.', 'Hulata nga dawaton una ang imbitasyon sa dili pa mo-assign og access.')}</p> : <form onSubmit={async e => {
        e.preventDefault(); if (busy) return
        if (!review && kind === 'contact' && !tenant) { setError(true); setMessage(tr('Choose the tenant record first.', 'Pilia una ang rekord sa nag-abang.')); return }
        if (!review) { setReview(true); setMessage(tr('Review the assignment and retype the matched email before confirming.', 'Susiha ang assignment ug isulat pag-usab ang email sa account sa dili pa mokumpirma.')); setError(false); return }
        setBusy(true); setMessage('')
        try {
          const { error } = await supabase!.rpc('assign_account_access', {
            p_property_id: propertyId, p_user_id: account.id, p_expected_email: confirmation.trim(),
            p_kind: kind, p_tenant_id: kind === 'contact' ? tenant : null,
            p_role: kind === 'staff' && enabled ? role : null, p_enabled: enabled, p_reason: reason.trim(),
          })
          if (error) throw error
          setError(false); setMessage(tr('Access change saved. The account’s next access check will use the new permissions.', 'Na-save ang kausaban sa access. Gamiton sa sunod nga pagsusi sa account ang bag-ong permiso.')); setReview(false); setConfirmation(''); await lookup(); loadCandidates(); changed()
        } catch { setError(true); setMessage(tr('Access was not confirmed. Refresh the account before retrying. Check the verified email, owner MFA, target tenant and last-owner protection.', 'Wala makumpirma ang access. I-refresh una ang account. Susiha ang kumpirmadong email, MFA sa tag-iya, nag-abang nga gipili ug proteksyon sa kataposang tag-iya.')); setReview(false) }
        finally { setBusy(false) }
      }}>
        <fieldset disabled={busy || review}><legend>{tr('Choose access','Pagpili og access')}</legend>
          <label htmlFor="assignment-kind">{tr('Access type','Klase sa access')}</label><select id="assignment-kind" value={kind} onChange={e => setKind(e.target.value)}><option value="contact">{tr('Tenant/contact','Nag-abang/contact')}</option><option value="staff">{tr('Property staff','Staff sa propiedad')}</option></select>
          {kind === 'contact' ? <TenantPicker label={tr('Tenant record','Rekord sa nag-abang')} tenants={activeTenants} value={tenant} onChange={setTenant} rooms={rooms} language={language} /> : <><label htmlFor="assignment-role">{tr('Staff role','Tahom sa staff')}</label><select id="assignment-role" value={role} onChange={e => setRole(e.target.value)}><option value="clerk">{tr('Clerk','Klerk')}</option>{owner && <option value="owner">{tr('Owner','Tag-iya')}</option>}</select></>}
          <label htmlFor="assignment-action">{tr('Action','Aksyon')}</label><select id="assignment-action" value={enabled ? 'enable' : 'disable'} onChange={e => setEnabled(e.target.value === 'enable')}><option value="enable">{tr('Enable access','Ihatag ang access')}</option><option value="disable">{tr('Disable access','Tangtanga ang access')}</option></select>
          <label htmlFor="assignment-reason">{tr('Reason for this change','Rason sa kausaban')}</label><input id="assignment-reason" value={reason} onChange={e => setReason(e.target.value)} required maxLength={500} aria-describedby="assignment-reason-help" />
          <p className="field-help" id="assignment-reason-help">{tr('This reason is retained in the property access history.','Magpabilin kini nga rason sa kasaysayan sa access sa propiedad.')}</p>
        </fieldset>
        {review && <div className="notice access-review" aria-labelledby="access-review-heading"><h3 id="access-review-heading">{tr('Review before saving','Susiha una mosave')}</h3><p>{enabled ? tr('Enable','Ihatag') : tr('Disable','Tangtangon')} {kind === 'contact' ? `${tr('contact access to','ang access sa contact alang kang')} ${activeTenants.find(t => t.id === tenant)?.display_name}` : `${role === 'owner' ? tr('owner','tag-iya') : tr('clerk','clerk')} ${tr('access to this property','nga access niini nga propiedad')}`} {tr('for','para sa')} <strong>{account.email}</strong>.</p>
          {!enabled && <p>{tr('Disabling removes this selected access. Other tenant or property memberships are unchanged; access history is retained. An owner can enable access again with a new reviewed change.','Tangtangon ang napiling access. Dili mausab ang laing pagtugot sa nag-abang o propiedad; magpabilin ang kasaysayan. Mahimong ihatag pag-usab sa tag-iya human sa laing pagsusi.')}</p>}
          <p>{tr('Reason:', 'Rason:')} {reason}</p><label htmlFor="confirm-email">{tr('Retype the matched account email','Isulat pag-usab ang email sa account')}</label><input id="confirm-email" type="email" required value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" aria-describedby="confirm-email-help" /><p className="field-help" id="confirm-email-help">{tr('This extra check helps prevent changes to the wrong account.','Kini nga dugang pagsusi makatabang nga malikayan ang pag-usab sa sayop nga account.')}</p><Button type="button" className="secondary-button" onClick={() => { setReview(false); setMessage('') }}>{tr('Edit assignment','Usba ang assignment')}</Button></div>}
        <Button className="primary" disabled={busy}>{busy ? tr('Saving…','Gi-save…') : review ? tr('Confirm access change','Kumpirmaha ang kausaban sa access') : tr('Review assignment','Susiha ang assignment')}</Button>
      </form>}
    </div>}
  </section>
}
