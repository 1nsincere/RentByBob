import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"
import { classifyProviderFailure, runInvitationWorkflow, type AttemptStatus, type ProviderResult } from "./workflow.ts"

const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "http://127.0.0.1:5173"
const callbackUrl = `${allowedOrigin}/auth/callback`
const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i
const attemptStatuses = new Set<AttemptStatus>(["prepared", "dispatching", "issued", "rejected", "uncertain", "accepted"])

function isAttemptStatus(value: unknown): value is AttemptStatus {
  return typeof value === "string" && attemptStatuses.has(value as AttemptStatus)
}

function jsonResponse(body: Record<string, string | boolean>, status: number, origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info")
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    headers.set("Vary", "Origin")
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function statusResponse(attemptId: string, status: AttemptStatus, origin?: string) {
  const messages: Record<AttemptStatus, string> = {
    prepared: "The invitation request is saved; the provider has not been called.",
    dispatching: "The provider may or may not have processed this request. Do not resend; ask an owner to review it.",
    issued: "Supabase Auth confirmed issuance. This does not confirm inbox delivery or application access.",
    rejected: "Supabase Auth definitively rejected the request. Check the reason before starting a new invitation.",
    uncertain: "The provider outcome could not be established. Do not resend; an owner must review it.",
    accepted: "The account linked to this invitation confirmed its email. Property access remains a separate owner decision.",
  }
  return jsonResponse({ attemptId, status, message: messages[status] }, 200, origin)
}

const authenticatedFetch = withSupabase({ auth: "user" }, async (request, context) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST to request an account invitation." }, 405)
  }

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return jsonResponse({ error: "Provide a valid invitation request." }, 400)
  }
  if (typeof input !== "object" || input === null) {
    return jsonResponse({ error: "Provide a valid invitation request." }, 400)
  }

  const body = input as Record<string, unknown>
  const attemptId = body.attemptId
  if (typeof attemptId !== "string" || !uuidPattern.test(attemptId)) {
    return jsonResponse({ error: "Choose a valid invitation reference." }, 400)
  }

  let propertyId = ""
  let accountType = ""
  let normalizedEmail: string
  let status: AttemptStatus
  if (body.resume === true) {
    const { data, error } = await context.supabaseAdmin.rpc("get_prepared_account_invitation_dispatch", {
      p_attempt_id: attemptId,
    })
    if (error || !data?.status) {
      return jsonResponse({ error: "The saved attempt could not be loaded. Ask an owner to review it." }, 503)
    }
    if (!isAttemptStatus(data.status)) {
      return jsonResponse({ error: "The saved attempt has an invalid status. Ask an owner to review it." }, 503)
    }
    status = data.status
    propertyId = typeof data.property_id === "string" ? data.property_id : ""
    accountType = typeof data.account_type === "string" ? data.account_type : ""
    normalizedEmail = typeof data.email === "string" ? data.email : ""
    if (status !== "prepared") {
      const { data: claim, error: claimError } = await context.supabase.rpc("claim_account_invitation_dispatch", {
        p_attempt_id: attemptId,
      })
      if (claimError) {
        return jsonResponse({ error: claimError.code === "42501"
          ? "Current staff permission and MFA are required."
          : "The saved attempt could not be verified; ask an owner to review it." }, claimError.code === "42501" ? 403 : 503)
      }
      if (!isAttemptStatus(claim?.status)) {
        return jsonResponse({ error: "The saved attempt status could not be verified. Refresh and ask an owner to review it." }, 503)
      }
      return statusResponse(attemptId, claim.status)
    }
    if (!uuidPattern.test(propertyId) || (accountType !== "tenant" && accountType !== "staff")
      || !normalizedEmail.endsWith(".invalid")) {
      return jsonResponse({ error: "The saved request is incomplete. Ask an owner to review it." }, 503)
    }
  } else {
    const rawPropertyId = body.propertyId
    const rawAccountType = body.accountType
    const rawEmail = body.email
    if (typeof rawPropertyId !== "string" || !uuidPattern.test(rawPropertyId)) {
      return jsonResponse({ error: "Choose a valid property." }, 400)
    }
    if (rawAccountType !== "tenant" && rawAccountType !== "staff") {
      return jsonResponse({ error: "Choose a tenant or staff invitation." }, 400)
    }
    if (typeof rawEmail !== "string" || rawEmail.length > 320 || /[\s\u0000-\u001f\u007f]/.test(rawEmail)) {
      return jsonResponse({ error: "Enter a valid fictional email address." }, 400)
    }
    normalizedEmail = rawEmail.trim().toLowerCase()
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(normalizedEmail)
      || !normalizedEmail.endsWith(".invalid")) {
      return jsonResponse({ error: "Only fictional .invalid addresses can be invited in this local application." }, 400)
    }
    propertyId = rawPropertyId
    accountType = rawAccountType
    const { data, error } = await context.supabase.rpc("prepare_account_invitation", {
      p_property_id: propertyId,
      p_attempt_id: attemptId,
      p_account_type: accountType,
      p_email: normalizedEmail,
    })
    if (error) {
      if (error.code === "42501") return jsonResponse({ error: "Current staff permission and MFA are required." }, 403)
      if (error.code === "23505" || error.code === "22023") {
        return jsonResponse({ error: "This attempt conflicts with a previous invitation or its saved details. Review it before doing anything else." }, 409)
      }
      return jsonResponse({ error: "The invitation request could not be durably prepared. No provider call was started." }, 503)
    }
    if (!data?.status) return jsonResponse({ error: "The saved invitation request could not be confirmed." }, 503)
    if (!isAttemptStatus(data.status)) return jsonResponse({ error: "The saved invitation status could not be verified." }, 503)
    status = data.status
    if (status !== "prepared") return statusResponse(attemptId, status)
  }

  let claimErrorCode: string | undefined
  let workflowResult
  try {
    workflowResult = await runInvitationWorkflow({
    prepare: async () => status,
    claim: async () => {
      const { data, error } = await context.supabase.rpc("claim_account_invitation_dispatch", {
        p_attempt_id: attemptId,
      })
      if (error || typeof data?.claimed !== "boolean" || !data?.status) {
        claimErrorCode = error?.code
        throw new Error(error?.code === "42501"
          ? "Current staff permission and MFA are required."
          : "Invitation dispatch claim was not confirmed.")
      }
      return { claimed: data.claimed, status: data.status as AttemptStatus }
    },
    dispatch: async (): Promise<ProviderResult> => {
      try {
        const { data, error } = await context.supabaseAdmin.auth.admin.inviteUserByEmail(
          normalizedEmail,
          { redirectTo: callbackUrl },
        )
        if (error) return classifyProviderFailure(error.status)
        if (!data.user?.id) return { outcome: "uncertain" }
        return { outcome: "issued", userId: data.user.id }
      } catch {
        return { outcome: "uncertain" }
      }
    },
    complete: async result => {
      const { data, error } = await context.supabaseAdmin.rpc("complete_account_invitation_dispatch", {
        p_attempt_id: attemptId,
        p_outcome: result.outcome,
        p_provider_user_id: result.outcome === "issued" ? result.userId : null,
        p_provider_http_status: result.outcome === "rejected" ? result.httpStatus : null,
      })
      if (error || typeof data !== "string") throw new Error("Invitation outcome could not be persisted.")
      return data as AttemptStatus
    },
    })
  } catch {
    if (claimErrorCode === "42501") {
      return jsonResponse({ error: "Current staff permission and MFA are required." }, 403)
    }
    return jsonResponse({
      attemptId,
      status: "dispatching",
      error: "The dispatch claim could not be confirmed. Do not retry by creating a new attempt; refresh and ask an owner to review this one.",
    }, 503)
  }

  if (!workflowResult.persisted) {
    return jsonResponse({
      attemptId,
      status: "dispatching",
      error: "The provider may have processed this attempt, but its outcome could not be saved. Do not resend; an owner must review it.",
    }, 503)
  }
  return statusResponse(attemptId, workflowResult.status)
})

export default {
  fetch: async (request: Request) => {
    const origin = request.headers.get("Origin") ?? undefined
    if (origin && origin !== allowedOrigin) {
      return jsonResponse({ error: "This website is not allowed to use the invitation service." }, 403)
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origin ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      } : undefined })
    }
    const response = await authenticatedFetch(request)
    if (!origin) return response
    const headers = new Headers(response.headers)
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
    return new Response(response.body, { status: response.status, headers })
  },
}
