export interface ReportDraft {
  method: string
  amount: string
  date: string
  collector: string
  reference: string
  months: string
  note: string
}
export type ReportErrors = Partial<Record<keyof ReportDraft, string>>

// Exact minor units. Compatible with the proposed PostgreSQL numeric(14,2).
export function parsePesos(value: string): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  return cents > 0n ? cents : null
}

export function formatPesos(cents: bigint): string {
  const sign = cents < 0n ? '-' : ''
  const absolute = cents < 0n ? -cents : cents
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}₱${whole}.${(absolute % 100n).toString().padStart(2, '0')}`
}

export function manilaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find(part => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function displayBusinessDate(value: string): string {
  if (!isBusinessDate(value)) throw new Error('Invalid business date')
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(`${value}T00:00:00Z`))
}

export function validateReport(draft: ReportDraft, today = manilaDate()): ReportErrors {
  const errors: ReportErrors = {}
  if (!['Cash', 'Check'].includes(draft.method)) errors.method = 'Choose Cash or Check.'
  if (parsePesos(draft.amount) === null) errors.amount = 'Enter an amount greater than zero, such as 4000.00, with no commas and at most two decimal places (up to 12 whole-number digits).'
  if (!isBusinessDate(draft.date)) errors.date = 'Enter a valid handover date.'
  else if (draft.date > today) errors.date = 'The handover date cannot be in the future in the Philippines.'
  if (!draft.collector.trim()) errors.collector = 'Enter the name of the person who received the payment.'
  if (!draft.months.trim()) errors.months = 'Enter the rental months you intended this payment to cover.'
  for (const field of ['collector', 'reference', 'months', 'note'] as const) {
    const limit = field === 'note' ? 1000 : 200
    if (draft[field].length > limit) errors[field] = `Use ${limit} characters or fewer.`
  }
  return errors
}
