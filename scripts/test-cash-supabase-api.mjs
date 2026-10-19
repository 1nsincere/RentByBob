import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'

const apiUrl = process.env.CASH_TEST_API_URL
const anonKey = process.env.CASH_TEST_ANON_KEY
const serviceKey = process.env.CASH_TEST_SERVICE_KEY
const password = process.env.CASH_TEST_PASSWORD
const propertyId = process.env.CASH_TEST_PROPERTY_ID
const tenantId = process.env.CASH_TEST_TENANT_ID
const unitId = process.env.CASH_TEST_UNIT_ID
const auditCashId = process.env.CASH_TEST_AUDIT_CASH_ID
const auditCheckId = process.env.CASH_TEST_AUDIT_CHECK_ID
const ownerEmail = process.env.CASH_TEST_OWNER_EMAIL
const clerkEmail = process.env.CASH_TEST_CLERK_EMAIL
const otherEmail = process.env.CASH_TEST_OTHER_EMAIL
const uiUrl = process.env.CASH_TEST_UI_URL

process.on('uncaughtException', error => {
  console.error(`Cash API integration error (${error.name}): ${error.message}`)
  process.exitCode = 1
})
process.on('unhandledRejection', error => {
  console.error(`Cash API integration error: ${error instanceof Error ? error.message : 'unexpected failure'}`)
  process.exitCode = 1
})

function requireConfig() {
  for (const [name, value] of Object.entries({ apiUrl, anonKey, serviceKey, password, propertyId, tenantId, unitId, auditCashId, auditCheckId, ownerEmail, clerkEmail, otherEmail })) {
    assert.ok(value, `Missing isolated cash test setting: ${name}`)
  }
  assert.match(apiUrl, /^http:\/\/127\.0\.0\.1:\d+$/, 'Cash API tests must use loopback only')
  assert.match(ownerEmail + clerkEmail + otherEmail, /example\.invalid/)
}

async function request(path, { key = anonKey, token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  return { response, data }
}

async function createUser(email) {
  const { response, data } = await request('/auth/v1/admin/users', {
    key: serviceKey,
    token: serviceKey,
    method: 'POST',
    body: { email, password, email_confirm: true },
  })
  assert.equal(response.status, 200, `Local Auth fixture creation returned HTTP ${response.status}`)
  const userId = data.user?.id ?? data.id
  assert.ok(userId, 'Local Auth did not return a test user ID')
  return userId
}

function decodeBase32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let value = 0
  let bits = 0
  const bytes = []
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character)
    assert.notEqual(digit, -1, 'Local MFA returned an invalid test TOTP secret')
    value = (value << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 255)
      value &= (1 << bits) - 1
    }
  }
  return Buffer.from(bytes)
}

function totp(secret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  const binary = ((digest[offset] & 127) << 24)
    | ((digest[offset + 1] & 255) << 16)
    | ((digest[offset + 2] & 255) << 8)
    | (digest[offset + 3] & 255)
  return String(binary % 1_000_000).padStart(6, '0')
}

async function signIn(email) {
  const { response, data } = await request('/auth/v1/token?grant_type=password', {
    body: { email, password },
    method: 'POST',
  })
  assert.equal(response.status, 200, `Local password sign-in returned HTTP ${response.status}`)
  return data
}

async function enrollMfa(session) {
  const enrolled = await request('/auth/v1/factors', {
    token: session.access_token,
    method: 'POST',
    body: { factor_type: 'totp', friendly_name: 'disposable-cash-integration' },
  })
  assert.equal(enrolled.response.status, 200, 'Disposable TOTP enrollment failed')
  const challenge = await request(`/auth/v1/factors/${enrolled.data.id}/challenge`, {
    token: session.access_token,
    method: 'POST',
    body: {},
  })
  assert.equal(challenge.response.status, 200, 'Disposable TOTP challenge failed')
  const verified = await request(`/auth/v1/factors/${enrolled.data.id}/verify`, {
    token: session.access_token,
    method: 'POST',
    body: { challenge_id: challenge.data.id, code: totp(enrolled.data.totp.secret) },
  })
  assert.equal(verified.response.status, 200, 'Disposable TOTP verification failed')
  assert.ok(verified.data.access_token, 'MFA verification did not issue an authenticated session')
  return { initial: session, aal2: verified.data, secret: enrolled.data.totp.secret }
}

