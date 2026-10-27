# Roadmap — updated 26 Oct 2026
## Progress tracker

Use [STATUS.md](STATUS.md) for verification evidence and [DECISIONS.md](DECISIONS.md) for unresolved rules. Dates below are planning targets, not completion claims.

| Milestone | Current state | Remaining gate |
| --- | --- | --- |
| Staff UI and preview workflows | Dashboard (with live current-month collection figures in the saved workspace), directory showing which tenants have a renter login, property map and building front view drawn from entered room counts, cash preview, Paid rent report, acknowledgments and preview-only rent-change review are implemented and browser-tested. Theme v2 (navy sidebar, blue gradients, icon tiles, motion with reduced-motion support) applied 26 Oct. Unsaved entries now survive access re-checks, and leaving with unsaved form typing asks first | Manual staff review on the running app; all preview data is fictional and resets on reload; saved rent-term editing remains unimplemented |
| Database access foundation and hosted development | Eleven access migrations, Auth/MFA, RLS, identity-bound access and invitation workflow are implemented; fictional hosted development exists | Independent review of the cumulative access boundary; do not confuse hosted development with production |
| Local cash schema and saved workflow | `202610180001_cash_rent_foundation.sql` applied locally; five financial tables with RLS; no financial records/verifier seeded | Owner must identity-confirm the designated clerk; create only reviewed local room agreements/charges; hosted and production untouched |
| Rental agreements and charges | Live Postgres RPC creates one responsible tenant/room agreement and manually adds an idempotent monthly charge with anniversary clamping | Review existing tenant/room terms before first write; no automatic billing or move-out workflow |
| Cash report, confirmation and acknowledgment | Live Postgres RPC records pending cash; only explicit MFA clerk verifier confirms; allocation is oldest-first; immutable acknowledgment can be reopened | Full isolated Supabase suite passed on 26 Oct 2026 (18 API + 10 browser checks). Preserved local tables are documented empty and the first owner-approved local exercise remains unverified |
| Saved staff account statement | Read-only agreement timeline shows charges, confirmed cash, allocations and current charge remaining; pending reports are separate | Focused unit and isolated cash browser checks passed; tenant access and exports remain separate |
| Basic check register and handover log | Migration and staff UI drafted; sequential references, owner-controlled transitions, cleared-only rent allocation, and owner-entered expected/actual handover totals | PGlite and isolated Supabase API/Auth/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback/browser checks passed on 26 Oct 2026; migration remains unapplied locally pending owner review, a local backup and explicit approval |
| Renter portal and reports | Renter self-service view (room, rent, balance, rent by month, confirmed payments, acknowledgments; pending shown separately) added 26 Oct 2026 via read-only `read_renter_account()`; PGlite isolation, live API and live renter sign-in checks pass; migration not yet applied locally. Saved read-only Paid rent report is wired to the authenticated staff snapshot and uses exact minor-unit aggregation; pure report calculations now have focused fictional unit tests | Owner approval to apply `202610190001` and `202610260001` locally, then review with one fictional linked renter; decide how returned checks are communicated to renters. Saved report passed isolated API/browser checks on 26 Oct 2026 after fixing a month-format crash on database dates; exports remain out of scope |
| Release readiness | Read-only GitHub Actions checks run tests/build/artifact guards; payment, property, renter and owner-only screens are lazy-loaded on first visit, and a failed screen download or render shows a recoverable message in that section; `npm run test:offline` runs nine offline browser checks and a second CI job runs them (not yet run on GitHub); the disposable live Supabase suite passes (API, Auth/MFA, RLS, idempotency, concurrency, audit rollback, staff and renter browser flows); no deploy job | Owner-controlled separate staging Supabase project and reviewed exact-project build target are not configured. Current production build rejects all Supabase connections. Still require independent security/accounting review, recovery rehearsal, accessibility/performance evidence, owner acceptance and paper-record pilot. Production deployment remains unauthorized |
| Day/night and language preference | Browser-persisted preference; shared dark-theme tokens; mounted app copy has broad English/Bisaya coverage; this milestone fixes environment/workspace labels and report/check fallbacks and adds offline browser assertions | Review rendered authenticated admin, security/MFA, report and check/handover screens with a fluent Bisaya speaker; some provider/technical terms remain English; no complete translation or accessibility claim |
| Paid rent report follow-up | Read-only saved report is implemented and passed isolated Supabase browser checks with fictional fixtures | Staff review of terminology on the running app before adding report features or exports |
| Backup and recovery readiness | Authenticator backup-factor path is implemented; provider database backup/restore coverage and all-factors-lost process are not evidenced | Owner chooses RPO/RTO, retention and recovery ownership; rehearse backup/restore only between separately identified disposable local stacks with fictional data |
| Public available-room listing for prospective renters | Implemented 26 Oct 2026: staff-listed rooms only, hidden automatically while a current or upcoming agreement exists; public `/rooms` page with building tabs and an inquiry form; staff inquiry inbox; verified in PGlite and live disposable checks | Must first define how availability is known and kept current, which fields/buildings/rooms the owner explicitly publishes, privacy boundaries, and inquiry/contact handling. Existing saved data has no occupancy lifecycle; do not infer vacancy from the absence of an agreement or charge. Keep the preview fictional and do not generate a real QR or deploy a public listing until authorized |

