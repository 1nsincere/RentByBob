// Staff idle sign-out (security default chosen 27 Oct 2026; see DECISIONS.md): warn after 30 minutes without
// activity, sign out 2 minutes later unless the person chooses to stay. Activity in any open tab counts.
export const IDLE_WARN_MS = 30 * 60 * 1000
export const IDLE_GRACE_MS = 2 * 60 * 1000

export function idleState(now: number, lastActivity: number, warnMs = IDLE_WARN_MS, graceMs = IDLE_GRACE_MS): 'active' | 'warn' | 'expired' {
  const idle = Math.max(0, now - lastActivity)
  return idle >= warnMs + graceMs ? 'expired' : idle >= warnMs ? 'warn' : 'active'
}

export function secondsLeft(now: number, lastActivity: number, warnMs = IDLE_WARN_MS, graceMs = IDLE_GRACE_MS) {
  return Math.max(0, Math.ceil((lastActivity + warnMs + graceMs - now) / 1000))
}
