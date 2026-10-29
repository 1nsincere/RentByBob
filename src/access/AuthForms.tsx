import { useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { hostedDevelopment, supabase } from './client'
import { deviceLabel, saveDevice } from './trusted-device'
import { copy, text, type Language } from '../i18n'

export function Feedback({ message, error = false }: { message: string; error?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <p ref={ref} tabIndex={-1} role={error ? 'alert' : 'status'} className={`notice ${error ? 'notice--error' : ''}`}>{message}</p> : null
}

export function SignIn({ language = 'en' }: { language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [recovery, setRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  return <section className="card auth-card"><p className="eyebrow">{tr('WELCOME TO RENTBYBOB', 'MAAYONG PAG-ABOT SA RENTBYBOB')}</p><h2>{recovery ? t.resetPassword : t.signIn}</h2>
    <p>{t.continue}</p>
    <Feedback message={message} error={error} />
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      const form = new FormData(e.currentTarget); setBusy(true); setMessage('')
      try {
        const email = String(form.get('email')).trim()
        if (recovery) {
          if (hostedDevelopment) {
            setError(true); setMessage(tr('Email recovery is unavailable in hosted development. Ask the development administrator for help. Staff MFA is still required.', 'Dili magamit ang email recovery sa hosted development. Pangayo og tabang sa development administrator. Kinahanglan gihapon ang MFA sa staff.'))
            return
          }
          const result = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` })
          if (result.error) throw result.error
          setError(false); setMessage(tr('If this address is eligible, a reset link will arrive. In local development, check Mailpit. Password reset does not remove staff MFA.', 'Kung angayan kining email, ipadala ang reset link. Sa local development, susiha ang Mailpit. Dili tangtangon sa pag-usab sa password ang MFA sa staff.'))
        } else {
          const result = await supabase!.auth.signInWithPassword({ email, password: String(form.get('password')) })
          if (result.error) throw result.error
        }
      } catch { setError(true); setMessage(recovery ? tr('The request could not be completed. Wait and try again, or contact the owner.', 'Wala nahuman ang hangyo. Hulata ug sulayi pag-usab, o kontaka ang tag-iya.') : tr('Sign-in failed. Check your email and password, or try again when connected.', 'Wala ka makasulod. Susiha ang email ug password o sulayi pag-usab kon nakakonekta na.')) }
      finally { setBusy(false) }
    }}>
      <label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={320} aria-describedby="email-help" />
      <p className="field-help" id="email-help">{t.invitationEmail}</p>
      {!recovery && <>      <label htmlFor="password">{t.password}</label><div className="password-input-row">
        <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
        <Button type="button" className="secondary-button password-toggle" aria-label={showPassword ? t.hidePassword : t.showPassword} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? t.hidePassword : t.showPassword}</Button>
      </div></>}
      <Button className="primary" disabled={busy}>{busy ? t.pleaseWait : recovery ? t.sendResetLink : t.signIn}</Button>
    </form>
    {hostedDevelopment ? <p className="field-help">{language === 'ceb' ? 'Dili magamit ang email recovery sa hosted development. Pangayo og tabang sa development administrator.' : 'Email recovery is unavailable in hosted development. Ask the development administrator for help.'}</p> : <Button className="quiet-button recovery-link" onClick={() => { setRecovery(!recovery); setMessage(''); setError(false) }}>{recovery ? (language === 'ceb' ? 'Balik sa pagsulod' : 'Back to sign-in') : (language === 'ceb' ? 'Nakalimot sa password?' : 'Forgot password?')}</Button>}
    <div className="auth-help"><strong>{t.newHere}</strong><p>{t.askInvite}</p></div>
  </section>
}

// email: the account this link signed the person into. A forged invite or recovery link could sign someone into an
// attacker's account (login CSRF), so the screen says whose account it is and tells them to stop if it is not theirs.
export function PasswordSetup({ done, email = '', language = 'en' }: { done: () => void; email?: string; language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  return <section className="card auth-card"><h2>{t.setupPassword}</h2><p>{t.setPasswordHelp}</p>
    {email && <p className="notice" role="status">{tr('You are setting a password for', 'Nagbutang ka og password para sa')} <strong>{email}</strong>. {tr('If this is not your email address, close this page and do not continue; ask the owner for a new link.', 'Kung dili kini imong email address, sirad-i kini nga panid ug ayaw ipadayon; pangayo og bag-ong link sa tag-iya.')}</p>}
    <Feedback message={message} error />
    <form onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget)
      if (form.get('new-password') !== form.get('confirm-password')) { setMessage(tr('The passwords do not match. Please check both fields.', 'Dili magkapareho ang mga password. Susiha ang duha ka field.')); return }
      setBusy(true); setMessage('')
      try {
        const { error } = await supabase!.auth.updateUser({ password: String(form.get('new-password')) })
        if (error) throw error
        done()
      } catch { setMessage(tr('The password could not be saved. Your session may need an authenticator code, or the link may no longer be valid. Contact the owner if this continues.', 'Wala ma-save ang password. Basin kinahanglan og authenticator code ang session o dili na balido ang link. Kontaka ang tag-iya kung magpadayon kini.')) }
      finally { setBusy(false) }
    }}>
      <label htmlFor="new-password">{t.newPassword}</label><div className="password-input-row">
        <input id="new-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required aria-describedby="password-help" />
        <Button type="button" className="secondary-button password-toggle" aria-label={showPassword ? t.hidePasswords : t.showPasswords} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? t.hidePassword : t.showPassword}</Button>
      </div><p className="field-help" id="password-help">{t.passwordHelp}</p>
      <label htmlFor="confirm-password">{t.confirmPassword}</label><input id="confirm-password" name="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required />
      <Button className="primary" disabled={busy}>{busy ? (language === 'ceb' ? 'Nag-save…' : 'Saving…') : t.savePassword}</Button>
    </form>
  </section>
}

export function Mfa({ done, backup = false, language = 'en' }: { done: () => void; backup?: boolean; language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const languageRef = useRef(language)
  useEffect(() => { languageRef.current = language }, [language])
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([])
  const [factorId, setFactorId] = useState(''); const [secret, setSecret] = useState(''); const [qr, setQr] = useState('')
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(false)
  useEffect(() => { let live = true
    void supabase!.auth.mfa.listFactors().then(({ data, error }) => {
      if (!live) return
      if (error) { setMessage(text(languageRef.current, 'Authenticator options could not be loaded. Refresh access to try again.', 'Wala makarga ang authenticator. I-refresh ang access ug sulayi pag-usab.')); return }
      setFactors(data.totp); if (!backup) setFactorId(data.totp[0]?.id ?? ''); setLoaded(true)
    }); return () => { live = false }
  }, [backup])
  return <section className="card auth-card"><h2>{backup ? t.addBackup : t.staffSecurityCheck}</h2>
    <p>{backup ? t.backupDeviceHelp : t.mfaHelp}</p>
    <Feedback message={message} error />
    {!loaded && !message && <LoadingSkeleton label={language === 'ceb' ? 'Gikarga ang authenticator…' : 'Loading authenticator…'} rows={2} />}
    {loaded && (backup || factors.length === 0) && !secret && <Button disabled={busy} onClick={async () => {
      setBusy(true); setMessage('')
      try {
        const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Rental records ${new Date().toISOString()}` })
        if (error) throw error
        setFactorId(data.id); setSecret(data.totp.secret); setQr(data.totp.qr_code)
      } catch { setMessage(tr('Could not start authenticator setup. Keep your existing factor; contact the owner if setup cannot continue.', 'Wala masugdi ang authenticator setup. Ibilin ang imong kasamtangang authenticator; kontaka ang tag-iya kung dili makapadayon.')) }
      finally { setBusy(false) }
    }}>{t.setupAuthenticator}</Button>}
    {secret && <div><p><strong>{t.oneTimeSetup}</strong></p><p>{t.mfaSetupHelp}</p><img className="mfa-qr" src={qr.startsWith('data:') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt={language === 'ceb' ? 'QR code sa authenticator' : 'Authenticator enrollment QR code'} /><label htmlFor="setup-key">{t.manualSetupKey}</label><input id="setup-key" value={secret} readOnly autoComplete="off" /></div>}
    {!backup && factors.length > 0 && <><label htmlFor="factor">{t.authenticator}</label><select id="factor" value={factorId} onChange={e => setFactorId(e.target.value)}>{factors.map((f, i) => <option key={f.id} value={f.id}>{f.friendly_name || `${t.authenticator} ${i + 1}`}</option>)}</select></>}
    {factorId && <form onSubmit={async e => {
      e.preventDefault(); const code = String(new FormData(e.currentTarget).get('code')); setBusy(true); setMessage('')
      try {
        const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error
        // Optional: remember this browser for 30 days (database stores only a hash; failure here never blocks sign-in).
        if (!backup && rememberDevice) {
          const [{ data: remembered }, { data: user }] = await Promise.all([supabase!.rpc('remember_device', { p_label: deviceLabel() }), supabase!.auth.getUser()])
          if (remembered?.secret && user.user) saveDevice({ userId: user.user.id, secret: remembered.secret, expiresAt: remembered.expires_at, id: remembered.id })
        }
        setSecret(''); setQr(''); done()
      }
      catch { setMessage(tr('The code could not be verified. Use the current six-digit code and try again.', 'Wala makumpirma ang code. Gamita ang kasamtangang unom-ka-digit nga code ug sulayi pag-usab.')) }
      finally { setBusy(false) }
    }}><label htmlFor="code">{t.codeLabel}</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />{!backup && <div className="remember-device"><input id="remember-device" type="checkbox" checked={rememberDevice} aria-describedby="remember-device-help" onChange={event => setRememberDevice(event.target.checked)} /><span><label htmlFor="remember-device">{tr('Remember this device for 30 days', 'Hinumdumi kini nga device sulod sa 30 ka adlaw')}</label><small id="remember-device-help">{tr('Only on your own device, not a shared computer. Your password is still needed.', 'Sa imong kaugalingong device lang, dili sa gipaambit nga kompyuter. Kinahanglan gihapon ang password.')}</small></span></div>}<Button className="primary" disabled={busy}>{busy ? (language === 'ceb' ? 'Gisusi…' : 'Checking…') : t.verifyCode}</Button></form>}
    <p className="small">{t.lostAuthenticator}</p>
  </section>
}

// Renter password change. The current password is re-verified first so an unattended signed-in device
// cannot be used to replace it; the new password follows the same 12-character rule as first-time setup.
export function ChangePassword({ email, language = 'en' }: { email: string; language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const fail = (english: string, bisaya: string) => { setError(true); setMessage(tr(english, bisaya)) }
  return <section className="card renter-security" aria-labelledby="change-password-heading">
    <p className="eyebrow">{tr('YOUR ACCOUNT', 'IMONG ACCOUNT')}</p>
    <h2 id="change-password-heading">{tr('Password', 'Password')}</h2>
    <p className="field-help">{tr('Signed in as', 'Nakasulod isip')} <strong>{email}</strong>. {tr('Change the password you use to sign in. You will need your current password.', 'Usba ang password nga imong gamiton sa pagsulod. Kinahanglan nimo ang imong karon nga password.')}</p>
    <Feedback message={message} error={error} />
    {!open ? <Button className="secondary-button" onClick={() => { setOpen(true); setMessage('') }}>{tr('Change password', 'Usba ang password')}</Button>
      : <form onSubmit={async e => {
        e.preventDefault(); if (busy) return
        const form = new FormData(e.currentTarget)
        const current = String(form.get('current-password')), next = String(form.get('changed-password'))
        if (next !== form.get('changed-password-confirm')) return fail('The new passwords do not match. Please check both fields.', 'Dili magkapareho ang bag-ong mga password. Susiha ang duha ka field.')
        if (next === current) return fail('Choose a new password that is different from your current one.', 'Pagpili og bag-ong password nga lahi sa imong karon.')
        setBusy(true); setMessage('')
        try {
          const check = await supabase!.auth.signInWithPassword({ email, password: current })
          if (check.error) { fail('Your current password is not correct. Nothing was changed.', 'Dili husto ang imong karon nga password. Walay nausab.'); return }
          const { error: updateError } = await supabase!.auth.updateUser({ password: next })
          if (updateError) throw updateError
          setOpen(false); setError(false)
          setMessage(tr('Password changed. Use your new password the next time you sign in.', 'Nausab na ang password. Gamita ang bag-ong password sa sunod nimong pagsulod.'))
        } catch { fail('The password could not be changed. Nothing was saved. Try again, or contact the owner if this continues.', 'Wala nausab ang password. Walay na-save. Sulayi pag-usab, o kontaka ang tag-iya kon magpadayon kini.') }
        finally { setBusy(false) }
      }}>
        <label htmlFor="current-password">{tr('Current password', 'Karon nga password')}</label>
        <input id="current-password" name="current-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
        <label htmlFor="changed-password">{t.newPassword}</label>
        <div className="password-input-row">
          <input id="changed-password" name="changed-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required aria-describedby="changed-password-help" />
          <Button type="button" className="secondary-button password-toggle" aria-label={showPassword ? t.hidePasswords : t.showPasswords} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? t.hidePassword : t.showPassword}</Button>
        </div>
        <p className="field-help" id="changed-password-help">{t.passwordHelp}</p>
        <label htmlFor="changed-password-confirm">{t.confirmPassword}</label>
        <input id="changed-password-confirm" name="changed-password-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required />
        <div className="form-actions renter-security-actions">
          <Button type="button" className="secondary-button" disabled={busy} onClick={() => { setOpen(false); setMessage('') }}>{tr('Cancel', 'Kanselahon')}</Button>
          <Button className="primary" disabled={busy}>{busy ? tr('Saving…', 'Nag-save…') : tr('Save new password', 'I-save ang bag-ong password')}</Button>
        </div>
      </form>}
  </section>
}
