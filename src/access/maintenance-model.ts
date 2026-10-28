// Monthly maintenance expenses (202610280003). Money stays as decimal text; totals are summed in whole centavos.
export type MaintenanceExpense = { id: string; month: string; description: string; place: string | null; amount: string; recordedBy: string; recordedAt: string }

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const moneyPattern = /^\d{1,12}\.\d{2}$/
const amountInput = /^\d{1,9}(\.\d{1,2})?$/

export const toCentavos = (value: string): bigint => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) }
export const fromCentavos = (cents: bigint): string => `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
export const maintenanceTotal = (items: readonly Pick<MaintenanceExpense, 'amount'>[]): string => fromCentavos(items.reduce((sum, item) => sum + toCentavos(item.amount), 0n))

// What a staff member types: pesos with up to two decimals, more than zero, below one billion.
export function validAmountInput(value: string): boolean { return amountInput.test(value.trim()) && toCentavos(value.trim()) > 0n }

// Strict reader for read_maintenance_expenses(): anything unexpected is rejected rather than shown.
export function parseMaintenance(value: unknown): MaintenanceExpense[] {
  if (!Array.isArray(value)) throw new Error('Unexpected maintenance data')
  return value.map(item => {
    const row = item as Record<string, unknown>
    if (typeof row?.id !== 'string' || typeof row.month !== 'string' || !monthPattern.test(row.month) || typeof row.description !== 'string'
      || !(row.place === null || typeof row.place === 'string') || typeof row.amount !== 'string' || !moneyPattern.test(row.amount)
      || typeof row.recorded_by !== 'string' || typeof row.recorded_at !== 'string') throw new Error('Unexpected maintenance data')
    return { id: row.id, month: row.month, description: row.description, place: row.place as string | null, amount: row.amount, recordedBy: row.recorded_by, recordedAt: row.recorded_at }
  })
}
