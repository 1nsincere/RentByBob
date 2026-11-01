import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from './atoms'
import type { Language } from '../i18n'
import { clampCrop, MAX_ZOOM, type Crop } from './crop'

// Personal profile (owner request, 1 Nov 2026): what to call the person and an optional picture, shown in the dashboard
// greeting and the app bar. The welcome card asks once after the first sign-in; Account settings can change it later.
// Each person sees only their own profile (database functions read_my_profile / save_my_profile, migration
// 202611010002). A chosen photo opens a cropper (drag to move, pinch / wheel / slider to zoom, arrow keys and +/-),
// and only the cropped circle area is saved, shrunk to 256 x 256.
export type Profile = { preferredName: string | null; photo: string | null; welcomed: boolean }
type ProfileRow = { preferred_name: string | null; photo: string | null; welcomed: boolean }
const fromRow = (row: ProfileRow): Profile => ({ preferredName: row.preferred_name, photo: row.photo, welcomed: row.welcomed })

export function useProfile(client: SupabaseClient | null, userId: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    setProfile(null)
    if (!client || !userId) return
    let alive = true
    void client.rpc('read_my_profile').then(({ data, error }) => {
      // A missing profile function (database not yet updated) simply means no welcome card and no custom greeting.
      if (alive && !error && data) setProfile(fromRow(data as ProfileRow))
    }, () => undefined)
    return () => { alive = false }
  }, [client, userId])
  return [profile, setProfile] as const
}

