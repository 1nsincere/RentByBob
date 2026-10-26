import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
const params = new URLSearchParams(location.search)
const publicAvailabilityPreview = import.meta.env.DEV &&
  params.get('availability') === 'preview' &&
  !params.has('auth') &&
  !params.has('preview')

const renterPreview = import.meta.env.DEV && params.get('preview') === 'renter' && !params.has('auth')
// Public, sign-in-free room listing (production route). Reads only listed rooms; inquiries are write-only.
const publicRoomsPage = /^\/rooms\/?$/.test(location.pathname)

async function startApp() {
  if (publicRoomsPage && !publicAvailabilityPreview) {
    const { PublicRoomsPage } = await import('./access/PublicRooms')
    root.render(<React.StrictMode><PublicRoomsPage /></React.StrictMode>)
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
