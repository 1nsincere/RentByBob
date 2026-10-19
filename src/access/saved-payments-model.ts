function toMinorUnits(value: string): bigint | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
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
