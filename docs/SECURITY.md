## Saved cash local verification - 19 Oct 2026

## Check register and handover migration - 19 Oct 2026

`202610190001_check_handover.sql` is a new draft migration and has not been applied to local, hosted, or production databases. It gives every exposed table RLS and authenticated staff-only reads, denies direct browser writes, and exposes only narrow SECURITY DEFINER RPCs with empty search paths, current staff/MFA checks, property locking, exact `numeric(14,2)` validation, idempotency identifiers, and atomic audit events. Clerk role is required to record check receipt; owner role is required for deposit, clearance, return, reversal, and handover entry. Cleared check allocations are included in both rent-balance calculations and cash confirmation revalidation; all other check states are excluded. Status history is append-only through the exposed API. PGlite coverage passes, but live Supabase API, separate-session concurrency, and browser checks are outstanding. Do not apply this migration until those checks pass.

20 Oct recheck: the required disposable Supabase run remains blocked. `docker info --format '{{.ServerVersion}}'` and `npx.cmd supabase status` failed because the Docker Desktop Linux-engine named pipe `//./pipe/dockerDesktopLinuxEngine` does not exist. No isolated stack was started and the migration remains unapplied. Do not substitute the preserved local database, hosted development, or production. The disposable runner now includes authenticated saved-report assertions and corrected post-April-charge balance expectations, but neither has been executed. Resume with `npm.cmd run test:cash:supabase` only after Docker is healthy; require live authorization/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback/report/browser evidence before local application.

Migration `202610180001_cash_rent_foundation.sql` is applied only to the preserved local Supabase database after a separate disposable stack passed live Auth/TOTP, PostgREST/RLS, retry, rollback, independent-session concurrency and owner/clerk browser workflow checks. The disposable runner uses a random project ID, unused loopback ports, `.invalid` accounts and temporary migration files; it stops only its project and removes its generated workspace. No cash test records or verifier were added to the preserved local database.

`isolated-cash-test` is an explicit development-only connection target for the authenticated browser integration test. It accepts only an HTTP `127.0.0.1` URL with a valid port and is rejected in production. Vite receives only the disposable stack's public anon key; the service-role key and throwaway password are removed from the Vite process environment. Test sessions, TOTP secrets and keys are not logged. Hosted and production systems are not part of the runner.

The existing James account has not been identity-confirmed for verifier assignment. Until an owner verifies the account ID and confirmed email through trusted account management, no cash verifier is assigned and the local app cannot confirm cash. No live financial records, opening balances, checks or reversals were created.

## Saved cash design before activation - 18 Oct 2026 (historical)

At the time of this design note the migration was unapplied. It restricts confirmation to current clerk membership with MFA plus explicit `cash_verifiers` entry. Owner alone cannot confirm. Verifier designation checks exact confirmed email/account ID and current clerk membership. Tenant portal has no financial grants in this milestone. Reports, allocations, snapshot and audit commit together; receipt is private staff UI/print only, with no email or public URL. The later local activation and live tests are documented above; hosted and production remain unchanged.

## 18 Oct 2026 ? payment preview boundary

PaymentsPreview is exported only through the development preview module. Entries are fictional in-memory state, reset on reload and make no external requests. Settled cash is a UI simulation, not authorized financial posting. No keys, accounts, RLS, MFA or migrations changed. Future financial writes must use reviewed transactional PostgreSQL functions with RLS, authorization, idempotency and concurrency tests.

# Security plan

## Renter read model and client session handling - 26 Oct 2026

`public.read_renter_account()` (migration `202610260001`) is a SECURITY DEFINER function with an empty search path, executable by `authenticated` only. It takes no parameters and derives scope from `auth.uid()`: unarchived tenants with an unrevoked contact link. It returns no staff or verifier IDs, handovers or other tenants, and its balance rule matches staff. PGlite isolation tests (with mutation checks) and a live disposable run verify this. The definer-function inventory test now expects 33.

The client no longer unmounts the workspace on token refresh, focus or tab visibility changes; it re-checks access in place every 10 seconds and on focus. This is a UX change only: RLS and RPC authorization are unchanged. Renter password changes re-verify the current password before `updateUser` (Supabase `secure_password_change` is off locally). The local `minimum_password_length` in `supabase/config.toml` is 6, while the app requires 12; consider raising the Auth setting for staging and production as an owner-approved configuration change.

## Preview creation boundary - 17 Oct 2026

Add tenant in preview now mutates in-memory fixtures only; it does not use the offline Supabase transport or grant Auth access. Email is optional and restricted to fictional .invalid addresses. Named occupants are sample data and are cleared on reload. New browser tests confirm zero external requests during create/review/location flows. Actual local/hosted mutation functions, RLS and MFA remain unchanged; UI-only minimum occupancy is not a backend security or financial rule.

## Interactive property preview - 17 Oct 2026

Spatial edits and tenant examples are confined to the dynamically imported development preview. No Supabase writes, actual accounts or tenant assignments were changed. Browser tests intercept external traffic and confirmed zero external requests during room/building editing. Full access policies and MFA remain intact. Production build still excludes the preview implementation.

## Dashboard preview boundary - 17 Oct 2026

Development-only preview uses fictional session/display data and a custom offline transport that never calls network fetch. Real Supabase client/session initialization is not executed in preview. Writes, invitations and account changes return errors; MFA enrollment control is disabled. A persistent notice explains the limitation. Production removes the dynamic preview import. Actual database permissions, Auth accounts, session storage and staff MFA were not changed. Browser checks verified zero external requests during preview navigation/submission. This mode provides no assurance about backend integration.

