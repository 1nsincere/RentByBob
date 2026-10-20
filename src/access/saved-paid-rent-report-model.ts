import type { RentWorkspaceSnapshot, SavedCharge, SavedCashRecord } from './saved-payments-model'

type ReportTenant = { id: string; display_name: string }

type ReportLabels = {
  tenantUnavailable: string
  buildingUnavailable: string
  roomUnavailable: string
}

type OutstandingCharge = {
  charge: SavedCharge
  tenant: string
  location: string
}

type ArrearsRow = {
  id: string
  tenant: string
  location: string
  periods: string[]
  total: bigint
}

export type SavedPaidRentReportData = {
  agreementById: Map<string, RentWorkspaceSnapshot['agreements'][number]>
  unitById: Map<string, RentWorkspaceSnapshot['units'][number]>
  buildingById: Map<string, RentWorkspaceSnapshot['buildings'][number]>
  tenantById: Map<string, ReportTenant>
  confirmed: SavedCashRecord[]
  cashTotal: bigint
  paidTenantIds: Set<string>
  outstanding: OutstandingCharge[]
  outstandingTotal: bigint
  arrears: ArrearsRow[]
}

function moneyMinor(value: string): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function moneyFromMinor(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`
}

export function buildSavedPaidRentReport(
  data: RentWorkspaceSnapshot,
  tenants: readonly ReportTenant[],
  receiptMonth: string,
  rentMonth: string,
  labels: ReportLabels,
): SavedPaidRentReportData {
  const agreementById = new Map(data.agreements.map(agreement => [agreement.id, agreement]))
  const unitById = new Map(data.units.map(unit => [unit.id, unit]))
  const buildingById = new Map(data.buildings.map(building => [building.id, building]))
  const tenantById = new Map(tenants.map(tenant => [tenant.id, tenant]))
  const confirmed = data.cash.filter(payment => payment.confirmed_at !== null && payment.received_on.slice(0, 7) === receiptMonth)
  const cashTotal = confirmed.reduce((sum, payment) => sum + moneyMinor(payment.amount), 0n)
  const paidTenantIds = new Set(confirmed.flatMap(payment => {
    const agreement = agreementById.get(payment.agreement_id)
    return agreement ? [agreement.tenant_id] : []
  }))
  const outstanding = data.charges.filter(charge => charge.rental_month.slice(0, 7) === rentMonth && moneyMinor(charge.remaining) > 0n)
    .map(charge => ({
      charge,
      ...locationFor(charge, agreementById, unitById, buildingById, tenantById, labels),
    }))
    .sort((left, right) => left.charge.due_date.localeCompare(right.charge.due_date) || left.tenant.localeCompare(right.tenant))
  const outstandingTotal = outstanding.reduce((sum, row) => sum + moneyMinor(row.charge.remaining), 0n)
  const byTenant = new Map<string, { tenant: string; location: string; months: Set<string>; total: bigint }>()
  for (const charge of data.charges) {
    if (moneyMinor(charge.remaining) === 0n) continue
    const agreement = agreementById.get(charge.agreement_id)
    if (!agreement) continue
    const unit = unitById.get(agreement.unit_id)
    const building = unit && buildingById.get(unit.building_id)
    const tenant = tenantById.get(agreement.tenant_id)?.display_name ?? labels.tenantUnavailable
    const current = byTenant.get(agreement.tenant_id) ?? {
      tenant,
      location: `${building?.label ?? labels.buildingUnavailable} / ${unit?.label ?? labels.roomUnavailable}`,
      months: new Set<string>(),
      total: 0n,
    }
    current.months.add(charge.rental_month)
    current.total += moneyMinor(charge.remaining)
    byTenant.set(agreement.tenant_id, current)
  }
  const arrears = [...byTenant.entries()].filter(([, row]) => row.months.size >= 2)
    .map(([id, row]) => ({ id, ...row, periods: [...row.months].sort() }))
    .sort((left, right) => right.periods.length - left.periods.length || left.tenant.localeCompare(right.tenant))
  return { agreementById, unitById, buildingById, tenantById, confirmed, cashTotal, paidTenantIds, outstanding, outstandingTotal, arrears }
}

function locationFor(
  charge: SavedCharge,
  agreementById: Map<string, RentWorkspaceSnapshot['agreements'][number]>,
  unitById: Map<string, RentWorkspaceSnapshot['units'][number]>,
  buildingById: Map<string, RentWorkspaceSnapshot['buildings'][number]>,
  tenantById: Map<string, ReportTenant>,
  labels: ReportLabels,
) {
  const agreement = agreementById.get(charge.agreement_id)
  const unit = agreement && unitById.get(agreement.unit_id)
  const building = unit && buildingById.get(unit.building_id)
  return {
    tenant: agreement ? tenantById.get(agreement.tenant_id)?.display_name ?? labels.tenantUnavailable : labels.tenantUnavailable,
    location: `${building?.label ?? labels.buildingUnavailable} / ${unit?.label ?? labels.roomUnavailable}`,
  }
}
