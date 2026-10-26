import type { RentWorkspaceSnapshot } from './saved-payments-model'
import { buildSavedPaidRentReport, moneyFromMinor } from './saved-paid-rent-report-model.ts'

// Dashboard figures reuse the saved Paid rent report definitions: confirmed cash by actual receipt month,
// recorded charges with money still owed for the rent month, and renters with 2+ recorded months owing.
// Pending cash and uncleared checks are counted separately and never treated as paid.
export type CollectionsOverview = {
  month: string
  confirmedCash: string
  confirmedPayments: number
  pendingCash: { count: number; total: string }
  unclearedChecks: { count: number; total: string }
  dueThisMonth: { renters: number; total: string }
  multipleMonthsRenters: number
}

const minor = (value: string) => {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function buildCollectionsOverview(data: RentWorkspaceSnapshot, tenants: readonly { id: string; display_name: string }[], month: string): CollectionsOverview {
  const labels = { tenantUnavailable: '', buildingUnavailable: '', roomUnavailable: '' }
  const report = buildSavedPaidRentReport(data, tenants, month, month, labels)
  const pending = data.cash.filter(payment => payment.confirmed_at === null)
  const uncleared = data.checks.filter(check => check.status === 'received' || check.status === 'deposited')
  return {
    month,
    confirmedCash: moneyFromMinor(report.cashTotal),
    confirmedPayments: report.confirmed.length,
    pendingCash: { count: pending.length, total: moneyFromMinor(pending.reduce((sum, payment) => sum + minor(payment.amount), 0n)) },
    unclearedChecks: { count: uncleared.length, total: moneyFromMinor(uncleared.reduce((sum, check) => sum + minor(check.amount), 0n)) },
    dueThisMonth: { renters: new Set(report.outstanding.map(row => row.charge.agreement_id)).size, total: moneyFromMinor(report.outstandingTotal) },
    multipleMonthsRenters: report.arrears.length,
  }
}
