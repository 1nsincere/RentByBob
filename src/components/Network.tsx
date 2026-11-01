import { useEffect, useRef, useState } from 'react'
import type { Language } from '../i18n'
import { BUSY_AFTER_MS, SLOW_AFTER_MS, requestSnapshot, requestState, subscribeRequests } from './requests'

export { trackRequests } from './requests'

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return online
}

// 'idle', 'busy' (a request has waited a little: show the thin bar) or 'slow' (long enough to say so in words).
export function useRequestState() {
  const [state, setState] = useState<'idle' | 'busy' | 'slow'>('idle')
  useEffect(() => {
    let timer = 0
    const check = () => {
      window.clearTimeout(timer)
      const snapshot = requestSnapshot(), wait = snapshot.wait
      setState(requestState(snapshot))
      if (snapshot.pending > 0) timer = window.setTimeout(check, wait < BUSY_AFTER_MS ? BUSY_AFTER_MS - wait + 20 : wait < SLOW_AFTER_MS ? SLOW_AFTER_MS - wait + 20 : 1000)
    }
    const unsubscribe = subscribeRequests(check)
    check()
    return () => { unsubscribe(); window.clearTimeout(timer) }
  }, [])
  return state
}

// The thin bar at the top while the database is answering slowly, and one notice in words for offline, back online
// and slow connections. The notice never covers buttons: it sits at the bottom edge and passes taps through.
export function NetworkStatus({ language }: { language: Language }) {
  const online = useOnline()
  const requests = useRequestState()
  const [backOnline, setBackOnline] = useState(false)
  const wasOffline = useRef(false)
  useEffect(() => {
    if (!online) { wasOffline.current = true; setBackOnline(false); return }
    if (!wasOffline.current) return
    wasOffline.current = false; setBackOnline(true)
    const timer = window.setTimeout(() => setBackOnline(false), 4000)
    return () => window.clearTimeout(timer)
  }, [online])
  const tr = (english: string, filipino: string) => language === 'fil' ? filipino : english
  const message = !online
    ? tr('You are offline. Your saved records are safe; new changes cannot be sent until the internet is back.', 'Offline ka. Ligtas ang iyong mga naka-save na talaan; hindi maipapadala ang bagong pagbabago hangga\'t walang internet.')
    : requests === 'slow' ? tr('The connection is slow. Still working; please wait before pressing again.', 'Mabagal ang koneksyon. Ginagawa pa rin; maghintay muna bago pumindot ulit.')
      : backOnline ? tr('Back online.', 'May internet na ulit.') : ''
  return <>
    <div className={`net-bar${online && requests !== 'idle' ? ' is-on' : ''}`} aria-hidden="true" />
    <p className={`net-notice${message ? ' is-on' : ''}${!online ? ' net-notice--offline' : backOnline && requests !== 'slow' ? ' net-notice--ok' : ''}`} role="status" aria-live="polite">
      {message && <><span className="net-notice-dot" aria-hidden="true" />{message}</>}
    </p>
  </>
}
