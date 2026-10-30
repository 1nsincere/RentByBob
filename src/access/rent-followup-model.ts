import { roomName, type RentWorkspaceSnapshot } from './saved-payments-model.ts'
import { moneyFromMinor } from './saved-paid-rent-report-model.ts'

// Follow-up lists for the dashboard, from the authorized staff snapshot only. "Late" is a fact, not a rule:
// a recorded month whose due date has passed and that confirmed payments have not fully covered. No fees,
// no grace period. Pending cash is shown beside the row (never subtracted) so staff check before reminding.
export type LateRow = {
  agreementId: string; tenantId: string; tenant: string; room: string; ended: boolean
  months: string[]; oldestDue: string; daysLate: number; overdue: string; pending: string
}
export type DueSoonRow = { agreementId: string; tenantId: string; tenant: string; room: string; dueDate: string; month: string; amount: string }
export type RentFollowUp = { late: LateRow[]; dueSoon: DueSoonRow[] }

const minor = (value: string) => {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}
const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000

export function buildRentFollowUp(data: RentWorkspaceSnapshot, tenants: readonly { id: string; display_name: string }[], today: string, soonDays = 7, unknownTenant = 'Tenant'): RentFollowUp {
  const late: LateRow[] = []
  const dueSoon: DueSoonRow[] = []
  for (const agreement of data.agreements) {
    const tenant = tenants.find(item => item.id === agreement.tenant_id)?.display_name ?? unknownTenant
    const room = roomName(data, agreement.unit_id)
    const owing = data.charges
      .filter(charge => charge.agreement_id === agreement.id && minor(charge.remaining) > 0n)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
    const overdue = owing.filter(charge => charge.due_date < today)
    if (overdue.length) {
      const pending = data.cash.filter(cash => cash.agreement_id === agreement.id && cash.confirmed_at === null)
      late.push({
        agreementId: agreement.id, tenantId: agreement.tenant_id, tenant, room, ended: agreement.ended_on !== null,
        months: overdue.map(charge => charge.rental_month.slice(0, 7)), oldestDue: overdue[0].due_date,
        daysLate: dayNumber(today) - dayNumber(overdue[0].due_date),
        overdue: moneyFromMinor(overdue.reduce((sum, charge) => sum + minor(charge.remaining), 0n)),
        pending: moneyFromMinor(pending.reduce((sum, cash) => sum + minor(cash.amount), 0n)),
      })
    }
    for (const charge of owing) {
      const ahead = dayNumber(charge.due_date) - dayNumber(today)
      if (ahead >= 0 && ahead <= soonDays) dueSoon.push({ agreementId: agreement.id, tenantId: agreement.tenant_id, tenant, room, dueDate: charge.due_date, month: charge.rental_month.slice(0, 7), amount: moneyFromMinor(minor(charge.remaining)) })
    }
  }
  late.sort((a, b) => b.daysLate - a.daysLate || a.tenant.localeCompare(b.tenant))
  dueSoon.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.tenant.localeCompare(b.tenant))
  return { late, dueSoon }
}

// A polite reminder staff can paste into SMS or Messenger. Contains only this renter's own figures.
export function reminderText(row: LateRow, language: 'en' | 'fil', pesos: (value: string) => string, month: (value: string) => string, day: (value: string) => string) {
  const months = row.months.map(month).join(', ')
  return language === 'fil'
    ? `Hi ${row.tenant}, paalala mula sa RentByBob. Ang upa sa ${row.room} na ${pesos(row.overdue)} (${months}) ay hindi pa nababayaran; ang pinakauna ay dapat bayaran noong ${day(row.oldestDue)}. Kung nakabayad ka na, pakisabihan kami o iulat ito sa iyong renter account. Salamat!`
    : `Hi ${row.tenant}, this is a friendly reminder from RentByBob. Rent for ${row.room} of ${pesos(row.overdue)} (${months}) is still unpaid; the oldest was due ${day(row.oldestDue)}. If you have already paid, please let us know or report it in your renter account. Thank you!`
}
