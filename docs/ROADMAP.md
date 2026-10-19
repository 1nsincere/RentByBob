# Roadmap — updated 19 Oct 2026
## Progress tracker

Use [STATUS.md](STATUS.md) for verification evidence and [DECISIONS.md](DECISIONS.md) for unresolved rules. Dates below are planning targets, not completion claims.

| Milestone | Current state | Remaining gate |
| --- | --- | --- |
| Staff UI and preview workflows | Dashboard, directory, illustrative property view, cash preview, Paid rent report and sample acknowledgment are implemented and browser-tested | Manual staff review; all preview data is fictional and resets on reload |
| Database access foundation and hosted development | Eleven access migrations, Auth/MFA, RLS, identity-bound access and invitation workflow are implemented; fictional hosted development exists | Independent review of the cumulative access boundary; do not confuse hosted development with production |
| Local cash schema and saved workflow | `202610180001_cash_rent_foundation.sql` applied locally; five financial tables with RLS; no financial records/verifier seeded | Owner must identity-confirm the designated clerk; create only reviewed local room agreements/charges; hosted and production untouched |
| Rental agreements and charges | Live Postgres RPC creates one responsible tenant/room agreement and manually adds an idempotent monthly charge with anniversary clamping | Review existing tenant/room terms before first write; no automatic billing or move-out workflow |
| Cash report, confirmation and acknowledgment | Live Postgres RPC records pending cash; only explicit MFA clerk verifier confirms; allocation is oldest-first; immutable acknowledgment can be reopened | Verified in isolated local API/Auth/browser tests; run first owner-approved local transaction after identity and terms review |
| Saved staff account statement | Read-only agreement timeline shows charges, confirmed cash, allocations and current charge remaining; pending reports are separate | Focused unit and isolated cash browser checks passed; tenant access and exports remain separate |
| Basic check register and handover log | New migration and staff UI drafted; sequential references, owner-controlled transitions, cleared-only rent allocation, and owner-entered expected/actual handover totals | PGlite tests pass; isolated Supabase API/browser verification and local migration application remain |
| Renter portal and reports | Tenant records view exists; saved read-only Paid rent report is wired into authenticated staff payments | Tenant-facing financial statements are explicitly deferred; saved report still needs local API/browser verification; exports remain out of scope |
| Release readiness | No production deployment | Accessibility audit, independent security review, opening-balance plan, backup/restore rehearsal, owner acceptance and a parallel paper-record payment cycle |
| Day/night and language preference | Browser-persisted preferences; shared dark-theme action/surface tokens now cover the dashboard, directory, forms and reports; broad English/Bisaya coverage includes authenticated staff/admin/security and fictional previews | Complete rendered screen-by-screen copy review with a fluent Bisaya speaker; run focused authenticated browser checks after Docker's Linux engine is available; full visual/accessibility review |
| Paid rent report follow-up | Read-only saved report is implemented; fictional preview and responsive report checks pass | Compare saved report output against authorized local Supabase fixtures before adding report features or exports |

## Current next step: complete rendered language and theme verification

The language preference updates app-authored copy and the document language while leaving saved names, emails, labels, dates, amounts and records unchanged. The shared theme tokens now separate filled action colors from link colors and theme the dashboard/report surfaces. Source-search and preview checks are not a complete authenticated screen review or fluent-speaker verification; see [STATUS.md](STATUS.md) for evidence and blockers.

Next: start Docker Desktop's Linux engine and confirm `docker info --format '{{.ServerVersion}}'` succeeds; run `npm.cmd run test:browser -- tests/browser/access.spec.ts` against the unique disposable local stack; then review rendered screens in both languages with a fluent speaker and review the theme at narrow widths. Do not claim complete translation or accessibility conformance before those checks. The next feature milestone is isolated Supabase API/concurrency/audit-rollback/browser verification of the drafted check and handover workflow via `npm.cmd run test:cash:supabase`; keep that migration unapplied unless every gate passes. Saved Paid rent report validation remains a later read-only step.

## Financial operations remain separately gated

The staff/admin feature inventory is maintained in [ADMIN_CAPABILITIES.md](ADMIN_CAPABILITIES.md), including current gaps and operational gates. The saved Paid rent report reuses the existing authorized staff snapshot and is read-only; its local API/browser verification remains pending. User explicitly deferred renter-facing financial statements. The basic check and handover migration is drafted; run it against an isolated Supabase stack and verify its API, concurrency, audit rollback and browser behavior before applying it locally. No language work bypasses that migration gate.

The first saved cash workflow remains gated on owner identity and rent-term review. After the independent language checks, the owner must verify the exact clerk account and review local renter/room/rent terms before any first financial transaction. Do not seed or infer financial terms.

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
