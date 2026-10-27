import { toCentavos } from './renter-account-model.ts'

// Renter payment reports (202610270012). A report is only a notice that the renter paid their collector:
// it never changes a balance. Staff record the cash (pending, then verifier-confirmed) or mark it not received.
export type PaymentReportStatus = 'new' | 'recorded' | 'dismissed'
export type PaidTo = 'Bob' | 'James' | 'Other'
export type PaymentReport = {
  id: string; agreement_id: string; amount: string; paid_on: string; paid_to: PaidTo; note: string
  status: PaymentReportStatus; handled_note: string | null; created_at: string; cash_id?: string | null
}
export type ReportDraft = { amount: string; paidOn: string; paidTo: PaidTo; note: string }
export type ReportDraftError = 'amount' | 'date' | 'note'

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
function businessDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}
function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// Rejects the whole list when any row is malformed, so a bad response never shows partial money data.
export function parsePaymentReports(value: unknown): PaymentReport[] {
  if (!Array.isArray(value)) throw new Error('Payment reports must be a list')
  return value.map(item => {
    const row = item as Record<string, unknown>
    const amount = typeof row?.amount === 'string' ? toCentavos(row.amount) : null
    if (typeof item !== 'object' || item === null || !uuid(row.id) || !uuid(row.agreement_id) || amount === null || amount <= 0n ||
      !businessDate(row.paid_on) || !['Bob', 'James', 'Other'].includes(row.paid_to as string) || typeof row.note !== 'string' ||
      !['new', 'recorded', 'dismissed'].includes(row.status as string) || !(row.handled_note === null || typeof row.handled_note === 'string') ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) || (row.cash_id !== undefined && row.cash_id !== null && !uuid(row.cash_id))) {
      throw new Error('Payment report is malformed')
    }
    return row as unknown as PaymentReport
  })
}

// Mirrors the database checks: positive exact amount, a date in the last 90 days (not after today), short note.
export function reportDraftError(draft: ReportDraft, today: string): ReportDraftError | null {
  const amount = draft.amount.trim()
  const cents = toCentavos(amount)
  if (cents === null || cents <= 0n) return 'amount'
  if (!businessDate(draft.paidOn) || draft.paidOn > today || draft.paidOn < addDays(today, -90)) return 'date'
  if (draft.note.length > 300) return 'note'
  return null
}
export const earliestReportDate = (today: string) => addDays(today, -90)
