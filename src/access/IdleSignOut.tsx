import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { idleState, secondsLeft } from './idle-model'
import { text, type Language } from '../i18n'

const key = 'rentbybob:last-activity'
const read = () => { try { return Number(localStorage.getItem(key)) || 0 } catch { return 0 } }
const write = (value: number) => { try { localStorage.setItem(key, String(value)) } catch { /* storage blocked: this tab still tracks itself */ } }

// Signs a staff session out after inactivity, with a warning the person can dismiss. Other tabs share the timer.
export function IdleSignOut({ expire, language = 'en' }: { expire: () => void; language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const last = useRef(Date.now())
  const [state, setState] = useState<'active' | 'warn'>('active')
  const [left, setLeft] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const stay = useRef<HTMLButtonElement>(null)
  const expired = useRef(false)

  useEffect(() => {
    const now = Date.now(); last.current = now; write(now)
    let throttle = 0
    const activity = () => {
      if (dialog.current?.open) return // while warning, only the button keeps the session
      const time = Date.now(); last.current = time
      if (time - throttle > 5000) { throttle = time; write(time) }
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach(name => window.addEventListener(name, activity, { passive: true }))
    const tick = window.setInterval(() => {
      const shared = Math.max(last.current, read())
      last.current = shared
      const now = Date.now(), current = idleState(now, shared)
      if (current === 'expired') { if (!expired.current) { expired.current = true; expire() } return }
      setState(current); setLeft(secondsLeft(now, shared))
    }, 1000)
    return () => { events.forEach(name => window.removeEventListener(name, activity)); window.clearInterval(tick) }
  }, [expire])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (state === 'warn' && !element.open) { element.showModal(); stay.current?.focus() }
    if (state === 'active' && element.open) element.close()
  }, [state])

  function keep() { const now = Date.now(); last.current = now; write(now); setState('active') }
  const minutes = Math.floor(left / 60), seconds = String(left % 60).padStart(2, '0')
  return <dialog ref={dialog} className="inquiry-dialog idle-dialog" aria-labelledby="idle-heading" aria-describedby="idle-text" onCancel={event => { event.preventDefault(); keep() }}>
    <h2 id="idle-heading">{tr('Are you still there?', 'Nandiyan ka pa ba?')}</h2>
    <p id="idle-text">{tr('For safety, you will be signed out after 30 minutes without activity.', 'Para sa kaligtasan, masa-sign out ka pagkatapos ng 30 minutong walang galaw.')} <strong role="timer" aria-live="off">{tr('Signing out in', 'Masa-sign out sa')} {minutes}:{seconds}</strong></p>
    <p className="field-help">{tr('Anything not yet saved will be lost when you are signed out.', 'Mawawala ang hindi pa na-save kapag nag-sign out.')}</p>
    <div className="person-actions"><button type="button" ref={stay} className="button primary" onClick={keep}>{tr('Stay signed in', 'Manatiling naka-sign in')}</button><Button onClick={() => { expired.current = true; expire() }}>{tr('Sign out now', 'Mag-sign out ngayon')}</Button></div>
  </dialog>
}
