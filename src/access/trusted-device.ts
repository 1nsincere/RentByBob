// "Remember this device": the device secret from remember_device() is kept in this browser only (localStorage,
// so it survives closing the browser) and sent with database requests. The database decides whether it counts;
// the app never treats the stored value as proof on its own. No other data is stored.
export type TrustedDevice = { userId: string; secret: string; expiresAt: string; id: string }
const key = 'rentbybob:trusted-device'

export function readDevice(): TrustedDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as TrustedDevice | null
    if (!value || typeof value.secret !== 'string' || value.secret.length < 64 || !(new Date(value.expiresAt).getTime() > Date.now())) return null
    return value
  } catch { return null }
}
export function saveDevice(device: TrustedDevice) { try { localStorage.setItem(key, JSON.stringify(device)) } catch { /* storage blocked: device is simply not remembered */ } }
export function clearDevice() { try { localStorage.removeItem(key) } catch { /* nothing stored */ } }

// Adds the device header to Supabase database (REST) requests and to the invitation function, which passes it on to
// its own database calls as the signed-in person; Auth and other endpoints never receive it.
export function withDeviceHeader(fetcher: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const device = url.includes('/rest/v1/') || url.includes('/functions/v1/invite-account') ? readDevice() : null
    if (!device) return fetcher(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('x-rentbybob-device', device.secret)
    return fetcher(input, { ...init, headers })
  }
}

// A readable name for the device list, from the browser's own description (no fingerprinting beyond this).
export function deviceLabel(userAgent = navigator.userAgent) {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /OPR\//.test(userAgent) ? 'Opera' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser'
  const system = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iPhone/iPad' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS/.test(userAgent) ? 'Mac' : /Linux/.test(userAgent) ? 'Linux' : 'device'
  return `${browser} on ${system}`
}
