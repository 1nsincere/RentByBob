import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paidRentCsv, safeCell } from '../src/access/paid-rent-csv.ts'

test('cells that could run as spreadsheet formulas are neutralised and quoted safely', () => {
  assert.equal(safeCell('=HYPERLINK("http://example.invalid","x")'), `"'=HYPERLINK(""http://example.invalid"",""x"")"`)
  assert.equal(safeCell('+63 912'), "'+63 912")
  assert.equal(safeCell('-1'), "'-1")
  assert.equal(safeCell('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(safeCell('Room 1, Building A'), '"Room 1, Building A"')
  assert.equal(safeCell('Line\nbreak'), '"Line\nbreak"')
  assert.equal(safeCell('5000.25'), '5000.25', 'plain amounts stay numeric')
})

test('export mirrors the report with exact amounts, BOM and CRLF lines', () => {
  const csv = paidRentCsv({
    receiptMonth: '2024-04', rentMonth: '2024-04',
    confirmed: [{ renter: 'Sample, Alex', space: 'Building A / Room 1', receivedOn: '2024-04-02', amount: '6000.25', months: ['2024-03', '2024-04'], receipt: 'RBB-1' }],
    confirmedTotal: '6000.25',
    outstanding: [{ renter: '=cmd', space: 'Building A / Room 2', month: '2024-04', dueDate: '2024-04-16', charged: '800.00', remaining: '100.00' }],
    outstandingTotal: '100.00',
  })
  assert.ok(csv.startsWith('﻿'))
  const lines = csv.slice(1).split('\r\n')
  assert.equal(lines[1], 'Renter,Rental space,Date received,Amount (PHP),Rent months covered,Receipt number')
  assert.equal(lines[2], '"Sample, Alex",Building A / Room 1,2024-04-02,6000.25,2024-03 2024-04,RBB-1')
  assert.equal(lines[3], 'Total confirmed cash,,,6000.25,1 payment(s),')
  assert.equal(lines[7], "'=cmd,Building A / Room 2,2024-04,2024-04-16,800.00,100.00")
  assert.equal(lines[8], 'Total still due,,,,,100.00')
  assert.equal(lines.at(-1), '')
})
