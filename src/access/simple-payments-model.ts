// Display helpers for the simple Payments screen. Exact centavos (bigint); the database remains the authority:
// it re-checks balances and does the real oldest-first allocation when cash is confirmed.
import type { RentWorkspaceSnapshot, SavedCharge } from './saved-payments-model'

const decimal = /^\d{1,12}(\.\d{1,2})?$/
export function toCents(value: string): bigint {
  const trimmed = value.trim()
  if (!decimal.test(trimmed)) throw new Error('Enter an amount like 2500 or 2500.50.')
  const [whole, fraction = ''] = trimmed.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}
export function fromCents(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

// Which rent months a cash amount would cover if confirmed now (oldest due date first) and how much is left over as
// advance credit for the next months (202610270010).
export function planOldestFirst(charges: readonly Pick<SavedCharge, 'id' | 'rental_month' | 'due_date' | 'remaining'>[], amount: string) {
  let left = toCents(amount)
  if (left <= 0n) throw new Error('Enter an amount greater than zero.')
  const covered: { month: string; amount: string; settles: boolean }[] = []
  for (const charge of [...charges].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))) {
    const owed = toCents(charge.remaining)
    if (owed <= 0n || left <= 0n) continue
    const part = owed < left ? owed : left
    covered.push({ month: charge.rental_month.slice(0, 7), amount: fromCents(part), settles: part === owed })
    left -= part
  }
  return { covered, credit: fromCents(left) }
}

export type WorklistRow = { agreementId: string; tenant: string; location: string; balance: string; pending: number; charges: number; ended: boolean }
// One row per agreement for the "What needs attention?" list.
export function worklistRows(data: RentWorkspaceSnapshot, tenants: readonly { id: string; display_name: string }[]): WorklistRow[] {
  return data.agreements.map(agreement => {
    const unit = data.units.find(item => item.id === agreement.unit_id)
    const building = unit && data.buildings.find(item => item.id === unit.building_id)
    return {
      agreementId: agreement.id,
      tenant: tenants.find(item => item.id === agreement.tenant_id)?.display_name ?? 'Tenant',
      location: `${building?.label ?? 'Building'} · ${unit?.label ?? 'Room'}`,
      balance: agreement.balance,
      pending: data.cash.filter(cash => cash.agreement_id === agreement.id && !cash.confirmed_at).length,
      charges: data.charges.filter(charge => charge.agreement_id === agreement.id).length,
      ended: agreement.ended_on != null,
    }
  })
}
export type WorklistFilter = 'pending' | 'unpaid' | 'setup' | 'all'
export function filterWorklist(rows: readonly WorklistRow[], filter: WorklistFilter, search: string) {
  const query = search.trim().toLocaleLowerCase()
  return rows.filter(row => (filter === 'all' || (filter === 'pending' ? row.pending > 0 : filter === 'unpaid' ? toCents(row.balance) > 0n : row.charges === 0 && !row.ended))
    && `${row.tenant} ${row.location}`.toLocaleLowerCase().includes(query))
}