## Waiting on owner decisions - 26 Oct 2026

Development can continue without these, but each blocks the item it names:

1. **Apply migrations locally:** stop the app, run `npx.cmd supabase db push --local` (applies 202610270004–0010: one-step add tenant, archive guard, default privileges, remembered devices, automatic listings, automatic rent/room change/remove, advance credit), then `npx.cmd supabase stop` and `npx.cmd supabase start` for the stricter sign-in settings. Turn on automatic rent and automatic listing only after every current tenant, room and rent is entered.
2. **Clerk identity:** confirm James's exact existing account before he is assigned as cash verifier. This blocks the first real saved cash confirmation.
3. **Real rent terms:** review the actual tenant, room and rent terms before the first saved agreement or charge.
4. **Returned checks:** decide whether and how renters are told about a returned check. Currently it is omitted from the renter view.
5. **Staging:** create a separate staging Supabase project before any hosted deployment work. Consider raising its minimum password length to match the app's 12.
6. **Backups:** daily with 30-day retention was chosen and the restore rehearsal passes; schedule the daily task (command in OPERATIONS.md) and keep a second off-machine copy.
7. **Public room listing:** built and tested; before going public, authorize hosting, decide on a CAPTCHA, confirm the 90-day inquiry retention, and create the QR code for the final address.

## New feature request: public room availability

On 22 Oct 2026, the user requested a guest-facing, view-only page for people who inquire about rentals. A prospective renter should be able to open a website or scan a QR code, see which owner-approved rooms are available, and see the building each listing belongs to. This is a public information surface, separate from sign-in, staff controls, renter accounts, and financial records; public visitors do not register or make payments through this feature.

The first implementation slice is a development-only page using explicitly fictional room/building labels. It is isolated from the authenticated app and the database. It demonstrates grouping and readable availability labels only; it does not establish how real availability is determined.

Before connecting any real record, resolve:

1. What explicit owner/staff action publishes a room, and who can publish/unpublish it?
2. What facts establish that a room is genuinely available, how quickly must changes appear, and how is a stale listing handled? Do not treat missing tenant/agreement/charge data as proof of vacancy.
3. Which details may be public (building/room labels, photos, rent amount, amenities, location, contact details), and which must never be shown (tenant identities, accounts, payment records, staff/security data)?
4. Should visitors only view listings, or may they submit an inquiry? No public form/contact route is included in this slice.
5. Once the stable public URL exists, create a QR code that points to that URL; QR is only a pointer and does not grant access control. Owner authorization is required before public deployment.

Use a dedicated minimal public read model or static published listing. Never fetch private staff/tenant/financial snapshots and hide fields in the browser. Security review must verify anonymous access is limited to explicitly published listing fields.

## Release readiness first slice - 22 Oct 2026

