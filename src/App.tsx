import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button } from './components/atoms'
import { initialized, supabase, stateLabels, type AccessState, type Membership, type Property, type Tenant } from './access/client'
import { Feedback, Mfa, PasswordSetup, SignIn } from './access/AuthForms'
import { Invitations, ManageAccess } from './access/ManageAccess'
import { PropertyDirectory } from './access/PropertyDirectory'

type Snapshot = { access: AccessState; mfa: boolean; properties: Property[]; memberships: Membership[]; tenants: Tenant[] }
export function App() {
  const [session, setSession] = useState<Session | null>(null); const [booting, setBooting] = useState(true)
  const [setup, setSetup] = useState(false); const [callbackError, setCallbackError] = useState(''); const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [propertyId, setPropertyId] = useState(''); const [backup, setBackup] = useState(false)
  const [search, setSearch] = useState(''); const generation = useRef(0); const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    let alive = true
    void initialized.then(value => { if (alive) { setSession(value.session); setSetup(value.setup); setCallbackError(value.failure); setBooting(false) } })
    const subscription = supabase?.auth.onAuthStateChange((_event, value) => {
      generation.current++; setSnapshot(null); setSession(value)
      if (!value) { setSetup(false); setBackup(false) }
    }).data.subscription
    return () => { alive = false; subscription?.unsubscribe() }
  }, [])
  const refresh = useCallback(async () => {
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
          supabase.from('staff_memberships').select('property_id,user_id,role,revoked_at').eq('user_id',session.user.id).is('revoked_at',null),
          supabase.from('tenants').select('id,property_id,display_name,kind,archived_at').order('display_name'),
        ])
        if (p.error || m.error || t.error) throw p.error || m.error || t.error
        properties = p.data; memberships = m.data; tenants = t.data
      }
      if (version !== generation.current) return
      setError(''); setSnapshot({ access, mfa, properties, memberships, tenants })
      setPropertyId(previous => properties.some(p => p.id === previous) ? previous : properties[0]?.id ?? '')
    } catch { if (version === generation.current) { setSnapshot(null); setError('Access could not be verified. Records are hidden. Check your connection, refresh access or sign in again.') } }
  }, [session, booting, callbackError, setup])
  useEffect(() => {
    void refresh(); const timer = setInterval(() => void refresh(), 10000)
    const focus = () => { setSnapshot(null); void refresh() }
    const visibility = () => { if (document.hidden) { generation.current++; setSnapshot(null) } else void refresh() }
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange',visibility)
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',visibility) }
  }, [refresh])
  const route = booting ? 'loading' : callbackError ? 'link-error' : !session ? 'sign-in' : !snapshot ? 'checking' : snapshot.mfa ? 'mfa' : setup ? 'password' : snapshot.access.state
  useEffect(() => { heading.current?.focus() }, [route])
  async function signOut() {
    generation.current++; setSnapshot(null)
    const { error } = await supabase!.auth.signOut({ scope: 'local' })
    if (error) { setError('Sign-out could not be confirmed. Close this tab to clear this tab’s stored session.'); return }
    setSession(null); setSetup(false); setCallbackError(''); setBackup(false); setError(''); history.replaceState(null,'','/')
  }
  const role = snapshot?.memberships.find(m => m.property_id === propertyId)?.role
  const tenantList = snapshot?.tenants.filter(t => !role || t.property_id === propertyId) ?? []
  return <><a className="skip" href="#main">Skip to content</a><div className="prototype">Local development · Fictional accounts only · Connected records</div>
    <header><div className="shell header-row"><strong>Rental records</strong>{session && <div><span className="account-email">{session.user.email}</span><Button onClick={() => void signOut()}>Sign out</Button></div>}</div></header>
    <div className="shell"><main id="main" tabIndex={-1}>
      <h1 ref={heading} tabIndex={-1} className="route-heading">{route === 'loading' || route === 'checking' ? 'Checking access' : 'Your rental account'}</h1>
      {!supabase ? <section className="card"><h2>Local connection is not configured</h2><p>Start this app with <code>npm.cmd run dev:local</code> after starting local Supabase. No prototype records are substituted.</p></section> : booting ? <p role="status">Loading your session…</p> : callbackError ? <><Feedback message={callbackError} error /><Button onClick={() => { setCallbackError(''); void signOut() }}>Return to sign-in</Button></> : !session ? <SignIn /> : <>
        <Feedback message={error} error /><Button onClick={() => { setSnapshot(null); void refresh() }}>Refresh access</Button>
        {!snapshot ? <p role="status">{error ? 'Records unavailable.' : 'Checking your current permissions...'}</p> : snapshot.mfa ? <Mfa done={() => void refresh()} /> : setup ? <PasswordSetup done={() => { sessionStorage.removeItem(`password-setup:${session.user.id}`); setSetup(false); void refresh() }} /> : snapshot.access.state !== 'ready' ? <section className="card"><h2>{stateLabels[snapshot.access.state]}</h2><p>{snapshot.access.state === 'disabled' ? 'Your previous access is disabled. Contact the owner to review it.' : 'You are signed in, but an owner has not assigned property or tenant access. Contact the owner with your account email.'}</p><p>No rental records are available to this account.</p></section> : <>
          <p className="badge">Account ready</p>
          {snapshot.properties.length > 0 && <><label htmlFor="property">Authorized property</label><select id="property" value={propertyId} onChange={e => { setPropertyId(e.target.value); setBackup(false); setSearch('') }}>{snapshot.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></>}
          <section className="card"><h2>{role ? `${role === 'owner' ? 'Owner' : 'Clerk'} tenant directory` : 'Your authorized rental records'}</h2>
            <p>These records come from the local database. Charges, balances and payment posting are not implemented here.</p>
            <label htmlFor="tenant-search">Find a tenant by name</label><input id="tenant-search" value={search} onChange={e => setSearch(e.target.value)} type="search" />
            <ul className="records">{tenantList.filter(t => t.display_name.toLowerCase().includes(search.trim().toLowerCase())).map(t => <li key={t.id}><div><strong>{t.display_name}</strong><p>{t.kind === 'business' ? 'Business tenant' : 'Individual tenant'} · {t.archived_at ? 'Archived' : 'Active'}</p></div></li>)}</ul>
            {!tenantList.some(t => t.display_name.toLowerCase().includes(search.trim().toLowerCase())) && <p>No authorized tenant records match this view.</p>}
          </section>
          {role && <><PropertyDirectory key={`locations:${propertyId}`} propertyId={propertyId} owner={role === 'owner'} /><CreateTenant key={`create:${propertyId}`} propertyId={propertyId} done={() => void refresh()} /><Invitations key={`invite:${propertyId}`} propertyId={propertyId} owner={role === 'owner'} />{role === 'owner' && <ManageAccess key={`access:${propertyId}`} propertyId={propertyId} tenants={tenantList} changed={() => void refresh()} />}
            <section className="card"><h2>Account security</h2><p>Enroll a backup authenticator on a separate device before losing access to your main one. Password recovery does not bypass MFA.</p><Button onClick={() => setBackup(!backup)}>{backup ? 'Close backup setup' : 'Add backup authenticator'}</Button>{backup && <Mfa backup done={() => { setBackup(false); void refresh() }} />}</section></>}
        </>}
      </>}
    </main><footer>Local access milestone · Philippine property records · No online payments</footer></div></>
}

