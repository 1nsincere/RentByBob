import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button, LoadingSkeleton } from './components/atoms'
import { WorkspaceIcon } from './components/WorkspaceIcon'
import { DeferredBoundary, deferredScreen } from './components/DeferredScreen'
import { dashboardPreview, hostedDevelopment, liveTarget, preview, initialized, supabase, stateLabels, type AccessState, type Membership, type Property, type Tenant } from './access/client'
import { ChangePassword, Feedback, Mfa, PasswordSetup, SignIn } from './access/AuthForms'
import { LogoMark, Wordmark } from './components/Logo'
import { IdleSignOut } from './access/IdleSignOut'
import { PhilippineClock } from './access/PhilippineClock'
import { TrustedDevices } from './access/TrustedDevices'
import { clearDevice, readDevice } from './access/trusted-device'
import { appError, copy, type Language } from './i18n'

const SavedPayments = deferredScreen(() => import('./access/SavedPayments').then(module => module.SavedPayments))
const Invitations = deferredScreen(() => import('./access/ManageAccess').then(module => module.Invitations))
const ManageAccess = deferredScreen(() => import('./access/ManageAccess').then(module => module.ManageAccess))
const PropertyDirectory = deferredScreen(() => import('./access/PropertyLocations').then(module => module.PropertyLocations))
const AccessAudit = deferredScreen(() => import('./access/AccessAudit').then(module => module.AccessAudit))
const InvitationReconciliation = deferredScreen(() => import('./access/InvitationReconciliation').then(module => module.InvitationReconciliation))
const CollectionsOverview = deferredScreen(() => import('./access/CollectionsOverview').then(module => module.CollectionsOverview))
const Maintenance = deferredScreen(() => import('./access/Maintenance').then(module => module.Maintenance))
const RoomListingsManager = deferredScreen(() => import('./access/RoomListingsManager').then(module => module.RoomListingsManager))
const TenantDirectory = deferredScreen(() => import('./access/TenantDirectory').then(module => module.TenantDirectory))
const AddTenant = deferredScreen(() => import('./access/AddTenant').then(module => module.AddTenant))
const RenterPortal = deferredScreen(() => import('./access/RenterPortal').then(module => module.RenterPortal))

// renterLinks: tenant IDs with an active (unrevoked) renter login link, readable by staff under existing RLS.
// newInquiries: unhandled public-page inquiries visible to this staff account (0 when unavailable).
// toCheck: renter payment reports not yet handled plus cash waiting for confirmation (0 when unavailable).
type Snapshot = { access: AccessState; mfa: boolean; properties: Property[]; memberships: Membership[]; tenants: Tenant[]; renterLinks: string[]; newInquiries: number; toCheck?: number }
// badge: a short count shown beside the label; the link's name stays the label, the count is its description.
type NavigationItem = { id: string; label: string; badge?: string }
const translateText = (language: Language, english: string, bisaya: string) => language === 'ceb' ? bisaya : english

