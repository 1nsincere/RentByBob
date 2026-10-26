import type { CashAcknowledgmentData } from './CashAcknowledgment'
import { validAcknowledgment } from './saved-payments-model.ts'

// Renter self-service view returned by public.read_renter_account(). Money stays as exact decimal
// strings and is compared in integer centavos; nothing here computes a balance the database did not return.
export type RenterCharge = { id: string; rental_month: string; due_date: string; amount: string; remaining: string }
export type RenterMonthAllocation = { month: string; amount: string }
export type RenterPayment =
  | { kind: 'cash'; id: string; amount: string; received_on: string; confirmed_at: string; months: RenterMonthAllocation[]; acknowledgment: CashAcknowledgmentData }
  | { kind: 'check'; id: string; reference: string; amount: string; received_on: string; confirmed_at: string; months: RenterMonthAllocation[] }
export type RenterUnconfirmed =
  | { kind: 'cash'; id: string; amount: string; received_on: string }
  | { kind: 'check'; id: string; reference: string; amount: string; received_on: string; status: 'received' | 'deposited' }
export type RenterAgreement = {
  id: string; building: string; room: string; move_in: string; rent: string; balance: string
  charges: RenterCharge[]; payments: RenterPayment[]; unconfirmed: RenterUnconfirmed[]
}
export type RenterTenant = { id: string; display_name: string; kind: 'individual' | 'business'; property: string; agreements: RenterAgreement[] }
export type RenterAccount = { tenants: RenterTenant[] }
export type ChargeStatus = 'paid' | 'partly-paid' | 'unpaid'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))

export function toCentavos(value: string): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value)
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}
export function fromCentavos(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`
}
function money(value: unknown, allowZero: boolean): value is string {
  if (typeof value !== 'string') return false
  const parsed = toCentavos(value)
  return parsed !== null && (allowZero || parsed > 0n)
}
const centavos = (value: string) => toCentavos(value) as bigint

function validMonths(value: unknown, amount: string): value is RenterMonthAllocation[] {
  return Array.isArray(value) &&
    value.every(item => record(item) && date(item.month) && item.month.endsWith('-01') && money(item.amount, false)) &&
    value.reduce((total, item) => total + centavos(item.amount), 0n) === centavos(amount)
}

function validCharge(value: unknown): value is RenterCharge {
  return record(value) && uuid(value.id) && date(value.rental_month) && value.rental_month.endsWith('-01') && date(value.due_date) &&
    money(value.amount, false) && money(value.remaining, true) && centavos(value.remaining) <= centavos(value.amount)
}

function validPayment(value: unknown): value is RenterPayment {
  if (!record(value) || !uuid(value.id) || !money(value.amount, false) || !date(value.received_on) || !timestamp(value.confirmed_at)) return false
  if (!validMonths(value.months, value.amount)) return false
  if (value.kind === 'cash') return validAcknowledgment(value.acknowledgment) && value.acknowledgment.amount === value.amount
  return value.kind === 'check' && text(value.reference)
}

function validUnconfirmed(value: unknown): value is RenterUnconfirmed {
  if (!record(value) || !uuid(value.id) || !money(value.amount, false) || !date(value.received_on)) return false
  if (value.kind === 'cash') return true
  return value.kind === 'check' && text(value.reference) && (value.status === 'received' || value.status === 'deposited')
}

function validAgreement(value: unknown): value is RenterAgreement {
  if (!record(value) || !uuid(value.id) || !text(value.building) || !text(value.room) || !date(value.move_in) ||
    !money(value.rent, false) || !money(value.balance, true) ||
    !Array.isArray(value.charges) || !value.charges.every(validCharge) ||
    !Array.isArray(value.payments) || !value.payments.every(validPayment) ||
    !Array.isArray(value.unconfirmed) || !value.unconfirmed.every(validUnconfirmed)) return false
  // The returned balance must equal the sum of what is still owed on each recorded charge.
  return value.charges.reduce((total, charge) => total + centavos(charge.remaining), 0n) === centavos(value.balance)
}

export function parseRenterAccount(value: unknown): RenterAccount {
  if (!record(value) || !Array.isArray(value.tenants) || !value.tenants.every(tenant =>
    record(tenant) && uuid(tenant.id) && text(tenant.display_name) && (tenant.kind === 'individual' || tenant.kind === 'business') &&
    text(tenant.property) && Array.isArray(tenant.agreements) && tenant.agreements.every(validAgreement))) {
    throw new Error('Invalid renter account response')
  }
  return value as RenterAccount
}

export function chargeStatus(charge: RenterCharge): ChargeStatus {
  const remaining = centavos(charge.remaining)
  return remaining === 0n ? 'paid' : remaining < centavos(charge.amount) ? 'partly-paid' : 'unpaid'
}

// Descriptive summary only: the oldest recorded charge with money still owed. No overdue or late-fee rule is implied.
export function summarizeAgreement(agreement: RenterAgreement) {
  const owing = agreement.charges.filter(charge => centavos(charge.remaining) > 0n)
  return {
    oldestUnpaid: owing[0] ?? null,
    monthsWithBalance: owing.length,
    unconfirmedTotal: fromCentavos(agreement.unconfirmed.reduce((total, item) => total + centavos(item.amount), 0n)),
    payments: [...agreement.payments].sort((left, right) => right.received_on.localeCompare(left.received_on) || left.id.localeCompare(right.id)),
  }
}
