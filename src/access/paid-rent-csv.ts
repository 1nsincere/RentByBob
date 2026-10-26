// CSV export of the saved Paid rent report for Excel. Amounts are exact decimal strings (no currency symbol)
// so totals stay numeric; dates are ISO. Cells that a spreadsheet could treat as a formula are neutralised.
export type PaidRentCsvInput = {
  receiptMonth: string
  rentMonth: string
  confirmed: { renter: string; space: string; receivedOn: string; amount: string; months: string[]; receipt: string }[]
  confirmedTotal: string
  outstanding: { renter: string; space: string; month: string; dueDate: string; charged: string; remaining: string }[]
  outstandingTotal: string
}

// A leading = + - @ (or tab/carriage return) can start a formula in Excel/LibreOffice/Sheets.
export function safeCell(value: string): string {
  const neutral = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral
}

const row = (cells: string[]) => cells.map(safeCell).join(',')

export function paidRentCsv(input: PaidRentCsvInput): string {
  const lines = [
    row([`Confirmed cash received in ${input.receiptMonth} (pending cash and uncleared checks excluded)`]),
    row(['Renter', 'Rental space', 'Date received', 'Amount (PHP)', 'Rent months covered', 'Receipt number']),
    ...input.confirmed.map(item => row([item.renter, item.space, item.receivedOn, item.amount, item.months.join(' '), item.receipt])),
    row(['Total confirmed cash', '', '', input.confirmedTotal, `${input.confirmed.length} payment(s)`, '']),
    '',
    row([`Recorded rent still due for ${input.rentMonth} (months without a recorded charge are not listed)`]),
    row(['Renter', 'Rental space', 'Rent month', 'Due date', 'Rent charged (PHP)', 'Still due (PHP)']),
    ...input.outstanding.map(item => row([item.renter, item.space, item.month, item.dueDate, item.charged, item.remaining])),
    row(['Total still due', '', '', '', '', input.outstandingTotal]),
  ]
  // BOM so Excel opens UTF-8 names correctly; CRLF line endings for Windows spreadsheet tools.
  return '﻿' + lines.join('\r\n') + '\r\n'
}
