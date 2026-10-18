export { PaymentsPreview } from './PaymentsPreview'
export { AddTenantPreview } from './AddTenantPreview'
import { createClient, type Session } from '@supabase/supabase-js'
export { TenantDirectoryPreview, PropertyMapPreview } from './PropertyPreview'

const property = { id: 'preview-property', name: 'Fictional preview property' }
export const previewSession: Session = {
  access_token: 'offline-preview-only', refresh_token: '', token_type: 'bearer', expires_in: 0,
  user: { id: 'preview-owner', email: 'preview@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'preview', created_at: '' },
}
export const previewSnapshot = {
  access: { state: 'ready', staff_mfa_required: false }, mfa: false,
  properties: [property],
  memberships: [{ property_id: property.id, user_id: 'preview-owner', role: 'owner' as const, revoked_at: null }],
  tenants: [
    { id: 'preview-alex', property_id: property.id, display_name: 'Sample Alex Santos', kind: 'individual', archived_at: null },
    { id: 'preview-shop', property_id: property.id, display_name: 'Sample Corner Shop', kind: 'business', archived_at: null },
    { id: 'preview-archived', property_id: property.id, display_name: 'Sample Archived Tenant', kind: 'individual', archived_at: '2026-10-01T00:00:00Z' },
  ],
}

// This transport never calls fetch. All writes fail explicitly; no real Auth
// client, stored session, privileged key or hosted request is used in preview.
export const previewClient = createClient('http://preview.invalid', 'offline-preview-only', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, options) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
    if (path === '/rest/v1/buildings' && (!options?.method || options.method === 'GET')) return json([{ id: 'preview-building', label: 'Sample Building A', archived_at: null }])
    if (path === '/rest/v1/units' && (!options?.method || options.method === 'GET')) return json([{ id: 'preview-unit', building_id: 'preview-building', label: 'Sample Room 01', archived_at: null }])
    if (['/rest/v1/rpc/read_access_audit', '/rest/v1/rpc/read_invitation_attempts'].includes(path)) return json([])
    if (path === '/rest/v1/rpc/find_account_for_assignment') return json(null)
    return json({ code: 'PREVIEW_ONLY', message: 'Preview only. Nothing was saved or sent.' }, 403)
  } },
})
