# Status - 16 Oct 2026, Asia/Manila
## Current milestone: mobile-first access interface

The real Supabase-backed renter and staff screens now use a restrained ivory/white/sage/deep-teal system. Renters see their authorized directory records, readable pending/unassigned/disabled states, useful empty states and sign-out without staff MFA controls or invented payment destinations. Owners and clerks get labeled section navigation in a mobile drawer and desktop sidebar. Directory search/results, staff forms, invitation messages, access review, archive confirmation and history are grouped and spaced for phone use. No data, authorization, MFA, invitation, membership, or database contract was changed for the visual refresh.

The app uses the approximate 60–30–10 palette in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Measured foreground/background and control-border pairs meet the listed WCAG contrast thresholds. Browser checks cover 160px (zoom-equivalent stress viewport), 320, 360, 390, 430, 768 and 1280 CSS px, mobile staff navigation, long email reflow, focus, control size and enlarged text. These checks are not an accessibility audit or WCAG conformance claim.

Verification on 16 Oct 2026: `npm.cmd test` passed 33 tests; `npm.cmd run build` passed strict TypeScript and Vite; `npm.cmd run test:browser` passed both local browser scenarios (owner/renter/staff workflows, backup MFA/password recovery, revocation, invitation acceptance, keyboard focus and responsive checks); `git diff --check` passed. The browser run captured [the fictional renter mobile screenshot](screenshots/rentbybob-renter-mobile.png) at 390px. Visual inspection confirmed it shows only `.invalid` fixture identity and directory data, with no password, invitation link/token, MFA secret or real user data. The browser suite does not emulate native browser zoom; its narrow viewport and enlarged-text checks are bounded responsive tests, not an accessibility audit. No schema or hosted system changed.

Exact next milestone: user readability review of the captured renter screen and manual keyboard/screen-reader checks of sign-in, renter records, staff navigation, archive confirmation and access review. Do not claim WCAG conformance until a complete audit; keep the separate invitation reissue/retention decision and financial policy gates open.

## Previous completed milestone: invitation dispatch reliability and owner reconciliation

Migrations `202610160009`–`202610160011` are applied to local Supabase only. Invitation intents now use a stable UUID bound to property, recipient and account type. PostgreSQL serializes competing requests; only a persisted `prepared` attempt can be claimed for dispatch. Repeating the same intent returns its saved state, while changed payloads and any new attempt for an already-attempted property/recipient are rejected. No resend action is implemented.

The tracked states are `prepared`, `dispatching`, `issued`, `rejected`, `uncertain` and `accepted`. `dispatching` deliberately means a provider call may or may not have started. Database and Auth operations are not atomic: a process can fail after claim, during Auth, or while saving its outcome. In those cases the attempt remains unresolved and a retry never calls Auth again. Auth-confirmed issuance does not mean inbox delivery; invitation acceptance still grants no application access. Only the exact Auth user ID returned by the provider, matching recipient email and confirmed after the request, can be reconciled automatically as accepted.

Owners with current MFA can review masked recipient, status and limited evidence, explicitly continue a request known to remain `prepared`, and append a reason/evidence review without changing uncertain state. The review neither proves delivery nor triggers a resend or access assignment. Recipient addresses are held only in a restricted private table and masked in owner output; they are omitted from general audit reasons. Retention is indefinite for now because the unique-address guard depends on prior attempts; a retention/reissue policy is unresolved.

The existing sign-in, callback/password setup, identity-confirmed owner assignment, staff TOTP/backup recovery, directories and access audit remain implemented. James may invite renters only; owners may invite renters or staff; assignments remain owner-managed. Revocation is rechecked at dispatch claim, but can race after the transaction commits and before the external Auth call. Even if that race issues an invitation, it grants no application access.

