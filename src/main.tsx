import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
const params = new URLSearchParams(location.search)
const publicAvailabilityPreview = import.meta.env.DEV &&
  params.get('availability') === 'preview' &&
  !params.has('auth') &&
  !params.has('preview')

async function startApp() {
  if (publicAvailabilityPreview) {
    const { PublicAvailabilityPreview } = await import('./access/PublicAvailabilityPreview')
    root.render(<React.StrictMode><PublicAvailabilityPreview /></React.StrictMode>)
    return
  }

  const { App } = await import('./App')
  root.render(<React.StrictMode><App /></React.StrictMode>)
}

void startApp()
