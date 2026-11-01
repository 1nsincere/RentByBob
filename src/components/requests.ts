// Counts the database requests that are still waiting (every Supabase call goes through trackRequests, see
// access/client.ts) so the app can say when the internet or the database is slow. Network.tsx shows it.
const started = new Map<number, number>()
let nextId = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

export function trackRequests(fetcher: typeof fetch): typeof fetch {
  return async (...args) => {
    const id = nextId++
    started.set(id, performance.now())
    notify()
    try { return await fetcher(...args) } finally { started.delete(id); notify() }
  }
}

export function subscribeRequests(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }

// How many requests are waiting, and how long the oldest has waited in milliseconds (0 when none).
export function requestSnapshot() {
  let oldest = Infinity
  for (const time of started.values()) oldest = Math.min(oldest, time)
  return { pending: started.size, wait: oldest === Infinity ? 0 : performance.now() - oldest }
}

export const BUSY_AFTER_MS = 700
export const SLOW_AFTER_MS = 7000
export function requestState({ pending, wait }: { pending: number; wait: number }): 'idle' | 'busy' | 'slow' {
  return pending === 0 ? 'idle' : wait >= SLOW_AFTER_MS ? 'slow' : wait >= BUSY_AFTER_MS ? 'busy' : 'idle'
}