Verification on 16 Oct 2026: `npm.cmd test` passed 33 tests, including SQL state/authorization/rollback/privacy cases and deterministic workflow fault simulations. `npm.cmd run build` passed strict TypeScript and Vite. `npm.cmd run test:supabase` passed 22 local checks against local Auth, MFA, PostgREST and Mailpit, including concurrent HTTP requests, same-ID retry, changed-payload rejection, acceptance reconciliation and fixture cleanup. The local API suite also confirmed actual Auth issuance followed by a test-only database constraint blocking the outcome audit: the attempt stayed unresolved, retry did not send again, and the test-owned Auth user/message were cleaned. Provider timeouts remain deterministic workflow simulations, not injected Auth failures. `npm.cmd run test:browser` passed 2 scenarios, including owner review and explicit prepared-attempt continuation, keyboard focus, 320px reflow and CSS-simulated 200% zoom. No hosted provider behavior is claimed. `git diff --check` and the local PowerShell script parser passed.

All eleven migrations (`202610160001`–`202610160011`) are applied locally. Migration 011 corrects acceptance-reconciliation audit attribution to the current owner performing reconciliation, rather than the original requester. The local database and user-created fictional accounts, properties, MFA enrollment and directory data were preserved; test-created records, Auth users and Mailpit messages were fixture-scoped and cleaned. No hosted project was linked or changed. No real emails, accounts, deployment or purchases were used.

Open limitations: the provider-call/revocation race cannot be closed across these services; there is no proof of inbox delivery; safe reissue/resend, expiry behavior, recipient retention duration and manually proving an uncertain attempt are not decided. One-hour provider expiry is configured, but elapsed-time expiry is not tested. Deterministic workflow tests simulate provider timeout and post-provider audit failure; the local API suite tested actual local Auth issuance followed by a database outcome-audit failure, but did not inject an Auth timeout. No full accessibility, security, hosted-provider or production-readiness claim. Financial work remains bounded by [business rules](BUSINESS_RULES.md); pending reports and uncleared checks never reduce settled balances.

Exact next milestone: obtain and document the owner-approved policy for when a rejected, unresolved, expired or apparently issued invitation may be reissued, what evidence and approval are required, and how long recipient data is retained. Until then keep reissue unavailable, then conduct a focused independent invitation-security review. No personal action is required to use this local implementation.

## Historical milestone records
The records below describe earlier implementation states and test runs; use the current milestone above for today's status.

## Earlier milestone: invitation audit hardening and local bootstrap

Implemented migration 202610160004 locally: browser callers can record invitation requests only; service-only completion requires a request, serializes outcomes, accepts identical retries and rejects conflicts. Updated the Edge Function and pre-register invitation fixtures for cleanup before sending.

Added scripts/bootstrap-local-owner.ps1 and its SQL transaction. It accepts only confirmed fictional .invalid Auth users, locks initialization, creates property/owner/audit atomically, rejects conflicting initialized states, and permits an identical retry. No persistent RPC or password is created. Existing staff MFA remains enforced. The CLI requires a single SQL statement, so bootstrap uses one atomic DO block rather than multiple prepared statements. It passes SQL through a temporary credential-free file to preserve multiline text on Windows; the file is removed afterward.

Verification: 23 isolated tests passed; strict TypeScript/build passed; 19 standard local API checks passed. The full local suite with -TestBootstrap passed 20 checks, including actual administrative-script execution and identical retry; fictional fixtures were removed. Migration 004 was applied only with --local. No hosted changes, real accounts, real email, repository creation or financial implementation.

Remaining: invitation dispatch reconciliation and safe resend, injected failure cleanup, actual elapsed expiry, parallel-session bootstrap tests, frontend auth, recovery/MFA UX and access assignment. Next feature slice is the smallest local sign-in/callback/password setup UI. Financial rules remain blocked. The user need not install or configure anything for this completed local work; landlord decisions and repository destination remain user-owned future inputs.

## Previous review and milestone records (historical)

## Handoff review and documentation polish — 16 Oct 2026

Compared the handoff against the original brief, roadmap, migrations, invitation handler and test harness. The reported local progress is consistent with the implementation; the roadmap now explicitly separates implemented work, unverified acceptance gates and blocked financial features. Updated setup instructions include the separate Edge Function serve process, and historical entries below are labeled to prevent stale next steps being mistaken for current instructions.

Fresh verification in this review: `npm.cmd test` passed 21 tests; `npm.cmd run build` passed strict TypeScript and Vite compilation; `npm.cmd run test:supabase` passed all 18 checks, including the three local migration versions, and reported fictional fixture cleanup. No hosted services were used. No `.git` directory exists.