// While the session loads, use the sign-in layout unless a saved session exists, so the first screen does not jump.
const savedSessionAtBoot = (() => { try { return Object.keys(sessionStorage).some(key => /^sb-.+-auth-token$/.test(key)) } catch { return false } })()

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [setup, setSetup] = useState(false)
  const [callbackError, setCallbackError] = useState('')
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [propertyId, setPropertyId] = useState('')
  const [backup, setBackup] = useState(false)
  const [activeSection, setActiveSection] = useState('home')
  const [visitedSections, setVisitedSections] = useState<string[]>(['home'])
  // Set when staff click "Start agreement" on a vacant room in the property map.
  const [tenantRoom, setTenantRoom] = useState<{ unitId: string; nonce: number } | null>(null)
  const [paymentTenant, setPaymentTenant] = useState<{ tenantId: string; nonce: number; tab?: 'months' | 'history' | 'setup' } | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [locateUnit, setLocateUnit] = useState<{ unitId: string; nonce: number } | null>(null)
  const [assignTenant, setAssignTenant] = useState<{ id: string; name: string; kind: 'individual' | 'business'; nonce: number } | null>(null)
  // Current room per tenant (open agreements only), shown on directory cards; 'unavailable' if the rent data cannot load.
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
      : supabase && liveTarget === 'production'
        ? translateText(language, 'RentByBob · Secure sign-in · No online payments', 'RentByBob · Luwas nga pagsulod · Walay online nga bayad')
      : supabase && liveTarget === 'staging'
        ? translateText(language, 'Staging · Test data only', 'Staging · Test nga datos lamang')
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
      let mfa = access.staff_mfa_required && assurance.currentLevel !== 'aal2'
      // A remembered device skips the authenticator only when the database accepts it for this user.
      const device = mfa ? readDevice() : null
      if (device && device.userId === session.user.id) {
        const { data: trusted, error: trustError } = await supabase.rpc('check_trusted_device')
        if (!trustError && trusted === true) mfa = false
        else if (!trustError && trusted === false) clearDevice()
      }
      let properties: Property[] = [], memberships: Membership[] = [], tenants: Tenant[] = [], renterLinks: string[] = [], newInquiries = 0, toCheck = 0
      if (access.state === 'ready' && !mfa && !setup) {
        const [p, m, t, c] = await Promise.all([
          supabase.from('properties').select('id,name').order('name'),
          supabase.from('staff_memberships').select('property_id,user_id,role,revoked_at').eq('user_id', session.user.id).is('revoked_at', null),
          supabase.from('tenants').select('*').order('display_name'),
          supabase.from('tenant_contacts').select('tenant_id').is('revoked_at', null),
        ])
        if (p.error || m.error || t.error || c.error) throw p.error || m.error || t.error || c.error
        properties = p.data
        memberships = m.data
        tenants = t.data
        renterLinks = [...new Set(c.data.map(link => link.tenant_id as string))]
        if (memberships.length) {
          // Badge only: an unavailable inquiry table must not block the workspace, so a failure shows no count.
          const inquiries = await supabase.from('rental_inquiries').select('id', { count: 'exact', head: true }).is('handled_at', null)
          newInquiries = inquiries.error ? 0 : inquiries.count ?? 0
          const [reportsWaiting, cashWaiting] = await Promise.all([
            supabase.from('renter_payment_reports').select('id', { count: 'exact', head: true }).eq('status', 'new'),
            supabase.from('cash_records').select('id', { count: 'exact', head: true }).is('confirmed_at', null),
          ])
          toCheck = (reportsWaiting.error ? 0 : reportsWaiting.count ?? 0) + (cashWaiting.error ? 0 : cashWaiting.count ?? 0)
        }
      }
      if (version !== generation.current) return
      setError('')
      setSnapshot({ access, mfa, properties, memberships, tenants, renterLinks, newInquiries, toCheck })
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
  // The idle sign-out notice stays on the sign-in screen until the person signs in again (token refresh events must not clear it).
  const previousRoute = useRef(route)
  useEffect(() => { if (previousRoute.current === 'sign-in' && route !== 'sign-in' && route !== 'loading') setIdleNotice(false); previousRoute.current = route }, [route])

  // Staff idle sign-out: keep a ref to the latest signOut so the timer callback stays stable.
  const signOutRef = useRef<() => Promise<void>>(async () => {})
  const [idleNotice, setIdleNotice] = useState(false)
  const expireIdle = useCallback(() => { setIdleNotice(true); void signOutRef.current() }, [])
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
    history.replaceState(null, '', '/sign-in')
  }

  const role = snapshot?.memberships.find(membership => membership.property_id === propertyId)?.role
  // Clerks run the rental system day to day and the owner oversees it (28 Oct 2026): every signed-in staff member may remove tenants, record move-outs, reverse payments and so on. Who may sign in (invitations, access) stays owner-only.
  const canManage = Boolean(role)
  const tenantList = snapshot?.tenants.filter(tenant => {
    if (propertyId && tenant.property_id !== propertyId) return false
    return !role || tenant.property_id === propertyId
  }) ?? []
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
    { id: 'payment-records', label: translate('Payments and balances', 'Mga bayad ug balanse'), badge: snapshot?.toCheck ? `${snapshot.toCheck} ${translate('to check', 'susihon')}` : undefined },
    ...(preview ? [] : [{ id: 'maintenance', label: translate('Maintenance', 'Maintenance') }]),
    { id: 'room-listings', label: `${translate('Room listings & inquiries', 'Lista sa kwarto ug pangutana')}${snapshot?.newInquiries ? ` (${snapshot.newInquiries} ${translate('new', 'bag-o')})` : ''}` },
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

  // Grouped menu (user feedback: one long list was confusing): Dashboard and an Add tenant action, the daily work
  // pages under a heading, and account/security pages folded under "More" (open while one of them is shown).
  function staffNavigation() {
    const byId = (id: string) => navigationItems.find(item => item.id === id)
    const link = (item: NavigationItem, className = '') => <li key={item.id}>
      <a href={`#${item.id}`} className={className} aria-current={activeSection === item.id ? 'location' : undefined} aria-description={item.badge}
        onClick={event => { event.preventDefault(); selectSection(item.id) }}>
        {dashboardPreview && <WorkspaceIcon kind={item.id === 'home' ? 'home' : item.id === 'tenant-records' ? 'people' : item.id === 'property-locations' ? 'building' : item.id === 'payment-records' ? 'payments' : 'add'} />}
        {item.id === 'create-tenant' && !dashboardPreview && <span className="nav-add-mark" aria-hidden="true">+</span>}{item.label}{item.badge && <span className="nav-badge" aria-hidden="true">{item.badge}</span>}
      </a>
    </li>
    const daily = ['tenant-records', 'payment-records', 'maintenance', 'property-locations', 'room-listings'].map(byId).filter(Boolean) as NavigationItem[]
    const more = ['invite-account', 'manage-access', 'invitation-review', 'access-history', 'account-security'].map(byId).filter(Boolean) as NavigationItem[]
    const moreShown = moreOpen || more.some(item => item.id === activeSection)
    return <nav aria-label={translateText(language, 'Property workspace', 'Workspace sa propiedad')}>
      <ul className="workspace-links">{[byId('home'), byId('create-tenant')].filter(Boolean).map(item => link(item!, item!.id === 'create-tenant' ? 'nav-add-tenant' : ''))}</ul>
      {daily.length > 0 && <><p className="nav-group-label">{translate('Daily work', 'Adlaw-adlaw nga trabaho')}</p><ul className="workspace-links">{daily.map(item => link(item))}</ul></>}
      {more.length > 0 && <>
        <button type="button" className="nav-group-toggle" aria-expanded={moreShown} onClick={() => setMoreOpen(!moreShown)}>
          <span>{translate('Accounts & security', 'Account ug kaluwasan')}</span><span className="nav-group-chevron" aria-hidden="true">▾</span>
        </button>
        <ul className="workspace-links nav-group-more" hidden={!moreShown}>{more.map(item => link(item))}</ul>
      </>}
    </nav>
  }

  signOutRef.current = signOut
  const staffWorkspaceOpen = Boolean(session && role && snapshot && !snapshot.mfa && !setup && !dashboardPreview && !preview)
  return <div className={`app-shell ${route === 'sign-in' || (route === 'loading' && !dashboardPreview && !savedSessionAtBoot) || !supabase ? 'sign-in-shell' : ''} ${dashboardPreview ? 'focused-preview' : ''}`}>
    <a className="skip-link" href="#main">{t.skipContent}</a>
    <div className="environment-note">{environmentLabel}</div>
    <header className="site-header">
      <div className="shell header-inner">
        <a className="brand" href="/" aria-label={translateText(language, 'RentByBob home', 'Panimalay sa RentByBob')}><LogoMark size={34} /><Wordmark /></a>
        {/* App bar: display controls, then the signed-in account and Sign out (same accessible names as before). */}
        <div className="session-tools">
          <div className="session-actions">
            {import.meta.env.DEV && (!session || role) && <Button className="appbar-dev" onClick={() => { location.href = dashboardPreview ? '/?auth=1' : '/?preview=1' }}>
              {dashboardPreview ? t.returnAccount : t.openPreview}
            </Button>}
            <Button className="appbar-icon" title={theme === 'dark' ? t.dayMode : t.nightMode} aria-label={`${translateText(language, 'Use', 'Gamita ang')} ${theme === 'dark' ? t.dayMode : t.nightMode}`} aria-pressed={theme === 'dark'} onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark'
                ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" /></svg>
                : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" /></svg>}
            </Button>
            <Button className="appbar-language" aria-label={language === 'en' ? t.showBisaya : t.showEnglish} aria-pressed={language === 'ceb'} onClick={() => setLanguage(current => current === 'en' ? 'ceb' : 'en')}>
              <span aria-hidden="true" className={language === 'en' ? 'is-on' : ''}>EN</span><span aria-hidden="true" className={language === 'ceb' ? 'is-on' : ''}>CEB</span>
            </Button>
          </div>
          {session && <div className="appbar-account">
            <span className="appbar-avatar" aria-hidden="true">{(dashboardPreview ? 'S' : session.user.email ?? '?').trim().slice(0, 1).toLocaleUpperCase()}</span>
            <div className="session-identity">
              <span className="signed-in-label">{dashboardPreview ? translateText(language, 'Workspace mode', 'Lugar sa trabaho') : role ? (role === 'owner' ? translateText(language, 'Owner', 'Tag-iya') : translateText(language, 'Clerk', 'Clerk')) : translateText(language, 'Signed in as', 'Nakasulod isip')}</span>
              <span className="account-email">{dashboardPreview ? translateText(language, 'Fictional sample account', 'Hinimo-himong sample nga account') : session.user.email}</span>
            </div>
            {!dashboardPreview && <Button className="appbar-signout" title={t.signOut} onClick={() => void signOut()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>{t.signOut}</Button>}
          </div>}
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
          {import.meta.env.PROD ? <p>{translate('The app cannot reach its records right now. Please try again later, or contact the property owner.', 'Dili makakonektar ang app sa mga rekord karon. Sulayi pag-usab unya, o kontaka ang tag-iya.')}</p>
            : <p>{translate('Start local development with', 'Sugdi ang local development gamit ang')} <code>npm.cmd run dev:local</code>{translate(', or the configured hosted development environment with', ', o ang naka-set up nga hosted development gamit ang')} <code>npm.cmd run dev:hosted</code>. {translate('No prototype records are substituted.', 'Walay prototype nga rekord nga ipuli.')}</p>}
        </section>
          : callbackError ? <><Feedback message={appError(language, callbackError)} error /><Button className="primary" onClick={() => { setCallbackError(''); void signOut() }}>{t.returnSignIn}</Button></>
            : !session ? <>{idleNotice && <p className="notice" role="status">{translate('You were signed out after 30 minutes without activity. Sign in again to continue.', 'Na-sign out ka human sa 30 minutos nga walay lihok. Sulod pag-usab aron magpadayon.')}</p>}<SignIn language={language} /></>
              : <>
                <Feedback message={appError(language, error)} error />
                {!dashboardPreview && snapshot && !snapshot.mfa && !setup && !role && snapshot.access.state !== 'ready' && <Button className="quiet-button refresh-access" onClick={() => { setSnapshot(null); void refresh() }}>{translate('Refresh access', 'I-refresh ang access')}</Button>}
                {!snapshot ? error ? <p role="status" className="loading-state">{t.recordsUnavailable}</p> : <LoadingSkeleton label={t.checkingPermissions} rows={4} />
                  : snapshot.mfa ? <Mfa done={() => void refresh()} language={language} />
                    : setup ? <PasswordSetup language={language} email={session.user.email ?? ''} done={() => { sessionStorage.removeItem(`password-setup:${session.user.id}`); setSetup(false); void refresh() }} />
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
                              {snapshot.properties.length > 1 ? <div className="property-picker">
                                <label htmlFor="property">{t.property}</label>
                                <select id="property" value={propertyId} onChange={event => {
                                  setPropertyId(event.target.value)
                                  setBackup(false)
                                }}>{snapshot.properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
                              </div> : <p className="toolbar-property"><span>{t.property}</span> <strong>{snapshot.properties.find(property => property.id === propertyId)?.name}</strong></p>}
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
                            {!preview && activeSection === 'home' && (snapshot?.newInquiries ?? 0) > 0 && <div className="notice inquiry-alert" role="status"><p><strong>{snapshot!.newInquiries} {translate(snapshot!.newInquiries === 1 ? 'new inquiry' : 'new inquiries', 'ka bag-ong pangutana')}</strong> {translate('from people asking about rooms on the public page.', 'gikan sa mga tawo nga nangutana bahin sa kwarto sa publiko nga panid.')}</p><Button className="primary" onClick={() => selectSection('room-listings')}>{translate('Open inquiries', 'Ablihi ang mga pangutana')}</Button></div>}
                            {activeSection === 'home' && <PhilippineClock propertyId={preview ? undefined : propertyId} language={language} />}
                            {!preview && propertyId && activeSection === 'home' && <DeferredBoundary loadingLabel={translate('Loading collection figures…', 'Gikarga ang mga numero sa koleksiyon…')} rows={2} language={language} reset={CollectionsOverview.reset}>
                              <CollectionsOverview.Screen key={propertyId} propertyId={propertyId} tenants={tenantList} openPayments={tenantId => { if (tenantId) setPaymentTenant({ tenantId, nonce: Date.now() }); selectSection('payment-records') }} language={language} />
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
                            {!preview && <div id="tenant-records" hidden={activeSection !== 'tenant-records'} tabIndex={-1} className="workspace-section">{visitedSections.includes('tenant-records') && <DeferredBoundary loadingLabel={translate('Loading tenants…', 'Gikarga ang mga nag-abang…')} rows={3} language={language} reset={TenantDirectory.reset}>
                              <TenantDirectory.Screen key={`directory:${propertyId}`} propertyId={propertyId} tenants={tenantList} renterLinks={snapshot.renterLinks} owner={canManage} active={activeSection === 'tenant-records'} language={language}
                                addTenant={() => selectSection('create-tenant')}
                                openPayments={(tenantId, tab) => { setPaymentTenant({ tenantId, nonce: Date.now(), tab }); selectSection('payment-records') }}
                                locateRoom={unitId => { setLocateUnit({ unitId, nonce: Date.now() }); selectSection('property-locations') }}
                                assignRoom={tenant => { setAssignTenant({ id: tenant.id, name: tenant.display_name, kind: tenant.kind === 'business' ? 'business' : 'individual', nonce: Date.now() }); selectSection('create-tenant') }}
                                refresh={() => refresh()} />
                            </DeferredBoundary>}</div>}
                            <div id="property-locations" hidden={activeSection !== 'property-locations'} tabIndex={-1} className="workspace-section">{preview
                              ? <preview.PropertyMapPreview addTenant={() => selectSection('create-tenant')} language={language} />
                              : visitedSections.includes('property-locations') && <DeferredBoundary loadingLabel={translate('Loading property locations…', 'Gikarga ang mga lokasyon…')} rows={3} language={language} reset={PropertyDirectory.reset}>
                                <PropertyDirectory.Screen key={`locations:${propertyId}`} propertyId={propertyId} owner={canManage} startAgreement={unitId => { setTenantRoom({ unitId, nonce: Date.now() }); selectSection('create-tenant') }} locate={locateUnit} openPaymentsForUnit={tenantId => { setPaymentTenant({ tenantId, nonce: Date.now() }); selectSection('payment-records') }} language={language} />
                              </DeferredBoundary>}</div>
                            <div id="create-tenant" hidden={activeSection !== 'create-tenant'} tabIndex={-1} className="workspace-section">{preview ? <preview.AddTenantPreview showDirectory={() => selectSection('tenant-records')} showBuildings={() => selectSection('property-locations')} language={language} /> : <DeferredBoundary loadingLabel={translate('Loading the tenant form…', 'Gikarga ang porma…')} rows={3} language={language} reset={AddTenant.reset}><AddTenant.Screen key={`create:${propertyId}`} propertyId={propertyId} preselect={tenantRoom} assignTenant={assignTenant} done={() => void refresh()} openDirectory={() => selectSection('tenant-records')} openPayments={() => selectSection('payment-records')} language={language} /></DeferredBoundary>}</div>
                            <div id="payment-records" hidden={activeSection !== 'payment-records'} tabIndex={-1} className="workspace-section">{preview
                              ? <preview.PaymentsPreview language={language} />
                              : visitedSections.includes('payment-records') && <DeferredBoundary loadingLabel={translate('Loading payment records…', 'Gikarga ang mga rekord sa bayad…')} rows={3} language={language} reset={SavedPayments.reset}>
                                <SavedPayments.Screen key={propertyId} propertyId={propertyId} propertyName={snapshot.properties.find(property => property.id === propertyId)?.name} tenants={tenantList} owner={canManage} userId={session.user.id} focusTenant={paymentTenant} active={activeSection === 'payment-records'} language={language} />
                              </DeferredBoundary>}</div>
                              {!preview && <div id="maintenance" hidden={activeSection !== 'maintenance'} tabIndex={-1} className="workspace-section">{visitedSections.includes('maintenance') && <DeferredBoundary loadingLabel={translate('Loading maintenance…', 'Gikarga ang maintenance…')} rows={3} language={language} reset={Maintenance.reset}><Maintenance.Screen key={`maintenance:${propertyId}`} propertyId={propertyId} userId={session.user.id} language={language} /></DeferredBoundary>}</div>}
                              <div id="room-listings" hidden={activeSection !== 'room-listings'} tabIndex={-1} className="workspace-section">{visitedSections.includes('room-listings') && <DeferredBoundary loadingLabel={translate('Loading room listings…', 'Gikarga ang lista sa kwarto…')} rows={3} language={language} reset={RoomListingsManager.reset}><RoomListingsManager.Screen key={`listings:${propertyId}`} propertyId={propertyId} owner={canManage} language={language} /></DeferredBoundary>}</div>
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
                              {!dashboardPreview && activeSection === 'account-security' && <TrustedDevices language={language} />}
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
      {staffWorkspaceOpen && <IdleSignOut expire={expireIdle} language={language} />}
      <footer className="site-footer"><span>RentByBob</span><span>{t.footer}</span></footer>
    </div>
  </div>
}

