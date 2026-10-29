import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
const params = new URLSearchParams(location.search)
const publicAvailabilityPreview = import.meta.env.DEV &&
  params.get('availability') === 'preview' &&
  !params.has('auth') &&
  !params.has('preview')

// Developer style guide of the atoms (buttons, icon buttons, chips); development builds only.
const atomsGallery = import.meta.env.DEV && params.has('atoms') && !params.has('auth')
const renterPreview = import.meta.env.DEV && params.get('preview') === 'renter' && !params.has('auth')
// Public, sign-in-free room listing (production route). Reads only listed rooms; inquiries are write-only.
const publicRoomsPage = /^\/rooms\/?$/.test(location.pathname)
// Public landing page at "/" for visitors without an open session (staff and renters sign in at /sign-in).
const hasSession = (() => { try { return Object.keys(sessionStorage).some(key => /^sb-.+-auth-token$/.test(key)) } catch { return false } })()
const landingPage = location.pathname === '/' && !location.search && !hasSession

async function startApp() {
  if (atomsGallery) {
    const { AtomsGallery } = await import('./components/AtomsGallery')
    root.render(<React.StrictMode><AtomsGallery /></React.StrictMode>)
    return
  }
  if (publicRoomsPage && !publicAvailabilityPreview) {
    const { PublicRoomsPage } = await import('./access/PublicRooms')
    root.render(<React.StrictMode><PublicRoomsPage /></React.StrictMode>)
    return
  }
  if (landingPage) {
    const { LandingPage } = await import('./landing/LandingPage')
    root.render(<React.StrictMode><LandingPage /></React.StrictMode>)
    return
  }
  if (renterPreview) {
    const { RenterPortalPreview } = await import('./access/RenterPortalPreview')
    root.render(<React.StrictMode><RenterPortalPreview /></React.StrictMode>)
    return
  }
  if (publicAvailabilityPreview) {
    const { PublicAvailabilityPreview } = await import('./access/PublicAvailabilityPreview')
    root.render(<React.StrictMode><PublicAvailabilityPreview /></React.StrictMode>)
    return
  }

  const { App } = await import('./App')
  root.render(<React.StrictMode><App /></React.StrictMode>)
}

// Shown without the i18n bundle, which may be what failed to download.
function StartupFailure() {
  return <main className="card" style={{ maxWidth: '40rem', margin: '2rem auto' }}>
    <div role="alert" className="notice notice--error">
      <p><strong>The app did not open.</strong> Check your internet connection, then reload the page.</p>
      <p lang="ceb"><strong>Wala maablihi ang app.</strong> Susiha ang imong koneksyon sa internet, dayon i-reload ang panid.</p>
      <button type="button" className="button" onClick={() => window.location.reload()}>Reload page / I-reload ang panid</button>
    </div>
  </main>
}

startApp().catch((error: unknown) => {
  console.error('RentByBob could not start.', error)
  root.render(<StartupFailure />)
})