Source review also found invitation audit provenance, non-atomic dispatch/retry and partial-failure fixture-cleanup gaps; see [SECURITY.md](SECURITY.md#review-findings--16-oct-2026). These were documented, not repaired or failure-tested in this documentation milestone. Passing happy-path checks do not establish reliable audit provenance. No application code or migrations were changed.

Next: await the user's next development direction. The planned feature slice remains local-only first-owner bootstrap; resolve the invitation hardening findings before operational onboarding. Financial policy, elapsed expiry, recovery, MFA UX, browser accessibility and production readiness remain open.

## Earlier milestone: local account invitations
All work remains in the existing `C:\Users\acegr\Desktop\Rent Tracker System`; no replacement Desktop folder was created. The disposable local Supabase stack runs with project-local Supabase CLI 2.121.0, Docker Desktop 4.95.0 and WSL 2.7.13. Migrations `202610160001` through `202610160003` are applied locally. No hosted project was linked or modified.

The authenticated `invite-account` Edge Function checks current database authorization and MFA. The owner can invite renters or staff; James can invite renters only. It delegates email invitation to local Supabase Auth, records privacy-minimized request/sent/failure events, rejects unapproved origins on actual requests, and does not assign staff roles or tenant access. Authorized owner access assignment and tenant-contact linking remain separate. The local test follows a Mailpit invitation through first verification, recipient password setup, password sign-in and replay rejection. Public signup stays disabled.

Latest verification: `npm.cmd run test:supabase` passed 18 local Auth/PostgREST/Edge/Mailpit checks and cleaned up fictional fixtures; `npm.cmd test` passed 21 tests; `npm.cmd run build` passed strict TypeScript and Vite production compilation. The migration list confirms all three migrations applied locally. Invitation emails went only to fictional `.invalid` identities in local Mailpit; no real email, hosted account or production data was used.

Handoff caveat: this directory has no `.git` metadata, so there is no branch, working-tree status or commit history to inspect. No files were moved, overwritten or reset. Create/connect a private repository only after the owner authorizes and chooses its destination.

Limitations: invitation expiry is configured for one hour, but elapsed-time expiry has not been tested. The local link was tested for one-time use and replay rejection. No frontend sign-in/invitation callback/password setup, recovery UI, safe resend flow, first-owner bootstrap, or user access-assignment workflow exists. No hosted Auth/JWT, production email/origin, backup/restore or recovery operations have been tested. Local TOTP verification tests authorization, not real-user MFA enrollment/recovery UX. No full browser accessibility audit; no production readiness claim.

Next steps, in dependency order: implement and test a local-only first-owner bootstrap with no browser exposure; build the smallest sign-in and invitation callback/password setup UI using the verified local Auth behavior; decide safe resend/expiry and account-to-role/contact assignment process; test the exact expiry, recovery and failure/retry cases; then do keyboard/zoom/narrow-reflow/browser accessibility checks. Keep real email and hosted services out of scope absent explicit authorization.

Financial posting remains blocked on landlord decisions in `DECISIONS.md`, including charging basis/schedule, deadlines/grace, allocation and advance credit, move-out proration, fees/deposits/utilities, opening balances and check-clearance/reversal approval. The current interface is still fictional and non-saving. Do not invent these rules.

## Completed predecessor: database access foundation
`supabase/migrations/202610160001_access_foundation.sql` implements property, staff membership, tenant, tenant contact and audit tables with constraints and RLS. Browser roles have SELECT only; guarded transactional functions handle tenant creation, owner-managed access and identity archival. Staff require MFA (`aal2`); user-editable metadata cannot grant roles. Current memberships govern access, including revocation with an existing token.

Security/consistency includes a composite property/tenant foreign key, no anonymous function execution, empty definer search paths, property locks for access mutations, last-owner protection, atomic audit and mutations, retry-safe tenant creation using a caller UUID, archived identity retention and contact revocation. This archival is not a complete move-out procedure.

PGlite tests execute the SQL in a development-only PostgreSQL engine. Local Supabase API tests additionally exercise real local Auth, PostgREST, MFA verification and invitation emails captured by Mailpit. Both use fictional fixtures and clean them up. These do not establish hosted or production behavior.

See [DECISIONS.md](DECISIONS.md), [SECURITY.md](SECURITY.md), and [supabase/README.md](../supabase/README.md) for the current contracts and limitations. Routine UI decisions may proceed without design approval; database/access dependencies come before new features.

## Earlier milestones (historical)
The entries below preserve earlier evidence and next steps. Their statements about missing backend work describe that earlier point in time; use the current milestone and ROADMAP.md tracker for today's state.

Milestone 1: local foundation and fake-data readability prototype. Existing empty Desktop folder reused; no additional project directory created. Requirements retained in USER_REQUIREMENTS.txt.

Implemented: React/strict TypeScript/Vite/Tailwind setup, renter/staff/reference screens, fictional search and non-saving form, initial documentation. No financial computation, database, authentication, export, account issuance or deployment yet.

Verification: dependency installation completed (40 packages); lockfile saved. `npm.cmd run build` passed strict TypeScript and Vite 8.3.4 production compilation. Local Vite startup succeeded and HTTP GET returned 200. Server stopped after verification; restart with `npm.cmd run dev`.

Measured WCAG relative-luminance ratios: main text/background 14.05, main text/white 15.10, secondary/white 8.06, secondary/background 7.50, white/action 7.36, white/hover 10.56, action/light hover 6.53, border/white 3.87, border/background 3.60, error/white 7.94, disabled text/background 7.03, notice text/background 13.78. Measurements cover the principal specified pairs, not full rendered-state accessibility certification.

Browser preview attempt failed because no browser is connected (browser inventory empty). Browser/keyboard/zoom/screen-reader validation and user readability review remain required. Not production-ready. No remote services, purchases or deployment performed.

## Milestone 1 follow-up — 16 Oct 2026
User requested continued development while landlord rules remain unknown. Improved the existing form without adding new product screens or financial writes:
- Extracted PaymentReportForm and pure domain validation from App.
- Full entered-details preview, edit-with-preserved-input, field-linked errors, error summary focus, review heading focus, and explicit non-saving wording.
- Exact BigInt centavo parsing/formatting compatible with the proposed numeric(14,2) range; no floating-point money arithmetic. This range is a technical schema limit, not a landlord policy.
- Philippine business-date handling, real calendar validation and rejection of future actual handovers. This does not reject postdated check dates; check-date policy remains undecided.
- Corrected tenant search to match normalized substrings of the actual fictional name/unit instead of matching any occurrence of Alex, Room or 01 in an arbitrary query.
- Added six built-in Node tests; all passed. Strict TypeScript and production build passed. No new dependencies.

Tests cover exact 0.10 + 0.20, maximum monetary value, centavo formatting, invalid/lossy inputs, Manila midnight/year boundary, invalid calendar dates/leap year, September rent reported in October, cash/check preview validation and invalid report fields. These are client-domain tests, not accounting transaction or security evidence. Browser interaction, error announcement, focus, zoom and reflow still require actual browser validation; no WCAG compliance claim.

Next: user reviews the current screens; verify browser interactions when available; collect landlord rules and resolve supported onboarding. Then design schema and trusted permissions for one complete cash workflow. No backend, financial posting, account provisioning or remote deployment implemented. Approval evidence for James's check clearance/reversal authority remains unresolved.

## Setup diagnostic follow-up
The user reported setup exiting before the email prompt. The failure did not reproduce on inspection: local status, loopback validation and the empty-property check passed. Added `npm.cmd run setup:local -- -CheckOnly`, which passed through the same npm/Windows PowerShell entry point without writing accounts or records. Setup errors now identify the failed stage without exposing raw provider responses or credentials. The original transient cause is unconfirmed; interactive owner creation still awaits the user's private email/password entry. Do not reset or automatically retry after an uncertain Auth creation response.

### Setup output-format fix
The repeated property-check failure was traced to Supabase CLI agent detection: `db query --agent no` renders a table, while the automated environment received a JSON envelope. Setup now requests `--agent no --output-format json`, validates the returned row array and rejects missing/malformed counts. Verified the read-only prerequisite check in a terminal and the actual interactive command reaching the email prompt, then cancelled before entering identity or creating data. No migrations or reset were needed. This supersedes the earlier unconfirmed-cause note.
