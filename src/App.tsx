import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button, LoadingSkeleton } from './components/atoms'
import { WorkspaceIcon } from './components/WorkspaceIcon'
import { DeferredBoundary, deferredScreen } from './components/DeferredScreen'
import { dashboardPreview, hostedDevelopment, preview, initialized, supabase, stateLabels, type AccessState, type Membership, type Property, type Tenant } from './access/client'
import { ChangePassword, Feedback, Mfa, PasswordSetup, SignIn } from './access/AuthForms'
import { appError, copy, type Language } from './i18n'
import { filterTenantDirectory, type TenantKindFilter, type TenantStatusFilter } from './access/tenant-directory-model'

const SavedPayments = deferredScreen(() => import('./access/SavedPayments').then(module => module.SavedPayments))
const Invitations = deferredScreen(() => import('./access/ManageAccess').then(module => module.Invitations))
const ManageAccess = deferredScreen(() => import('./access/ManageAccess').then(module => module.ManageAccess))
const PropertyDirectory = deferredScreen(() => import('./access/PropertyLocations').then(module => module.PropertyLocations))
const AccessAudit = deferredScreen(() => import('./access/AccessAudit').then(module => module.AccessAudit))
const InvitationReconciliation = deferredScreen(() => import('./access/InvitationReconciliation').then(module => module.InvitationReconciliation))
const CollectionsOverview = deferredScreen(() => import('./access/CollectionsOverview').then(module => module.CollectionsOverview))
const RoomListingsManager = deferredScreen(() => import('./access/RoomListingsManager').then(module => module.RoomListingsManager))
const RenterPortal = deferredScreen(() => import('./access/RenterPortal').then(module => module.RenterPortal))

