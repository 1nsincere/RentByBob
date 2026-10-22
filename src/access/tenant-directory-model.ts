import type { Tenant } from './client'

export type TenantStatusFilter = 'all' | 'active' | 'archived'
export type TenantKindFilter = 'all' | 'individual' | 'business'

export function filterTenantDirectory<T extends Pick<Tenant, 'display_name' | 'kind' | 'archived_at'>>(
  tenants: readonly T[],
  search: string,
  status: TenantStatusFilter,
  kind: TenantKindFilter,
): T[] {
  const query = search.trim().toLowerCase()
  return tenants.filter(tenant => {
    if (query && !tenant.display_name.toLowerCase().includes(query)) return false
    if (status === 'active' && tenant.archived_at !== null) return false
    if (status === 'archived' && tenant.archived_at === null) return false
    if (kind !== 'all' && tenant.kind !== kind) return false
    return true
  })
}