Added a GitHub Actions quality workflow with read-only repository permissions and no deployment credentials/job. `npm run verify:release` runs the unit suite, strict production build, and artifact checks that ensure index asset references resolve and the public availability prototype is absent from production JavaScript.

Deferred initial loading of saved payments, property directory and owner/admin sections until each screen is opened. Build output shows the App chunk at 37.01 kB (10.58 kB gzip), with major screens emitted as separate chunks. All seven offline browser preview checks pass, including the property-preview facade and payment rent-draft checks. This is a code-splitting result only; deployed mobile performance has not been measured.

Staging is not ready to provision/deploy yet: there is no owner-approved staging Supabase project, and the current connection allowlist rejects hosted Supabase in compiled production builds. Keep this fail-closed. Next, after the owner creates an isolated staging project, add a reviewed exact-project target and verify it cannot connect to local, hosted-development, or production projects by accident. Only then configure a manual Cloudflare Pages staging site. This work does not deploy or touch backend data.

## Disposable integration-runner preflight - 22 Oct 2026, 17:56 +08:00

The cash integration runner now requires a successful Docker Linux-engine version check before creating its temporary project workspace or invoking Supabase. This reduces partial setup and ensures the runner itself fails closed when its disposable-stack prerequisite is unavailable.

`npm.cmd run test:cash:supabase` was invoked to verify that guard. It stopped before creating a workspace or starting a stack because Docker Desktop's Linux engine is unavailable. No database tests ran; the saved report and check/handover integration assertions remain unverified. This is an operational safety improvement only, not a passed Supabase integration or readiness score.

Exact next step: start/recover Docker Desktop's Linux engine; confirm `docker info --format '{{.ServerVersion}}'` returns a version; then run `npm.cmd run test:cash:supabase` against its disposable fictional stack. The runner will repeat the preflight itself. Never target the preserved local database, hosted development, or production.

## Isolated saved-cash, report and check/handover verification - 22 Oct 2026, 17:52 +08:00

Project records show an earlier successful disposable Supabase integration for the saved cash workflow (including Auth/MFA, RLS, idempotency, concurrency, audit rollback, and authenticated browser checks). They do not show a successful run of the newer saved Paid rent report integration assertions or the drafted check/handover API/Auth/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback/browser checks. The check/handover migration remains unapplied to the preserved local database.

At 17:52 +08:00, `docker info --format '{{.ServerVersion}}'` failed because the Docker Desktop Linux-engine pipe `//./pipe/dockerDesktopLinuxEngine` was not found. Therefore `npm.cmd run test:cash:supabase` was not run and no new API/Auth/MFA/RLS/idempotency/concurrency/audit/browser result was produced. No database was reset, migrated, seeded, or otherwise changed; hosted and production systems were not contacted.

Exact next step: start/recover Docker Desktop's Linux engine, confirm `docker info --format '{{.ServerVersion}}'` returns a server version, and only then run `npm.cmd run test:cash:supabase` against its disposable fictional stack. Never substitute the preserved local database or hosted development.

## Isolated verification passed - 26 Oct 2026

The full disposable suite passed (exit 0). It found and fixed a real crash in the saved Paid rent report (database `YYYY-MM-01` months were double-suffixed) and a glossary reflow bug, plus several never-executed test-script errors. The isolated-verification gate below is therefore met. Exact next step: owner reviews the check/handover migration and evidence, a backup of the preserved local database is taken, and only with explicit approval is `npx.cmd supabase db push --local` run against `127.0.0.1:54321`. See [STATUS.md](STATUS.md).

## Previous priority (historical): verify saved workflows and the isolated check/handover gate

