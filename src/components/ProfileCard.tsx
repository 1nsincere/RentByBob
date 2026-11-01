import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from './atoms'
import type { Language } from '../i18n'

// Personal profile (owner request, 1 Nov 2026): what to call the person and an optional picture, shown in the dashboard
// greeting and the app bar. The welcome card asks once after the first sign-in; Account settings can change it later.
// Each person sees only their own profile (database functions read_my_profile / save_my_profile, migration
// 202611010002). The browser crops the picture to a square and shrinks it to 256 x 256 before saving.
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

const PHOTO_SIDE = 256
// Crops the middle square of a photo and shrinks it, so a phone picture of several megabytes becomes about 20 KB.
export async function shrinkPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image')
  if (file.size > 20 * 1024 * 1024) throw new Error('too-large')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PHOTO_SIDE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('no-canvas')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIDE, PHOTO_SIDE)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.84)
}

// Round picture, or the first letter of the name or email when there is no picture.
export function ProfileAvatar({ profile, fallback, size = 'md' }: { profile: Profile | null; fallback: string; size?: 'sm' | 'md' | 'lg' }) {
  const letter = (profile?.preferredName || fallback || '?').trim().slice(0, 1).toLocaleUpperCase()
  return <span className={`profile-avatar profile-avatar--${size}`} aria-hidden="true">
    {profile?.photo ? <img src={profile.photo} alt="" /> : letter}
  </span>
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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => { setName(profile.preferredName ?? ''); setPhoto(profile.photo); setPhotoChanged(false) }, [profile])
  const suggestion = email.split('@')[0]?.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim().replace(/\b\w/g, letter => letter.toUpperCase()) || ''

  const choosePhoto = useCallback(async (file: File | undefined) => {
    if (!file) return
    setMessage(null)
    try { setPhoto(await shrinkPhoto(file)); setPhotoChanged(true) }
    catch { setMessage({ error: true, text: tr('That file could not be used as a picture. Try a JPG or PNG photo.', 'Hindi magamit ang file na iyon bilang larawan. Subukan ang JPG o PNG na larawan.') }) }
  }, [language])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setMessage(null)
    const { data, error } = await client.rpc('save_my_profile', { p_preferred_name: name, p_photo: photo, p_change_photo: photoChanged })
    setBusy(false)
    if (error || !data) { setMessage({ error: true, text: tr('Your profile was not saved. Check your connection and try again.', 'Hindi na-save ang iyong profile. Suriin ang koneksyon at subukan ulit.') }); return }
    const saved = fromRow(data as ProfileRow)
    setMessage({ error: false, text: tr('Saved.', 'Na-save.') })
    onSaved(saved)
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
      <div className="profile-photo-row">
        <ProfileAvatar profile={preview} fallback={email} size="lg" />
        <div className="profile-photo-actions">
          <label className="button button--secondary profile-photo-pick">
            <input className="visually-hidden" type="file" accept="image/*" disabled={busy}
              onChange={event => { void choosePhoto(event.target.files?.[0]); event.target.value = '' }} />
            {photo ? tr('Change picture', 'Palitan ang larawan') : tr('Add a picture', 'Magdagdag ng larawan')}
          </label>
          {photo && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPhoto(null); setPhotoChanged(true) }}>{tr('Remove picture', 'Alisin ang larawan')}</Button>}
          <small className="field-help">{tr('Only you see your picture. It is made small before saving.', 'Ikaw lang ang nakakakita ng larawan. Pinapaliit ito bago i-save.')}</small>
        </div>
      </div>
      <label htmlFor={`${id}-name`}>{tr('Your name or nickname', 'Iyong pangalan o palayaw')}</label>
      <input id={`${id}-name`} type="text" value={name} maxLength={40} autoComplete="nickname" disabled={busy}
        placeholder={suggestion ? tr(`For example ${suggestion}`, `Halimbawa: ${suggestion}`) : undefined}
        onChange={event => setName(event.target.value.replace(/[<>]/g, ''))} />
      {message && <p className={`notice${message.error ? ' notice--error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <div className="profile-card-buttons">
        <Button variant="primary" disabled={busy}>{busy ? tr('Saving…', 'Sine-save…') : mode === 'welcome' ? tr('Save and continue', 'I-save at magpatuloy') : tr('Save profile', 'I-save ang profile')}</Button>
        {mode === 'welcome' && <Button type="button" variant="ghost" disabled={busy} onClick={() => void later()}>{tr('Maybe later', 'Mamaya na lang')}</Button>}
      </div>
    </form>
  </section>
}
