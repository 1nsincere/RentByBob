import { SavedPayments } from './access/SavedPayments'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button } from './components/atoms'
import { WorkspaceIcon } from './components/WorkspaceIcon'
import { dashboardPreview, preview, initialized, supabase, stateLabels, type AccessState, type Membership, type Property, type Tenant } from './access/client'
import { Feedback, Mfa, PasswordSetup, SignIn } from './access/AuthForms'
import { Invitations, ManageAccess } from './access/ManageAccess'
import { PropertyDirectory } from './access/PropertyDirectory'
import { AccessAudit } from './access/AccessAudit'
import { InvitationReconciliation } from './access/InvitationReconciliation'

type Snapshot = { access: AccessState; mfa: boolean; properties: Property[]; memberships: Membership[]; tenants: Tenant[] }
type NavigationItem = { id: string; label: string }

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [setup, setSetup] = useState(false)
  const [callbackError, setCallbackError] = useState('')
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [propertyId, setPropertyId] = useState('')
  const [backup, setBackup] = useState(false)
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState('home')
  const generation = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const mobileNavigation = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    let alive = true
    void initialized.then(value => {
      if (alive) {
        setSession(value.session)
        setSetup(value.setup)
        setCallbackError(value.failure)
        setBooting(false)
      }
    })
    const subscription = (dashboardPreview ? null : supabase)?.auth.onAuthStateChange((_event, value) => {
      generation.current++
      setSnapshot(null)
      setSession(value)
      if (!value) { setSetup(false); setBackup(false) }
    }).data.subscription
    return () => { alive = false; subscription?.unsubscribe() }
  }, [])

  const refresh = useCallback(async () => {
    if (preview) {
      setSnapshot(preview.previewSnapshot)
      setPropertyId(preview.previewSnapshot.properties[0].id)
      return
    }
    if (!supabase || !session || booting || callbackError) return
    const version = ++generation.current
    try {
      const { data: access, error: accessError } = await supabase.rpc('my_access_state')
      if (accessError || !access) throw accessError
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assuranceError) throw assuranceError
      const mfa = access.staff_mfa_required && assurance.currentLevel !== 'aal2'
      let properties: Property[] = [], memberships: Membership[] = [], tenants: Tenant[] = []
      if (access.state === 'ready' && !mfa && !setup) {
        const [p, m, t] = await Promise.all([
          supabase.from('properties').select('id,name').order('name'),
          supabase.from('staff_memberships').select('property_id,user_id,role,revoked_at').eq('user_id', session.user.id).is('revoked_at', null),
          supabase.from('tenants').select('id,property_id,display_name,kind,archived_at').order('display_name'),
        ])
        if (p.error || m.error || t.error) throw p.error || m.error || t.error
        properties = p.data
        memberships = m.data
        tenants = t.data
      }
      if (version !== generation.current) return
      setError('')
      setSnapshot({ access, mfa, properties, memberships, tenants })
      setPropertyId(previous => properties.some(property => property.id === previous) ? previous : properties[0]?.id ?? '')
    } catch {
      if (version === generation.current) {
        setSnapshot(null)
        setError('Access could not be verified. Records are hidden. Check your connection, refresh access or sign in again.')
      }
    }
  }, [session, booting, callbackError, setup])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 10000)
    const focus = () => { setSnapshot(null); void refresh() }
    const visibility = () => {
      if (document.hidden) { generation.current++; setSnapshot(null) }
      else void refresh()
    }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      generation.current++
      clearInterval(timer)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [refresh])

  const route = booting ? 'loading' : callbackError ? 'link-error' : !session ? 'sign-in'
    : !snapshot ? 'checking' : snapshot.mfa ? 'mfa' : setup ? 'password' : snapshot.access.state
  useEffect(() => { heading.current?.focus() }, [route])

  async function signOut() {
    if (dashboardPreview) { location.href = '/?auth=1'; return }
    generation.current++
    setSnapshot(null)
    const { error } = await supabase!.auth.signOut({ scope: 'local' })
    if (error) {
      setError('Sign-out could not be confirmed. Close this tab to clear this tab’s stored session.')
      return
    }
    setSession(null)
    setSetup(false)
    setCallbackError('')
    setBackup(false)
    setError('')
    history.replaceState(null, '', '/')
  }

  const role = snapshot?.memberships.find(membership => membership.property_id === propertyId)?.role
  const tenantList = snapshot?.tenants.filter(tenant => !role || tenant.property_id === propertyId) ?? []
  const activeTenantCount = tenantList.filter(tenant => !tenant.archived_at).length
  const workspaceStats = role ? [
    { label: 'Active records', value: String(activeTenantCount), hint: `${tenantList.length} total records` },
    { label: 'Authorized properties', value: String(snapshot?.properties.length ?? 0), hint: snapshot?.properties.length === 1 ? 'Current property ready' : 'Cross-property access' },
    { label: 'Access level', value: role === 'owner' ? 'Owner' : 'Clerk', hint: role === 'owner' ? 'Can manage access' : 'Can work with records' },
  ] : []
  const navigationItems: NavigationItem[] = role ? [
    { id: 'home', label: 'Dashboard' },
    { id: 'tenant-records', label: 'Tenant directory' },
    { id: 'property-locations', label: 'Buildings and units' },
    { id: 'create-tenant', label: 'Add tenant record' },
    { id: 'payment-records', label: 'Payments and balances' },
    { id: 'invite-account', label: 'Invite account' },
    ...(role === 'owner' ? [
      { id: 'manage-access', label: 'Assign or disable access' },
      { id: 'invitation-review', label: 'Invitation review' },
      { id: 'access-history', label: 'Access history' },
    ] : []),
    { id: 'account-security', label: 'Account security' },
  ].filter(item => !dashboardPreview || ['home', 'tenant-records', 'property-locations', 'create-tenant', 'payment-records'].includes(item.id)) : []
  const navigationKey = navigationItems.map(item => item.id).join('|')

  useEffect(() => {
    if (navigationKey && !navigationItems.some(item => item.id === activeSection)) setActiveSection('home')
  }, [navigationKey, activeSection])

  function selectSection(id: string) {
    setActiveSection(id)
    if (mobileNavigation.current) mobileNavigation.current.open = false
    requestAnimationFrame(() => {
      const section = document.getElementById(preview && id === 'tenant-records' ? 'preview-tenant-records' : id === 'home' ? 'dashboard-home' : id)
      section?.focus({ preventScroll: true })
      section?.scrollIntoView({ block: 'start' })
    })
  }

  function staffNavigation() {
    return <nav aria-label="Property workspace">
      <ul className="workspace-links">{navigationItems.map(item =>
        <li key={item.id}>
          <a href={`#${item.id}`} aria-current={activeSection === item.id ? 'location' : undefined}
            onClick={event => { event.preventDefault(); selectSection(item.id) }}>
            {dashboardPreview && <WorkspaceIcon kind={item.id === 'home' ? 'home' : item.id === 'tenant-records' ? 'people' : item.id === 'property-locations' ? 'building' : item.id === 'payment-records' ? 'payments' : 'add'} />}{item.label}
          </a>
        </li>)}</ul>
    </nav>
  }

  return <div className={`app-shell ${route === 'sign-in' ? 'sign-in-shell' : ''} ${dashboardPreview ? 'focused-preview' : ''}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="environment-note">Local development · Fictional accounts only</div>
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/" aria-label="RentByBob home"><span className="brand-mark" aria-hidden="true">R</span><span>Rent<span className="brand-accent">ByBob</span></span></a>
        {session && <div className="session-tools">
          <span className="signed-in-label">{dashboardPreview ? 'Workspace mode' : 'Signed in as'}</span>
          <span className="account-email">{dashboardPreview ? 'Interactive preview' : session.user.email}</span>
          <Button className="quiet-button" onClick={() => void signOut()}>{dashboardPreview ? 'Exit preview' : 'Sign out'}</Button>
        </div>}
      </div>
    </header>
    <div className="shell page-shell">
      <main id="main" tabIndex={-1} className={role && route === 'ready' ? 'staff-main' : ''}>
        {dashboardPreview && <p className="notice" role="status"><strong>Dashboard preview - sign-in skipped.</strong> Fictional tenants only. Changes last until reload. No database writes or emails.</p>}
        <div className="page-intro">
          <p className="eyebrow">{role ? 'PROPERTY WORKSPACE' : session ? 'YOUR ACCOUNT' : 'YOUR RENTAL SPACE, SIMPLIFIED'}</p>
          <h1 ref={heading} tabIndex={-1} className="route-heading">
            {route === 'loading' || route === 'checking' ? 'Checking access'
              : route === 'ready' ? role ? `${role === 'owner' ? 'Owner' : 'Clerk'} workspace` : 'Your rental records'
                : route === 'sign-in' ? 'A little less hassle. A little more home.'
                  : route === 'disabled' ? 'Access disabled'
                        : route === 'pending' ? 'Invitation pending'
                          : route === 'unassigned' ? 'Waiting for access' : 'Your rental account'}
          </h1>
          {route === 'sign-in' && <p className="page-summary">Your rental records, together in one simple space. Sign in to see what your property owner has shared with you.</p>}
          {route === 'ready' && !role && <p className="page-summary">View the rental records your property owner has shared with you.</p>}
          {route === 'sign-in' && <div className="welcome-points"><div><span className="welcome-number">01</span><span><strong>Your records</strong><small>Only the information shared with you.</small></span></div><div><span className="welcome-number">02</span><span><strong>Your own account</strong><small>Invited by your property. Managed by you.</small></span></div></div>}
        </div>

        {!supabase ? <section className="card auth-card">
          <h2>Development connection is not configured</h2>
          <p>Start local development with <code>npm.cmd run dev:local</code>, or the configured hosted development environment with <code>npm.cmd run dev:hosted</code>. No prototype records are substituted.</p>
        </section> : booting ? <p role="status">Loading your session…</p>
          : callbackError ? <><Feedback message={callbackError} error /><Button className="primary" onClick={() => { setCallbackError(''); void signOut() }}>Return to sign-in</Button></>
            : !session ? <SignIn />
              : <>
                <Feedback message={error} error />
                {!dashboardPreview && snapshot && !snapshot.mfa && !setup && <Button className="quiet-button refresh-access" onClick={() => { setSnapshot(null); void refresh() }}>Refresh access</Button>}
                {!snapshot ? <p role="status" className="loading-state">{error ? 'Records unavailable.' : 'Checking your current permissions…'}</p>
                  : snapshot.mfa ? <Mfa done={() => void refresh()} />
                    : setup ? <PasswordSetup done={() => { sessionStorage.removeItem(`password-setup:${session.user.id}`); setSetup(false); void refresh() }} />
                      : snapshot.access.state !== 'ready' ? <section className="card access-state-card">
                        <p className={`status status--${snapshot.access.state}`}>{stateLabels[snapshot.access.state] ?? 'Access not available'}</p>
                        <h2>{snapshot.access.state === 'disabled' ? 'Your access has been turned off'
                          : snapshot.access.state === 'pending' ? 'Your invitation is not yet confirmed'
                            : 'Your account is waiting for access'}</h2>
                        <p>{snapshot.access.state === 'disabled'
                          ? 'Your previous access is disabled. Contact the property owner to review it.'
                          : snapshot.access.state === 'pending'
                            ? 'Follow the invitation link sent to your email address. If the invitation has expired or you cannot find it, contact the property owner.'
                            : 'You are signed in, but an owner has not assigned property or tenant access yet. Contact the owner with this account email.'}</p>
                        <p>No rental records are available to this account until access is assigned.</p>
                      </section> : role ? <>
                        <div className="mobile-workspace-navigation">
                          <details ref={mobileNavigation}>
                            <summary><span>Workspace navigation</span><small>{navigationItems.find(item => item.id === activeSection)?.label}</small></summary>
                            {staffNavigation()}
                          </details>
                        </div>
                        <div className="workspace-layout">
                          <aside className="workspace-sidebar">
                            <p className="sidebar-label">WORKSPACE</p>
                            {staffNavigation()}
                          </aside>
                          <div className="workspace-content">
                            <div className="workspace-toolbar" hidden={dashboardPreview}>
                              <p className="status status--ready">Account ready</p>
                              <div className="property-picker">
                                <label htmlFor="property">Authorized property</label>
                                <select id="property" value={propertyId} onChange={event => {
                                  setPropertyId(event.target.value)
                                  setBackup(false)
                                  setSearch('')
                                }}>{snapshot.properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                              </div>
                            </div>
                            <section hidden={activeSection !== 'home'} tabIndex={-1} id="dashboard-home" className="dashboard-home" aria-labelledby="dashboard-welcome-heading">
                              <div className="dashboard-welcome">
                                <p className="eyebrow">{role === 'owner' ? 'OWNER WORKSPACE' : 'STAFF WORKSPACE'}</p>
                                <h2 id="dashboard-welcome-heading">Welcome back</h2>
                                <p className="dashboard-identity">Signed in as <strong>{session.user.email}</strong></p>
                                <h3>What would you like to do today?</h3>
                                <div className="dashboard-actions">
                                  <Button className="dashboard-action" onClick={() => selectSection('payment-records')}><span><strong>Log a payment</strong><small>Record cash received and review it.</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                  <Button className="dashboard-action" onClick={() => selectSection('create-tenant')}><span><strong>Add a tenant</strong><small>Create a renter or business record.</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                  <Button className="dashboard-action" onClick={() => selectSection('property-locations')}><span><strong>View the property</strong><small>Explore buildings and rental spaces.</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                  <Button className="dashboard-action" onClick={() => selectSection('tenant-records')}><span><strong>Find a tenant</strong><small>Search renter and business records.</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                </div>
                              </div>
                            </section>
                            <section hidden={activeSection !== 'home'} className="workspace-overview" aria-label="Property workspace summary">
                              {workspaceStats.map(stat => (
                                <article key={stat.label} className="stat-card">
                                  <span className="stat-label">{stat.label}</span>
                                  <strong>{stat.value}</strong>
                                  <small>{stat.hint}</small>
                                </article>
                              ))}
                            </section>
                            {preview && <div hidden={activeSection !== 'tenant-records'} tabIndex={-1} id="preview-tenant-records"><preview.TenantDirectoryPreview openPayments={() => selectSection('payment-records')} openMap={() => selectSection('property-locations')} addTenant={() => selectSection('create-tenant')} /></div>}
                            {!preview && <section hidden={activeSection !== 'tenant-records'} tabIndex={-1} className="card directory-card" id="tenant-records" aria-labelledby="tenant-records-heading">
                              <div className="section-heading">
                                <div><p className="eyebrow">PEOPLE AND BUSINESSES</p><h2 id="tenant-records-heading">Tenant directory</h2></div>
                                <Button className="primary" onClick={() => selectSection('create-tenant')}>Add tenant</Button><span className="record-count">{tenantList.length} {tenantList.length === 1 ? 'record' : 'records'}</span>
                              </div>
                              <p>Find the people and businesses connected to this property.</p>
                              <label htmlFor="tenant-search">Search tenants by name</label>
                              <input id="tenant-search" value={search} onChange={event => setSearch(event.target.value)} type="search" autoComplete="off" aria-describedby="tenant-search-help" />
                              <p className="field-help" id="tenant-search-help">Results update as you type.</p>
                              {tenantList.length > 0 && <ul className="records tenant-records">
                                {tenantList.filter(tenant => tenant.display_name.toLowerCase().includes(search.trim().toLowerCase())).map(tenant =>
                                  <li key={tenant.id} className="tenant-record">
                                    <span className="record-initial" aria-hidden="true">{tenant.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span>
                                    <div className="tenant-record-copy">
                                      <strong>{tenant.display_name}</strong>
                                      <p>{tenant.kind === 'business' ? 'Business tenant' : 'Individual tenant'}</p>
                                    </div>
                                    <span className={`status status--${tenant.archived_at ? 'archived' : 'ready'}`}>{tenant.archived_at ? 'Archived' : 'Active'}</span>
                                  </li>)}
                              </ul>}
                              {tenantList.length === 0 && <div className="empty-state">
                                <h3>No rental records yet</h3>
                                <p>Start by adding a tenant record. Account invitations and access are managed separately.</p>
                              </div>}
                              {tenantList.length > 0 && !tenantList.some(tenant => tenant.display_name.toLowerCase().includes(search.trim().toLowerCase())) && <div className="empty-state">
                                <h3>No matches found</h3>
                                <p>No tenant records match “{search.trim()}”. Clear the search to see the full directory.</p>
                                <Button className="secondary-button" onClick={() => setSearch('')}>Clear search</Button>
                              </div>}
                            </section>}
                            <div id="property-locations" hidden={activeSection !== 'property-locations'} tabIndex={-1} className="workspace-section">{preview ? <preview.PropertyMapPreview addTenant={() => selectSection('create-tenant')} /> : <PropertyDirectory key={`locations:${propertyId}`} propertyId={propertyId} owner={role === 'owner'} />}</div>
                            <div id="create-tenant" hidden={activeSection !== 'create-tenant'} tabIndex={-1} className="workspace-section">{preview ? <preview.AddTenantPreview showDirectory={() => selectSection('tenant-records')} showBuildings={() => selectSection('property-locations')} /> : <CreateTenant key={`create:${propertyId}`} propertyId={propertyId} done={() => void refresh()} />}</div>
                            <div id="payment-records" hidden={activeSection !== 'payment-records'} tabIndex={-1} className="workspace-section">{preview ? <preview.PaymentsPreview /> : <SavedPayments key={propertyId} propertyId={propertyId} tenants={tenantList} owner={role === 'owner'} userId={session.user.id} />}</div>
                              <div id="invite-account" hidden={activeSection !== 'invite-account'} tabIndex={-1} className="workspace-section"><Invitations key={`invite:${propertyId}`} propertyId={propertyId} owner={role === 'owner'} /></div>
                            {role === 'owner' && <>
                              <div id="manage-access" hidden={activeSection !== 'manage-access'} tabIndex={-1} className="workspace-section"><ManageAccess key={`access:${propertyId}`} propertyId={propertyId} tenants={tenantList} changed={() => void refresh()} /></div>
                              <div id="invitation-review" hidden={activeSection !== 'invitation-review'} tabIndex={-1} className="workspace-section"><InvitationReconciliation key={`invitation-reconciliation:${propertyId}`} propertyId={propertyId} /></div>
                              <div id="access-history" hidden={activeSection !== 'access-history'} tabIndex={-1} className="workspace-section"><AccessAudit key={`audit:${propertyId}`} propertyId={propertyId} /></div>
                            </>}
                            <section hidden={activeSection !== 'account-security'} tabIndex={-1} className="card account-security" id="account-security">
                              <p className="eyebrow">SIGN-IN AND RECOVERY</p>
                              <h2>Account security</h2>
                              <p>Enroll a backup authenticator on a separate device before losing access to your main one. Password recovery does not bypass staff MFA.</p>
                              <Button disabled={dashboardPreview} className="secondary-button" onClick={() => setBackup(!backup)}>{backup ? 'Close backup setup' : 'Add a backup authenticator'}</Button>
                              {backup && <Mfa backup done={() => { setBackup(false); void refresh() }} />}
                            </section>
                          </div>
                        </div>
                      </> : <>
                        <p className="status status--ready renter-status">Account ready</p>
                        <section className="card renter-records-card" aria-labelledby="renter-records-heading">
                          <div className="section-heading"><div><p className="eyebrow">SHARED WITH YOUR ACCOUNT</p><h2 id="renter-records-heading">Your rental records</h2></div></div>
                          {snapshot.properties.length > 1 && <div className="property-picker">
                            <label htmlFor="property">Property</label>
                            <select id="property" value={propertyId} onChange={event => setPropertyId(event.target.value)}>
                              {snapshot.properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
                            </select>
                          </div>}
                          <p>These are the tenant records your property has authorized for this account. Payment history, balances and online payments are not available here.</p>
                          {tenantList.length > 0 ? <ul className="records tenant-records">
                            {tenantList.map(tenant =>
                              <li key={tenant.id} className="tenant-record">
                                <span className="record-initial" aria-hidden="true">{tenant.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span>
                                <div className="tenant-record-copy"><strong>{tenant.display_name}</strong><p>{tenant.kind === 'business' ? 'Business tenant' : 'Individual tenant'}</p></div>
                                <span className={`status status--${tenant.archived_at ? 'archived' : 'ready'}`}>{tenant.archived_at ? 'Archived' : 'Active'}</span>
                              </li>)}
                          </ul> : <div className="empty-state">
                            <h3>No rental records yet</h3>
                            <p>There are no records shared with this account for the selected property. Contact the property owner if you expected to see one.</p>
                          </div>}
                        </section>
                      </>}
              </>}
      </main>
      <footer className="site-footer"><span>RentByBob</span><span>Philippine property access · No online payments</span></footer>
    </div>
  </div>
}

function CreateTenant({ propertyId, done }: { propertyId: string; done: () => void }) {
  const requestId = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  return <section className="card form-card" aria-labelledby="create-tenant-heading">
    <p className="eyebrow">DIRECTORY MANAGEMENT</p>
    <h2 id="create-tenant-heading">Add a tenant record</h2>
    <p>This creates a directory record only. It does not set occupancy, charges or account access.</p>
    <Feedback message={message} error={failed} />
    <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const form = event.currentTarget
      const values = new FormData(form)
      setBusy(true)
      try {
        const { error } = await supabase!.rpc('create_tenant', {
          p_property_id: propertyId,
          p_tenant_id: requestId.current,
          p_display_name: String(values.get('tenant-name')).trim(),
          p_kind: String(values.get('tenant-kind')),
        })
        if (error) throw error
        requestId.current = crypto.randomUUID()
        setFailed(false)
        setMessage('Tenant record saved. Account access remains separate.')
        form.reset()
        done()
      } catch {
        setFailed(true)
        setMessage('Save could not be confirmed. Keep the same details when retrying; the request identifier prevents a duplicate record.')
      } finally { setBusy(false) }
    }}>
      <label htmlFor="tenant-name">Tenant display name</label>
      <input id="tenant-name" name="tenant-name" autoComplete="off" required maxLength={200} />
      <label htmlFor="tenant-kind">Tenant type</label>
      <select id="tenant-kind" name="tenant-kind"><option value="individual">Individual</option><option value="business">Business</option></select>
      <Button className="primary" disabled={busy}>{busy ? 'Saving tenant record…' : 'Create tenant record'}</Button>
    </form>
  </section>
}
