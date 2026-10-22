# Roadmap — updated 22 Oct 2026
## Progress tracker

Use [STATUS.md](STATUS.md) for verification evidence and [DECISIONS.md](DECISIONS.md) for unresolved rules. Dates below are planning targets, not completion claims.

| Milestone | Current state | Remaining gate |
| --- | --- | --- |
| Staff UI and preview workflows | Dashboard, directory, illustrative property view, cash preview, Paid rent report, sample acknowledgment, clearer payment history and preview-only rent-change review are implemented and browser-tested | Manual staff review; all preview data is fictional and resets on reload; saved rent-term editing remains unimplemented |
| Database access foundation and hosted development | Eleven access migrations, Auth/MFA, RLS, identity-bound access and invitation workflow are implemented; fictional hosted development exists | Independent review of the cumulative access boundary; do not confuse hosted development with production |
| Local cash schema and saved workflow | `202610180001_cash_rent_foundation.sql` applied locally; five financial tables with RLS; no financial records/verifier seeded | Owner must identity-confirm the designated clerk; create only reviewed local room agreements/charges; hosted and production untouched |
| Rental agreements and charges | Live Postgres RPC creates one responsible tenant/room agreement and manually adds an idempotent monthly charge with anniversary clamping | Review existing tenant/room terms before first write; no automatic billing or move-out workflow |
| Cash report, confirmation and acknowledgment | Live Postgres RPC records pending cash; only explicit MFA clerk verifier confirms; allocation is oldest-first; immutable acknowledgment can be reopened | Prior isolated integration evidence exists; preserved local tables are empty and first owner-approved local exercise remains unverified |
| Saved staff account statement | Read-only agreement timeline shows charges, confirmed cash, allocations and current charge remaining; pending reports are separate | Focused unit and isolated cash browser checks passed; tenant access and exports remain separate |
| Basic check register and handover log | Migration and staff UI drafted; sequential references, owner-controlled transitions, cleared-only rent allocation, and owner-entered expected/actual handover totals | PGlite coverage and a disposable Supabase runner exist; live API/Auth/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback/browser checks are blocked because Docker Linux engine is unavailable; migration remains unapplied locally |
| Renter portal and reports | Tenant records view exists; saved read-only Paid rent report is wired to the authenticated staff snapshot and uses exact minor-unit aggregation; pure report calculations now have focused fictional unit tests | Tenant-facing financial statements are explicitly deferred; saved report browser assertions are in the disposable integration runner but have not run; exports remain out of scope |
| Release readiness | Read-only GitHub Actions checks now run tests, strict build, and production-artifact guards on PRs/pushes to main; no deploy job | Owner-controlled separate staging Supabase project and reviewed exact-project build target are not configured. Current production build rejects all Supabase connections. Still require live staged access/financial verification, independent security/accounting review, recovery rehearsal, accessibility/performance evidence, owner acceptance and paper-record pilot. Production deployment remains unauthorized |
| Day/night and language preference | Browser-persisted preference; shared dark-theme tokens; mounted app copy has broad English/Bisaya coverage; this milestone fixes environment/workspace labels and report/check fallbacks and adds offline browser assertions | Review rendered authenticated admin, security/MFA, report and check/handover screens with a fluent Bisaya speaker; some provider/technical terms remain English; no complete translation or accessibility claim |
| Paid rent report follow-up | Read-only saved report is implemented; fictional preview and responsive report checks pass | Compare saved report output against authorized local Supabase fixtures before adding report features or exports |
| Backup and recovery readiness | Authenticator backup-factor path is implemented; provider database backup/restore coverage and all-factors-lost process are not evidenced | Owner chooses RPO/RTO, retention and recovery ownership; rehearse backup/restore only between separately identified disposable local stacks with fictional data |
| Public available-room listing for prospective renters | User requested a view-only public page, reachable by website URL or QR code, that groups available rooms by building; a separate fictional development preview is now implemented | Must first define how availability is known and kept current, which fields/buildings/rooms the owner explicitly publishes, privacy boundaries, and inquiry/contact handling. Existing saved data has no occupancy lifecycle; do not infer vacancy from the absence of an agreement or charge. Keep the preview fictional and do not generate a real QR or deploy a public listing until authorized |

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

Staging is not ready to provision/deploy yet: there is no owner-approved staging Supabase project, and the current connection allowlist rejects hosted Supabase in compiled production builds. Keep this fail-closed. Next, after the owner creates an isolated staging project, add a reviewed exact-project target and verify it cannot connect to local, hosted-development, or production projects by accident. Only then configure a manual Cloudflare Pages staging site. This work does not deploy or touch backend data.

## Current priority: verify saved workflows and the isolated check/handover gate

Saved Paid rent calculations now have direct fictional unit tests for receipt-vs-confirmation month, pending/check exclusion, charge-month outstanding totals, no-charge months and exact minor-unit arithmetic. The next required verification remains the authenticated saved-data path. The safe first action is to restore Docker Desktop's Linux engine. On 20 Oct 2026, `docker info --format '{{.ServerVersion}}'` failed because `//./pipe/dockerDesktopLinuxEngine` is missing; `npx.cmd supabase status` returned the same service error. Do not run the suite against, reset, or migrate the preserved local database. Once Docker is healthy, run `npm.cmd run test:cash:supabase`; it creates a uniquely named disposable local stack with fictional identities/data and applies the current migrations only there. It must pass saved-cash, report, check/handover API/Auth/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback and authenticated-browser checks. The runner checks the saved Paid rent view's receipt-month totals, charge-month outstanding amounts, pending/check exclusion, and no-charge empty state. Only after all isolated gates pass may the drafted check/handover migration be applied locally.

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
