import type { RentWorkspaceSnapshot, SavedAgreement } from './saved-payments-model'
import { anniversaryDue } from './payment-preview-model.ts'

// Agreements that should have a charge for the month but do not: started on or before that month and not
// moved out before it (move-out month itself is a full month). The database recomputes the due date and
// amount; these values are shown for staff review only.
export type MissingMonthlyCharge = { agreement: SavedAgreement; month: string; dueDate: string; amount: string }

export function missingMonthlyCharges(data: Pick<RentWorkspaceSnapshot, 'agreements' | 'charges'>, month: string): MissingMonthlyCharge[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return []
  const firstDay = `${month}-01`
  const charged = new Set(data.charges.filter(charge => charge.rental_month === firstDay).map(charge => charge.agreement_id))
  return data.agreements
    .filter(agreement => agreement.move_in.slice(0, 7) <= month && (agreement.ended_on == null || firstDay <= agreement.ended_on) && !charged.has(agreement.id))
    .map(agreement => ({ agreement, month, dueDate: anniversaryDue(agreement.move_in, month), amount: agreement.rent }))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.agreement.id.localeCompare(right.agreement.id))
}
