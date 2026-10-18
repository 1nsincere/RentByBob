import { createClient } from '@supabase/supabase-js'
import { connectionAllowed, hostedDevelopmentUrl } from './connection'

const env = import.meta.env
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
// Temporary UI debugging switch. Production always uses the real auth flow.
export const dashboardPreview = import.meta.env.DEV && !new URLSearchParams(location.search).has('auth') && (env.MODE === 'dashboard-preview' || new URLSearchParams(location.search).get('preview') === '1')
export const preview = import.meta.env.DEV && dashboardPreview ? await import('./dashboard-preview') : null
export const hostedDevelopment = url === hostedDevelopmentUrl
// Hosted access is explicit, project-bound and unavailable in production builds.
export const supabase = preview ? preview.previewClient : connectionAllowed(url, env.VITE_SUPABASE_TARGET, env.DEV) && key
  ? createClient(url, key, { auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storage: window.sessionStorage } })
  : null

export const stateLabels: Record<string, string> = {
  pending: 'Invitation pending', unassigned: 'Invitation accepted but access not assigned',
  ready: 'Account ready', disabled: 'Access disabled',
}
export type AccessState = { state: string; staff_mfa_required: boolean }
export type Property = { id: string; name: string }
export type Membership = { property_id: string; role: 'owner' | 'clerk'; user_id: string; revoked_at: string | null }
export type Tenant = { id: string; property_id: string; display_name: string; kind: string; archived_at: string | null }
export type Account = { id: string; email: string; accepted: boolean; state: string; staff_role: string | null; contacts: { tenant_id: string; name: string; enabled: boolean }[] }

export async function initializeAuth() {
  if (preview) return { session: preview.previewSession, setup: false, failure: '' }
  if (!supabase) return { session: null, setup: false, failure: '' }
  const callback = window.location.pathname === '/auth/callback'
  const params = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  if (callback) {
    // Remove bearer credentials and provider error details before rendering anything.
    history.replaceState(null, '', '/auth/callback')
    const type = params.get('type')
    if (params.has('error') || query.has('error') || params.has('error_code') || query.has('error_code') ||
      !['invite', 'recovery'].includes(type ?? '') || !params.get('access_token') || !params.get('refresh_token')) {
      return { session: null, setup: false, failure: 'This link is invalid, expired or already used. Sign in if you already set a password, or ask the owner to review the invitation. Do not repeatedly resend it.' }
    }
    const { data, error } = await supabase.auth.setSession({ access_token: params.get('access_token')!, refresh_token: params.get('refresh_token')! })
    if (error || !data.session) return { session: null, setup: false, failure: 'This link could not be verified. Request help from the owner or return to sign-in.' }
    sessionStorage.setItem(`password-setup:${data.session.user.id}`, 'required')
    history.replaceState(null, '', '/')
    return { session: data.session, setup: true, failure: '' }
  }
  const { data, error } = await supabase.auth.getSession()
  return { session: data.session, setup: !!data.session && sessionStorage.getItem(`password-setup:${data.session.user.id}`) === 'required', failure: error ? 'Your session could not be loaded. Please sign in again.' : '' }
}

// One callback exchange, even under React StrictMode.
export const initialized = initializeAuth().catch(() => ({ session: null, setup: false, failure: 'Your session could not be verified. Return to sign-in and try again when connected.' }))
