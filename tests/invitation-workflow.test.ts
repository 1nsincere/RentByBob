import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyProviderFailure,
  runInvitationWorkflow,
  type AttemptStatus,
  type InvitationWorkflow,
  type ProviderResult,
} from '../supabase/functions/invite-account/workflow.ts'

function workflow(overrides: Partial<InvitationWorkflow> = {}): InvitationWorkflow {
  return {
    prepare: async () => 'prepared',
    claim: async () => ({ claimed: true, status: 'dispatching' }),
    dispatch: async () => ({ outcome: 'issued', userId: 'provider-user' }),
    complete: async result => result.outcome,
    ...overrides,
  }
}

test('a repeated durable attempt returns its saved state without another provider call', async () => {
  let calls = 0
  const first = await runInvitationWorkflow(workflow({ dispatch: async () => {
    calls++
    return { outcome: 'issued', userId: 'provider-user' }
  } }))
  const retry = await runInvitationWorkflow(workflow({
    prepare: async () => first.status,
    dispatch: async () => { calls++; return { outcome: 'uncertain' } },
  }))
  assert.equal(first.status, 'issued')
  assert.equal(retry.status, 'issued')
  assert.equal(retry.providerCallMade, false)
  assert.equal(calls, 1)
})

test('competing requests share one durable dispatch claim', async () => {
  let claimConsumed = false
  let providerCalls = 0
  const shared: Partial<InvitationWorkflow> = {
    claim: async () => {
      if (claimConsumed) return { claimed: false, status: 'dispatching' }
      claimConsumed = true
      return { claimed: true, status: 'dispatching' }
    },
    dispatch: async () => {
      providerCalls++
      await Promise.resolve()
      return { outcome: 'uncertain' }
    },
    complete: async () => 'uncertain',
  }
  const results = await Promise.all([
    runInvitationWorkflow(workflow(shared)),
    runInvitationWorkflow(workflow(shared)),
  ])
  assert.equal(providerCalls, 1)
  assert.deepEqual(results.map(result => result.providerCallMade).sort(), [false, true])
  assert.deepEqual(results.map(result => result.status).sort(), ['dispatching', 'uncertain'])
})

test('provider errors are conservative and only allowlisted responses are definitive', () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.deepEqual(classifyProviderFailure(status), { outcome: 'rejected', httpStatus: status })
  }
  for (const status of [undefined, 408, 409, 429, 500, 503]) {
    assert.deepEqual(classifyProviderFailure(status), { outcome: 'uncertain' })
  }
})

test('a provider exception is persisted as uncertain, not reported as rejection', async () => {
  let completed: ProviderResult | undefined
  const result = await runInvitationWorkflow(workflow({
    dispatch: async () => { throw new Error('simulated provider timeout') },
    complete: async outcome => { completed = outcome; return 'uncertain' },
  }))
  assert.deepEqual(completed, { outcome: 'uncertain' })
  assert.equal(result.status, 'uncertain')
  assert.equal(result.persisted, true)
})

test('a lost completion audit leaves dispatching and retries do not send again', async () => {
  let calls = 0
  const failed = await runInvitationWorkflow(workflow({
    dispatch: async () => {
      calls++
      return { outcome: 'issued', userId: 'provider-user' }
    },
    complete: async () => { throw new Error('simulated audit persistence failure') },
  }))
  const retry = await runInvitationWorkflow(workflow({
    prepare: async () => failed.status,
    dispatch: async () => { calls++; return { outcome: 'issued', userId: 'provider-user' } },
  }))
  assert.equal(failed.status, 'dispatching')
  assert.equal(failed.providerCallMade, true)
  assert.equal(failed.persisted, false)
  assert.equal(retry.providerCallMade, false)
  assert.equal(retry.status, 'dispatching')
  assert.equal(calls, 1)
})

test('provider success followed by a lost client response is recovered from saved state', async () => {
  let persisted: AttemptStatus = 'prepared'
  let providerCalls = 0
  const send = () => workflow({
    prepare: async () => persisted,
    claim: async () => {
      if (persisted !== 'prepared') return { claimed: false, status: persisted }
      persisted = 'dispatching'
      return { claimed: true, status: persisted }
    },
    dispatch: async () => {
      providerCalls++
      return { outcome: 'issued', userId: 'provider-user' }
    },
    complete: async () => { persisted = 'issued'; return persisted },
  })
  const responseLost = await runInvitationWorkflow(send())
  const refreshed = await runInvitationWorkflow(send())
  assert.equal(responseLost.status, 'issued')
  assert.equal(refreshed.status, 'issued')
  assert.equal(refreshed.providerCallMade, false)
  assert.equal(providerCalls, 1)
})

test('failure before provider dispatch and definitive provider rejection stay distinct', async () => {
  let calls = 0
  const blocked = await runInvitationWorkflow(workflow({
    claim: async () => ({ claimed: false, status: 'prepared' }),
    dispatch: async () => { calls++; return { outcome: 'uncertain' } },
  }))
  assert.equal(blocked.status, 'prepared')
  assert.equal(blocked.providerCallMade, false)
  assert.equal(calls, 0)

  const rejected = await runInvitationWorkflow(workflow({
    dispatch: async () => ({ outcome: 'rejected', httpStatus: 422 }),
    complete: async result => result.outcome,
  }))
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.providerCallMade, true)
  assert.equal(calls, 0)
})
