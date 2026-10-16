import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

const allowedOrigin = Deno.env.get("APP_ORIGIN") ?? "http://127.0.0.1:5173"
const callbackUrl = `${allowedOrigin}/auth/callback`

function jsonResponse(body: Record<string, string>, status: number, origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info")
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    headers.set("Vary", "Origin")
  }
  return new Response(JSON.stringify(body), { status, headers })
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
  const propertyId = body.propertyId
  const accountType = body.accountType
  const email = body.email
  if (typeof propertyId !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(propertyId)) {
    return jsonResponse({ error: "Choose a valid property." }, 400)
  }
  if (accountType !== "tenant" && accountType !== "staff") {
    return jsonResponse({ error: "Choose a tenant or staff invitation." }, 400)
  }
  if (typeof email !== "string" || email.length > 320 || /[\s\u0000-\u001f\u007f]/.test(email)) {
    return jsonResponse({ error: "Enter a valid email address." }, 400)
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(normalizedEmail)) {
    return jsonResponse({ error: "Enter a valid email address." }, 400)
  }

  const { data: allowed, error: authorizationError } = await context.supabase.rpc(
    "can_issue_account_invitation",
    { p_property_id: propertyId, p_account_type: accountType },
  )
  if (authorizationError) {
    return jsonResponse({ error: "Could not confirm invitation permission." }, 503)
  }
  if (allowed !== true) {
    return jsonResponse({ error: "You are not authorized to issue this invitation." }, 403)
  }

  const invitationId = crypto.randomUUID()
  const audit = (outcome: "requested" | "sent" | "failed") =>
    outcome === "requested" ? context.supabase.rpc("record_account_invitation", {
      p_property_id: propertyId,
      p_account_type: accountType,
      p_invitation_id: invitationId,
      p_outcome: outcome,
    }) : context.supabaseAdmin.rpc("complete_account_invitation", {
      p_invitation_id: invitationId,
      p_outcome: outcome,
    })

  const { error: requestAuditError } = await audit("requested")
  if (requestAuditError) {
    return jsonResponse({ error: "Could not record the invitation request." }, 503)
  }

  const { data, error: inviteError } = await context.supabaseAdmin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo: callbackUrl },
  )
  if (inviteError || !data.user) {
    const { error: failureAuditError } = await audit("failed")
    if (failureAuditError) {
      return jsonResponse({ error: "The invitation attempt could not be completed or recorded. Ask an owner to review it." }, 503)
    }
    return jsonResponse({ error: "The invitation could not be sent. Ask an owner to check its status before retrying." }, 502)
  }

  const { error: sentAuditError } = await audit("sent")
  if (sentAuditError) {
    return jsonResponse({ error: "The invitation was issued but its audit record could not be confirmed. Ask an owner to review it before retrying." }, 503)
  }

  return jsonResponse({
    invitationId,
    message: "Invitation sent. The recipient must use the emailed link to finish setting up the account.",
  }, 202)
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
