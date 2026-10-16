# Security plan
Current local access UI is connected to Supabase. Six local migrations enforce identity-bound owner assignment, tenant isolation, current membership revocation and staff MFA. Browser tests exercise actual enrollment/challenge, backup factors and password recovery without an assurance bypass; a clerk cannot administer an owner's factors. The runtime never falls back to prototype records. Self-routing exposes only the caller's access status before MFA.

See STATUS.md for latest test evidence and ONBOARDING.md for identity confirmation, paper-delivery limitations, 10-second UI refresh, and recovery. Remaining work includes uncertain dispatch reconciliation, safe resend, injected partial-failure tests, real elapsed expiry, parallel transactions, all-factors-lost recovery drill and independent review. No hosted/production security claim.

The following foundation description and counts are historical; the current access milestone supersedes statements that the UI/bootstrap/recovery are missing.

Versioned database access foundation exists and is exercised in disposable PostgreSQL tests and the local Supabase Auth/PostgREST stack. The UI is still disconnected from the database; no real data or accounts are used.

Selected authentication: Supabase email/password, staff-issued invitations and recipient-created passwords. Public signup is disabled. The `invite-account` Edge Function checks current staff scope and MFA, allows the owner to invite renters/staff and James to invite renters only, and does not assign a role or tenant access. Local Supabase Auth sends invitations to Mailpit in tests. The recipient was verified locally through link use, password setup and sign-in; replay was rejected. This direction supersedes the earlier phone/voucher proposal. No frontend auth flow or hosted email is configured.

Implemented SQL enforces current owner/clerk memberships with aal2, contact isolation, no direct browser writes, owner-only audited access administration, last-owner protection, restricted function execution and archival revocation. Security-definer functions have empty search paths and explicit authorization. Local Auth/PostgREST/Edge checks cover disabled public signup, anonymous denial, tenant isolation, revocation with an existing JWT, forged-metadata escalation denial, invitation authority, audit privacy, no access before or after invitation acceptance, local email delivery, recipient password setup/sign-in, replay rejection and disallowed function origins. The integration suite passed 18 checks using fictional fixtures removed after the run. Invitation expiry is configured to one hour, but elapsed-time expiry is not tested. Hosted JWTs/email, a full first-owner bootstrap, frontend auth, recovery, real-user MFA enrollment/recovery, parallel transactions and production operations remain unverified. PGlite is a development-only PostgreSQL test engine, not the production database.

The matrix combines implemented access controls with intended product permissions. Financial actions, reporting and reconciliation are planned only; their rows do not indicate implemented workflows or settled landlord rules.

| Action | Renter/contact | James | Owner |
| --- | --- | --- | --- |
| Read records | Authorized tenant only | Assigned property | Owned property |
| Report/withdraw pending claims | Own authorized tenant | Record/review | Review |
| Verify cash/check receipt, allocate | No | Yes under agreed rules | Yes |
| Clear checks / reverse settled payments | No | Sir Bob approval; mechanism pending | Authorize |
| Manage staff roles / restricted terms | No | No | Yes |
| Issue invitations | No | Renter invitations only, trusted Edge Function | Renter or staff invitations, trusted Edge Function |
| Reconcile/export | Own statements only | Operational scope | Property scope |

Every exposed table needs RLS and explicit grants. Default deny anonymous access. Membership and roles outside user-editable metadata; policies consult current membership so revocation takes effect even with an old JWT. Narrow function grants; SECURITY DEFINER only with fixed safe search_path, qualified relations and explicit authorization. Sensitive staff operations require enforced MFA assurance. Privileged keys stay server-side; VITE values are public. Generic login errors, abuse controls and verified recovery required.

Required additional tests: actual elapsed-time invitation expiry, first-owner bootstrap, resend/failure paths, recovery authority, archived access with old tokens, real-user MFA enrollment/recovery and business-contact variants. Test concurrent approvals, duplicate settlement and retries, matching, transitions, exact amounts, historical changes and date boundaries before implementing financial writes.

No attachments initially. Minimize PII, redact logs, private acknowledgments/storage, HTTPS and reviewed CSP/headers before deployment. No production credentials in repository or AI prompts. Independent security/accounting review required before launch; no claim of full security.

## Hardening update (16 Oct 2026)

Migration 202610160004 restricts caller audit writes to requests. Only service_role can complete an existing request. Completion inherits its actor/property, locks the request row, accepts identical retries and rejects conflicting outcomes. The Edge Function uses its admin client for completion. This records dispatcher results, not proof of inbox delivery.

Intended invitation addresses are registered for cleanup before dispatch. Injected partial-delivery failure cleanup remains untested. Dispatch reconciliation and send idempotency across Auth and SQL remain open; do not automatically retry uncertain sends.

The bootstrap is a local administrative transaction for confirmed fictional .invalid Auth identities. It locks initialization, creates property/owner/audit atomically and rejects conflicting initialized states. No RPC or password is created; MFA is still required. This is not a production bootstrap or recovery procedure.

Privilege guidance checked: https://supabase.com/docs/guides/database/functions

## Review findings — 16 Oct 2026

Historical findings: outcome provenance and fixture pre-registration are repaired. Cross-service dispatch/retry and injected-failure coverage remain open.

- **Invitation audit provenance:** `record_account_invitation` is executable by authenticated users and permits appropriately authorized staff to supply `requested`, `sent` or `failed` directly. The function checks role/MFA but does not prove an Auth invitation occurred or enforce an ordered outcome transition. A `sent` event alone is therefore not trustworthy dispatch evidence. Before operational use, restrict outcome recording to a trusted dispatch path and test direct-client spoofing and conflicting outcomes. Use a new migration; preserve applied migrations.
- **Dispatch is not atomic with audit:** the Edge Function authorizes, records a request, calls Auth and records the outcome in separate operations. Revocation or audit failure between calls can leave an issued invitation without a confirmed outcome. Retry handling needs an explicit reconciliation/idempotency design; the current random ID per request does not deduplicate repeated sends.
- **Integration cleanup on failure:** the test script registers invited email addresses for cleanup only after a successful response. An Auth send followed by an audit/response failure can leave fictional users or messages behind. Register intended fixture addresses before dispatch and exercise partial-failure cleanup in the next test-hardening slice.

These are source-review findings, not newly exercised failure scenarios. Existing passing checks cover successful local flows and selected denials; they do not close these gaps. Invitations still do not grant application membership.