async function rpc(name, args, token) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })
}

function expectDenied(result, description) {
  assert.ok(result.response.status >= 400, `${description} unexpectedly succeeded`)
}

function pass(message) {
  console.log(`PASS: ${message}`)
}

function totalCentavos(amounts) {
  return amounts.reduce((total, amount) => {
    const match = /^(\d+)\.(\d{2})$/.exec(amount)
    assert.ok(match, `Expected exact two-decimal database money string, received ${amount}`)
    return total + BigInt(match[1]) * 100n + BigInt(match[2])
  }, 0n)
}

async function verifySavedCashBrowserFlow(ownerSecret, clerkSecret, agreementId) {
  assert.ok(uiUrl, 'Missing isolated cash UI address')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()
  const cashRecordRequests = []
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/rpc/record_rent_cash')) cashRecordRequests.push(request.url())
  })
  try {
    await page.goto(uiUrl)
    await page.getByLabel('Email address', { exact: true }).fill(ownerEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Staff security check' })).toBeVisible()
    await page.getByLabel('Six-digit authenticator code').fill(totp(ownerSecret))
    await page.getByRole('button', { name: 'Verify code', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Owner workspace' })).toBeVisible()

    await page.getByRole('link', { name: 'Payments and balances', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved rent and cash' })).toBeVisible()
    const ownerQueue = page.locator('.cash-verification-queue')
    await expect(ownerQueue.getByRole('heading', { name: 'Cash awaiting confirmation' })).toBeVisible()
    await expect(ownerQueue.locator('.cash-queue-row')).toHaveCount(2)
    await expect(ownerQueue.getByRole('button', { name: 'Review confirmation', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Saved workflow readiness' })).toBeVisible()
    await expect(page.getByText('An owner-designated verifier is assigned.', { exact: true })).toBeVisible()
    await page.getByLabel('Tenant / room agreement').selectOption(agreementId)
    const balance = page.locator('.simple-balance strong')
    await expect(balance).toHaveText('₱6,000.25')
    const cashRowCount = await page.locator('.cash-row').count()
    await page.getByLabel('Amount (PHP)').fill('6000.26')
    await page.getByLabel('Actual payment date').fill('2024-04-02')
    await page.getByLabel('Received by').selectOption('Bob')
    await page.getByRole('button', { name: 'Save pending cash', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'no cash report was saved' })).toBeVisible()
    assert.equal(await page.locator('.cash-row').count(), cashRowCount, 'Over-balance input must not create a pending cash record')
    assert.equal(cashRecordRequests.length, 0, 'Over-balance input must not call the cash-record RPC')
    await expect(balance).toHaveText('₱6,000.25')
    pass('Cash entry above the exact remaining balance is rejected before any RPC or pending record')

    await page.getByLabel('Amount (PHP)').fill('100.00')
    await page.getByRole('button', { name: 'Save pending cash', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved to the database.' })).toBeVisible()
    assert.equal(cashRecordRequests.length, 1, 'Valid pending cash should call the RPC exactly once')
    await expect(balance).toHaveText('₱6,000.25')
    const queueRow = page.locator('.cash-verification-queue .cash-queue-row').filter({ hasText: '₱100.00' })
    await expect(queueRow).toContainText('Sample API test renter')
    await expect(queueRow).toContainText('Test building / Test room')
    await expect(queueRow).toContainText('Pending verification')
    const statement = page.locator('.account-statement')
    await expect(statement.getByRole('heading', { name: 'Account statement' })).toBeVisible()
    await expect(statement.locator('.statement-pending')).toContainText('₱100.00')
    await expect(statement.locator('.statement-pending')).toContainText('not included in the rent balance')
    await expect(statement.locator('.statement-event').filter({ hasText: '₱100.00' })).toHaveCount(0)
    const pendingStatementRow = page.locator('.statement-pending').getByText('₱100.00', { exact: false })
    await expect(pendingStatementRow).toBeVisible()
    pass('Authenticated owner UI saves cash as pending without lowering the balance')

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await page.getByLabel('Email address', { exact: true }).fill(clerkEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Staff security check' })).toBeVisible()
    await page.getByLabel('Six-digit authenticator code').fill(totp(clerkSecret))
    await page.getByRole('button', { name: 'Verify code', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Clerk workspace' })).toBeVisible()

    await page.getByRole('link', { name: 'Payments and balances', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved rent and cash' })).toBeVisible()
    const pendingRow = page.locator('.cash-verification-queue .cash-queue-row').filter({ hasText: '₱100.00' })
    await expect(pendingRow).toContainText('Sample API test renter')
    await pendingRow.getByRole('button', { name: 'Review confirmation', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Confirm cash received?' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirm and issue acknowledgment', exact: true }).click()
    const acknowledgment = page.getByRole('dialog')
    await expect(acknowledgment.getByRole('heading', { name: 'Cash Payment Acknowledgment' })).toBeVisible()
    await expect(acknowledgment.locator('.pos-total strong')).toHaveText('₱100.00')
    await page.getByRole('button', { name: 'Close receipt', exact: true }).click()
    await expect(page.locator('.cash-verification-queue .cash-queue-row')).toHaveCount(2)
    await page.getByLabel('Tenant / room agreement').selectOption(agreementId)
    await expect(page.locator('.simple-balance strong')).toHaveText('₱5,900.25')
    const confirmedStatement = page.locator('.account-statement')
    const confirmedStatementRow = confirmedStatement.locator('.statement-event').filter({ hasText: 'Confirmed cash' }).filter({ hasText: '₱100.00' })
    await expect(confirmedStatementRow).toContainText('March 2024')
    await expect(confirmedStatementRow).toContainText('Received')
    pass('Designated clerk UI confirms the pending report and shows its acknowledgment')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Clerk workspace' })).toBeVisible()
    await page.getByRole('link', { name: 'Payments and balances', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved rent and cash' })).toBeVisible()
    await page.getByLabel('Tenant / room agreement').selectOption(agreementId)
    await expect(page.locator('.simple-balance strong')).toHaveText('₱5,900.25')
    const confirmedRow = page.locator('.account-statement .statement-event').filter({ hasText: 'Confirmed cash' }).filter({ hasText: '₱100.00' })
    await expect(confirmedRow.getByText('Confirmed cash', { exact: true })).toBeVisible()
    await confirmedRow.getByRole('button', { name: 'Open acknowledgment', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Cash Payment Acknowledgment' })).toBeVisible()
    await expect(page.getByRole('dialog').locator('.pos-total strong')).toHaveText('₱100.00')
    await page.getByRole('button', { name: 'Close receipt', exact: true }).click()
    const acknowledgmentButton = confirmedRow.getByRole('button', { name: 'Open acknowledgment', exact: true })
    await acknowledgmentButton.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    assert.equal(await acknowledgmentButton.evaluate(element => element.matches(':focus-visible')), true, 'Acknowledgment action must have visible keyboard focus')
    pass('Statement acknowledgment action is keyboard reachable with visible focus')

    const checkSection = page.locator('section.card:has(#checks-heading)')
    await checkSection.getByLabel('Tenant / room', { exact: true }).selectOption(agreementId)
    await checkSection.getByLabel('Amount (PHP)', { exact: true }).fill('200.00')
    await checkSection.getByLabel('Date received', { exact: true }).fill('2024-04-02')
    await checkSection.getByLabel('Date written on check', { exact: true }).fill('2024-04-01')
    await checkSection.getByLabel('Received by', { exact: true }).selectOption('James')
    await checkSection.getByRole('button', { name: 'Save check received', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Saved to the database.' })).toBeVisible()
    const uiCheck = checkSection.locator('.cash-queue-row').filter({ hasText: 'CHK-0004' })
    await expect(uiCheck).toContainText('Received — not settled')
    await expect(page.locator('.simple-balance strong')).toHaveText('â‚±5,900.25')
    pass('Clerk UI records a short-reference check without changing rent balance')

    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await page.getByLabel('Email address', { exact: true }).fill(ownerEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Staff security check' })).toBeVisible()
    await page.getByLabel('Six-digit authenticator code').fill(totp(ownerSecret))
    await page.getByRole('button', { name: 'Verify code', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Owner workspace' })).toBeVisible()
    await page.getByRole('link', { name: 'Payments and balances', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved rent and cash' })).toBeVisible()
    const ownerCheckSection = page.locator('section.card:has(#checks-heading)')
    const ownerUiCheck = ownerCheckSection.locator('.cash-queue-row').filter({ hasText: 'CHK-0004' })
    await ownerUiCheck.getByLabel('Owner note (reason required for reversal)').fill('')
    await ownerUiCheck.getByRole('button', { name: 'Record deposit', exact: true }).click()
    await expect(ownerUiCheck).toContainText('Deposited — awaiting clearance')
    await ownerUiCheck.getByRole('button', { name: 'Confirm bank clearance', exact: true }).click()
    await expect(ownerUiCheck).toContainText('Cleared')
    await expect(page.locator('.simple-balance strong')).toHaveText('â‚±5,700.25')
    pass('Owner UI records deposit and bank clearance; only clearance reduces rent')

    const handoverSection = page.locator('section.card:has(#handover-heading)')
    await handoverSection.getByLabel('Clerk handing over').selectOption(process.env.CASH_TEST_CLERK_ID)
    await handoverSection.getByLabel('Handover date').fill('2024-04-02')
    await handoverSection.getByLabel('Cash the clerk says was handed over (PHP)').fill('0.00')
    await handoverSection.getByLabel('Checks the clerk says were handed over (PHP)').fill('200.00')
    await handoverSection.getByLabel('Cash actually received by owner (PHP)').fill('0.00')
    await handoverSection.getByLabel('Checks actually received by owner (PHP)').fill('200.00')
    await handoverSection.getByRole('button', { name: 'Save handover', exact: true }).click()
    await expect(handoverSection.getByRole('status').filter({ hasText: 'Handover recorded.' })).toBeVisible()
    await expect(page.locator('.simple-balance strong')).toHaveText('â‚±5,700.25')
    pass('Owner UI logs a matching collection handover without changing renter balances')

    for (const width of [390, 320, 160, 768]) {
      await page.setViewportSize({ width, height: 900 })
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        roots: [...document.querySelectorAll('html, body, #root, .shell, .page-shell, .workspace-layout, .workspace-content, .workspace-section, .simple-payments, form.card.rent-setup')].map(element => {
          const rect = element.getBoundingClientRect()
          return `${element.tagName.toLowerCase()}.${typeof element.className === 'string' ? element.className : ''}:x${Math.floor(rect.x)} w${Math.ceil(rect.width)} sw${element.scrollWidth}`
        }),
        scrollables: [...document.querySelectorAll('body *')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => `${element.tagName.toLowerCase()}.${typeof element.className === 'string' ? element.className : ''}:c${element.clientWidth} s${element.scrollWidth}`),
        elements: [...document.querySelectorAll('body *')]
          .map(element => {
            const rect = element.getBoundingClientRect()
            return { element: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className : '', x: Math.floor(rect.x), width: Math.ceil(rect.width), right: Math.ceil(rect.right) }
          })
          .filter(element => element.right > window.innerWidth + 1 || element.x < -1)
          .slice(0, 8),
      }))
      assert.ok(overflow.page <= width, `Statement page has horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`)
      assert.ok(await page.locator('button:visible').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)), `Visible button is smaller than 44px at ${width}px`)
    }
    await page.setViewportSize({ width: 320, height: 900 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Statement page has horizontal overflow at 200% text size')
    assert.ok(await page.locator('button:visible').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)), 'Visible button is smaller than 44px at 200% text size')
    pass('Statement and cash queue reflow at narrow widths and 200% text size with 44px buttons')
    pass('Confirmed balance and immutable acknowledgment persist and reopen after reload')
  } finally {
    await browser.close()
  }
}

if (process.argv[2] === 'create-users') {
  requireConfig()
  const owner = await createUser(ownerEmail)
  const clerk = await createUser(clerkEmail)
  const other = await createUser(otherEmail)
  console.log(JSON.stringify({ owner, clerk, other }))
} else if (process.argv[2] === 'verify') {
  requireConfig()
  const ownerSessions = await enrollMfa(await signIn(ownerEmail))
  const clerkSessions = await enrollMfa(await signIn(clerkEmail))
  const otherSession = await signIn(otherEmail)
  const property = propertyId
  const owner = ownerSessions.aal2.access_token
  const clerk = clerkSessions.aal2.access_token
  const agreementId = randomUUID()
  const februaryChargeId = randomUUID()
  const marchChargeId = randomUUID()
  const primaryCashId = randomUUID()
  const concurrentCashIds = [randomUUID(), randomUUID()]
  const auditCash = auditCashId
  const requestDate = '2024-04-02'

  const anonymous = await request(`/rest/v1/rpc/read_rent_workspace`, {
    method: 'POST',
    body: { p_property_id: property },
  })
  expectDenied(anonymous, 'Anonymous cash workspace read')
  pass('Anonymous cash workspace access is denied')

  const notMfa = await rpc('read_rent_workspace', { p_property_id: property }, ownerSessions.initial.access_token)
  expectDenied(notMfa, 'AAL1 cash workspace read')
  pass('Cash workspace requires an MFA-verified staff session')

  const unassigned = await rpc('read_rent_workspace', { p_property_id: property }, otherSession.access_token)
  expectDenied(unassigned, 'Unassigned account cash workspace read')
  pass('Unassigned Auth user cannot read the property cash workspace')

  const badVerifier = await rpc('assign_cash_verifier', {
    p_property_id: property,
    p_user_id: randomUUID(),
    p_email: otherEmail,
  }, owner)
  expectDenied(badVerifier, 'Verifier assignment to an unrelated Auth identity')
  pass('Verifier assignment rejects an unrelated account identity')

  const assignment = await rpc('assign_cash_verifier', {
    p_property_id: property,
    p_user_id: process.env.CASH_TEST_CLERK_ID,
    p_email: clerkEmail,
  }, owner)
  assert.ok(assignment.response.ok, 'Owner could not assign the confirmed clerk as cash verifier')
  pass('Owner assigns the confirmed clerk account as explicit cash verifier')

  const agreement = {
    p_property_id: property,
    p_id: agreementId,
    p_tenant_id: tenantId,
    p_unit_id: unitId,
    p_move_in: '2024-01-31',
    p_rent: 5000.25,
  }
  assert.ok((await rpc('create_rental_agreement', agreement, owner)).response.ok)
  assert.ok((await rpc('create_rental_agreement', agreement, owner)).response.ok)
  const changedAgreement = await rpc('create_rental_agreement', { ...agreement, p_rent: 5000.26 }, owner)
  expectDenied(changedAgreement, 'Changed agreement retry payload')
  pass('Agreement creation is idempotent and rejects a changed retry payload')

  const february = await rpc('add_rent_month', {
    p_property_id: property, p_id: februaryChargeId, p_agreement_id: agreementId, p_month: '2024-02-01',
  }, owner)
  const march = await rpc('add_rent_month', {
    p_property_id: property, p_id: marchChargeId, p_agreement_id: agreementId, p_month: '2024-03-01',
  }, owner)
  assert.ok(february.response.ok && march.response.ok, 'Rent charge creation failed')
  const cashless = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(cashless.data.charges.find(row => row.id === februaryChargeId).due_date, '2024-02-29')
  assert.equal(cashless.data.charges.find(row => row.id === marchChargeId).due_date, '2024-03-31')
  pass('Live PostgreSQL anniversary dates clamp to month-end without anchor drift')

  const recordArgs = {
    p_property_id: property,
    p_id: primaryCashId,
    p_agreement_id: agreementId,
    p_amount: '6000.50',
    p_received_on: requestDate,
    p_collector: 'Bob',
  }
  assert.ok((await rpc('record_rent_cash', recordArgs, owner)).response.ok)
  assert.ok((await rpc('record_rent_cash', recordArgs, owner)).response.ok)
  const changedCash = await rpc('record_rent_cash', { ...recordArgs, p_amount: '6000.51' }, owner)
  expectDenied(changedCash, 'Changed cash retry payload')

  const pending = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(pending.data.agreements.find(row => row.id === agreementId).balance, '10000.50')
  assert.equal(pending.data.cash.find(row => row.id === primaryCashId).confirmed_at, null)
  const anonymousAfterRecords = await request('/rest/v1/rpc/read_rent_workspace', {
    method: 'POST',
    body: { p_property_id: property },
  })
  expectDenied(anonymousAfterRecords, 'Anonymous statement read after financial records exist')
  const unassignedAfterRecords = await rpc('read_rent_workspace', { p_property_id: property }, otherSession.access_token)
  expectDenied(unassignedAfterRecords, 'Unassigned account statement read after financial records exist')
  pass('Statement remains unavailable to anonymous and unassigned accounts after records exist')
  const ownerCannotConfirm = await rpc('confirm_rent_cash', {
    p_property_id: property, p_cash_id: primaryCashId,
  }, owner)
  expectDenied(ownerCannotConfirm, 'Owner cash confirmation without the designated clerk role')
  const clerkWithoutMfa = await rpc('confirm_rent_cash', {
    p_property_id: property, p_cash_id: primaryCashId,
  }, clerkSessions.initial.access_token)
  expectDenied(clerkWithoutMfa, 'AAL1 designated clerk cash confirmation')
  pass('Pending cash does not settle rent; owner and AAL1 clerk cannot confirm')

  const directWrite = await request('/rest/v1/cash_records', {
    method: 'POST',
    token: owner,
    body: { id: randomUUID(), property_id: property },
    headers: { prefer: 'return=minimal' },
  })
  expectDenied(directWrite, 'Direct browser cash table write')
  pass('Direct table writes are denied; financial changes require RPCs')

  const confirmed = await rpc('confirm_rent_cash', {
    p_property_id: property, p_cash_id: primaryCashId,
  }, clerk)
  assert.ok(confirmed.response.ok, 'Designated MFA clerk could not confirm reported cash')
  assert.equal(confirmed.data.amount, '6000.50')
  assert.equal(confirmed.data.balance_at_issuance, '4000.00')
  assert.equal(confirmed.data.allocations.length, 2)
  assert.deepEqual((await rpc('confirm_rent_cash', {
    p_property_id: property, p_cash_id: primaryCashId,
  }, clerk)).data, confirmed.data)
  pass('Designated MFA clerk confirms cash once, oldest-first, and retry returns the same acknowledgment')

  for (const cashId of concurrentCashIds) {
    const result = await rpc('record_rent_cash', {
      p_property_id: property,
      p_id: cashId,
      p_agreement_id: agreementId,
      p_amount: '3000.00',
      p_received_on: requestDate,
      p_collector: 'James',
    }, owner)
    assert.ok(result.response.ok, 'Could not create concurrent confirmation fixture')
  }
  const concurrentResults = await Promise.all(concurrentCashIds.map(cashId => rpc('confirm_rent_cash', {
    p_property_id: property, p_cash_id: cashId,
  }, clerk)))
  assert.equal(concurrentResults.filter(result => result.response.ok).length, 1)
  assert.equal(concurrentResults.filter(result => !result.response.ok).length, 1)
  const afterConcurrent = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(afterConcurrent.data.agreements.find(row => row.id === agreementId).balance, '1000.00')
  assert.equal(totalCentavos(afterConcurrent.data.charges.map(row => row.remaining)), 100000n)
  pass('Concurrent independent API confirmations serialize without over-allocation')

  assert.ok((await rpc('record_rent_cash', {
    p_property_id: property,
    p_id: auditCash,
    p_agreement_id: agreementId,
    p_amount: '500.00',
    p_received_on: requestDate,
    p_collector: 'Bob',
  }, owner)).response.ok)
  const auditFailure = await rpc('confirm_rent_cash', { p_property_id: property, p_cash_id: auditCash }, clerk)
  expectDenied(auditFailure, 'Confirmation with injected audit failure')
  const afterAuditFailure = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(afterAuditFailure.data.cash.find(row => row.id === auditCash).confirmed_at, null)
  assert.equal(afterAuditFailure.data.agreements.find(row => row.id === agreementId).balance, '1000.00')
  pass('Audit failure rolls back the confirmation and leaves the cash pending')

  const concurrentChargeIds = [randomUUID(), randomUUID()]
  const chargeResults = await Promise.all(concurrentChargeIds.map(id => rpc('add_rent_month', {
    p_property_id: property, p_id: id, p_agreement_id: agreementId, p_month: '2024-04-01',
  }, owner)))
  assert.equal(chargeResults.filter(result => result.response.ok).length, 1)
  const afterCharges = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(afterCharges.data.charges.filter(row => row.rental_month === '2024-04-01').length, 1)
  pass('Concurrent monthly charge creation retains one agreement/month charge')

  const checkId = randomUUID()
  const checkRequest = {
    p_property_id: property, p_id: checkId, p_agreement_id: agreementId,
    p_amount: '500.00', p_received_on: requestDate, p_check_date: '2024-04-01', p_collector: 'James',
  }
  const checkReceipt = await rpc('record_rent_check', checkRequest, clerk)
  assert.ok(checkReceipt.response.ok, 'Clerk could not record a received check')
  assert.equal(checkReceipt.data, 'CHK-0001')
  assert.equal((await rpc('record_rent_check', checkRequest, clerk)).data, 'CHK-0001')
  const checkPending = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(checkPending.data.agreements.find(row => row.id === agreementId).balance, '1000.00')
  assert.equal(checkPending.data.checks.find(row => row.id === checkId).status, 'received')
  expectDenied(await rpc('record_rent_check', { ...checkRequest, p_id: randomUUID() }, owner), 'Owner attempting clerk check receipt')
  expectDenied(await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: checkId, p_action: 'deposited', p_reason: 'Unauthorized test',
  }, clerk), 'Clerk attempting owner check transition')
  const directCheckWrite = await request('/rest/v1/check_records', {
    method: 'POST', token: clerk, body: { id: randomUUID(), property_id: property }, headers: { prefer: 'return=minimal' },
  })
  expectDenied(directCheckWrite, 'Direct check record write')
  const depositRequest = randomUUID(), clearanceRequest1 = randomUUID(), clearanceRequest2 = randomUUID()
  assert.ok((await rpc('transition_rent_check', {
    p_property_id: property, p_id: depositRequest, p_check_id: checkId, p_action: 'deposited', p_reason: 'Taken to bank',
  }, owner)).response.ok)
  const simultaneousClearances = await Promise.all([clearanceRequest1, clearanceRequest2].map(id => rpc('transition_rent_check', {
    p_property_id: property, p_id: id, p_check_id: checkId, p_action: 'cleared', p_reason: 'Bank confirmed funds',
  }, owner)))
  assert.equal(simultaneousClearances.filter(result => result.response.ok).length, 2)
  const clearedCheck = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(clearedCheck.data.agreements.find(row => row.id === agreementId).balance, '500.00')
  assert.equal(clearedCheck.data.checks.find(row => row.id === checkId).events.filter(event => event.action === 'cleared').length, 1)
  pass('Check reference is stable; receipt stays pending; owner-only concurrent clearance settles exactly once')

  const auditCheck = await rpc('record_rent_check', {
    ...checkRequest, p_id: auditCheckId, p_amount: '250.00',
  }, clerk)
  assert.ok(auditCheck.response.ok, 'Could not record audit-failure fixture check')
  const auditDeposit = await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: auditCheckId, p_action: 'deposited', p_reason: 'Taken to bank',
  }, owner)
  assert.ok(auditDeposit.response.ok)
  const failedClearance = await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: auditCheckId, p_action: 'cleared', p_reason: 'Simulated audit rollback',
  }, owner)
  expectDenied(failedClearance, 'Check clearance with injected audit failure')
  const afterCheckAuditFailure = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(afterCheckAuditFailure.data.checks.find(row => row.id === auditCheckId).status, 'deposited')
  assert.equal(afterCheckAuditFailure.data.agreements.find(row => row.id === agreementId).balance, '500.00')
  pass('Injected check audit failure rolls back clearance and allocation')

  assert.ok((await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: checkId, p_action: 'reversed', p_reason: 'Bank reversal',
  }, owner)).response.ok)
  const afterReversal = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(afterReversal.data.agreements.find(row => row.id === agreementId).balance, '1000.00')
  const returnedCheckId = randomUUID()
  assert.ok((await rpc('record_rent_check', { ...checkRequest, p_id: returnedCheckId, p_amount: '100.00' }, clerk)).response.ok)
  assert.ok((await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: returnedCheckId, p_action: 'deposited', p_reason: 'Taken to bank',
  }, owner)).response.ok)
  assert.ok((await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: returnedCheckId, p_action: 'cleared', p_reason: 'Bank confirmed funds',
  }, owner)).response.ok)
  assert.ok((await rpc('transition_rent_check', {
    p_property_id: property, p_id: randomUUID(), p_check_id: returnedCheckId, p_action: 'returned', p_reason: 'Bank returned check',
  }, owner)).response.ok)
  const afterReturn = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(afterReturn.data.agreements.find(row => row.id === agreementId).balance, '1000.00')
  const handover = {
    p_property_id: property, p_id: randomUUID(), p_clerk_id: process.env.CASH_TEST_CLERK_ID,
    p_handover_on: requestDate, p_expected_cash: '100.00', p_expected_checks: '600.00',
    p_actual_cash: '100.00', p_actual_checks: '500.00', p_difference_reason: 'One item remained uncleared',
  }
  assert.ok((await rpc('record_collection_handover', { ...handover, p_id: randomUUID(), p_difference_reason: '' }, owner)).response.ok === false,
    'Mismatched handover totals must require a reason')
  assert.ok((await rpc('record_collection_handover', handover, owner)).response.ok)
  assert.ok((await rpc('record_collection_handover', handover, owner)).response.ok)
  const handoverSnapshot = await rpc('read_rent_workspace', { p_property_id: property }, owner)
  assert.equal(handoverSnapshot.data.handovers.length, 1)
  assert.equal(handoverSnapshot.data.agreements.find(row => row.id === agreementId).balance, '1000.00')
  const anonymousChecks = await request('/rest/v1/check_records?select=id')
  expectDenied(anonymousChecks, 'Anonymous check register read')
  pass('Returned and reversed checks stay unsettled; handover mismatch is audited without changing rent balance')

  const anonymousTable = await request('/rest/v1/cash_records?select=id')
  expectDenied(anonymousTable, 'Anonymous cash table read')
  const clerkTable = await request('/rest/v1/cash_records?select=id', { token: clerk })
  assert.ok(clerkTable.response.ok, 'Authorized clerk could not read the scoped cash worklist')
  pass('RLS denies anonymous cash reads and permits MFA staff reads')

  await verifySavedCashBrowserFlow(ownerSessions.secret, clerkSessions.secret, agreementId)
} else {
  throw new Error('Expected create-users or verify phase')
}
