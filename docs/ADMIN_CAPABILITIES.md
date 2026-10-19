# Admin and staff capabilities

Updated 19 Oct 2026. This is an implementation inventory, not a production-readiness claim. The authenticated workspace uses local Supabase unless started with the explicit hosted-development launcher. The no-sign-in preview is fictional and resets on reload.

## Available in the authenticated workspace

| Area | What an authorized staff account can do | Current boundary |
| --- | --- | --- |
| Sign-in and security | Sign in, complete required staff authenticator MFA, add a backup authenticator, recover a password, and sign out. Access is checked against current database membership. | All-factors-lost recovery still needs an owner-run procedure and drill. Hosted-development email invitations/recovery are unavailable. |
| Dashboard | See the signed-in account and shortcuts to payments, tenant creation, property locations, and tenant search. | It is a navigation page, not an operational collections dashboard with live financial KPIs. |
| Tenant directory | Search authorized property records and create individual or business tenant records. | No persisted occupant/household list, unit assignment, agreement, move-out, duplicate-person resolution, or tenant edit flow. Access assignment is separate. |
| Buildings and units | Staff can view property locations. Owners can create, rename, and archive buildings/sections and units; archive retains history and archiving a building archives its units. | No live site map, measured floor plan, bed model, occupancy assignment/capacity, or reactivation workflow. Preview map geometry is illustrative and temporary. |
| Invitations | Owner can invite renter or staff accounts; clerk can invite renters. Stable attempts and guarded provider dispatch are recorded. | Invitation does not assign access or prove delivery. Same-recipient reissue/resend is unavailable pending policy. Hosted-development email is unavailable. |
| Account access | Owner can find an exact account email, review the matched identity, assign tenant contact or staff access, and disable access with audit. | Owner must verify real-world identity and tenant relationship. Clerks cannot grant access. No bulk management or self-service renter linking. |
| Invitation review | Owner can inspect masked invitation attempt state/evidence, continue only a saved `prepared` request, and append a review note. | Cannot resend, override uncertainty, prove inbox delivery, or grant access. Recipient-retention/reissue policy remains open. |
| Access history | Owner can read up to 100 recent access-related events for the property. | This is access history, not a complete financial or property activity ledger. |
| Saved agreements and charges | In local saved Payments and balances, staff can create one responsible-tenant-per-room agreement and manually add an idempotent monthly charge using the saved terms and move-in anniversary date rule. | Preserved local financial tables are empty. Actual tenant/room/terms review gates the first record. No recurring charge generator, edits, move-out, deposits, utilities, fees, proration, opening balances, or general occupancy lifecycle. |
| Cash records | Staff can record cash already handed to Bob or James as pending. The saved form requires existing positive rent balance and blocks amounts above it. The designated MFA verifier confirms pending cash; allocation is oldest unpaid first and confirmation issues a stable acknowledgment. | No verifier is assigned. James's exact account identity must be confirmed first. Pending cash does not reduce balances. No advance credit or cash/check matching workflow. |
| Check register | A clerk can record a check against an agreement and gets a sequential reference such as `CHK-0001`. An owner can record deposit, bank-confirmed clearance, return, or reasoned reversal. Only cleared checks reduce rent and are allocated oldest due first. | Migration and UI are drafted and PGlite-tested, but not yet checked against Supabase API/browser or applied locally. The first UI does not capture bank name, check number, check date or images. Excess check credit is rejected; no cash/check matching exists. |
| Collection handovers | Owner can save clerk-stated cash/check totals, actual amounts received, date and a reason for any difference. | Migration and UI are drafted and PGlite-tested, but not yet checked against Supabase API/browser or applied locally. This is a one-step owner log, not a clerk submission/owner acceptance or full reconciliation workflow. |
| Account statement | Staff can read saved charges, confirmed cash by actual receipt date, rent months allocated, current remaining amount per charge, and reopen an acknowledgment. | Read-only staff view. No renter-facing balance/history or export. |
| Reports | Authenticated local Payments and balances now includes a read-only Paid rent report from the saved staff snapshot: confirmed cash by actual receipt month, recorded outstanding charges by rent month, and arrears across two or more recorded months. The fictional preview has a similar report. | The saved report is not yet integration-checked against the local API because Docker is stopped. No Excel export, report scheduling, or inference for months without a charge. Pending cash and uncleared checks are excluded. |

## Missing before routine operational use

1. Owner confirms the exact existing clerk Auth identity and decides who may verify cash; assign only after that check.
2. Owner reviews real tenant, room and rent terms before the first saved agreement or charge. Do not infer terms from preview data.
3. Complete the first narrow local saved-cash workflow and reconcile it against the paper record: approved agreement, charge, pending report, clerk confirmation, acknowledgment reprint, and balance check.
4. Finish isolated Supabase API/browser verification of the check and handover migration, then apply it locally after review. Resolve remaining billing policies before expanding finance: grace/late fees, opening balances, advance/excess credit, move-out treatment, and reconciliation evidence.
5. Decide the persisted occupancy/agreement lifecycle. Current tenant access only exposes authorized tenant directory records; renter-facing financial statements are explicitly deferred and do not expose payment actions.
6. The saved read-only on-screen Paid rent report is implemented; saved downloadable reports and spreadsheet exports remain separate work requiring privacy review, formula-injection protection, totals verification, and visual inspection.
7. Finish operational readiness: full accessibility review, independent security/accounting review, backups and restore drill, owner acceptance, and a parallel paper-record payment cycle. Production deployment is not authorized.

## Recommended practical projects

These four projects give useful outcomes in dependency order. Each should remain a separate reviewable milestone.

1. **Activate one approved local cash workflow.** Verify the existing clerk identity, review one real tenant/room/rent setup, then use the already-built saved agreement, charge, pending cash, confirmation, acknowledgment, and reload path. This proves the current feature against owner-approved local terms before adding more finance. It is blocked until the owner completes those reviews.
2. **Verify the saved Paid rent report locally.** Sign in after local Supabase is running, compare the saved on-screen totals and rows against known fictional records, and refine any confusing staff terminology. Keep it read-only; defer exports.
3. **Keep renter-facing financial statements out of scope for now.** User directed that renter statements remain out of the renter portal. The staff-only account statement remains the available view. Revisit only after a new explicit scope and tenant-contact visibility decision.
4. **Complete local check and handover verification.** A basic sequential-reference check list, owner-controlled status transitions, cleared-only settlement, and one-step owner-entered handover log are implemented in a new migration and staff UI. PGlite checks pass; isolated Supabase/browser checks and local migration application remain.

The first saved transaction remains gated on the owner's identity and rent-term review. The saved report is implemented in the UI but waits for local API verification. Renter statements are explicitly deferred. Check and handover implementation is drafted but waits on isolated Supabase/browser verification before local migration application.

## Security and evidence boundaries

Financial writes use PostgreSQL functions with current authorization, MFA checks, row/property locking, exact numeric amounts, idempotency, audit, and tested concurrency/rollback behavior. Exposed financial tables have RLS and no direct browser write grants. The cash integration suite runs on its own disposable local Supabase project. The preserved local financial tables currently contain no verifier, agreement, charge, or cash record. Hosted development and production have not received this cash migration.

See [STATUS.md](STATUS.md), [ROADMAP.md](ROADMAP.md), [DATA_MODEL.md](DATA_MODEL.md), [SECURITY.md](SECURITY.md), [DECISIONS.md](DECISIONS.md), and [BUSINESS_RULES.md](BUSINESS_RULES.md) for evidence and decision history.
