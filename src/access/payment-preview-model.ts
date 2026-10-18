export type Charge = { id: string; tenant: string; room: string; period: string; due: string; cents: bigint }
export type Receipt = { id: string; paymentId?: string; charge: string; date: string; cents: bigint; status: 'Settled cash' | 'Pending report' | 'Uncleared check'; reference: string }
export function confirmedPayments(receipts: Receipt[], month: string) {
  const groups = new Map<string, { id: string; date: string; cents: bigint; allocations: Receipt[] }>()
  for (const receipt of receipts) {
    if (receipt.status !== 'Settled cash' || receipt.date.slice(0, 7) !== month) continue
    const id = receipt.paymentId ?? receipt.id
    const group = groups.get(id) ?? { id, date: receipt.date, cents: 0n, allocations: [] }
    group.cents += receipt.cents
    group.allocations.push(receipt)
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}
export function parseAmount(value: string): bigint {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a positive amount with up to two decimal places.')
  const [whole, fraction = ''] = value.trim().split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents <= 0n) throw new Error('Amount must be greater than zero.')
  return cents
}
export function pesos(cents: bigint) { return `₱${(cents / 100n).toLocaleString('en-PH')}.${(cents % 100n).toString().padStart(2, '0')}` }
export function remaining(charge: Charge, receipts: Receipt[]) { return charge.cents - receipts.filter(r => r.charge === charge.id && r.status === 'Settled cash').reduce((sum, r) => sum + r.cents, 0n) }
export function validateReceipt(charge: Charge, receipts: Receipt[], receipt: Receipt) {
  if (receipt.cents <= 0n || receipt.cents > remaining(charge, receipts)) throw new Error('Enter an amount no greater than the remaining balance. Advance payments are not configured.')
  if (receipts.some(r => r.id === receipt.id)) throw new Error('This entry is already recorded.')
}
export function philippineToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
export function validBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function anniversaryDue(moveIn: string, month: string) {
  if (!validBusinessDate(moveIn) || !/^\d{4}-\d{2}$/.test(month) || !validBusinessDate(month + '-01')) throw new Error('Choose a valid move-in date and rent month.')
  const [year, m] = month.split('-').map(Number)
  const day = Number(moveIn.slice(8))
  if (m < 1 || m > 12 || day < 1 || day > 31 || month < moveIn.slice(0, 7)) throw new Error('Choose a rent month on or after move-in.')
  return `${month}-${String(Math.min(day, new Date(Date.UTC(year, m, 0)).getUTCDate())).padStart(2, '0')}`
}
export function oldestFirst(charges: Charge[], receipts: Receipt[], amount: bigint) {
  if (amount <= 0n) throw new Error('Enter an amount greater than zero.')
  let left = amount
  const allocations: { charge: string; cents: bigint }[] = []
  for (const charge of [...charges].sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))) {
    const owed = remaining(charge, receipts)
    const cents = owed < left ? owed : left
    if (cents > 0n) { allocations.push({ charge: charge.id, cents }); left -= cents }
  }
  if (left > 0n) throw new Error('This exceeds the unpaid rent. Advance payments are not set up yet.')
  return allocations
}
