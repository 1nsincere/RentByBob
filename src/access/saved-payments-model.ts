import type { CashAcknowledgmentData } from './CashAcknowledgment'

function toMinorUnits(value: string): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}

// ended_on/end_reason and cash reversal are null when absent (including before migration 202610270001 is applied).
export type SavedAgreement = { id:string; tenant_id:string; unit_id:string; move_in:string; rent:string; balance:string; ended_on:string|null; end_reason:string|null }
export type SavedUnit = { id:string; label:string; building_id:string }
export type SavedCharge = StatementCharge & { agreement_id:string }
type Cash = StatementCash & { agreement_id:string }
export type SavedCashRecord = Cash
export type SavedCheck = { id:string; agreement_id:string; reference:string; amount:string; received_on:string; check_date:string; collector:'Bob'|'James'; status:'received'|'deposited'|'cleared'|'returned'|'reversed'; received_by:string; received_at:string; events:{action:string;reason:string;actor_id:string;occurred_at:string}[] }
export type SavedHandover = { id:string; clerk_id:string; handover_on:string; expected_cash:string; expected_checks:string; actual_cash:string; actual_checks:string; difference_reason:string|null; recorded_by:string; recorded_at:string }
export type RentWorkspaceSnapshot = {
  agreements:SavedAgreement[]
  units:SavedUnit[]
  charges:SavedCharge[]
  cash:Cash[]
  verifiers:{user_id:string}[]
  buildings:{id:string;label:string}[]
  checks:SavedCheck[]
  handovers:SavedHandover[]
  clerks:{user_id:string}[]
}

export type RentWorkspaceTenant = { id: string }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

function minorUnits(value: unknown, allowZero: boolean): value is string {
  if (typeof value !== 'string') return false
  const parsed = toMinorUnits(value)
  return parsed !== null && (allowZero || parsed > 0n)
}

function checkedMinorUnits(value: string): bigint {
  const parsed = toMinorUnits(value)
  if (parsed === null) throw new Error('Invalid rent workspace response')
  return parsed
}

function validAllocation(value: unknown): value is StatementAllocation {
  return record(value) && validDate(value.month) && value.month.endsWith('-01') && minorUnits(value.amount, false)
}

export function validAcknowledgment(value: unknown): value is CashAcknowledgmentData {
  return record(value) &&
    requiredString(value.number) &&
    requiredString(value.tenant) &&
    requiredString(value.building) &&
    requiredString(value.room) &&
    requiredString(value.property) &&
    minorUnits(value.amount, false) &&
    validDate(value.received_on) &&
    requiredString(value.collector) &&
    validTimestamp(value.issued_at) &&
    minorUnits(value.balance_at_issuance, true) &&
    Array.isArray(value.allocations) &&
    value.allocations.every(validAllocation) &&
    (value.advance_credit === undefined || minorUnits(value.advance_credit, true)) &&
    // Months paid plus any advance credit kept must equal the cash received.
    value.allocations.reduce((total, allocation) => total + checkedMinorUnits(allocation.amount), 0n) + (value.advance_credit === undefined ? 0n : checkedMinorUnits(value.advance_credit as string)) === checkedMinorUnits(value.amount)
}

