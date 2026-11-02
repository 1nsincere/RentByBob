// "Keep me signed in on this device" (owner request, 2 Nov 2026). Without it the sign-in lives in sessionStorage and ends
// when the browser closes; with it the sign-in is kept in localStorage for 30 days. The password is never stored here
// (the phone's own password manager may offer to save it from the sign-in form). Staff MFA and the staff idle sign-out
// are unchanged. Signing out, or the 30 days running out, removes the kept sign-in.
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const UNTIL = 'rentbybob-remember-until'
const EMAIL = 'rentbybob-remember-email'
export const REMEMBER_DAYS = 30

const safe = <T,>(work: () => T, fallback: T): T => { try { return work() } catch { return fallback } }

export function createRememberStorage(long: Store, short: Store, now: () => number = Date.now) {
  const remembering = () => safe(() => Number(long.getItem(UNTIL) ?? 0) > now(), false)
  return {
    remembering,
    setRemember(on: boolean, email = '') {
      safe(() => {
        if (on) { long.setItem(UNTIL, String(now() + REMEMBER_DAYS * 86_400_000)); if (email) long.setItem(EMAIL, email) }
        else { long.removeItem(UNTIL); long.removeItem(EMAIL) }
      }, undefined)
    },
    rememberedEmail: () => safe(() => remembering() ? long.getItem(EMAIL) ?? '' : '', ''),
    // The storage the Supabase client keeps its session in.
    storage: {
      getItem(key: string) {
        if (remembering()) { const kept = safe(() => long.getItem(key), null); if (kept !== null) return kept }
        else safe(() => long.removeItem(key), undefined) // expired or switched off: forget the kept sign-in
        return safe(() => short.getItem(key), null)
      },
      setItem(key: string, value: string) {
        if (remembering()) { safe(() => long.setItem(key, value), undefined); safe(() => short.removeItem(key), undefined) }
        else { safe(() => short.setItem(key, value), undefined); safe(() => long.removeItem(key), undefined) }
      },
      removeItem(key: string) { safe(() => long.removeItem(key), undefined); safe(() => short.removeItem(key), undefined) },
    },
  }
}