// renterLinks: tenant IDs with an active (unrevoked) renter login link, readable by staff under existing RLS.
type Snapshot = { access: AccessState; mfa: boolean; properties: Property[]; memberships: Membership[]; tenants: Tenant[]; renterLinks: string[] }
type NavigationItem = { id: string; label: string }
const translateText = (language: Language, english: string, bisaya: string) => language === 'ceb' ? bisaya : english

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
  const [tenantStatusFilter, setTenantStatusFilter] = useState<TenantStatusFilter>('all')
  const [tenantKindFilter, setTenantKindFilter] = useState<TenantKindFilter>('all')
  const [activeSection, setActiveSection] = useState('home')
  const [visitedSections, setVisitedSections] = useState<string[]>(['home'])
  // Current room per tenant (open agreements only), shown on directory cards; 'unavailable' if the rent data cannot load.
  const [tenantRooms, setTenantRooms] = useState<Record<string, string> | 'unavailable' | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('rentbybob-theme') === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  })
  const [language, setLanguage] = useState<'en' | 'ceb'>(() => {
    try { return localStorage.getItem('rentbybob-language') === 'ceb' ? 'ceb' : 'en' }
    catch { return 'en' }
  })
  const t = copy[language]
  const environmentLabel = dashboardPreview
    ? translateText(language, 'Fictional preview · Offline sample data', 'Sample nga preview · Sample nga datos nga offline')
    : hostedDevelopment
      ? translateText(language, 'Hosted development · Sign-in + MFA', 'Hosted development · Pagsulod + MFA')
      : supabase
        ? translateText(language, 'Local development · Sign-in + MFA', 'Local development · Pagsulod + MFA')
        : translateText(language, 'Development · Connection not configured', 'Development · Wala ma-set up ang koneksyon')
  const generation = useRef(0)
  const sessionUser = useRef<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const mobileNavigation = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('rentbybob-theme', theme) } catch { /* Theme still works for this session. */ }
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = language
    try { localStorage.setItem('rentbybob-language', language) } catch { /* Language still works for this session. */ }
  }, [language])

  useEffect(() => {
    let alive = true
    void initialized.then(value => {
      if (alive) {
        sessionUser.current = value.session?.user.id ?? null
        setSession(value.session)
        setSetup(value.setup)
        setCallbackError(value.failure)
        setBooting(false)
      }
    })
    // Token refresh, password change and MFA step-up keep the same person signed in: update the session without
    // unmounting the workspace (which would discard unsaved drafts). Only sign-out or a different user resets it.
    const subscription = (dashboardPreview ? null : supabase)?.auth.onAuthStateChange((_event, value) => {
      const userId = value?.user.id ?? null
      if (userId !== sessionUser.current) {
        generation.current++
        setSnapshot(null)
      }
      sessionUser.current = userId
      setSession(value)
      if (!value) { setSetup(false); setBackup(false) }
    }).data.subscription
    return () => { alive = false; subscription?.unsubscribe() }
  }, [])

  // Ask before leaving or reloading while a form has unsaved typing. Searches, filters and password forms are excluded;
  // the browser shows its own wording. Submitting a form clears the warning.
  useEffect(() => {
    let unsaved = false
    const tracked = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const form = target.closest('form')
      return Boolean(form && !form.querySelector('input[type="password"]') && !(target instanceof HTMLInputElement && target.type === 'search'))
    }
    const changed = (event: Event) => { if (tracked(event.target)) unsaved = true }
    const submitted = () => { unsaved = false }
    // preventDefault is the standard signal; returnValue is still required by some Chromium/Safari versions.
    const leaving = (event: BeforeUnloadEvent) => { if (unsaved) { event.preventDefault(); event.returnValue = '' } }
    document.addEventListener('input', changed, true)
    document.addEventListener('submit', submitted, true)
    window.addEventListener('beforeunload', leaving)
    return () => {
      document.removeEventListener('input', changed, true)
      document.removeEventListener('submit', submitted, true)
      window.removeEventListener('beforeunload', leaving)
    }
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
      let properties: Property[] = [], memberships: Membership[] = [], tenants: Tenant[] = [], renterLinks: string[] = []
      if (access.state === 'ready' && !mfa && !setup) {
        const [p, m, t, c] = await Promise.all([
          supabase.from('properties').select('id,name').order('name'),
          supabase.from('staff_memberships').select('property_id,user_id,role,revoked_at').eq('user_id', session.user.id).is('revoked_at', null),
          supabase.from('tenants').select('id,property_id,display_name,kind,archived_at').order('display_name'),
          supabase.from('tenant_contacts').select('tenant_id').is('revoked_at', null),
        ])
        if (p.error || m.error || t.error || c.error) throw p.error || m.error || t.error || c.error
        properties = p.data
        memberships = m.data
        tenants = t.data
        renterLinks = [...new Set(c.data.map(link => link.tenant_id as string))]
      }
      if (version !== generation.current) return
      setError('')
      setSnapshot({ access, mfa, properties, memberships, tenants, renterLinks })
      setPropertyId(previous => properties.some(property => property.id === previous) ? previous : properties[0]?.id ?? '')
    } catch {
      if (version === generation.current) {
        setSnapshot(null)
        setError('access-verification')
      }
    }
  }, [session, booting, callbackError, setup])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 10000)
    // Re-check access when the person returns, in place; the server still enforces access on every request.
    const focus = () => void refresh()
    const visibility = () => { if (!document.hidden) void refresh() }
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
      setError('sign-out')
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
  const tenantList = snapshot?.tenants.filter(tenant => {
    if (propertyId && tenant.property_id !== propertyId) return false
    return !role || tenant.property_id === propertyId
  }) ?? []
  const visibleTenantList = filterTenantDirectory(tenantList, search, tenantStatusFilter, tenantKindFilter)
  const activeTenantCount = tenantList.filter(tenant => !tenant.archived_at).length
  const workspaceStats = role ? [
    { label: translateText(language, 'Active records', 'Aktibong rekord'), value: String(activeTenantCount), hint: `${tenantList.length} ${translateText(language, 'total records', 'kinatibuk-ang rekord')}` },
    { label: translateText(language, 'Authorized properties', 'Mga propiedad nga gitugotan'), value: String(snapshot?.properties.length ?? 0), hint: snapshot?.properties.length === 1 ? translateText(language, 'Current property ready', 'Andam ang propiedad') : translateText(language, 'Cross-property access', 'Access sa daghang propiedad') },
    { label: translateText(language, 'Access level', 'Klase sa access'), value: role === 'owner' ? translateText(language, 'Owner', 'Tag-iya') : 'Clerk', hint: role === 'owner' ? translateText(language, 'Can manage access', 'Makadumala sa access') : translateText(language, 'Can work with records', 'Makagamit sa mga rekord') },
  ] : []
  const translate = (english: string, bisaya: string) => language === 'ceb' ? bisaya : english
  const navigationItems: NavigationItem[] = role ? [
    { id: 'home', label: translate('Dashboard', 'Kinatibuk-ang panid') },
    { id: 'tenant-records', label: translate('Tenant directory', 'Lista sa mga nag-abang') },
    { id: 'property-locations', label: translate('Buildings and units', 'Mga bilding ug kwarto') },
    { id: 'create-tenant', label: translate('Add tenant record', 'Idugang ang nag-abang') },
    { id: 'payment-records', label: translate('Payments and balances', 'Mga bayad ug balanse') },
    { id: 'room-listings', label: translate('Room listings & inquiries', 'Lista sa kwarto ug pangutana') },
    { id: 'invite-account', label: translate('Invite account', 'Pagdapit og account') },
    ...(role === 'owner' ? [
      { id: 'manage-access', label: translate('Assign or disable access', 'Ihatag o tangtangon ang access') },
      { id: 'invitation-review', label: translate('Invitation review', 'Susihon ang mga pagdapit') },
      { id: 'access-history', label: translate('Access history', 'Kasaysayan sa access') },
    ] : []),
    { id: 'account-security', label: translate('Account security', 'Kaluwasan sa account') },
  ].filter(item => !dashboardPreview || ['home', 'tenant-records', 'property-locations', 'create-tenant', 'payment-records'].includes(item.id)) : []
  const navigationKey = navigationItems.map(item => item.id).join('|')

  useEffect(() => {
    if (preview || !supabase || !role || !propertyId || activeSection !== 'tenant-records') return
    let alive = true
    void (async () => {
      try {
        const { data, error } = await supabase!.rpc('read_rent_workspace', { p_property_id: propertyId })
        if (error) throw error
        const workspace = data as { agreements: { tenant_id: string; unit_id: string; ended_on?: string | null }[]; units: { id: string; label: string; building_id: string }[]; buildings: { id: string; label: string }[] }
        const rooms: Record<string, string> = {}
        for (const agreement of workspace.agreements.filter(item => !item.ended_on)) {
          const unit = workspace.units.find(item => item.id === agreement.unit_id)
          const building = unit && workspace.buildings.find(item => item.id === unit.building_id)
          if (unit) rooms[agreement.tenant_id] = `${building?.label ?? ''} · ${unit.label}`
        }
        if (alive) setTenantRooms(rooms)
      } catch { if (alive) setTenantRooms('unavailable') }
    })()
    return () => { alive = false }
  }, [role, propertyId, activeSection])

  useEffect(() => {
    if (navigationKey && !navigationItems.some(item => item.id === activeSection)) setActiveSection('home')
  }, [navigationKey, activeSection])

  function selectSection(id: string) {
    setActiveSection(id)
    setVisitedSections(previous => previous.includes(id) ? previous : [...previous, id])
    if (mobileNavigation.current) mobileNavigation.current.open = false
    requestAnimationFrame(() => {
      const section = document.getElementById(preview && id === 'tenant-records' ? 'preview-tenant-records' : id === 'home' ? 'dashboard-home' : id)
      section?.focus({ preventScroll: true })
      section?.scrollIntoView({ block: 'start' })
    })
  }

  function staffNavigation() {
    return <nav aria-label={translateText(language, 'Property workspace', 'Workspace sa propiedad')}>
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
    <a className="skip-link" href="#main">{t.skipContent}</a>
    <div className="environment-note">{environmentLabel}</div>
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/" aria-label={translateText(language, 'RentByBob home', 'Panimalay sa RentByBob')}><span className="brand-mark" aria-hidden="true">R</span><span>Rent<span className="brand-accent">ByBob</span></span></a>
        <div className="session-tools">
          {session && <div className="session-identity">
            <span className="signed-in-label">{dashboardPreview ? translateText(language, 'Workspace mode', 'Lugar sa trabaho') : translateText(language, 'Signed in as', 'Nakasulod isip')}</span>
            <span className="account-email">{dashboardPreview ? translateText(language, 'Fictional sample account', 'Hinimo-himong sample nga account') : session.user.email}</span>
          </div>}
          <div className="session-actions">
            <Button className="quiet-button" aria-label={`${translateText(language, 'Use', 'Gamita ang')} ${theme === 'dark' ? t.dayMode : t.nightMode}`} aria-pressed={theme === 'dark'} onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? t.dayMode : t.nightMode}</Button>
            <Button className="quiet-button" aria-label={language === 'en' ? t.showBisaya : t.showEnglish} aria-pressed={language === 'ceb'} onClick={() => setLanguage(current => current === 'en' ? 'ceb' : 'en')}>{language === 'en' ? `${t.english} · ${t.bisaya}` : `${t.bisaya} · ${t.english}`}</Button>
            {session && !dashboardPreview && <Button className="quiet-button" onClick={() => void signOut()}>{t.signOut}</Button>}
            {import.meta.env.DEV && (!session || role) && <Button className="quiet-button" onClick={() => { location.href = dashboardPreview ? '/?auth=1' : '/?preview=1' }}>
              {dashboardPreview ? t.returnAccount : t.openPreview}
            </Button>}
          </div>
        </div>
      </div>
    </header>
    <div className="shell page-shell">
      <main id="main" tabIndex={-1} className={role && route === 'ready' ? 'staff-main' : ''}>
        {dashboardPreview && <p className="notice" role="status"><strong>{translate('Fictional dashboard preview - sign-in skipped.', 'Sample nga dashboard - wala magsulod sa account.')}</strong> {translate('Sample records are isolated from your account. Changes reset on reload. This mode makes no Supabase requests, database writes or emails.', 'Lahi ang sample nga rekord sa imong account. Mawala ang kausaban inig reload. Walay Supabase request, database write o email niining mode.')}</p>}
        {/* While starting up, the intro is kept for screen readers but takes no space, so nothing jumps when the real screen arrives. */}
        <div className={`page-intro ${booting ? 'visually-hidden' : ''}`}>
          <p className="eyebrow">{role ? translate('PROPERTY WORKSPACE', 'WORKSPACE SA PROPIEDAD') : session ? translate('YOUR ACCOUNT', 'IMONG ACCOUNT') : translate('YOUR RENTAL SPACE, SIMPLIFIED', 'Sayon nga pagdumala sa imong giabangan')}</p>
          <h1 ref={heading} tabIndex={-1} className="route-heading">
            {route === 'loading' || route === 'checking' ? t.checkingAccess
              : route === 'ready' ? role ? language === 'ceb' ? role === 'owner' ? 'Panid sa tag-iya' : 'Panid sa clerk' : role === 'owner' ? 'Owner workspace' : 'Clerk workspace' : translate('Your rental records', 'Imong mga rekord sa abang')
                : route === 'sign-in' ? translate('A little less hassle. A little more home.', 'Mas sayon ang pagdumala sa abang.')
                  : route === 'disabled' ? translate('Access disabled', 'Wala na ang access')
                        : route === 'pending' ? translate('Invitation pending', 'Naghulat ang imbitasyon')
                          : route === 'unassigned' ? t.waitingAccess : translate('Your rental account', 'Imong account sa abang')}
          </h1>
          {route === 'sign-in' && <p className="page-summary">{t.appSummary}</p>}
          {route === 'ready' && !role && <p className="page-summary">{t.yourSharedRecords}</p>}
          {route === 'sign-in' && <div className="welcome-points"><div><span className="welcome-number">01</span><span><strong>{t.yourRecords}</strong><small>{t.onlySharedInfo}</small></span></div><div><span className="welcome-number">02</span><span><strong>{t.yourOwnAccount}</strong><small>{t.invitedManaged}</small></span></div></div>}
        </div>

        {booting ? <div className="boot-placeholder"><LoadingSkeleton label={t.sessionLoading} rows={4} /></div> : !supabase ? <section className="card auth-card">
          <h2>{t.noConnection}</h2>
          <p>{translate('Start local development with', 'Sugdi ang local development gamit ang')} <code>npm.cmd run dev:local</code>{translate(', or the configured hosted development environment with', ', o ang naka-set up nga hosted development gamit ang')} <code>npm.cmd run dev:hosted</code>. {translate('No prototype records are substituted.', 'Walay prototype nga rekord nga ipuli.')}</p>
        </section>
          : callbackError ? <><Feedback message={appError(language, callbackError)} error /><Button className="primary" onClick={() => { setCallbackError(''); void signOut() }}>{t.returnSignIn}</Button></>
            : !session ? <SignIn language={language} />
              : <>
                <Feedback message={appError(language, error)} error />
                {!dashboardPreview && snapshot && !snapshot.mfa && !setup && <Button className="quiet-button refresh-access" onClick={() => { setSnapshot(null); void refresh() }}>{translate('Refresh access', 'I-refresh ang access')}</Button>}
                {!snapshot ? error ? <p role="status" className="loading-state">{t.recordsUnavailable}</p> : <LoadingSkeleton label={t.checkingPermissions} rows={4} />
                  : snapshot.mfa ? <Mfa done={() => void refresh()} language={language} />
                    : setup ? <PasswordSetup language={language} done={() => { sessionStorage.removeItem(`password-setup:${session.user.id}`); setSetup(false); void refresh() }} />
                      : snapshot.access.state !== 'ready' ? <section className="card access-state-card">
                        <p className={`status status--${snapshot.access.state}`}>{language === 'ceb' ? (snapshot.access.state === 'pending' ? 'Naghulat' : snapshot.access.state === 'disabled' ? 'Gipalong' : 'Wala ma-assign') : (stateLabels[snapshot.access.state] ?? t.noAccessAvailable)}</p>
                        <h2>{snapshot.access.state === 'disabled' ? t.accessDisabledTitle
                          : snapshot.access.state === 'pending' ? t.invitationUnconfirmed
                            : t.waitingAccess}</h2>
                        <p>{snapshot.access.state === 'disabled'
                          ? t.contactOwnerReview
                          : snapshot.access.state === 'pending'
                            ? t.followInvitation
                            : t.signedNoAccess}</p>
                        <p>{t.noRecordsUntilAssigned}</p>
                      </section> : role ? <>
                        <div className="mobile-workspace-navigation">
                          <details ref={mobileNavigation}>
                            <summary><span>{t.workspaceNavigation}</span><small>{navigationItems.find(item => item.id === activeSection)?.label}</small></summary>
                            {staffNavigation()}
                          </details>
                        </div>
                        <div className="workspace-layout">
                          <aside className="workspace-sidebar">
                            <p className="sidebar-label">{t.workspace}</p>
                            {staffNavigation()}
                          </aside>
                          <div className="workspace-content">
                            <div className="workspace-toolbar" hidden={dashboardPreview}>
                              <p className="status status--ready">{t.accountReady}</p>
                              <div className="property-picker">
                                <label htmlFor="property">{t.property}</label>
                                <select id="property" value={propertyId} onChange={event => {
                                  setPropertyId(event.target.value)
                                  setBackup(false)
                                  setSearch('')
                                  setTenantStatusFilter('all')
                                  setTenantKindFilter('all')
                                }}>{snapshot.properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                              </div>
                            </div>
                            <section hidden={activeSection !== 'home'} tabIndex={-1} id="dashboard-home" className="dashboard-home" aria-labelledby="dashboard-welcome-heading">
                              <div className="dashboard-welcome">
                                <p className="eyebrow">{role === 'owner' ? (language === 'ceb' ? 'TRABAHO SA TAG-IYA' : 'OWNER WORKSPACE') : (language === 'ceb' ? 'TRABAHO SA STAFF' : 'STAFF WORKSPACE')}</p>
                                <h2 id="dashboard-welcome-heading">{t.welcome}</h2>
                                <p className="dashboard-identity">{translate('Signed in as', 'Nakasulod isip')} <strong>{session.user.email}</strong></p>
                                <h3>{t.today}</h3>
                                <div className="dashboard-actions">
                                  <Button className="dashboard-action" onClick={() => selectSection('payment-records')}><span className="dashboard-action-icon tone-blue" aria-hidden="true"><WorkspaceIcon kind="payments" /></span><span><strong>{t.logPayment}</strong><small>{t.recordCash}</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                  <Button className="dashboard-action" onClick={() => selectSection('create-tenant')}><span className="dashboard-action-icon tone-teal" aria-hidden="true"><WorkspaceIcon kind="add" /></span><span><strong>{t.addTenantAction}</strong><small>{t.createTenantHint}</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                  <Button className="dashboard-action" onClick={() => selectSection('property-locations')}><span className="dashboard-action-icon tone-violet" aria-hidden="true"><WorkspaceIcon kind="building" /></span><span><strong>{t.viewProperty}</strong><small>{t.exploreProperty}</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                  <Button className="dashboard-action" onClick={() => selectSection('tenant-records')}><span className="dashboard-action-icon tone-amber" aria-hidden="true"><WorkspaceIcon kind="people" /></span><span><strong>{t.findTenant}</strong><small>{t.searchRecords}</small></span><span className="dashboard-action-arrow" aria-hidden="true">→</span></Button>
                                </div>
                              </div>
                            </section>
                            {!preview && propertyId && activeSection === 'home' && <DeferredBoundary loadingLabel={translate('Loading collection figures…', 'Gikarga ang mga numero sa koleksiyon…')} rows={2} language={language} reset={CollectionsOverview.reset}>
                              <CollectionsOverview.Screen key={propertyId} propertyId={propertyId} tenants={tenantList} openPayments={() => selectSection('payment-records')} language={language} />
                            </DeferredBoundary>}
                            <section hidden={activeSection !== 'home'} className="workspace-overview" aria-label={translate('Property workspace summary', 'Kinatibuk-ang kahimtang sa propiedad')}>
                              {workspaceStats.map((stat, index) => (
                                <article key={stat.label} className="stat-card">
                                  <span className={`stat-icon tone-${['blue', 'teal', 'violet'][index]}`} aria-hidden="true"><WorkspaceIcon kind={(['people', 'building', 'home'] as const)[index]} /></span>
                                  <span className="stat-label">{stat.label}</span>
                                  <strong>{stat.value}</strong>
                                  <small>{stat.hint}</small>
                                </article>
                              ))}
                            </section>
                            {preview && <div hidden={activeSection !== 'tenant-records'} tabIndex={-1} id="preview-tenant-records"><preview.TenantDirectoryPreview openPayments={() => selectSection('payment-records')} openMap={() => selectSection('property-locations')} addTenant={() => selectSection('create-tenant')} language={language} /></div>}
                            {!preview && <section hidden={activeSection !== 'tenant-records'} tabIndex={-1} className="card directory-card" id="tenant-records" aria-labelledby="tenant-records-heading">
                              <div className="section-heading">
                                <div><p className="eyebrow">{translate('PEOPLE AND BUSINESSES', 'MGA TAWO UG NEGOSYO')}</p><h2 id="tenant-records-heading">{t.tenantDirectory}</h2></div>
                                <Button className="primary" onClick={() => selectSection('create-tenant')}>{translate('Add tenant', 'Idugang ang nag-abang')}</Button><span className="record-count">{tenantList.length} {translate('records', 'ka rekord')}</span>
                              </div>
                              <p>{translate('Find the people and businesses connected to this property.', 'Pangitaa ang mga tawo ug negosyo nga nalambigit niining propiedad.')}</p>
                              <label htmlFor="tenant-search">{translate('Search tenants by name', 'Pangitaa ang nag-abang pinaagi sa ngalan')}</label>
                              <input id="tenant-search" value={search} onChange={event => setSearch(event.target.value)} type="search" autoComplete="off" aria-describedby="tenant-search-help" />
                              <p className="field-help" id="tenant-search-help">{translate('Results update as you type.', 'Ma-update ang resulta samtang magsulat ka.')}</p>
                              {tenantList.length > 0 && <>
                                <div className="tenant-directory-filters">
                                  <div>
                                    <label htmlFor="tenant-status-filter">{translate('Record status', 'Kahimtang sa rekord')}</label>
                                    <select id="tenant-status-filter" value={tenantStatusFilter} onChange={event => setTenantStatusFilter(
                                      event.target.value === 'active' ? 'active' : event.target.value === 'archived' ? 'archived' : 'all',
                                    )}>
                                      <option value="all">{translate('All statuses', 'Tanang kahimtang')}</option>
                                      <option value="active">{t.active}</option>
                                      <option value="archived">{t.archived}</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label htmlFor="tenant-kind-filter">{translate('Record type', 'Klase sa rekord')}</label>
                                    <select id="tenant-kind-filter" value={tenantKindFilter} onChange={event => setTenantKindFilter(
                                      event.target.value === 'individual' ? 'individual' : event.target.value === 'business' ? 'business' : 'all',
                                    )}>
                                      <option value="all">{translate('All types', 'Tanang klase')}</option>
                                      <option value="individual">{t.individualTenant}</option>
                                      <option value="business">{t.businessTenant}</option>
                                    </select>
                                  </div>
                                </div>
                                <p className="field-help" aria-live="polite">
                                  {translate('Showing', 'Nagpakita og')} {visibleTenantList.length} {translate('of', 'gikan sa')} {tenantList.length} {translate('records', 'ka rekord')}.
                                </p>
                              </>}
                              {visibleTenantList.length > 0 && <ul className="records tenant-records tenant-records--cards">
                                {visibleTenantList.map(tenant => {
                                  const propertyName = snapshot?.properties.find(property => property.id === tenant.property_id)?.name ?? translate('Property', 'Propiedad')
                                  return <li key={tenant.id} className="tenant-record">
                                    <span className="record-initial" aria-hidden="true">{tenant.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span>
                                    <div className="tenant-record-copy">
                                      <strong>{tenant.display_name}</strong>
                                      <p>{tenant.kind === 'business' ? t.businessTenant : t.individualTenant}</p>
                                      <small className="tenant-room">{tenantRooms === 'unavailable' ? translate('Room details unavailable', 'Wala makita ang detalye sa kwarto') : tenantRooms?.[tenant.id] ?? (tenantRooms ? translate('No current room agreement', 'Walay kasabotan sa kwarto karon') : propertyName)}</small>
                                      {!tenant.archived_at && <small className={`renter-link ${snapshot?.renterLinks.includes(tenant.id) ? 'renter-link--linked' : ''}`}>{snapshot?.renterLinks.includes(tenant.id) ? translate('Renter can sign in', 'Makasulod ang nag-abang') : translate('No renter login yet', 'Wala pay login ang nag-abang')}</small>}
                                    </div>
                                    <span className={`status status--${tenant.archived_at ? 'archived' : 'ready'}`}>{tenant.archived_at ? t.archived : t.active}</span>
                                  </li>
                                })}
                              </ul>}
                              {tenantList.length === 0 && <div className="empty-state">
                                <h3>{t.noRecordsYet}</h3>
                                <p>{translate('Start by adding a tenant record. Account invitations and access are managed separately.', 'Sugdi pinaagi sa pagdugang og rekord sa nag-abang. Lahi ang mga imbitasyon ug paghatag og access.')}</p>
                              </div>}
                              {tenantList.length > 0 && visibleTenantList.length === 0 && <div className="empty-state">
                                <h3>{translate('No matches found', 'Walay nakit-an nga katugbang')}</h3>
                                <p>{search.trim()
                                  ? <>{translate('No tenant records match', 'Walay rekord sa nag-abang nga katugbang sa')} “{search.trim()}”. {translate('Try changing your search or filters.', 'Sulayi usbon ang pangita o mga filter.')}</>
                                  : translate('No tenant records match the selected filters.', 'Walay rekord sa nag-abang nga katugbang sa gipiling mga filter.')}</p>
                                <Button className="secondary-button" onClick={() => {
                                  setSearch('')
                                  setTenantStatusFilter('all')
                                  setTenantKindFilter('all')
                                }}>{translate('Clear search and filters', 'Hawani ang pangita ug mga filter')}</Button>
                              </div>}
                            </section>}
                            <div id="property-locations" hidden={activeSection !== 'property-locations'} tabIndex={-1} className="workspace-section">{preview
                              ? <preview.PropertyMapPreview addTenant={() => selectSection('create-tenant')} language={language} />
                              : visitedSections.includes('property-locations') && <DeferredBoundary loadingLabel={translate('Loading property locations…', 'Gikarga ang mga lokasyon…')} rows={3} language={language} reset={PropertyDirectory.reset}>
                                <PropertyDirectory.Screen key={`locations:${propertyId}`} propertyId={propertyId} owner={role === 'owner'} language={language} />
                              </DeferredBoundary>}</div>
                            <div id="create-tenant" hidden={activeSection !== 'create-tenant'} tabIndex={-1} className="workspace-section">{preview ? <preview.AddTenantPreview showDirectory={() => selectSection('tenant-records')} showBuildings={() => selectSection('property-locations')} language={language} /> : <CreateTenant key={`create:${propertyId}`} propertyId={propertyId} done={() => void refresh()} language={language} />}</div>
                            <div id="payment-records" hidden={activeSection !== 'payment-records'} tabIndex={-1} className="workspace-section">{preview
                              ? <preview.PaymentsPreview language={language} />
                              : visitedSections.includes('payment-records') && <DeferredBoundary loadingLabel={translate('Loading payment records…', 'Gikarga ang mga rekord sa bayad…')} rows={3} language={language} reset={SavedPayments.reset}>
                                <SavedPayments.Screen key={propertyId} propertyId={propertyId} tenants={tenantList} owner={role === 'owner'} userId={session.user.id} language={language} />
                              </DeferredBoundary>}</div>
                              <div id="room-listings" hidden={activeSection !== 'room-listings'} tabIndex={-1} className="workspace-section">{visitedSections.includes('room-listings') && <DeferredBoundary loadingLabel={translate('Loading room listings…', 'Gikarga ang lista sa kwarto…')} rows={3} language={language} reset={RoomListingsManager.reset}><RoomListingsManager.Screen key={`listings:${propertyId}`} propertyId={propertyId} language={language} /></DeferredBoundary>}</div>
                              <div id="invite-account" hidden={activeSection !== 'invite-account'} tabIndex={-1} className="workspace-section">{visitedSections.includes('invite-account') && <DeferredBoundary loadingLabel={translate('Loading invitations…', 'Gikarga ang mga imbitasyon…')} rows={2} language={language} reset={Invitations.reset}><Invitations.Screen key={`invite:${propertyId}`} propertyId={propertyId} owner={role === 'owner'} language={language} /></DeferredBoundary>}</div>
                            {role === 'owner' && <>
                              <div id="manage-access" hidden={activeSection !== 'manage-access'} tabIndex={-1} className="workspace-section">{visitedSections.includes('manage-access') && <DeferredBoundary loadingLabel={translate('Loading account access…', 'Gikarga ang access sa account…')} rows={3} language={language} reset={ManageAccess.reset}><ManageAccess.Screen key={`access:${propertyId}`} propertyId={propertyId} tenants={tenantList} changed={() => void refresh()} language={language} /></DeferredBoundary>}</div>
                              <div id="invitation-review" hidden={activeSection !== 'invitation-review'} tabIndex={-1} className="workspace-section">{visitedSections.includes('invitation-review') && <DeferredBoundary loadingLabel={translate('Loading invitation review…', 'Gikarga ang pagsusi sa imbitasyon…')} rows={3} language={language} reset={InvitationReconciliation.reset}><InvitationReconciliation.Screen key={`invitation-reconciliation:${propertyId}`} propertyId={propertyId} language={language} /></DeferredBoundary>}</div>
                              <div id="access-history" hidden={activeSection !== 'access-history'} tabIndex={-1} className="workspace-section">{visitedSections.includes('access-history') && <DeferredBoundary loadingLabel={translate('Loading access history…', 'Gikarga ang kasaysayan sa access…')} rows={3} language={language} reset={AccessAudit.reset}><AccessAudit.Screen key={`audit:${propertyId}`} propertyId={propertyId} language={language} /></DeferredBoundary>}</div>
                            </>}
                            <section hidden={activeSection !== 'account-security'} tabIndex={-1} className="card account-security" id="account-security">
                              <p className="eyebrow">{translate('SIGN-IN AND RECOVERY', 'PAGSULOD UG PAG-RECOVER SA ACCOUNT')}</p>
                              <h2>{t.accountSecurity}</h2>
                              <p>{translate('Enroll a backup authenticator on a separate device before losing access to your main one. Password recovery does not bypass staff MFA.', 'Idugang ang laing pang-authenticator sa lahi nga device aron naa kay lain magamit. Ang pag-usab sa password dili makatangtang sa security check sa staff.')}</p>
                              <Button disabled={dashboardPreview} className="secondary-button" onClick={() => setBackup(!backup)}>{backup ? t.closeBackup : t.addBackup}</Button>
                              {backup && <Mfa backup language={language} done={() => { setBackup(false); void refresh() }} />}
                            </section>
                          </div>
                        </div>
                      </> : <>
                        <DeferredBoundary loadingLabel={translate('Loading your rent record…', 'Gikarga ang rekord sa imong abang…')} rows={4} language={language} reset={RenterPortal.reset}>
                          <RenterPortal.Screen language={language} />
                        </DeferredBoundary>
                        {session.user.email && <ChangePassword email={session.user.email} language={language} />}
                      </>}
              </>}
      </main>
      <footer className="site-footer"><span>RentByBob</span><span>{t.footer}</span></footer>
    </div>
  </div>
}

function CreateTenant({ propertyId, done, language = 'en' }: { propertyId: string; done: () => void; language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => translateText(language, english, bisaya)
  const requestId = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  return <section className="card form-card" aria-labelledby="create-tenant-heading">
    <p className="eyebrow">{language === 'ceb' ? 'PAGDUMALA SA LISTA' : 'DIRECTORY MANAGEMENT'}</p>
    <h2 id="create-tenant-heading">{t.addTenant}</h2>
    <p>{translateText(language, 'This creates a directory record only. It does not set occupancy, charges or account access.', 'Kini maghimo lang og rekord sa lista. Dili kini magbutang og nagpuyo, bayranan, o access sa account.')}</p>
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
        setMessage(translateText(language, 'Tenant record saved. Account access remains separate.', 'Narekord na ang nag-abang. Lahi ang paghatag og access sa account.'))
        form.reset()
        done()
      } catch {
        setFailed(true)
        setMessage(tr('Save could not be confirmed. Keep the same details when retrying; the request identifier prevents a duplicate record.', 'Wala makumpirma ang pag-save. Gamita gihapon ang mao nga detalye kung mosulay pag-usab; malikayan sa request ID ang doble nga rekord.'))
      } finally { setBusy(false) }
    }}>
      <label htmlFor="tenant-name">{translateText(language, 'Tenant display name', 'Ngalan sa nag-abang')}</label>
      <input id="tenant-name" name="tenant-name" autoComplete="off" required maxLength={200} />
      <label htmlFor="tenant-kind">{translateText(language, 'Tenant type', 'Klase sa nag-abang')}</label>
      <select id="tenant-kind" name="tenant-kind"><option value="individual">{tr('Individual','Tawo')}</option><option value="business">{tr('Business','Negosyo')}</option></select>
      <Button className="primary" disabled={busy}>{busy ? translateText(language, 'Saving tenant record…', 'Girekord ang nag-abang…') : translateText(language, 'Create tenant record', 'Paghimo og rekord sa nag-abang')}</Button>
    </form>
  </section>
}