// Round picture, or the first letter of the name or email when there is no picture.
export function ProfileAvatar({ profile, fallback, size = 'md' }: { profile: Profile | null; fallback: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const letter = (profile?.preferredName || fallback || '?').trim().slice(0, 1).toLocaleUpperCase()
  return <span className={`profile-avatar profile-avatar--${size}`} aria-hidden="true">
    {profile?.photo ? <img src={profile.photo} alt="" /> : letter}
  </span>
}

const PHOTO_SIDE = 256
function PhotoCropper({ src, language, onDone, onCancel }: { src: string; language: Language; onDone: (photo: string) => void; onCancel: () => void }) {
  const tr = (english: string, filipino: string) => language === 'fil' ? filipino : english
  const id = useId()
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchDistance = useRef<number | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [crop, setCrop] = useState<Crop | null>(null)
  const [frame, setFrame] = useState(260)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = frameRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setFrame(entry.contentRect.width || 260))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const update = (change: (current: Crop) => Crop) => setCrop(current => current && natural ? clampCrop(change(current), natural.w, natural.h) : current)
  const scaleFor = (current: Crop) => natural ? frame / (Math.min(natural.w, natural.h) / current.zoom) : 1
  const moveBy = (dx: number, dy: number) => update(current => { const scale = scaleFor(current); return { ...current, cx: current.cx - dx / scale, cy: current.cy - dy / scale } })
  const zoomBy = (factor: number) => update(current => ({ ...current, zoom: current.zoom * factor }))

  // Mouse wheel zoom needs a non-passive listener so the page does not scroll at the same time.
  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08) }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  })

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    pinchDistance.current = null
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) { moveBy(event.clientX - previous.x, event.clientY - previous.y); return }
    const [a, b] = [...pointers.current.values()]
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinchDistance.current) zoomBy(distance / pinchDistance.current)
    pinchDistance.current = distance
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) { pointers.current.delete(event.pointerId); pinchDistance.current = null }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = frame * 0.05
    const actions: Record<string, () => void> = {
      ArrowLeft: () => moveBy(step, 0), ArrowRight: () => moveBy(-step, 0), ArrowUp: () => moveBy(0, step), ArrowDown: () => moveBy(0, -step),
      '+': () => zoomBy(1.1), '=': () => zoomBy(1.1), '-': () => zoomBy(1 / 1.1),
    }
    if (actions[event.key]) { event.preventDefault(); actions[event.key]() }
  }
  function applyCrop() {
    const image = imageRef.current
    if (!image || !crop || !natural) return
    const side = Math.min(natural.w, natural.h) / crop.zoom
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PHOTO_SIDE
    const context = canvas.getContext('2d')
    if (!context) { setFailed(true); return }
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, crop.cx - side / 2, crop.cy - side / 2, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE)
    onDone(canvas.toDataURL('image/jpeg', 0.86))
  }

  const scale = crop ? scaleFor(crop) : 1
  const imageStyle = crop && natural ? {
    width: `${natural.w * scale}px`, height: `${natural.h * scale}px`,
    transform: `translate(${frame / 2 - crop.cx * scale}px, ${frame / 2 - crop.cy * scale}px)`,
  } : { opacity: 0 }
  return <div className="photo-cropper">
    <p className="photo-cropper-help" id={`${id}-help`}>{tr('Drag the photo to place your face in the circle. Pinch, scroll or use the slider to zoom.', 'I-drag ang larawan para nasa bilog ang mukha mo. I-pinch, i-scroll o gamitin ang slider para mag-zoom.')}</p>
    <div ref={frameRef} className="photo-cropper-frame" tabIndex={0} role="group"
      aria-label={tr('Picture position. Arrow keys move it; plus and minus zoom.', 'Posisyon ng larawan. Galawin gamit ang arrow keys; plus at minus para mag-zoom.')} aria-describedby={`${id}-help`}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onKeyDown={keyDown}>
      <img ref={imageRef} src={src} alt="" draggable={false} style={imageStyle}
        onLoad={event => { const { naturalWidth: w, naturalHeight: h } = event.currentTarget; setNatural({ w, h }); setCrop({ cx: w / 2, cy: h / 2, zoom: 1 }) }}
        onError={() => setFailed(true)} />
      <span className="photo-cropper-mask" aria-hidden="true" />
    </div>
    {failed && <p className="notice notice--error" role="alert">{tr('That file could not be opened as a picture. Try a JPG or PNG photo.', 'Hindi mabuksan ang file bilang larawan. Subukan ang JPG o PNG na larawan.')}</p>}
    <label htmlFor={`${id}-zoom`}>{tr('Zoom', 'Zoom')}</label>
    <input id={`${id}-zoom`} className="photo-cropper-zoom" type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop?.zoom ?? 1} disabled={!crop}
      onChange={event => update(current => ({ ...current, zoom: Number(event.target.value) }))} />
    <div className="profile-card-buttons">
      <Button type="button" variant="primary" disabled={!crop || failed} onClick={applyCrop}>{tr('Use this picture', 'Gamitin ang larawang ito')}</Button>
      <Button type="button" variant="secondary" disabled={!crop} onClick={() => natural && setCrop({ cx: natural.w / 2, cy: natural.h / 2, zoom: 1 })}>{tr('Reset', 'I-reset')}</Button>
      <Button type="button" variant="ghost" onClick={onCancel}>{tr('Cancel', 'Kanselahin')}</Button>
    </div>
  </div>
}

type CardProps = {
  client: SupabaseClient
  profile: Profile
  onSaved: (profile: Profile) => void
  language: Language
  email: string
  mode: 'welcome' | 'edit'
}