## Single-origin development switch - 19 Oct 2026

The fictional preview and authenticated app share the development origin on port 5173 but are isolated by explicit `?preview=1` versus `?auth=1` mode selection. Preview remains development-only, uses the offline fake client, and does not initialize or read the configured Supabase Auth session. Its header clearly identifies sample data and offers a return to the account app. That return does not alter the active backend target; local/hosted authentication and staff MFA remain in force. `dev:preview` reuses an existing RentByBob server on port 5173, or starts the authenticated local launcher if none is present; it never silently replaces a hosted-development server. Browser checks intercept non-app traffic and verify no request during preview use. No migrations, Auth settings, permissions, account records or financial data changed.

## Hosted development ? 17 Oct 2026

Eleven reviewed migrations also run on authorized fictional project `vyzexanzktskvjxjpphp`. Signup/anonymous sign-in verified disabled; nine tables have RLS, no anonymous reads and no direct browser writes. Definer search paths pinned. Hosted Auth confirms verified owner TOTP and AAL2 session. Identity-bound assignment/current-membership checks remain intact. Hosted invitations fail before an attempt/provider call; UI recovery unavailable. Local Mailpit tests pass. [Evidence, advisor warnings and limits](HOSTED_DEVELOPMENT.md) supersede older no-hosted statements below. User reports exposed secret revoked; it was not reused.

Current local access UI is connected to Supabase. Ten local migrations enforce identity-bound owner assignment, tenant isolation, current membership revocation, staff MFA and durable invitation attempt tracking. Browser tests exercise actual enrollment/challenge, backup factors, password recovery and invitation reconciliation without an assurance bypass; a clerk cannot administer an owner's factors or reconcile attempts. The runtime never falls back to prototype records. Self-routing exposes only the caller's access status before MFA. Directory rename/archive and bounded owner/MFA-gated access and invitation review are enforced in PostgreSQL, not only the UI.

The account statement is rendered only inside the existing staff Payments and balances screen, using the MFA-gated `read_rent_workspace` snapshot. It adds no tenant financial view, client-side grant, export or financial mutation. Pending reports remain explicitly outside confirmed history and balances.

Cash-statement security regression coverage also retries `read_rent_workspace` as anonymous and unassigned identities after disposable agreement/charge/cash records exist and requires denial. Browser checks verify pending cash is absent from confirmed statement events. Existing isolated tests continue to require MFA and designated clerk identity for settlement, reject owner confirmation and direct table writes, and cover audit rollback/concurrency. These checks run only against the unique disposable local Supabase stack; they are not an independent security audit or proof of hosted/production configuration.

The saved cash UI parses the `read_rent_workspace` response as untrusted input before rendering. It requires exact decimal strings, valid calendar dates/IDs, known cash collectors, consistent confirmed/acknowledgment state, matching acknowledgment receipt details and allocation totals, valid record relationships, and agreement balances equal to summed charge remaining amounts. Invalid or inconsistent snapshots are withheld with an explicit error; the client does not coerce numbers or manufacture defaults. PostgreSQL authorization and constraints remain authoritative; this validation detects bad/mismatched responses and is not a replacement for them.

The saved Paid rent report reuses that same staff/MFA-authorized workspace RPC and adds no new database grants or access path. It aggregates exact decimal strings using integer minor units and filters settled receipts by actual receipt date with `confirmed_at` present. Local API/browser review of this view remains outstanding because the Docker engine is currently stopped.

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

The matrix combines implemented access controls with intended product permissions. Financial actions outside the specifically documented cash and drafted check/handover flows remain planned; rows do not indicate operational readiness or settled landlord rules.

| Action | Renter/contact | James | Owner |
| --- | --- | --- | --- |
| Read records | Authorized tenant only | Assigned property | Owned property |
| Report/withdraw pending claims | Own authorized tenant | Record/review | Review |
| Verify cash receipt | No | Designated verifier only | No |
| Record check receipt | No | Yes, under drafted migration | No |
| Deposit, clear, return or reverse checks | No | No | Yes, under drafted migration |
| Record collection handover | No | No | Yes, under drafted migration |
| Manage staff roles / restricted terms | No | No | Yes |
| Issue invitations | No | Renter invitations only, trusted Edge Function | Renter or staff invitations, trusted Edge Function |
| Reconcile/export | Own statements only | Operational scope | Property scope |

Every exposed table needs RLS and explicit grants. Default deny anonymous access. Membership and roles outside user-editable metadata; policies consult current membership so revocation takes effect even with an old JWT. Narrow function grants; SECURITY DEFINER only with fixed safe search_path, qualified relations and explicit authorization. Sensitive staff operations require enforced MFA assurance. Privileged keys stay server-side; VITE values are public. Generic login errors, abuse controls and verified recovery required.

Required additional tests: actual elapsed-time invitation expiry, first-owner bootstrap, resend/failure paths, recovery authority, archived access with old tokens, real-user MFA enrollment/recovery and business-contact variants. Before applying the check migration, test its transitions and idempotency through actual Supabase API calls, independent concurrent sessions, audit rollback, and authenticated browser behavior. Matching, general reconciliation, exact amounts, historical changes and date boundaries remain follow-up checks.

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
