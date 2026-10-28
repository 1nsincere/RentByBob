// Pure helpers for months copied from the paper notebook (202610280001). Month text is "YYYY-MM"; no dates are parsed
// through the local time zone, and money stays as decimal text.
export type WaitingMonth = { id: string; agreementId: string; month: string; rent: string; sourceNote: string; enteredBy: string; enteredAt: string }
export type RentReview = { drafts: WaitingMonth[]; estimated: Record<string, string | null> }

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const moneyPattern = /^\d{1,12}\.\d{2}$/

// The months from..to (inclusive) that fit between the account's first and last allowed months, at most 36.
export function notebookMonthRange(from: string, to: string, first: string, last: string): string[] {
  if (![from, to, first, last].every(value => monthPattern.test(value)) || from > to) return []
  const months: string[] = []
  let [year, month] = from.split('-').map(Number)
  while (months.length < 36) {
    const value = `${year}-${String(month).padStart(2, '0')}`
    if (value > to) break
    if (value >= first && value <= last) months.push(value)
    month++; if (month > 12) { month = 1; year++ }
  }
  return months
}

// Strict reader for read_rent_review(): anything unexpected is rejected rather than shown.
export function parseRentReview(value: unknown): RentReview {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Unexpected review data')
  const { drafts, estimated } = value as { drafts?: unknown; estimated?: unknown }
  if (!Array.isArray(drafts) || typeof estimated !== 'object' || estimated === null || Array.isArray(estimated)) throw new Error('Unexpected review data')
  return {
    drafts: drafts.map(item => {
      const row = item as Record<string, unknown>
      if (typeof row?.id !== 'string' || typeof row.agreement_id !== 'string' || typeof row.month !== 'string' || !monthPattern.test(row.month)
        || typeof row.rent !== 'string' || !moneyPattern.test(row.rent) || typeof row.source_note !== 'string' || typeof row.entered_by !== 'string' || typeof row.entered_at !== 'string') throw new Error('Unexpected review data')
      return { id: row.id, agreementId: row.agreement_id, month: row.month, rent: row.rent, sourceNote: row.source_note, enteredBy: row.entered_by, enteredAt: row.entered_at }
    }),
    estimated: Object.fromEntries(Object.entries(estimated as Record<string, unknown>).map(([key, flagged]) => [key, typeof flagged === 'string' ? flagged : null])),
  }
}