export function ProfileCard({ client, profile, onSaved, language, email, mode }: CardProps) {
  const tr = (english: string, filipino: string) => language === 'fil' ? filipino : english
  const id = useId()
  const [name, setName] = useState(profile.preferredName ?? '')
  const [photo, setPhoto] = useState<string | null>(profile.photo)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [cropping, setCropping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => { setName(profile.preferredName ?? ''); setPhoto(profile.photo); setPhotoChanged(false) }, [profile])
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  const suggestion = email.split('@')[0]?.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim().replace(/\b\w/g, letter => letter.toUpperCase()) || ''

  function choosePhoto(file: File | undefined) {
    if (!file) return
    setMessage(null)
    if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) {
      setMessage({ error: true, text: tr('That file could not be used as a picture. Try a JPG or PNG photo under 25 MB.', 'Hindi magamit ang file bilang larawan. Subukan ang JPG o PNG na mas maliit sa 25 MB.') })
      return
    }
    setSource(URL.createObjectURL(file))
    setCropping(true)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || cropping) return
    setBusy(true); setMessage(null)
    const { data, error } = await client.rpc('save_my_profile', { p_preferred_name: name, p_photo: photo, p_change_photo: photoChanged })
    setBusy(false)
    if (error || !data) { setMessage({ error: true, text: tr('Your profile was not saved. Check your connection and try again.', 'Hindi na-save ang iyong profile. Suriin ang koneksyon at subukan ulit.') }); return }
    setMessage({ error: false, text: tr('Saved.', 'Na-save.') })
    setSource(null)
    onSaved(fromRow(data as ProfileRow))
  }
  async function later() {
    if (busy) return
    setBusy(true)
    const { data, error } = await client.rpc('dismiss_profile_welcome')
    setBusy(false)
    onSaved(!error && data ? fromRow(data as ProfileRow) : { ...profile, welcomed: true })
  }

  const preview: Profile = { preferredName: name.trim() || null, photo, welcomed: true }
  const headingId = `${id}-heading`
  return <section className={`card profile-card profile-card--${mode}`} aria-labelledby={headingId}>
    {mode === 'welcome' && <p className="eyebrow">{tr('WELCOME TO RENTBYBOB', 'MALIGAYANG PAGDATING SA RENTBYBOB')}</p>}
    <h2 id={headingId}>{mode === 'welcome' ? tr('Hey! What should we call you?', 'Uy! Ano ang itatawag namin sa iyo?') : tr('Your profile', 'Iyong profile')}</h2>
    <p className="profile-card-lead">{tr('We will greet you by this name every time you sign in. A picture is optional.', 'Ito ang itatawag namin sa iyo tuwing mag-sign in ka. Hindi kailangan ang larawan.')}</p>
    <form className="profile-form" onSubmit={save}>
      {cropping && source
        ? <PhotoCropper src={source} language={language}
            onDone={cropped => { setPhoto(cropped); setPhotoChanged(true); setCropping(false) }}
            onCancel={() => setCropping(false)} />
        : <div className="profile-photo-row">
          <ProfileAvatar profile={preview} fallback={email} size="lg" />
          <div className="profile-photo-actions">
            <label className="button button--secondary profile-photo-pick">
              <input className="visually-hidden" type="file" accept="image/*" disabled={busy}
                onChange={event => { choosePhoto(event.target.files?.[0]); event.target.value = '' }} />
              {photo ? tr('Change picture', 'Palitan ang larawan') : tr('Add a picture', 'Magdagdag ng larawan')}
            </label>
            {source && photoChanged && photo && <Button type="button" variant="secondary" disabled={busy} onClick={() => setCropping(true)}>{tr('Adjust crop', 'Ayusin ang crop')}</Button>}
            {photo && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPhoto(null); setPhotoChanged(true) }}>{tr('Remove picture', 'Alisin ang larawan')}</Button>}
            <small className="field-help">{tr('Only you see your picture. You can crop it before saving.', 'Ikaw lang ang nakakakita ng larawan. Maaari mo itong i-crop bago i-save.')}</small>
          </div>
        </div>}
      <label htmlFor={`${id}-name`}>{tr('Your name or nickname', 'Iyong pangalan o palayaw')}</label>
      <input id={`${id}-name`} type="text" value={name} maxLength={40} autoComplete="nickname" disabled={busy}
        placeholder={suggestion ? tr(`For example ${suggestion}`, `Halimbawa: ${suggestion}`) : undefined}
        onChange={event => setName(event.target.value.replace(/[<>]/g, ''))} />
      {message && <p className={`notice${message.error ? ' notice--error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <div className="profile-card-buttons">
        <Button variant="primary" disabled={busy || cropping}>{busy ? tr('Saving…', 'Sine-save…') : mode === 'welcome' ? tr('Save and continue', 'I-save at magpatuloy') : tr('Save profile', 'I-save ang profile')}</Button>
        {mode === 'welcome' && <Button type="button" variant="ghost" disabled={busy} onClick={() => void later()}>{tr('Maybe later', 'Mamaya na lang')}</Button>}
      </div>
    </form>
  </section>
}