function CreateTenant({ propertyId, done }: { propertyId: string; done: () => void }) {
  const requestId = useRef(crypto.randomUUID()); const [busy,setBusy] = useState(false); const [message,setMessage] = useState(''); const [failed,setFailed] = useState(false)
  return <section className="card"><h2>Add a tenant record</h2><p>This creates a directory record only, without occupancy, charges or account access.</p><Feedback message={message} error={failed} />
    <form onSubmit={async e => { e.preventDefault(); const form=e.currentTarget; const f=new FormData(form); setBusy(true)
      try { const {error}=await supabase!.rpc('create_tenant',{p_property_id:propertyId,p_tenant_id:requestId.current,p_display_name:String(f.get('tenant-name')).trim(),p_kind:String(f.get('tenant-kind'))}); if(error) throw error
        requestId.current=crypto.randomUUID(); setFailed(false); setMessage('Tenant record saved. Account access remains separate.'); form.reset(); done()
      } catch { setFailed(true); setMessage('Save could not be confirmed. Keep the same details when retrying; the request identifier prevents a duplicate record.') }
      finally {setBusy(false)}
    }}><label htmlFor="tenant-name">Tenant display name</label><input id="tenant-name" name="tenant-name" required maxLength={200} /><label htmlFor="tenant-kind">Tenant type</label><select id="tenant-kind" name="tenant-kind"><option value="individual">Individual</option><option value="business">Business</option></select><Button disabled={busy}>{busy?'Saving…':'Create tenant record'}</Button></form>
  </section>
}