export function parseRentWorkspaceSnapshot(value: unknown, tenants?: readonly RentWorkspaceTenant[]): RentWorkspaceSnapshot {
  if (!record(value) ||
    !Array.isArray(value.agreements) ||
    !Array.isArray(value.units) ||
    !Array.isArray(value.charges) ||
    !Array.isArray(value.cash) ||
    !Array.isArray(value.verifiers) ||
    !Array.isArray(value.buildings) || !Array.isArray(value.checks) ||
    !Array.isArray(value.handovers) || !Array.isArray(value.clerks)) {
    throw new Error('Invalid rent workspace response')
  }

  const checks = value.checks.map(item => {
    if (!record(item) || !validUuid(item.id) || !validUuid(item.agreement_id) ||
      typeof item.reference !== 'string' || !/^CHK-[0-9]{4,}$/.test(item.reference) || !minorUnits(item.amount,false) || !validDate(item.received_on) || !validDate(item.check_date) ||
      (item.collector !== 'Bob' && item.collector !== 'James') ||
      !['received','deposited','cleared','returned','reversed'].includes(String(item.status)) ||
      !validUuid(item.received_by) || !validTimestamp(item.received_at) || !Array.isArray(item.events) ||
      !item.events.every(e => record(e) && ['received','deposited','cleared','returned','reversed'].includes(String(e.action)) && requiredString(e.reason) && validUuid(e.actor_id) && validTimestamp(e.occurred_at))) {
      throw new Error('Invalid rent workspace response')
    }
    return item as unknown as SavedCheck
  })
  const handovers = value.handovers.map(item => {
    if (!record(item) || !validUuid(item.id) || !validUuid(item.clerk_id) || !validDate(item.handover_on) ||
      !minorUnits(item.expected_cash,true) || !minorUnits(item.expected_checks,true) || !minorUnits(item.actual_cash,true) ||
      !minorUnits(item.actual_checks,true) || !(item.difference_reason === null || (typeof item.difference_reason === 'string' && item.difference_reason.length<=500)) || !validUuid(item.recorded_by) || !validTimestamp(item.recorded_at)) {
      throw new Error('Invalid rent workspace response')
    }
    return item as unknown as SavedHandover
  })
  const clerks = value.clerks.map(item => {
    if (!record(item) || !validUuid(item.user_id)) throw new Error('Invalid rent workspace response')
    return {user_id:item.user_id}
  })

  const agreements = value.agreements.map(item => {
    if (!record(item) || !validUuid(item.id) || !validUuid(item.tenant_id) || !validUuid(item.unit_id) ||
      !validDate(item.move_in) || !minorUnits(item.rent, false) || !minorUnits(item.balance, true) ||
      !(item.ended_on == null || (validDate(item.ended_on) && item.ended_on >= item.move_in)) ||
      !(item.end_reason == null || (typeof item.end_reason === 'string' && item.end_reason.trim().length > 0 && item.end_reason.length <= 500)) ||
      (item.ended_on == null) !== (item.end_reason == null)) {
      throw new Error('Invalid rent workspace response')
    }
    return {
      id:item.id,
      tenant_id:item.tenant_id,
      unit_id:item.unit_id,
      move_in:item.move_in,
      rent:item.rent,
      balance:item.balance,
      ended_on:(item.ended_on ?? null) as string|null,
      end_reason:(item.end_reason ?? null) as string|null,
    }
  })
  const units = value.units.map(item => {
    if (!record(item) || !validUuid(item.id) || !validUuid(item.building_id) || !requiredString(item.label)) {
      throw new Error('Invalid rent workspace response')
    }
    return { id:item.id, label:item.label, building_id:item.building_id }
  })
  const buildings = value.buildings.map(item => {
    if (!record(item) || !validUuid(item.id) || !requiredString(item.label)) {
      throw new Error('Invalid rent workspace response')
    }
    return { id:item.id, label:item.label }
  })
  const charges = value.charges.map(item => {
    if (!record(item) || !validUuid(item.id) || !validUuid(item.agreement_id) ||
      !validDate(item.rental_month) || !item.rental_month.endsWith('-01') || !validDate(item.due_date) ||
      !minorUnits(item.amount, false) || !minorUnits(item.remaining, true) ||
      checkedMinorUnits(item.remaining) > checkedMinorUnits(item.amount)) {
      throw new Error('Invalid rent workspace response')
    }
    return {
      id:item.id,
      agreement_id:item.agreement_id,
      rental_month:item.rental_month,
      due_date:item.due_date,
      amount:item.amount,
      remaining:item.remaining,
    }
  })
  const cash = value.cash.map(item => {
    if (!record(item) || !validUuid(item.id) || !validUuid(item.agreement_id) ||
      !minorUnits(item.amount, false) || !validDate(item.received_on) ||
      (item.collector !== 'Bob' && item.collector !== 'James') ||
      !(item.confirmed_at === null || validTimestamp(item.confirmed_at)) ||
      !(item.acknowledgment === null || validAcknowledgment(item.acknowledgment)) ||
      (item.confirmed_at === null) !== (item.acknowledgment === null) ||
      !(item.reversal == null || (record(item.reversal) && requiredString(item.reversal.reason) && validTimestamp(item.reversal.reversed_at) && item.confirmed_at !== null))) {
      throw new Error('Invalid rent workspace response')
    }
    if (item.acknowledgment && (
      item.acknowledgment.amount !== item.amount ||
      item.acknowledgment.received_on !== item.received_on ||
      item.acknowledgment.collector !== item.collector
    )) {
      throw new Error('Invalid rent workspace response')
    }
    return {
      id:item.id,
      agreement_id:item.agreement_id,
      amount:item.amount,
      received_on:item.received_on,
      collector:item.collector,
      confirmed_at:item.confirmed_at,
      acknowledgment:item.acknowledgment,
      reversal:item.reversal == null ? null : { reason:String(item.reversal.reason), reversed_at:String(item.reversal.reversed_at) },
    }
  })
  const verifiers = value.verifiers.map(item => {
    if (!record(item) || !validUuid(item.user_id)) throw new Error('Invalid rent workspace response')
    return { user_id:item.user_id }
  })

  const agreementIds = new Set(agreements.map(agreement => agreement.id))
  const tenantIds = tenants ? new Set(tenants.map(tenant => tenant.id)) : null
  const buildingIds = new Set(buildings.map(building => building.id))
  const unique = (ids: string[]) => new Set(ids).size === ids.length
  if (!unique(agreements.map(item => item.id)) || !unique(units.map(item => item.id)) ||
    !unique(charges.map(item => item.id)) || !unique(cash.map(item => item.id)) ||
    !unique(buildings.map(item => item.id)) || !unique(verifiers.map(item => item.user_id)) ||
    (tenantIds !== null && agreements.some(agreement => !tenantIds.has(agreement.tenant_id))) ||
    units.some(unit => !buildingIds.has(unit.building_id)) ||
    charges.some(charge => !agreementIds.has(charge.agreement_id)) ||
    cash.some(payment => !agreementIds.has(payment.agreement_id)) || checks.some(check => !agreementIds.has(check.agreement_id)) ||
    !unique(checks.map(check=>check.id)) || !unique(checks.map(check=>check.reference)) || !unique(handovers.map(item=>item.id)) || !unique(clerks.map(item=>item.user_id))) {
    throw new Error('Invalid rent workspace response')
  }
  for (const agreement of agreements) {
    const outstanding = charges
      .filter(charge => charge.agreement_id === agreement.id)
      .reduce((total, charge) => total + checkedMinorUnits(charge.remaining), 0n)
    if (outstanding !== checkedMinorUnits(agreement.balance)) throw new Error('Invalid rent workspace response')
  }

  return { agreements, units, charges, cash, verifiers, buildings, checks, handovers, clerks }
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
  reversal?: { reason: string; reversed_at: string } | null
}

export type StatementEvent =
  | { id: string; kind: 'charge'; date: string; month: string; amount: string; remaining: string }
  | { id: string; kind: 'payment'; date: string; amount: string; collector: string; allocations: StatementAllocation[]; acknowledgment: StatementAcknowledgment | null; reversal: { reason: string; reversed_at: string } | null }

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
      reversal: payment.reversal ?? null,
    })),
  ]

  return events.sort((left, right) =>
    left.date.localeCompare(right.date) ||
    (left.kind === right.kind ? 0 : left.kind === 'charge' ? -1 : 1) ||
    left.id.localeCompare(right.id),
  )
}

// "Building · Room": rooms repeat across buildings (Building 1 and 2 both have Room 01), so lists always name both.
export function roomName(data: Pick<RentWorkspaceSnapshot, 'units' | 'buildings'>, unitId: string, unavailable = 'Room unavailable') {
  const unit = data.units.find(item => item.id === unitId)
  const building = unit && data.buildings.find(item => item.id === unit.building_id)
  return unit ? `${building?.label ?? 'Building'} · ${unit.label}` : unavailable
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
