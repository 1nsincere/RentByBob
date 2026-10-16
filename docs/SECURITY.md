# Security plan
Current local access UI is connected to Supabase. Ten local migrations enforce identity-bound owner assignment, tenant isolation, current membership revocation, staff MFA and durable invitation attempt tracking. Browser tests exercise actual enrollment/challenge, backup factors, password recovery and invitation reconciliation without an assurance bypass; a clerk cannot administer an owner's factors or reconcile attempts. The runtime never falls back to prototype records. Self-routing exposes only the caller's access status before MFA. Directory rename/archive and bounded owner/MFA-gated access and invitation review are enforced in PostgreSQL, not only the UI.

See STATUS.md for the exact current test evidence and ONBOARDING.md for identity confirmation, invitation states, resend limits, paper-delivery limitations, 10-second UI refresh, and recovery. No hosted/production security claim.

## Invitation dispatch reliability — migrations 202610160009 through 202610160011

Every invitation intent has a caller-generated stable UUID. The trusted `prepare_account_invitation` transaction binds it to the property, normalized `.invalid` recipient and `tenant`/`staff` type, and writes the request audit record atomically. Reuse with changed details is rejected. A unique property/recipient index prevents a second intent for that recipient, including after a definitive rejection or provider-confirmed issuance; this deliberately keeps reissue unavailable pending a separate policy decision.

| State | Evidence and allowed transition |
| --- | --- |
| `prepared` | Request and request audit committed; no provider call has started. Only this state can be claimed. An owner may explicitly continue this exact saved request after current authorization is rechecked. |
| `dispatching` | The database claim and start audit committed. The external call may or may not have started; process death can occur between claim and call. Never retry the provider call from this state. |
| `issued` | Supabase Auth returned a user ID and the completion state/audit committed. This confirms provider issuance only, not inbox delivery or real-world identity. |
| `rejected` | Auth returned an explicitly allowlisted definitive HTTP rejection (400, 401, 403, 404 or 422) and completion/audit committed. Other statuses and transport failures are uncertain. Reissue is not enabled. |
| `uncertain` | Provider outcome could not be established and that outcome/audit committed. No automatic retry. |
| `accepted` | An owner/MFA reconciliation read found the exact provider-returned user ID with the exact invited email confirmed after the request baseline. This establishes Auth email confirmation for that linked account only. |

PostgreSQL locks the property and attempt while preparing/claiming. A stable ID, payload consistency check and transactional claim ensure competing requests cannot both receive a successful claim; only the winner calls Auth. `issued`, `rejected`, `uncertain` and `accepted` states are returned for repeated requests without another provider call. If provider success is followed by completion/audit failure, the completion transaction rolls back and `dispatching` remains unresolved. If the client response is lost after completion, retrying the same ID returns the persisted state. This is a database claim plus safe no-retry behavior, **not** an atomic transaction with Auth, exactly-once delivery, or proof of email arrival.

Owner review requires current owner membership and AAL2. It shows fixed-format masked recipient information and the minimum status evidence, and appends actor/reason/evidence source without changing the original state. Review text rejects links, credential-like terms and email addresses; the general audit reason remains a fixed message. A matching Auth account is shown as evidence but does not prove a specific attempt. No reconciliation action resends, grants access or fabricates delivery. Automatic `accepted` reconciliation is limited to the provider-linked Auth ID/email/confirmation timestamp evidence above.

Migration 010 also stores the actual dispatching staff actor on the attempt; provider outcome audit attributes to that dispatcher rather than assuming the requester sent it. Automatic acceptance reconciliation is attributed to the owner who performed the reconciliation. The normalized recipient is retained in `private.invitation_attempts`, with no direct browser/service-role table grant; only the trusted Edge Function obtains it for an explicitly authorized `prepared` continuation. Owners see a masked address. This private row is retained indefinitely in the current implementation because it enforces the no-reissue constraint; database administrators/backups remain within the trusted boundary. The approved retention duration and resulting reissue policy remain open. Recipient addresses, invitation tokens, links, passwords, MFA secrets and raw provider bodies are not written to general audit payloads or application logs.

Authorization and the external send cannot be atomic. The claim checks current role and MFA, but a revocation can commit after claim and before the Auth call; an invitation may therefore issue during that narrow race. Invitation acceptance still creates no staff membership or tenant contact, so the recipient receives no application access until a separate owner assignment.