Saved Paid rent calculations have direct fictional unit tests for receipt-vs-confirmation month, pending/check exclusion, charge-month outstanding totals, no-charge months and exact minor-unit arithmetic. Earlier isolated saved-cash integration passed, but the newer saved-report assertions and drafted check/handover Supabase gates remain unverified. The latest Docker preflight at 17:52 +08:00 failed because `//./pipe/dockerDesktopLinuxEngine` is missing. Do not run the suite against, reset, or migrate the preserved local database. Once Docker is healthy, run `npm.cmd run test:cash:supabase`; it creates a uniquely named disposable local stack with fictional identities/data and applies the current migrations only there. It must pass saved-cash, report, check/handover API/Auth/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback and authenticated-browser checks. The runner checks the saved Paid rent view's receipt-month totals, charge-month outstanding amounts, pending/check exclusion, and no-charge empty state. Only after all isolated gates pass may the drafted check/handover migration be applied locally.

The first owner-approved exercise against the preserved local records remains a separate gate: do not assign a verifier or add financial records until the owner verifies the exact clerk account, approves the fictional test fixture, and reviews its terms. In parallel, review English/Bisaya authenticated admin/security/report screens with a fluent speaker and approve a disposable-only recovery drill scope and provisional RPO/RTO. See [OPERATIONS.md](OPERATIONS.md) for the owner checklist. No restoration readiness or full accessibility/language completion is claimed.

## Financial operations remain separately gated

The staff/admin feature inventory is maintained in [ADMIN_CAPABILITIES.md](ADMIN_CAPABILITIES.md), including current gaps and operational gates. The saved Paid rent report reuses the existing authorized staff snapshot and is read-only; its local API/browser verification remains pending. User explicitly deferred renter-facing financial statements. The basic check and handover migration is drafted; run it against an isolated Supabase stack and verify its API, concurrency, audit rollback and browser behavior before applying it locally. No language work bypasses that migration gate.

The first saved cash workflow remains gated on owner identity and rent-term review. The owner must verify the exact clerk account and review local tenant/room/rent terms before any financial transaction. Use only explicitly owner-approved fictional local test data; do not seed or infer financial terms.

Keep this narrow: verify the designated account, review the real local tenant/room/rent terms, then exercise one saved agreement, monthly charge, pending-cash report, verifier confirmation, and acknowledgment reprint. Do not include checks, automatic monthly billing, excess credits, adjustments, reversals, move-out, Excel exports or production deployment.

1. Verify James's account identity using the owner's existing confirmed-account workflow. Assign only the exact approved clerk account as cash verifier; do not infer from display name.
2. Review actual local tenant, room and rent terms before creating an agreement or rent charge. Keep the first transaction narrow and fictional/local if the terms are not approved.
3. Run one saved workflow: create agreement, add a monthly charge, record cash as pending, verify receipt, confirm as the designated MFA clerk, and reopen the immutable acknowledgment after reload.
4. Confirm that only verified cash affected the balance and record any confusion or missing process evidence before widening scope.

Verification completed: cash-specific live API/Auth/concurrency and browser tests passed on a separate disposable Supabase stack. The reviewed cash migration is applied to the preserved local database, and RLS was verified on all five financial tables. No local verifier, agreements, charges or cash reports have been populated yet. Do not use actual collections until account identity and rent terms have been reviewed.

Small operational fix completed before that owner-dependent step: the saved Payments screen now summarizes live setup status and blocks a pending cash report if its exact amount exceeds the current balance or there is no positive balance. This prevents a report that the confirmation transaction would later reject because advance credit is not configured. It does not authorize or create terms, verifier assignments, agreements, charges or receipts.

Operational workflow improvement: pending cash is now in a property-wide verifier queue, with tenant/room/date/collector context. The assigned verifier can begin review directly from the queue; owner and other staff can see pending state but do not receive a confirmation action. This uses the existing authorized read RPC and confirmation RPC only.

## Schedule and scope

As of 19 Oct 2026, the 1 Dec pilot target is 43 days away and the requested first release before 1 Jan 2027 is 74 days away. The full brief is too broad to promise on that schedule: policy decisions, live financial integration, checks/reconciliation, renter-facing views, exports, independent review and restore testing remain. Treat 1 Dec as conditional, potentially a controlled parallel pilot only if every financial/security/recovery gate and owner acceptance pass. Move dates rather than omit safeguards.

Defer email reminders, complex PDFs and nonessential polish. No production deployment, real-data import, paid service change or hosted migration without separate explicit authorization.
