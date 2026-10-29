import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase } from './client'
import { clearDevice, readDevice } from './trusted-device'
import { text, type Language } from '../i18n'

type Device = { id: string; label: string; created_at: string; last_used_at: string | null; expires_at: string; current: boolean }
const day = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(value))

// Account security: the person's own remembered devices, with Remove; "Forget this device" for the current one.
export function TrustedDevices({ language = 'en' }: { language?: Language }) {
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase!.rpc('list_trusted_devices')
    if (error) { setDevices([]); setMessage({ error: true, text: tr('Remembered devices could not be loaded. Refresh access and try again.', 'Wala makarga ang mga nahinumdoman nga device. I-refresh ang access ug sulayi pag-usab.') }); return }
    setDevices(data as Device[])
  }, [])
  useEffect(() => { void load() }, [load])

  async function remove(device: Device | null) {
    setBusy(true); setMessage(null)
    const { error } = await supabase!.rpc('forget_trusted_device', { p_device_id: device?.id ?? null })
    setBusy(false)
    if (error) { setMessage({ error: true, text: tr('The device could not be removed. Try again.', 'Wala matangtang ang device. Sulayi pag-usab.') }); return }
    const forgotCurrent = !device || device.current
    if (forgotCurrent) clearDevice()
    setMessage({ error: false, text: forgotCurrent ? tr('This device is forgotten. The authenticator code will be asked at the next sign-in.', 'Nakalimtan na kini nga device. Pangayuon ang authenticator code sa sunod nga pagsulod.') : tr('Device removed. It will need the authenticator code again.', 'Natangtang ang device. Kinahanglan na usab ang authenticator code.') })
    await load()
  }

  const remembered = Boolean(readDevice()) && Boolean(devices?.some(device => device.current))
  return <section className="trusted-devices" aria-labelledby="trusted-devices-heading">
    <h3 id="trusted-devices-heading">{tr('Remembered devices', 'Mga nahinumdoman nga device')}</h3>
    <p>{tr('On a remembered device you sign in with your password only, without the authenticator code, for 30 days. Remove any device you no longer use or that is shared.', 'Sa nahinumdoman nga device, password lang ang kinahanglan, walay authenticator code, sulod sa 30 ka adlaw. Tangtanga ang device nga dili na nimo gamiton o gipaambit.')}</p>
    {message && <p role={message.error ? 'alert' : 'status'} className={`notice${message.error ? ' notice--error' : ''}`}>{message.text}</p>}
    {devices === null ? <p className="field-help">{tr('Loading…', 'Gikarga…')}</p> : devices.length === 0 ? <p className="field-help">{tr('No remembered devices. Tick "Remember this device" after entering the authenticator code to add one.', 'Walay nahinumdoman nga device. I-tsek ang "Hinumdumi kini nga device" human isulod ang code.')}</p>
      : <ul className="trusted-device-list">{devices.map(device => <li key={device.id}>
        <div><strong>{device.label}{device.current && <span className="status status--ready">{tr('This device', 'Kini nga device')}</span>}</strong>
          <small>{tr('Added', 'Gidugang')} {day(device.created_at)} · {tr('expires', 'matapos')} {day(device.expires_at)}{device.last_used_at ? ` · ${tr('last used', 'katapusang gamit')} ${day(device.last_used_at)}` : ''}</small></div>
        <Button variant="danger-quiet" size="sm" disabled={busy} aria-label={`${tr('Remove', 'Tangtanga')} ${device.label}`} onClick={() => void remove(device)}>{tr('Remove', 'Tangtanga')}</Button>
      </li>)}</ul>}
    {remembered && <Button variant="danger-quiet" disabled={busy} onClick={() => void remove(null)}>{tr('Forget this device', 'Kalimti kini nga device')}</Button>}
  </section>
}
