import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/atoms'
import { supabase } from './client'

export function Feedback({ message, error = false }: { message: string; error?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (message) ref.current?.focus() }, [message])
  return message ? <p ref={ref} tabIndex={-1} role={error ? 'alert' : 'status'} className={`notice ${error ? 'notice--error' : ''}`}>{message}</p> : null
}

export function SignIn() {
  const [recovery, setRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  return <section className="card auth-card"><p className="eyebrow">SECURE ACCOUNT ACCESS</p><h2>{recovery ? 'Reset your password' : 'Sign in'}</h2>
    <p>Use the email address associated with your account. New accounts are invited by the property owner or clerk.</p>
    <Feedback message={message} error={error} />
    <form onSubmit={async e => {
      e.preventDefault(); if (busy) return
      const form = new FormData(e.currentTarget); setBusy(true); setMessage('')
      try {
        const email = String(form.get('email')).trim()
        if (recovery) {
          const result = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` })
          if (result.error) throw result.error
          setError(false); setMessage('If this address is eligible, a reset link will arrive. In local development, check Mailpit. Password reset does not remove staff MFA.')
        } else {
          const result = await supabase!.auth.signInWithPassword({ email, password: String(form.get('password')) })
          if (result.error) throw result.error
        }
      } catch { setError(true); setMessage(recovery ? 'The request could not be completed. Wait and try again, or contact the owner.' : 'Sign-in failed. Check your email and password, or try again when connected.') }
      finally { setBusy(false) }
    }}>
      <label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={320} aria-describedby="email-help" />
      <p className="field-help" id="email-help">Enter the email address where you received your account invitation.</p>
      {!recovery && <><label htmlFor="password">Password</label><div className="password-input-row">
        <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required />
        <Button type="button" className="secondary-button password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</Button>
      </div></>}
      <Button className="primary" disabled={busy}>{busy ? 'Please wait…' : recovery ? 'Send reset link' : 'Sign in'}</Button>
    </form>
    <Button className="secondary-button" onClick={() => { setRecovery(!recovery); setMessage(''); setError(false) }}>{recovery ? 'Back to sign-in' : 'Forgot password?'}</Button>
    <p className="small">Password reset does not remove staff MFA. If you cannot use your email or authenticator, contact the property owner.</p>
  </section>
}

export function PasswordSetup({ done }: { done: () => void }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  return <section className="card auth-card"><h2>Set your password</h2><p>Choose your own password. Staff cannot retrieve it. Setting a password does not assign rental access.</p>
    <Feedback message={message} error />
    <form onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget)
      if (form.get('new-password') !== form.get('confirm-password')) { setMessage('The passwords do not match. Please check both fields.'); return }
      setBusy(true); setMessage('')
      try {
        const { error } = await supabase!.auth.updateUser({ password: String(form.get('new-password')) })
        if (error) throw error
        done()
      } catch { setMessage('The password could not be saved. Your session may need an authenticator code, or the link may no longer be valid. Contact the owner if this continues.') }
      finally { setBusy(false) }
    }}>
      <label htmlFor="new-password">New password (at least 12 characters)</label><div className="password-input-row">
        <input id="new-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required aria-describedby="password-help" />
        <Button type="button" className="secondary-button password-toggle" aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</Button>
      </div><p className="field-help" id="password-help">Use at least 12 characters. Your password is never shown to staff.</p>
      <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} required />
      <Button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
    </form>
  </section>
}

export function Mfa({ done, backup = false }: { done: () => void; backup?: boolean }) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([])
  const [factorId, setFactorId] = useState(''); const [secret, setSecret] = useState(''); const [qr, setQr] = useState('')
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false)
  useEffect(() => { let live = true
    void supabase!.auth.mfa.listFactors().then(({ data, error }) => {
      if (!live) return
      if (error) { setMessage('Authenticator options could not be loaded. Refresh access to try again.'); return }
      setFactors(data.totp); if (!backup) setFactorId(data.totp[0]?.id ?? ''); setLoaded(true)
    }); return () => { live = false }
  }, [backup])
  return <section className="card auth-card"><h2>{backup ? 'Add a backup authenticator' : 'Staff security check'}</h2>
    <p>{backup ? 'Use a separate device you control. Keep it available if your main authenticator is lost.' : 'Staff must verify an authenticator code before opening property records or managing access.'}</p>
    <Feedback message={message} error />
    {loaded && (backup || factors.length === 0) && !secret && <Button disabled={busy} onClick={async () => {
      setBusy(true); setMessage('')
      try {
        const { data, error } = await supabase!.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Rental records ${new Date().toISOString()}` })
        if (error) throw error
        setFactorId(data.id); setSecret(data.totp.secret); setQr(data.totp.qr_code)
      } catch { setMessage('Could not start authenticator setup. Keep your existing factor; contact the owner if setup cannot continue.') }
      finally { setBusy(false) }
    }}>Set up authenticator</Button>}
    {secret && <div><p>Scan this QR code in your authenticator, or enter the setup key manually. Do not share it.</p><img className="mfa-qr" src={qr.startsWith('data:') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="Authenticator enrollment QR code" /><label htmlFor="setup-key">Manual setup key</label><input id="setup-key" value={secret} readOnly autoComplete="off" /></div>}
    {!backup && factors.length > 0 && <><label htmlFor="factor">Authenticator</label><select id="factor" value={factorId} onChange={e => setFactorId(e.target.value)}>{factors.map((f, i) => <option key={f.id} value={f.id}>{f.friendly_name || `Authenticator ${i + 1}`}</option>)}</select></>}
    {factorId && <form onSubmit={async e => {
      e.preventDefault(); const code = String(new FormData(e.currentTarget).get('code')); setBusy(true); setMessage('')
      try { const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code }); if (error) throw error; setSecret(''); setQr(''); done() }
      catch { setMessage('The code could not be verified. Use the current six-digit code and try again.') }
      finally { setBusy(false) }
    }}><label htmlFor="code">Six-digit authenticator code</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /><Button className="primary" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</Button></form>}
    <p className="small">Lost your authenticator? Choose an enrolled backup above. If all factors are lost, contact the owner for identity-verified administrative recovery. James cannot remove owner MFA or retrieve passwords. No bypass account is provided.</p>
  </section>
}
