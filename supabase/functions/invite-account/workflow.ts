export type AttemptStatus = 'prepared' | 'dispatching' | 'issued' | 'rejected' | 'uncertain' | 'accepted'
export type ProviderResult =
  | { outcome: 'issued'; userId: string }
  | { outcome: 'rejected'; httpStatus: number }
  | { outcome: 'uncertain' }

export type InvitationWorkflow = {
  prepare: () => Promise<AttemptStatus>
  claim: () => Promise<{ claimed: boolean; status: AttemptStatus }>
  dispatch: () => Promise<ProviderResult>
  complete: (result: ProviderResult) => Promise<AttemptStatus>
}

export type InvitationWorkflowResult = {
  status: AttemptStatus
  providerCallMade: boolean
  persisted: boolean
}

export async function runInvitationWorkflow(
  workflow: InvitationWorkflow,
): Promise<InvitationWorkflowResult> {
  const initial = await workflow.prepare()
  if (initial !== 'prepared') {
    return { status: initial, providerCallMade: false, persisted: true }
  }

  const claim = await workflow.claim()
  if (!claim.claimed) {
    return { status: claim.status, providerCallMade: false, persisted: true }
  }

  let result: ProviderResult
  try {
    result = await workflow.dispatch()
  } catch {
    result = { outcome: 'uncertain' }
  }

  try {
    return {
      status: await workflow.complete(result),
      providerCallMade: true,
      persisted: true,
    }
  } catch {
    return { status: 'dispatching', providerCallMade: true, persisted: false }
  }
}

export function classifyProviderFailure(status: number | undefined): ProviderResult {
  if (status !== undefined && [400, 401, 403, 404, 422].includes(status)) {
    return { outcome: 'rejected', httpStatus: status }
  }
  return { outcome: 'uncertain' }
}
