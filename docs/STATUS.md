# Status - 16 Oct 2026, Asia/Manila
## Current milestone: working local access and basic directories

The runtime now connects to actual local Supabase Auth/PostgreSQL. Sign-in, invitation callback/password setup, owner identity-confirmed contact/staff assignment, staff TOTP enrollment/challenge, backup authenticator recovery, authorized landing pages, sign-out and disabled/unassigned states are implemented. Invitation acceptance grants no application permission. James can invite renters and create tenant records; every access assignment remains owner-only. Exact verified email/UUID matching and property scope are enforced in trusted SQL; legacy ID-only access RPC grants are revoked.

Six migrations (202610160001 through 202610160006) are applied locally only. Staff can read authorized property/building/unit and tenant directories; owners can create buildings/units, and staff can create/search tenants. Runtime failures show errors and hide records, never substitute fictional prototype data. Access is rechecked on focus, manually and every 10 seconds; database revocation applies to each request even with an existing JWT.

Verification on this date: 25 isolated tests passed; strict TypeScript and production build passed; two real local browser scenarios passed. All 19 standard local API checks passed and their fictional fixtures were removed. Browser checks cover owner/clerk authorization, renter isolation, unassigned invitations, malicious/mismatched assignment denial, existing-session revocation, MFA enforcement, backup-factor recovery, password recovery without MFA bypass, callback errors/replay/expiry, offline handling, keyboard/focus, 320px reflow, doubled text and CSS-simulated 200% zoom. Expiry is tested by backdating only disposable Auth fixture timestamps, not waiting a real hour. This is not a full native-browser zoom, screen-reader or WCAG audit.

The local stack was restarted without resetting data. The standard tests clean up their own fictional fixtures; bootstrap tests were not rerun against an initialized database. Isolated bootstrap tests cover atomicity and rejection paths. The optional interactive setup helper's fresh-owner path still needs a separate disposable-environment manual rehearsal; parallel-session bootstrap remains untested.

Git: user selected and authorized private https://github.com/1nsincere/RentByBob. Existing commits are retained and main tracks origin/main. No hosted Supabase, real emails, real accounts, purchases or deployment.

Remaining mock screens: old financial/payment preview and design reference are retained only under src/prototype, outside runtime imports. No saved payment reports, charges, balances, occupancy/agreement assignment, acknowledgments or exports exist. Pending reports and uncleared checks never reduce settled balances.

Open limitations: safe invitation resend and uncertain-delivery reconciliation, injected partial-send failure testing, real elapsed expiry, no-email onboarding, paper issuance implementation, all-factors-lost administrative recovery drill, independent security and accessibility review. See [onboarding](ONBOARDING.md) for supported recovery and paper-delivery design; no permanent password retrieval or hidden MFA bypass exists.

Exact next milestone: owner directory rename/archive with retained history and account/contact audit review, including direct API/browser checks. Continue policy-independent work; [business decisions](BUSINESS_RULES.md) maps each outstanding landlord rule to its affected financial feature. Do not infer billing or approval policies.

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
