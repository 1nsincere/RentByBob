import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deviceLabel, withDeviceHeader } from '../src/access/trusted-device.ts'

test('device header goes only to database requests, and labels are readable', async () => {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }
  const seen: { url: string; header: string | null }[] = []
  const fake = (async (input: any, init?: RequestInit) => { seen.push({ url: String(input), header: new Headers(init?.headers).get('x-rentbybob-device') }); return new Response('{}') }) as typeof fetch
  const wrapped = withDeviceHeader(fake)
  await wrapped('https://x.supabase.co/rest/v1/tenants')
  assert.equal(seen[0].header, null, 'nothing stored, nothing sent')
  const secret = 'a'.repeat(128)
  store.set('rentbybob:trusted-device', JSON.stringify({ userId: 'u', secret, expiresAt: new Date(Date.now() + 86400000).toISOString(), id: 'd' }))
  await wrapped('https://x.supabase.co/rest/v1/rpc/read_rent_workspace', { headers: { apikey: 'k' } })
  await wrapped('https://x.supabase.co/auth/v1/token?grant_type=password')
  assert.equal(seen[1].header, secret)
  assert.equal(seen[2].header, null, 'Auth endpoints never receive the device secret')
  // The invitation function passes it on to its own database calls; other functions never receive it.
  await wrapped('https://x.supabase.co/functions/v1/invite-account', { method: 'POST' })
  await wrapped('https://x.supabase.co/functions/v1/some-other-function', { method: 'POST' })
  assert.equal(seen.at(-2)?.header, secret)
  assert.equal(seen.at(-1)?.header, null)
  seen.splice(3)
  store.set('rentbybob:trusted-device', JSON.stringify({ userId: 'u', secret, expiresAt: new Date(Date.now() - 1000).toISOString(), id: 'd' }))
  await wrapped('https://x.supabase.co/rest/v1/tenants')
  assert.equal(seen[3].header, null, 'an expired device is not sent')
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge on Windows')
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'), 'Chrome on Android')
})
