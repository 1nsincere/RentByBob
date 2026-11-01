import { useEffect, useRef, useState } from 'react'
import { Button, LoadingSkeleton } from '../components/atoms'
import { hostedDevelopment, supabase } from './client'
import { deviceLabel, saveDevice } from './trusted-device'
import { copy, text, type Language } from '../i18n'
import { LogoMark } from '../components/Logo'

// Show/hide password: an eye icon button sitting inside the field (its name is still "Show password" / "Hide password").
function EyeToggle({ shown, onToggle, label }: { shown: boolean; onToggle: () => void; label: string }) {
  return <button type="button" className="password-eye" aria-label={label} title={label} aria-pressed={shown} onClick={onToggle}>
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {shown
        ? <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c5.5 0 9 5.5 9 7a8.3 8.3 0 0 1-2.3 3.2M6.3 6.4C4.2 7.8 3 10.4 3 12c0 1.5 3.5 7 9 7 1.6 0 3-.4 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>
        : <><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" /><circle cx="12" cy="12" r="3" /></>}
    </svg>
  </button>
}

export function Feedback({ message, error = false }: { message: string; error?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <p ref={ref} tabIndex={-1} role={error ? 'alert' : 'status'} className={`notice ${error ? 'notice--error' : ''}`}>{message}</p> : null
}

// Shown when an invite or reset link fails. Links work once: someone who opened their invite and closed the page before
// choosing a password finds the link "expired" the second time. They ask for a fresh link here (a password-reset email,
// which also works for an invited account with no password yet). The reply is the same whether or not the email has an
// account, so this page does not reveal who is registered.
export function NewLinkRequest({ language = 'en', onBack }: { language?: Language; onBack: () => void }) {
  const t = copy[language]
  const tr = (english: string, filipino: string) => text(language, english, filipino)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  return <section className="card auth-card new-link-card" aria-labelledby="new-link-heading">
    <div className="auth-brand"><LogoMark size={46} /></div>
    <h2 id="new-link-heading">{tr('This link was already used or has expired', 'Nagamit na o nag-expire na ang link na ito')}</h2>
    <p>{tr('Invite and password links work only once. If you opened yours and closed the page before choosing a password, that is fine: enter your email and we will send you a new link to set it.', 'Isang beses lang gumagana ang link ng imbitasyon at password. Kung nabuksan mo ito at naisara bago pumili ng password, ayos lang: ilagay ang email mo at padadalhan ka namin ng bagong link para gumawa nito.')}</p>
    <Feedback message={message} error={error} />
    {!sent && <form onSubmit={async event => {
      event.preventDefault(); if (busy) return
      const email = String(new FormData(event.currentTarget).get('email')).trim()
      setBusy(true); setMessage('')
      try {
        const result = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` })
        if (result.error) throw result.error
        setSent(true); setError(false)
        setMessage(tr('If this email has an account, a new link is on its way. Open the newest email from RentByBob (check Spam too) and choose your password right away.', 'Kung may account ang email na ito, padating na ang bagong link. Buksan ang pinakabagong email mula sa RentByBob (tingnan din ang Spam) at pumili agad ng password.'))
      } catch {
        setError(true)
        setMessage(tr('The new link could not be sent. Wait a minute and try again, or ask the owner or clerk for help.', 'Hindi maipadala ang bagong link. Maghintay ng isang minuto at subukan ulit, o humingi ng tulong sa may-ari o clerk.'))
      } finally { setBusy(false) }
    }}>
      <label htmlFor="new-link-email">{t.email}</label>
      <input id="new-link-email" name="email" type="email" autoComplete="email" required maxLength={320} />
      <Button className="primary" disabled={busy}>{busy ? t.pleaseWait : tr('Send me a new link', 'Padalhan ako ng bagong link')}</Button>
    </form>}
    <Button className="secondary-button" type="button" onClick={onBack}>{t.returnSignIn}</Button>
  </section>
}

export function SignIn({ language = 'en' }: { language?: Language }) {
  const t = copy[language]
  const tr = (english: string, bisaya: string) => text(language, english, bisaya)
  const [recovery, setRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  return <section className="card auth-card auth-card--sign-in"><div className="auth-brand"><LogoMark size={46} /><p className="eyebrow">{tr('WELCOME TO RENTBYBOB', 'MALIGAYANG PAGDATING SA RENTBYBOB')}</p></div><h2>{recovery ? t.resetPassword : t.signIn}</h2>
    <p>{t.continue}</p>
    <Feedback message={message} error={error} />
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      const form = new FormData(e.currentTarget); setBusy(true); setMessage('')
      try {
        const email = String(form.get('email')).trim()
        if (recovery) {
          if (hostedDevelopment) {
            setError(true); setMessage(tr('Email recovery is unavailable in hosted development. Ask the development administrator for help. Staff MFA is still required.', 'Hindi magagamit ang email recovery sa hosted development. Humingi ng tulong sa development administrator. Kailangan pa rin ang MFA ng staff.'))
            return
          }
          const result = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` })
          if (result.error) throw result.error
          setError(false); setMessage(tr('If this address is eligible, a reset link will arrive. In local development, check Mailpit. Password reset does not remove staff MFA.', 'Kung kwalipikado ang email na ito, ipapadala ang reset link. Sa local development, tingnan ang Mailpit. Hindi inaalis ng pagpapalit ng password ang MFA ng staff.'))
        } else {
          const result = await supabase!.auth.signInWithPassword({ email, password: String(form.get('password')) })
          if (result.error) throw result.error
        }
      } catch { setError(true); setMessage(recovery ? tr('The request could not be completed. Wait and try again, or contact the owner.', 'Hindi natapos ang kahilingan. Maghintay at subukan ulit, o kontakin ang may-ari.') : tr('Sign-in failed. Check your email and password, or try again when connected.', 'Hindi ka makapasok. Suriin ang email at password o subukan ulit kapag may koneksyon na.')) }
      finally { setBusy(false) }
    }}>
      <label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={320} aria-describedby="email-help" />
      <p className="field-help" id="email-help">{t.invitationEmail}</p>
      {!recovery && <>      <label htmlFor="password">{t.password}</label><div className="password-field">
        <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
        <EyeToggle shown={showPassword} label={showPassword ? t.hidePassword : t.showPassword} onToggle={() => setShowPassword(value => !value)} />
      </div></>}
      <Button className="primary" disabled={busy}>{busy ? t.pleaseWait : recovery ? t.sendResetLink : t.signIn}</Button>
    </form>
    {hostedDevelopment ? <p className="field-help">{language === 'fil' ? 'Hindi magagamit ang email recovery sa hosted development. Humingi ng tulong sa development administrator.' : 'Email recovery is unavailable in hosted development. Ask the development administrator for help.'}</p> : <Button className="quiet-button recovery-link" onClick={() => { setRecovery(!recovery); setMessage(''); setError(false) }}>{recovery ? (language === 'fil' ? 'Bumalik sa pag-sign in' : 'Back to sign-in') : (language === 'fil' ? 'Nakalimutan ang password?' : 'Forgot password?')}</Button>}
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
    {email && <p className="notice" role="status">{tr('You are setting a password for', 'Naglalagay ka ng password para sa')} <strong>{email}</strong>. {tr('If this is not your email address, close this page and do not continue; ask the owner for a new link.', 'Kung hindi ito ang iyong email address, isara ang pahinang ito at huwag ituloy; humingi ng bagong link sa may-ari.')}</p>}
    <Feedback message={message} error />
    <form onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget)
      if (form.get('new-password') !== form.get('confirm-password')) { setMessage(tr('The passwords do not match. Please check both fields.', 'Hindi magkapareho ang mga password. Suriin ang dalawang field.')); return }
      setBusy(true); setMessage('')
      try {
        const { error } = await supabase!.auth.updateUser({ password: String(form.get('new-password')) })
        if (error) throw error
        done()
      } catch { setMessage(tr('The password could not be saved. Your session may need an authenticator code, or the link may no longer be valid. Contact the owner if this continues.', 'Hindi na-save ang password. Maaaring kailangan ng authenticator code ang session o hindi na wasto ang link. Kontakin ang may-ari kung magpapatuloy ito.')) }
      finally { setBusy(false) }
    }}>
      <label htmlFor="new-password">{t.newPassword}</label><div className="password-field">
        <input id="new-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required aria-describedby="password-help" />
        <EyeToggle shown={showPassword} label={showPassword ? t.hidePasswords : t.showPasswords} onToggle={() => setShowPassword(value => !value)} />
      </div><p className="field-help" id="password-help">{t.passwordHelp}</p>
      <label htmlFor="confirm-password">{t.confirmPassword}</label><input id="confirm-password" name="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required />
      <Button className="primary" disabled={busy}>{busy ? (language === 'fil' ? 'Sine-save…' : 'Saving…') : t.savePassword}</Button>
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
      if (error) { setMessage(text(languageRef.current, 'Authenticator options could not be loaded. Refresh access to try again.', 'Hindi ma-load ang authenticator. I-refresh ang access at subukan ulit.')); return }
      setFactors(data.totp); if (!backup) setFactorId(data.totp[0]?.id ?? ''); setLoaded(true)
    }); return () => { live = false }
  }, [backup])
  return <section className="card auth-card"><h2>{backup ? t.addBackup : t.staffSecurityCheck}</h2>
    <p>{backup ? t.backupDeviceHelp : t.mfaHelp}</p>
    <Feedback message={message} error />
    {!loaded && !message && <LoadingSkeleton label={language === 'fil' ? 'Nilo-load ang authenticator…' : 'Loading authenticator…'} rows={2} shape="form" />}
    {loaded && (backup || factors.length === 0) && !secret && <Button disabled={busy} onClick={async () => {
      setBusy(true); setMessage('')
      try {
        const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Rental records ${new Date().toISOString()}` })
        if (error) throw error
        setFactorId(data.id); setSecret(data.totp.secret); setQr(data.totp.qr_code)
      } catch { setMessage(tr('Could not start authenticator setup. Keep your existing factor; contact the owner if setup cannot continue.', 'Hindi masimulan ang authenticator setup. Panatilihin ang kasalukuyang authenticator; kontakin ang may-ari kung hindi makapagpatuloy.')) }
      finally { setBusy(false) }
    }}>{t.setupAuthenticator}</Button>}
    {secret && <div><p><strong>{t.oneTimeSetup}</strong></p><p>{t.mfaSetupHelp}</p><img className="mfa-qr" src={qr.startsWith('data:') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt={language === 'fil' ? 'QR code ng authenticator' : 'Authenticator enrollment QR code'} /><label htmlFor="setup-key">{t.manualSetupKey}</label><input id="setup-key" value={secret} readOnly autoComplete="off" /></div>}
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
      catch { setMessage(tr('The code could not be verified. Use the current six-digit code and try again.', 'Hindi makumpirma ang code. Gamitin ang kasalukuyang anim na digit na code at subukan ulit.')) }
      finally { setBusy(false) }
    }}><label htmlFor="code">{t.codeLabel}</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />{!backup && <div className="remember-device"><input id="remember-device" type="checkbox" checked={rememberDevice} aria-describedby="remember-device-help" onChange={event => setRememberDevice(event.target.checked)} /><span><label htmlFor="remember-device">{tr('Remember this device for 30 days', 'Tandaan ang device na ito sa loob ng 30 araw')}</label><small id="remember-device-help">{tr('Only on your own device, not a shared computer. Your password is still needed.', 'Sa sarili mong device lang, hindi sa computer na ginagamit ng iba. Kailangan pa rin ang password.')}</small></span></div>}<Button className="primary" disabled={busy}>{busy ? (language === 'fil' ? 'Sinusuri…' : 'Checking…') : t.verifyCode}</Button></form>}
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
    <p className="eyebrow">{tr('YOUR ACCOUNT', 'IYONG ACCOUNT')}</p>
    <h2 id="change-password-heading">{tr('Password', 'Password')}</h2>
    <p className="field-help">{tr('Signed in as', 'Naka-sign in bilang')} <strong>{email}</strong>. {tr('Change the password you use to sign in. You will need your current password.', 'Palitan ang password na ginagamit mo sa pag-sign in. Kailangan mo ang kasalukuyan mong password.')}</p>
    <Feedback message={message} error={error} />
    {!open ? <Button className="secondary-button" onClick={() => { setOpen(true); setMessage('') }}>{tr('Change password', 'Palitan ang password')}</Button>
      : <form onSubmit={async e => {
        e.preventDefault(); if (busy) return
        const form = new FormData(e.currentTarget)
        const current = String(form.get('current-password')), next = String(form.get('changed-password'))
        if (next !== form.get('changed-password-confirm')) return fail('The new passwords do not match. Please check both fields.', 'Hindi magkapareho ang mga bagong password. Suriin ang dalawang field.')
        if (next === current) return fail('Choose a new password that is different from your current one.', 'Pumili ng bagong password na iba sa kasalukuyan mo.')
        setBusy(true); setMessage('')
        try {
          const check = await supabase!.auth.signInWithPassword({ email, password: current })
          if (check.error) { fail('Your current password is not correct. Nothing was changed.', 'Mali ang iyong kasalukuyang password. Walang nabago.'); return }
          const { error: updateError } = await supabase!.auth.updateUser({ password: next })
          if (updateError) throw updateError
          setOpen(false); setError(false)
          setMessage(tr('Password changed. Use your new password the next time you sign in.', 'Napalitan na ang password. Gamitin ang bagong password sa susunod mong pag-sign in.'))
        } catch { fail('The password could not be changed. Nothing was saved. Try again, or contact the owner if this continues.', 'Hindi napalitan ang password. Walang na-save. Subukan ulit, o kontakin ang may-ari kung magpapatuloy ito.') }
        finally { setBusy(false) }
      }}>
        <label htmlFor="current-password">{tr('Current password', 'Kasalukuyang password')}</label>
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
          <Button type="button" className="secondary-button" disabled={busy} onClick={() => { setOpen(false); setMessage('') }}>{tr('Cancel', 'Kanselahin')}</Button>
          <Button className="primary" disabled={busy}>{busy ? tr('Saving…', 'Sine-save…') : tr('Save new password', 'I-save ang bagong password')}</Button>
        </div>
      </form>}
  </section>
}
