function toMinorUnits(value: string): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}

export type StatementCharge = {
  id: string
  rental_month: string
  due_date: string
  amount: string
  remaining: string
}

export type StatementAllocation = { month: string; amount: string }

export type StatementAcknowledgment = {
  number: string
  tenant: string
  building: string
  room: string
  property: string
  amount: string
  received_on: string
  collector: string
  issued_at: string
  balance_at_issuance: string
  allocations: StatementAllocation[]
}

export type StatementCash = {
  id: string
  amount: string
  received_on: string
  collector: string
  confirmed_at: string | null
  acknowledgment: StatementAcknowledgment | null
}

export type StatementEvent =
  | { id: string; kind: 'charge'; date: string; month: string; amount: string; remaining: string }
  | { id: string; kind: 'payment'; date: string; amount: string; collector: string; allocations: StatementAllocation[]; acknowledgment: StatementAcknowledgment | null }

export function buildStatementEvents(charges: StatementCharge[], cash: StatementCash[]): StatementEvent[] {
  const events: StatementEvent[] = [
    ...charges.map(charge => ({
      id: charge.id,
      kind: 'charge' as const,
      date: charge.due_date,
      month: charge.rental_month,
      amount: charge.amount,
      remaining: charge.remaining,
    })),
    ...cash.filter(payment => payment.confirmed_at !== null).map(payment => ({
      id: payment.id,
      kind: 'payment' as const,
      date: payment.received_on,
      amount: payment.amount,
      collector: payment.collector,
      allocations: payment.acknowledgment?.allocations ?? [],
      acknowledgment: payment.acknowledgment,
    })),
  ]

  return events.sort((left, right) =>
    left.date.localeCompare(right.date) ||
    (left.kind === right.kind ? 0 : left.kind === 'charge' ? -1 : 1) ||
    left.id.localeCompare(right.id),
  )
}

export function hasPositiveSavedBalance(balance: string): boolean {
  const minorUnits = toMinorUnits(balance)
  return minorUnits !== null && minorUnits > 0n
}

export function savedCashFitsBalance(amount: string, balance: string): boolean {
  const amountMinorUnits = toMinorUnits(amount)
  const balanceMinorUnits = toMinorUnits(balance)
  return amountMinorUnits !== null && balanceMinorUnits !== null &&
    amountMinorUnits > 0n && balanceMinorUnits > 0n && amountMinorUnits <= balanceMinorUnits
}
