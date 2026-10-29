// Development-only harness served by Vite for scripts/check-deferred-screen.mjs; the app never imports it.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DeferredBoundary, deferredScreen } from '../../../src/components/DeferredScreen'
import type { Language } from '../../../src/i18n'

const Sample = deferredScreen(() => import('./deferred-screen-sample').then(module => module.SampleScreen))

function Harness({ language }: { language: Language }) {
  const [draft, setDraft] = useState('')
  return <main className="card">
    <label htmlFor="other-section-draft">Other section draft</label>
    <input id="other-section-draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <div id="sample-section" className="workspace-section" tabIndex={-1}>
      <DeferredBoundary loadingLabel="Loading sample screen…" language={language} reset={Sample.reset}>
        <Sample.Screen label="Sample screen loaded" />
      </DeferredBoundary>
    </div>
  </main>
}

export function mount(language: Language) {
  document.getElementById('root')?.setAttribute('hidden', '')
  const container = document.createElement('div')
  document.body.append(container)
  createRoot(container).render(<Harness language={language} />)
}