Evidence: PGlite applies migrations 009 through 011 and tests idempotency, changed payload, role/MFA, revocation, serialization, rollback on request/completion audit failure, provider outcome transitions, owner review and acceptance audit attribution when the request actor differs from the reconciling owner. Dependency-injected workflow tests simulate provider rejection/timeout, concurrent claim results, provider success plus audit failure, and lost responses. The 22-check local Supabase suite exercises actual Auth/MFA/PostgREST/Mailpit issuance, same-ID/concurrent HTTP calls, no assignment on acceptance, audit preservation and fixture cleanup. Its local-only fault test lets Auth issue a message, then injects a database constraint preventing the outcome audit; the attempt remains unresolved and a retry does not dispatch again. This does not simulate an Auth timeout or prove provider behavior outside local Supabase. See [STATUS.md](STATUS.md) for current complete test results.

Unresolved owner policy: what evidence, elapsed time, and approval permit reissue after definitive rejection, uncertain outcome, provider expiry, or issuance without delivery confirmation, and how long recipient details may be retained. Until a policy is approved, same-property/same-address reissue is blocked.

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

## Prior hardening record (superseded by migrations 009/010)

Migration 202610160004 restricts caller audit writes to requests. Only service_role can complete an existing request. Completion inherits its actor/property, locks the request row, accepts identical retries and rejects conflicting outcomes. The Edge Function uses its admin client for completion. This records dispatcher results, not proof of inbox delivery.

At that earlier stage, intended invitation addresses were registered for cleanup before dispatch, but injected partial-delivery cleanup was not yet tested and dispatch reconciliation/idempotency remained open. Migrations 009–011 and the current test evidence below supersede those gaps; never automatically retry uncertain sends.

The bootstrap is a local administrative transaction for confirmed fictional .invalid Auth identities. It locks initialization, creates property/owner/audit atomically and rejects conflicting initialized states. No RPC or password is created; MFA is still required. This is not a production bootstrap or recovery procedure.

## Directory maintenance and access audit — 16 Oct 2026

Migration 202610160007 makes directory rename/archive owner-only with current AAL2, property locking and atomic audit. Building archive retains the building and archives its current units in the same transaction. The create function rejects archived parents and no browser role has direct table mutation grants. The owner audit function returns only the latest 100 account/contact access, tenant archive and invitation-dispatch events for the requested property; clerk and AAL1 calls are denied. It returns actor/target email where relevant, tenant name and the recorded reason, so owners should keep reasons limited to what is needed. Invitation “sent” still means the trusted dispatch operation returned successfully, not inbox delivery. No independent security review or production claim is implied.

Migration 202610160008 corrects the audit RPC's Auth email output types for the local Supabase schema. The browser/API suite caught a mismatch that the PGlite fixture, whose email field is text, did not reproduce. Local integration tests passed after the follow-up migration; the result does not establish hosted-provider behavior.

Privilege guidance checked: https://supabase.com/docs/guides/database/functions

## Historical review findings — 16 Oct 2026

The following findings were the prior-state review and are addressed by migrations 009/010 and the implementation above. Their old descriptions are retained as historical evidence, not current open defects.

- **Invitation audit provenance:** `record_account_invitation` is executable by authenticated users and permits appropriately authorized staff to supply `requested`, `sent` or `failed` directly. The function checks role/MFA but does not prove an Auth invitation occurred or enforce an ordered outcome transition. A `sent` event alone is therefore not trustworthy dispatch evidence. Before operational use, restrict outcome recording to a trusted dispatch path and test direct-client spoofing and conflicting outcomes. Use a new migration; preserve applied migrations.
- **Dispatch is not atomic with audit:** the Edge Function authorizes, records a request, calls Auth and records the outcome in separate operations. Revocation or audit failure between calls can leave an issued invitation without a confirmed outcome. Retry handling needs an explicit reconciliation/idempotency design; the current random ID per request does not deduplicate repeated sends.
- **Integration cleanup on failure:** the test script registers invited email addresses for cleanup only after a successful response. An Auth send followed by an audit/response failure can leave fictional users or messages behind. Register intended fixture addresses before dispatch and exercise partial-failure cleanup in the next test-hardening slice.

The deterministic fault tests above exercise the transactional and orchestration failure boundaries; actual local Auth remains a success-path integration, not a simulated provider timeout. Invitations still do not grant application membership.
