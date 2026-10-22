# Persisted local cash workflow - 19 Oct 2026

## Release-readiness CI first slice - 22 Oct 2026

Added `.github/workflows/quality.yml` to run for pull requests targeting `main` and pushes to `main`, with read-only repository permission, Node 24, lockfile install, and no deploy credentials/job. Added `npm.cmd run verify:release` for the complete unit suite, strict production build, and production artifact validation. The artifact check confirms the emitted JavaScript/CSS are referenced from `index.html` and that the development-only public availability preview is absent from production JavaScript.

**Validation:** `npm.cmd run verify:release` passed: unit tests 65/65, strict TypeScript/Vite build, and production artifact check (two JavaScript chunks, one stylesheet, with no public availability preview markers). `git diff --check` passed. Workflow configuration was source-reviewed; it has not run on GitHub from this worktree.

**Deployment blocker:** There is no owner-approved staging Supabase project configured. `connectionAllowed` currently permits local Supabase, isolated cash-test ports, and one explicitly targeted hosted-development URL only in a development build; it rejects all Supabase URLs in a production build. This is fail-closed, but it means a built staging/production app cannot yet authenticate. Do not loosen this guard without an exact owner-approved staging project and a test proving other projects remain rejected. No backend, database, secrets, Cloudflare project, or production deployment was touched.

**Next exact steps:** owner creates a separate staging Supabase project with synthetic data and provides its exact project identity through their secure setup process; then add/test a project-specific staging target, run the full API/MFA/RLS/financial/browser suite against staging or a disposable stack, and configure a manual Cloudflare Pages staging deployment. Complete accessibility, performance, independent review, recovery drill and owner acceptance before production authorization.

## Fictional public room-listing concept - 22 Oct 2026

Responded to the request for prospective renters to view available rooms by adding a separate development-only page at `/?availability=preview`. The page groups fictional available sample rooms by building, labels the data as fictional and not connected to rental records, and is view-only. Its route dynamically imports only the standalone listing component; it does not initialize the authenticated app, load authorized snapshots, contact Supabase, or make external requests. Added the public-listing request, roadmap decisions and privacy gates to [ROADMAP.md](ROADMAP.md) and [DECISIONS.md](DECISIONS.md).

**Validation:** `node scripts/check-public-availability-preview.mjs` passed, verifying sample building/room groups, fictional-data boundary, view-only controls, visible keyboard skip link, no Supabase/API or external requests, no authenticated app module load, no runtime errors, and no horizontal overflow at 320/390/768px. `npm.cmd test` passed 65/65. `npm.cmd run build` passed and split the authenticated app into a separate chunk; the production output contains no public preview route/component. `git diff --check` passed.

**Limitations and next step:** This is not a real vacancy feed and must not be used to advertise current vacancies. Before connecting records, define who can publish a room, how availability is authoritatively established/currently updated, exactly which fields may be public, and whether inquiries are in scope. Do not infer vacancies from missing agreement/charge data or deploy/QR-link real listings without owner approval.

## Saved property directory search - 22 Oct 2026

Added a read-only search across saved building/section and unit labels. Searching a building retains its units; searching for a unit shows that matching unit with its parent for context. Archived locations stay searchable and visible, since they remain part of the historical directory. A live count reports how many building/unit rows are displayed. No location records, backend queries, permissions, occupancy, or billing behavior changed.

**Validation:** `node --test tests/property-directory.test.ts` passed 4/4 for default results/count, building matches, unit matches with parent context, archived matches, and no matches. `npm.cmd run build` passed; Vite still reports the existing advisory for a main bundle above 500 kB. The current authenticated directory was not opened against a database.

**Limitations and next step:** Search is label-only and does not change location data or reveal occupancy. Review the saved directory in the normal authenticated UI when available, including narrow-screen layout. Do not add room assignments or move-in/move-out operations until the owner confirms occupancy, timing, conflicts, archiving, and access rules.

## Staff tenant directory filters - 22 Oct 2026

Added read-only filters to the authenticated staff tenant directory for active/archived status and individual/business record type. The existing name search combines with both filters, the default “all” selections preserve the previous full-list behavior, and a live result count plus a clear-all action makes narrowed results easier to understand. Filters operate only on the already-authorized property snapshot; no database, access, or financial behavior changed.

**Validation:** `npm.cmd test` passed 61/61, including new search, combined-filter, status-filter, and unchanged-default tests. `npm.cmd run build` passed; Vite retains its existing advisory that the main JS chunk exceeds 500 kB. `git diff --check` passed. The authenticated screen was not exercised against a temporary or preserved database.

**Limitations and next step:** This adds directory navigation only; it does not edit tenant records, assign rooms/occupants, or implement occupancy lifecycle. Review the controls in the authenticated staff UI when convenient. Before implementing persisted occupancy or move-in/move-out, confirm the unresolved arrangement, effective dates, overlap/capacity, archival, and access rules with the owner.

## Property room counts and invited-account clarity improvements - 21 Oct 2026

Updated the preview property map to match the counted room plan for Bob's house, Building 1 and Building 2: Bob's house has six rent rooms, the first building's ground floor includes the apartment plus three rentable rooms, the second floor has six rentable rooms, the second building's ground floor includes the gym plus three rentable rooms, and the second floor has five rentable rooms. The preview still allows the floor count to be increased later if the property grows, while keeping the layout from overstating room counts on the facade.

Also tightened the preview room-rent control so the saved monthly rate stays fixed until a deliberate change is enabled, and it returns to the existing amount smoothly when the toggle is turned back off without saving. This reduces confusion during room-rent edits and keeps the new rate review step clear before the next monthly charge is added.

Added clearer invited-renter status guidance in the user account view and owner access assignment review so it is easier to distinguish between an active account, an accepted invitation, a shared tenant record, and the final owner approval step. This keeps the tenant-side flow easier to understand without changing the underlying access or financial rules.

## Priority follow-up: check/handover gate, language, operations and usability - 20 Oct 2026

**Check register/handover:** Reviewed `202610190001_check_handover.sql`, the PGlite migration-backed tests, and the separate-session Supabase runner. The migration remains unapplied to the preserved local database. Isolated Supabase API/MFA/RLS, direct-write denial, idempotency, concurrency, audit rollback, and authenticated browser verification are still required before considering local application. Preflight command `docker info --format '{{.ServerVersion}}'` failed with `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine ... open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.` No isolated stack was started and no migration or database was changed.

**Language switch:** Source-reviewed the mounted shell, sign-in/password/MFA, navigation, invitation, owner access management, invitation reconciliation, access audit, saved/preview payment reports, and check/handover UI. Fixed visible English-only environment/workspace labels in the shell, added Cebuano/Bisaya for check-register fallback statuses/records and owner role labels, corrected outstanding-rent heading wording, and improved selected security/admin terms. Added offline browser assertions for language persistence, document language, translated shell/navigation/report-preview labels, and preserved fictional account identifiers. Provider errors/technical terms and stored event/user-authored text may remain English or unchanged where preserving meaning/data requires it. Authenticated screens still need rendered review; manually written Bisaya remains unreviewed by a fluent speaker.

**Saved cash owner gate:** No verifier or financial record was assigned/created. Added the exact owner checklist to [OPERATIONS.md](OPERATIONS.md): confirm the clerk's exact Auth ID and confirmed email/MFA membership; review renter/space/agreed rent terms and existing charges; only use an explicitly approved fictional local fixture; verify pending cash does not change the balance; confirm as the designated clerk; reload and reprint the server-issued acknowledgment. Stop if identity, terms or an approved fictional fixture is unavailable.

**Backup/recovery:** Reviewed [OPERATIONS.md](OPERATIONS.md) and [ONBOARDING.md](ONBOARDING.md). No database backup schedule, retention, RPO/RTO, or restore drill is evidenced. Backup authenticator is implemented/tested; all-factors-lost operator recovery and database restoration remain untested. `npx.cmd supabase db dump --help` confirms local dump options, but the installed CLI has no `db restore` subcommand and `Get-Command pg_dump,pg_restore,psql -ErrorAction SilentlyContinue` found no PostgreSQL client tools. Added a fictional-only disposable rehearsal plan; did not create a dump or connect to any database.

**Usability/accessibility:** Existing offline checks cover navigation/action keyboard activation, responsive widths (320/390/768px), text enlargement/zoom-equivalent stress, no external requests, and explicit reduced-motion CSS. Extended browser checks for the visible keyboard skip link/focus ring, Bisaya persistence, and reduced-motion behavior. The worklist check found and fixed singular/plural English grammar for pending cash counts. These are focused previews, not native browser zoom, screen-reader, touch, authenticated screen, or WCAG verification.

**Validation:** `npm.cmd run build` passed (existing Vite warning: main JS bundle is 582.67 kB, above the 500 kB advisory); `npm.cmd test` passed 54/54, including fictional PGlite migration-backed rent/check/handover boundary coverage, but this is not a substitute for Supabase service verification. `node scripts/check-dashboard-preview.mjs`, `node scripts/check-paid-rent.mjs`, `node scripts/check-admin-worklist.mjs`, `node scripts/check-payments-preview.mjs`, and `node scripts/check-workspace-preview.mjs` all passed after updating assertions for the corrected copy. Checks used the already-running same-origin offline preview and verified no external requests/runtime errors where instrumented. `git diff --check` passed. No real renter data, hosted/production systems, financial records, verifier assignments, migration application or deployment were involved.

**Next exact step:** Start Docker Desktop's Linux engine and confirm `docker info --format '{{.ServerVersion}}'` succeeds. Then run `npm.cmd run test:cash:supabase`; only if its migration/API/Auth/MFA/RLS/direct-write/idempotency/concurrency/audit-rollback/browser gates all pass may the owner review local migration application. In parallel, review rendered English/Bisaya authenticated screens with a fluent speaker and have the owner choose recovery objectives/provider backup scope before a disposable backup/restore drill. Keep the first local cash exercise blocked on owner identity and terms review.

## Scope checklist and verification refresh - 20 Oct 2026

| Planned feature | Status | Evidence or remaining gate |
| --- | --- | --- |
| Staff authentication, MFA, tenant isolation, access grants/revocation, directory and property administration | Implemented and verified (scoped) | Existing local SQL/API/browser evidence and fictional test coverage; not an independent security review or production assurance |
| Invitation and renter account setup | Implemented but not fully verified | Existing Auth setup-link/access separation, guarded attempts and local tests; elapsed expiry is untested, and safe reissue/retention waits for owner policy |
| Tenant and property records | Implemented and verified (scoped) | Search/create and location management have scoped tests; this does not include persisted occupants, assigned occupancy or lifecycle |
| Occupancy and move-in/move-out lifecycle | Not implemented | Owner must decide household/room arrangement, effective dates, overlap/capacity, and archival/access consequences before design |
| Saved agreement, monthly charge, cash report/confirmation, balance and acknowledgment | Implemented but not fully verified | Prior disposable cash integration evidence and PGlite/unit coverage; preserved local financial tables are documented empty, first owner-approved exercise is pending, and the latest repeatable isolated run is Docker-blocked |
| Saved Paid rent report | Implemented but not fully verified | Pure aggregation now has 3 focused fictional unit tests; authenticated saved snapshot/API/browser report assertions exist but remain unrun pending Docker |
| Check register and collection handover | Implemented but not fully verified | UI/draft migration and PGlite tests exist; migration is unapplied locally; isolated live Supabase gates are Docker-blocked |
| Language, theme, responsive and accessibility improvements | Implemented but not fully verified | Focused offline responsive/focus/motion tests; authenticated rendered review, fluent Bisaya review, native zoom/screen-reader and full accessibility audit remain |
| Backup, restore and account recovery readiness | Incomplete; owner decision/prerequisites pending | No restore drill, agreed RPO/RTO/retention, verified backup coverage, or all-factors-lost recovery procedure |
| Tenant financial statements, exports and production release | Not implemented / deferred | Tenant financial views and exports remain out of scope; production deployment is unauthorized and release evidence is incomplete |

The required disposable integration run is additionally **waiting on an external prerequisite**: Docker Desktop's Linux engine is unavailable. The owner must verify the intended clerk's exact identity and approve a fictional local fixture before creating any saved financial records. Opening balances, fees/credits, returned-check policy, invitation reissue/retention, rent-change effective dates and recovery objectives still need decisions before affected work proceeds.

This refresh corrected stale expected balances in the disposable cash/check integration runner after it adds an April charge, and added authenticated-browser assertions for receipt-month cash totals, outstanding rent by charge month, pending/check exclusion, and months without a recorded charge. The new live assertions are source changes only: they have not run because Docker is unavailable. Existing UI/report behavior did not change.

**Validation for this refresh:** `npm.cmd test` passed 54/54; `npm.cmd run build` passed with the existing 582.67 kB main-chunk advisory. `docker info --format '{{.ServerVersion}}'` failed because the Docker Desktop Linux-engine pipe `//./pipe/dockerDesktopLinuxEngine` is missing; `npx.cmd supabase status` failed with the same service error. The disposable suite and authenticated report assertions were therefore not run. No database, migration, financial record, verifier, hosted service, or production system was changed.

## Saved Paid rent report calculation tests - 20 Oct 2026

Moved the saved report's existing receipt-month, charge-month, outstanding-balance, distinct-renter and arrears aggregation into a pure helper, preserving the current UI and rules. Added fictional unit coverage confirming confirmed cash is grouped by actual receipt date (not confirmation time), pending cash and checks do not count as cash, outstanding rent only includes positive balances on charges recorded in the selected rent month, months without charges produce no outstanding amount, arrears counts distinct recorded months, and sums retain exact centavos. This verifies local computation only; the authenticated saved snapshot, database permissions, SQL calculations and report browser flow still require the disposable Supabase run.

**Validation:** `node --test tests/saved-paid-rent-report.test.ts` passed 3/3; final `npm.cmd test` passed 57/57; `npm.cmd run build` passed with the existing Vite 582.68 kB main-chunk advisory. The 20 Oct 12:56 recheck of `docker info --format '{{.ServerVersion}}'` and `npx.cmd supabase status` failed because the Docker Desktop Linux-engine pipe `//./pipe/dockerDesktopLinuxEngine` is missing. Therefore `npm.cmd run test:cash:supabase` and its saved-report browser assertions remain blocked. No financial records, verifier, migration or database were changed.

**Next exact step:** start Docker Desktop's Linux engine and confirm `docker info --format '{{.ServerVersion}}'` succeeds, then run `npm.cmd run test:cash:supabase` on its unique fictional stack. Do not apply the drafted check/handover migration locally until that suite passes. Keep the first preserved-local saved cash exercise gated on the owner's exact clerk identity and approval of the fictional test fixture and terms.

## Clearer payment history and controlled preview rent changes - 20 Oct 2026

Improved the fictional Payments and balances preview so staff can distinguish pending cash from confirmed payment history at a glance. Each history item now shows its status, amount, actual receipt date and collector where applicable. Room rent and move-in date are fixed/read-only after setup by default; a labeled checkbox unlocks a proposed rate change. The user must choose the first rent month, review the old/new rates and due date, then explicitly confirm. Confirmation adds that month's charge and changes the rate used for later preview charges, while previously recorded charges keep their original amounts. Returning to edit details preserves the draft for correction; duplicate room/month charges remain rejected.

This is temporary in-memory preview behavior only. It resets on reload and does not update a saved agreement, database, permission, or real financial record. The authenticated saved workflow still has no reviewed rent-term edit operation. The app continues to exclude pending cash from settled balances.

**Verification:** `npm.cmd run build` passed (existing Vite advisory: main JS chunk exceeds 500 kB); `npm.cmd test` passed 54/54; `node scripts/check-payments-preview.mjs` passed payment-history status/amount/date checks, fixed-by-default rent setup, explicit unlock and reset-on-relock, review-before-change, no changes before confirmation, unchanged earlier charges, duplicate-month rejection, resulting balance, narrow-width reflow at 320/390/768px, no external requests and no runtime errors; `git diff --check` passed. Browser test uses fictional offline preview data; no authenticated Supabase or database tests were needed or run. Screenshot files reflect the fictional browser test run.

**Limits and next step:** no persisted rent-edit semantics, database function, RLS policy, migration or saved agreement behavior was introduced. Do not mirror this preview operation into the authenticated workflow until rent-change effective-date, authorization, audit and correction requirements are reviewed and a transactional path is designed. Next, have staff review the updated fictional history/rent screens at desktop and phone widths; then continue with the Docker-gated language/theme browser verification and isolated check/handover workflow gates already recorded below. This is not an accessibility audit or production-readiness claim.

## Clearer pending cash and rent-by-month view - 19 Oct 2026

Refined the fictional payment preview shown in the user's screenshot. The pending cash card now has a visible unconfirmed status, a direct note that it does not reduce rent balance, and distinct collector/receipt-date labels. Monthly rows now separate month/due date, rent charged and still to pay; the combined room total is labeled as applying across accounts and not being an extra charge. At narrow widths the amount groups stack under the month. Updated English/Bisaya labels are presentation-only: no balance calculation, payment status, confirmation flow, or rent rule changed.

Verification: `npm.cmd run build` and `npm.cmd test` passed (54 tests); `node scripts/check-payments-preview.mjs` verifies the pending-vs-balance wording, actual receipt date and collector, September rent charged vs remaining amount, October charged vs remaining amount, the combined room total explanation, and no horizontal overflow at 320/390/768px. It also retains assertions for pending cash not settling, oldest-first allocation and the 44px review action. `git diff --check` passed. The preview uses fictional data and no external requests. These checks do not cover authenticated local Supabase or a full accessibility audit.

Next: open the offline preview with `npm.cmd run dev:preview`, choose Payments and balances, and review the payment account at desktop and narrow phone widths. Then proceed with the documented Docker-gated authenticated browser checks; do not apply the drafted check/handover migration until isolated integration gates pass.

## Shared visual system and dark-theme contrast - 19 Oct 2026

**Assessment before editing:** the app already had a warm-neutral palette, local/system font stack, 18px baseline, hierarchy, responsive staff sidebar/mobile navigation, labeled controls, 44px targets, visible keyboard focus, restrained transitions, reduced-motion handling, and saved light/dark preference. The prior staff visual refresh had already improved the dashboard, worklist, report and payment surfaces; those foundations were retained.

**Visible gaps found:** dark mode reused the pale link blue as a filled-action background with white text (including selected navigation/tabs), dashboard and report surfaces still contained fixed light colors, and a dashboard gradient contradicted the documented simple visual direction. Added distinct ink-blue filled-action tokens with white text; centralized theme-aware hover/pressed, table, border, status and avatar colors; and moved dashboard/form/report surfaces onto shared tokens. Replaced the dashboard gradient with a solid surface. Kept the QR code white for scanning and acknowledgment paper styling dark-on-paper for on-screen readability and printing. No Auth, access, financial, data or navigation behavior changed.

**Verification:** `npm.cmd run build` passed (existing 582.07 kB Vite main-chunk advisory); `npm.cmd test` passed 54/54. `node scripts/check-dashboard-preview.mjs` passed offline-preview navigation/reload/no-external-request checks plus dark-theme preference persistence, selected report-control contrast ≥4.5:1, and dark report-header surface. `node scripts/check-paid-rent.mjs` passed report totals, pending exclusion, charge-month separation, confirmation preview, acknowledgment and 320/390/768px reflow. Updated two stale browser-script accessible-name selectors to match the current “Use Night mode” and “Paid rent report” labels. `git diff --check` passed. Contrast ratios in `DESIGN_SYSTEM.md` were calculated from the defined sRGB tokens.

**Limits:** the browser checks use fictional offline preview data; they do not exercise authenticated local Supabase or validate the saved report against the database. The language/browser check is still blocked by Docker's missing Linux engine; fluent-speaker review, full rendered theme review, native 200% zoom, screen-reader and full control-contrast audits remain outstanding. This is not a WCAG conformance claim. No migrations, hosted/production services, real renter records, or emails were touched.

**Next exact step:** start Docker Desktop's Linux engine until `docker info --format '{{.ServerVersion}}'` succeeds, then run `npm.cmd run test:browser -- tests/browser/access.spec.ts` against the unique disposable local stack. Arrange a fluent Bisaya screen review and check the dark/light themes at narrow widths. The next feature milestone should then complete isolated Supabase API, concurrency, audit-rollback and browser checks for the drafted check/handover workflow using `npm.cmd run test:cash:supabase`; keep its migration unapplied until those checks pass. Validate the saved Paid rent report against fictional authorized local records afterward, without adding writes or exports.

## Bilingual UI coverage follow-up — 19 Oct 2026

Expanded the existing browser-persisted English/Bisaya switch without changing the Auth, database, or financial workflows. The authenticated shell and key staff views now pass the selected language through sign-in/password setup/MFA, navigation and dashboard copy, directory/property views, invitations/access review/audit, saved payments and account statement, check/handover UI, and the saved Paid rent report. The fictional preview tenant/property/cash/Paid rent views also have broader coverage, including the property map and report tables. Generic callback, session, access-verification and sign-out failures now resolve to selected-language copy; the document `lang` attribute follows the selection. Manual translations are local; there is no translation service. Names, emails, building/room labels, dates, amounts, IDs, and user-entered records remain as recorded.

Invitation copy describes the existing Supabase Auth setup link, renter-chosen password, and separate owner access assignment. No invitation delivery or financial behavior changed. Added browser assertions for language persistence, unchanged email/property values, invitation boundaries, and the document language attribute.

**Verification for this follow-up:** `npm.cmd run build` passed with the existing Vite main-chunk advisory (main JS bundle 582.07 kB); `npm.cmd test` passed 54/54, including the selected-language application-error helper; `git diff --check` passed. Docker check `docker info --format '{{.ServerVersion}}'` failed because `//./pipe/dockerDesktopLinuxEngine` does not exist. Therefore `npm.cmd run test:browser -- tests/browser/access.spec.ts` and disposable Supabase/API verification were not run. No database, migration, hosted service, production system, or real renter was changed or contacted.

**Copy audit and limits:**

| Screen group | Source review |
| --- | --- |
| Authentication, setup links, password recovery and MFA | Static UI and generic callback/session failures have English/Bisaya copy. Browser switch assertions are added but not run. |
| Navigation, dashboard, tenant directory and property screens | Selected language is wired through the current shell and preview views. Saved names, emails and location labels remain unchanged. Rendered review remains outstanding. |
| Payments, account statement, check/handover UI and Paid rent | Core labels, instructions, statuses and report tables have bilingual copy; financial records and values are not translated. No report/API behavior changed. |
| Invitations, access management, reconciliation and audit | Main UI copy is bilingual. Provider/Edge Function returned messages may remain English because their text is preserved as supplied. |
| Legacy design prototype | `src/prototype/PrototypeApp.tsx` and `PaymentReportForm` contain English-only copy, but are not imported by `src/main.tsx`; they are not part of the mounted application. |

This is a source review, not an exhaustive rendered screen-by-screen review. Bisaya is manually written but has not been reviewed by a fluent speaker and must not be treated as authoritative. The authenticated local browser assertions are present but were not executed because Docker was unavailable; no accessibility conformance claim is made.

**Next exact step:** start Docker Desktop's Linux engine until `docker info --format '{{.ServerVersion}}'` returns a server version. Then run `npm.cmd run test:browser -- tests/browser/access.spec.ts` against the unique disposable local stack using the documented fictional fixtures. Then review the authenticated screens in both languages with a fluent Bisaya speaker and record any corrections. Do not apply the separate check/handover migration or change hosted/production data.

## Day/night mode and plain Bisaya payment help - 19 Oct 2026

Added header controls beside each other to switch between light/day and dark/night colors, and between English and basic Bisaya. Both choices are stored in this browser's local storage. Language selection updates the main navigation, dashboard actions and labels, and staff Payments and balances headings/help. The payment glossary explains balance, pending cash, check received, cleared, returned, reversal and handover. Text is manually written; names, saved descriptions and financial records are not translated or modified, and no translation service is used.

Evidence: `npm.cmd run build` and `git diff --check` passed. No database, access, tenant statement or payment behavior changed.

Limitations: several less common administrative screens and detailed financial instructions remain in English. Bisaya wording should be reviewed by James or a fluent speaker before treating it as authoritative. Dark colors were checked through the production build only; rendered contrast and full accessibility verification remain outstanding.

## Payment preview bilingual flow - 19 Oct 2026

Connected the header English/Bisaya choice to the fictional `RENT RECORDS → Payments and balances` flow. The **Record and confirm** tab now translates the practice-only and James simulation notice, attention list, filters and account count, tenant selector, balance explanation, cash entry and review, pending confirmation queue, rent-by-month notes, payment history, and room-rent setup labels/instructions. The **Paid rent** tab translates the report heading, receipt-period selector, top metrics and selected explanations. Preview names, dates, amounts and financial state are unchanged. This remains a development-only simulation and does not settle live cash.

Evidence: `npm.cmd run build` and `git diff --check` passed with the existing large-chunk advisory.

Limitations: the Paid rent report tables, some reports/actions, error states and separate live owner/admin controls are still partly English. User-entered names and dates intentionally remain unchanged. Have a fluent Cebuano/Bisaya speaker review wording before anyone relies on it.

## Whole-app language switch expansion - 19 Oct 2026

Expanded the header's English/Bisaya setting to persist and update shared app copy across sign-in, main route headings, navigation, dashboard shortcuts, tenant directory, tenant creation, property directory heading/explanation, invitation screen, and footer. In the fictional **RENT RECORDS → Payments and balances → Record and confirm** view, the heading, practice-only note, attention list, tenant/account controls, balance explanation, cash-entry form, pending James review, rent-by-month, payment history, and room-rent setup notes now switch to basic Bisaya. The Paid rent view has translations for its heading, receipt-period selector, summary metrics, selected report explanations and outstanding-rent headings. User-entered names, dates, amounts and server-returned data remain unchanged. Detailed owner access controls, MFA, invitation reconciliation, property maintenance, some payment errors, check controls and many Paid rent table labels still contain English. This is not yet complete site-wide translation.

Evidence: `npm.cmd run build` passed with existing chunk advisory.

Next: localize remaining UI strings and verify language changes on each screen with an English/Bisaya review, especially all Paid rent table labels and financial/security instructions. Have a fluent Bisaya speaker review the wording before operational use.

## Check list and collection handover milestone drafted - 19 Oct 2026

Added migration `202610190001_check_handover.sql` and staff UI sections for a basic check register and owner-entered handover log. Check IDs display sequentially as `CHK-0001`; internal UUIDs remain separate. A clerk records receipt; an owner records deposit, bank-confirmed clearance, return, or reasoned reversal. Pending checks do not settle rent; cleared checks allocate oldest due first; returns/reversals restore the charge balance while preserving events. Handover rows compare clerk-stated cash/check totals with what the owner received, require a reason when totals differ, and never change tenant balances. No bank/check number or renter statement is added.

Evidence: disposable PGlite migration-backed tests pass for roles, RLS/direct-write denial, check receipt and idempotency, uncleared balance preservation, owner-only transition, settlement, duplicate transition behavior, return/reversal balance restoration, event history, handover idempotency and discrepancy reasons. The separate-session Supabase API runner now includes concurrent clearance, audit rollback and browser flows for receipt, clearance and handover, but Docker is stopped so that runner has not been executed for this milestone. `npm.cmd test` passes 53 tests; `npm.cmd run build` passes with the existing Vite chunk-size advisory. No production or hosted state changed.

Limitations and next actions: this migration has not yet been verified against a disposable Supabase API/browser stack or applied to the preserved local database. Docker service is stopped. Handovers are recorded by the owner in one step; a separate clerk submission/owner acceptance workflow is not included. Next run `npm.cmd run test:cash:supabase` after Docker starts the disposable local stack; review the resulting UI in authenticated local development, then apply this reviewed migration locally once migration/API/browser checks pass. First real financial records still require the owner to confirm the clerk account and review tenant, room, and rent terms.

Applied `202610180001_cash_rent_foundation.sql` to the preserved **local** Supabase database only, after exercising the same complete migration in a separate disposable local Supabase project. `SavedPayments` now connects to local transactional RPCs. The tenant portal, hosted development and production were not changed.

Verification: `npm run test:cash:supabase` passed against a throwaway Supabase stack using fictional `.invalid` Auth users and actual local TOTP. It covers RLS/anonymous denial, MFA, explicit verifier identity, direct-write denial, exact balances while pending, idempotent and changed-payload retries, anniversary clamping, oldest-first acknowledgment snapshots, audit-failure rollback, concurrent independent cash confirmations, concurrent charge creation, and the owner/clerk browser flow through confirmation and reload/reprint. The runner stopped only its unique disposable project and deleted its temporary workspace. `npm run test:supabase` then passed all 22 existing local Auth/PostgREST/MFA/access checks, with its scoped fictional fixtures cleaned. `npm test` passed 42 tests; `npm run build` passed with the existing just-over-500 kB chunk advisory; `git diff --check` passed.

Local post-apply verification confirms migration `202610180001` is recorded; all five financial tables exist with RLS enabled; agreement, charge, cash-record and verifier counts are zero. Existing directory records remain present. No cash test fixture was written to the preserved database. Docker Desktop and the existing local stack remain running. No hosted API, hosted migration or production system was contacted.

Guardrail: no cash verifier has been assigned, because the existing James account identity has not been confirmed for this operation. Do not assign by display name or guess an email. The owner must verify the existing confirmed clerk account, then use the staff-only verifier form in Payments and balances. Until that is done, no one can confirm cash. The first actual agreement and rent charges also require owner review of the existing local tenant/room records and terms; none were invented or seeded.

Next: sign in to the local app with the owner MFA account; verify James's exact existing Auth account identity through the owner's trusted account workflow; assign that account as verifier; review the real room/tenant/rent terms before creating the first agreement and charge. Then exercise one approved fictional receipt and acknowledgment locally. Checks, reversal/correction workflows, excess credit, exports, hosted migration and production remain separate gates.

## Preserved property-map layout - 19 Oct 2026

Kept the original site sketch as the default Buildings and units preview: Bob's house, Building 1, Building 2, House 1, Yamaha property and Stores 1-3 retain their relative placement around the road. Building list remains a second way to navigate. The floor-specific view retains the facade/room tiles and a visible return-to-map action. Added a browser regression assertion for the map's marker set and the three rental-building positions.

This is still the supplied illustrative sketch, not a surveyed plan. It remains temporary preview data; no coordinates are written to PostgreSQL. The authenticated database-backed building/unit directory remains separate and does not guess spatial placement from names or IDs.

Evidence: the saved desktop/mobile map and building-view screenshots were reviewed; the property-preview browser check verifies the named landmarks, Bob/Building 1/Building 2 placements, map/list controls, floor and unit details, keyboard/touch building selection, small-screen reflow and no external requests. No financial or database behavior changed.

Next: preserve this sketch when continuing the UI. If the user later wants mapped live database records, first confirm the actual site positions and decide a reviewed, authorized persistence model; do not infer coordinates from the current directory.

## Add missed rent month and track arrears - 19 Oct 2026

Added a staff-only preview flow in Paid rent for adding the selected rent month as a charge. Only active renters with an assigned room, existing rent terms and no charge for that room/month are offered. The confirmation shows the saved rent amount and due date calculated from the existing move-in anniversary setup; cancel leaves records unchanged. A separate list flags renters with positive remaining balances in at least two distinct recorded rent months and shows their locations, month names and total balance. Partial confirmed cash reduces the month balance; pending reports and uncleared checks do not.

Evidence: `npm run build`, `node scripts/check-paid-rent.mjs`, `npm test` (42 tests), and `git diff --check` passed. The browser check verifies the two-month threshold, only offers an eligible saved-setup renter, reviewed cancellation, charge creation from saved terms, refreshed outstanding and arrears rows/totals, duplicate prevention, partial-payment behavior, narrow reflow and zero external requests/runtime errors. Updated desktop/mobile report screenshots and the reviewed add-month confirmation at [desktop paid-rent report](screenshots/paid-rent.png), [mobile paid-rent report](screenshots/paid-rent-mobile.png), [desktop add-month confirmation](screenshots/add-rent-month-desktop.png) and [mobile add-month confirmation](screenshots/add-rent-month-mobile.png) are captured and visually inspected.

Limitations: this is fictional in-memory preview state and resets on reload; it does not write to a database or create a recurring schedule. The arrears list counts only distinct recorded rent months with a positive balance; it cannot identify omitted charge months and does not determine that rent is overdue. No financial policy or persisted workflow was added, and no accessibility conformance claim is made.

Next: review the selected-month add and arrears behavior with the user. Any persisted rent-charge creation requires a separate financial milestone, reviewed schema/policy, and transactional PostgreSQL function with RLS, authorization, idempotency and concurrency tests. No migration was applied.

## Staff dashboard landing page - 19 Oct 2026

Added a staff dashboard as the default workspace section. It greets the signed-in account by authenticated email and offers four shortcuts: Log a payment, Add a tenant, View the property, and Find a tenant. Each navigates to its existing flow; no data is written merely by choosing an action. Added Dashboard navigation on desktop and mobile and kept it out of tenant portal screens. Preview continues to use its explicit fictional preview account identity.

Evidence: `npm run build`, `npm test` (42 tests), the dashboard, workspace, property, payment, admin-worklist and paid-rent preview browser checks, and `git diff --check` pass. The dashboard browser check verifies displayed preview identity, all four action destinations (including keyboard activation), responsive reflow, reload behavior, and zero external requests. Captured and visually inspected [desktop staff dashboard](screenshots/dashboard-landing-desktop.png) and [mobile staff dashboard](screenshots/dashboard-landing-mobile.png).

Limitations: name greeting uses the authenticated email because the app does not currently load a verified display name. This is a navigation/landing-page change only; no financial, tenant or property record is created, and tenant portal remains unchanged. This UI check is not a full accessibility audit.

Next: review whether the email identifier is clear enough for staff, and whether the four action labels match daily terminology. If a verified display-name source is later adopted, review its provenance and privacy before using it in the greeting.

## Mobile-first report and dashboard polish - 19 Oct 2026

Kept the warm ivory/ink-blue palette and system font stack. On the Paid rent report, the confirmed-cash metric leads the compact mobile summary, while renter/payment counts share a row. The outstanding total and active 2+ month arrears state now have stronger restrained emphasis; report details remain visible with labeled table-card reflow. The dashboard preview uses a prominent active-record summary with property/access summaries alongside below it on mobile, and tighter notice/navigation spacing to bring the tenant directory forward. Desktop overview remains three cards. No new animation was added; existing reduced-motion handling remains.

Evidence: `npm run build`, `node scripts/check-dashboard-preview.mjs`, `node scripts/check-paid-rent.mjs` and `git diff --check` pass. Browser checks assert the mobile summary-card hierarchy, no horizontal overflow at 320/390/768px, visible selected-month/arrears emphasis, report behavior unchanged and no external requests/runtime errors. Captured and visually inspected [desktop dashboard](screenshots/dashboard-polish-desktop.png), [mobile dashboard](screenshots/dashboard-polish-mobile.png), [desktop Paid rent report](screenshots/paid-rent.png) and [mobile Paid rent report](screenshots/paid-rent-mobile.png).

Limitations: this is a presentation-only refinement to fictional preview screens. The desktop/mobile browser checks do not constitute a full accessibility or 200% zoom audit; no conformance claim is made. Financial behavior, authentication, MFA, RLS and database state were not changed.

Next: review the dashboard and Paid rent layouts at actual device sizes. If the mobile table-card presentation is hard to scan, adjust its field ordering/spacing based on that feedback without dropping necessary data.

## Cross-feature logic polish - 19 Oct 2026

Ran the current fictional-preview browser checks across dashboard and isolation, workspace/tenant creation, property/building navigation, payment recording/allocation, admin worklist and Paid rent/arrears. All six checks pass after fixing an ambiguous dashboard-test locator to target the tenant heading rather than also matching a dropdown option; the initial failure was in the test selector, not application behavior. `npm test` passes all 42 tests, including exact-money/date/allocation behavior and isolated database access/RLS invariants. `npm run build` and `git diff --check` pass.

Scope and limits: this pass did not change application financial logic, Auth/MFA, RLS, or database contents. It exercises the fictional preview surfaces plus the existing isolated unit/database-policy tests. Authenticated local-Supabase browser tests and live API checks were not run in this pass because they require the separately configured local Supabase/invitation services; no migration, hosted target, email, or production deployment was invoked. The Vite build continues to show its existing advisory that the main JavaScript chunk is just over 500 kB. No full accessibility conformance claim is made.

Next: have Bob review the preview workflows and sample rent-month behavior. Before connecting any financial preview action to persistence, complete the separate schema, authorization/RLS, transactional idempotency/concurrency, recovery and local integration gates.

## Spreadsheet-style paid-rent report - 19 Oct 2026

Redesigned the Paid rent preview as a spreadsheet-like monthly report. Its summary shows confirmed cash received, distinct renters who paid, and the number of confirmed payment groups. A semantic table lists renter, rental space, actual date received, amount, rent months covered and a receipt action, followed by a total row. Below it, a separate rent-month filter shows recorded charges with a remaining balance, due date, rent amount and still-due amount; partial payments reduce only the confirmed balance. The user chose outstanding balance for the selected rent month as the definition of “not paid yet.” No charge recorded for a month is explicitly not treated as unpaid. Filters distinguish actual receipt month from rent charge month. Pending reports and uncleared checks remain excluded.

Evidence: `npm run build` and `node scripts/check-paid-rent.mjs` passed. Browser checks cover receipt-month totals/counts and actual dates, distinct renter count, split payment grouping, separate rent-month outstanding totals for September/October, pending exclusion, partial balance changes only after simulated confirmation, empty receipt month, acknowledgment, 320/390/768px reflow and zero external requests/runtime errors. Captured and visually inspected [desktop paid-rent report](screenshots/paid-rent.png) and [mobile paid-rent report](screenshots/paid-rent-mobile.png). `git diff --check` passed.

Limitations: fictional preview only; data resets on reload. Report reads preview charges and receipts in memory; no export, saved report or database change. Missing charge setup is not classified as unpaid. No accessibility conformance claim.

Next: review the spreadsheet-style monthly preview with the user. Before any saved reporting, separately review financial data definitions and run the required transactional, RLS, idempotency and concurrency tests; do not connect this preview report to unsaved or unauthorized data.

## Lodging-house facade refinement - 19 Oct 2026

Replaced the plain window-block facade with a front elevation of a small lodging house: pitched roof and eaves, gable detail, floor bands, foundation and inset room-door symbols with small brass-colored knobs. The illustration uses one facade row per configured floor (Bob’s current preview remains one floor; Buildings 1/2 show two) and six decorative doors per row. Door motifs are explicitly not room counts, room labels or surveyed geometry; Building 1/2 rentable-room counts remain “Not set” until entered. The existing per-floor room tiles/counts remain the source of preview details. No saved data or backend behavior changes.

Evidence: `npm run build` passed with the existing Vite >500 kB chunk advisory. `node scripts/check-property-preview.mjs` passed; it asserts six decorative door motifs for Bob’s single-floor example and twelve across Building 1’s two illustrative floors, tests the explicit non-count accessibility label, and retains map/list/back, keyboard/touch, reduced-motion, count, mobile-reflow and zero-network checks. Captured and visually inspected [desktop two-floor facade](screenshots/property-building-desktop.png) and [mobile Bob’s house facade](screenshots/property-building-mobile.png). `git diff --check` passed.

Limitations: the door pattern is an architectural illustration and must not be read as a room count or a surveyed elevation. Bob’s example count stays six in the floor summary and room tiles. Building 1/2 counts remain unknown. No accessibility conformance claim.

Next: obtain measured facade/floor and confirmed room-count details from the property owner before replacing any illustration with real property geometry. Keep Building 1/2 counts “Not set” until confirmed.

## Illustrative building entry view

Added a closer, front-facing illustrative view for Bob’s house, Building 1 and Building 2. Selecting any of these buildings from the property map or building list opens the view; other buildings keep their prior selection behavior. A 650 ms restrained opacity/scale/short-translation arrival is disabled for reduced-motion preferences. Semantic buttons keep map/list navigation and a visible “Back to property map” action available; keyboard and touch activation are covered by the browser check.

The view names each floor, shows a per-floor rentable-room count and labeled room tiles. Bob’s house continues to show six example rooms. Building 1 and Building 2 remain “Not set” until a preview count is entered; apartment and gym spaces remain separate from rentable room counts. The facade and room layout are explicit illustrations, not a surveyed floor plan. Edits remain temporary and reload resets them. Tenant features remain separate; no Auth, database, migration, financial, email or deployment behavior changed.

Evidence: `npm run build` passed with the existing Vite >500 kB chunk advisory. `node scripts/check-property-preview.mjs` passed building entry/back, map/list visibility, mouse/keyboard/touch operation, 650 ms and reduced-motion behavior, unknown and edited floor counts, Bob’s six example rooms, apartment/gym preservation, mobile reflow and zero external requests. Captured and visually inspected [desktop Building 1](screenshots/property-building-desktop.png) and [mobile Bob’s house](screenshots/property-building-mobile.png). `git diff --check` passed. While extending the existing browser flow, restored rendering of the selected-room editor: its JSX was evaluated but discarded before this milestone, so the room editor and related temporary edits were not actually visible. The browser check now exercises the visible editor.

Limitations: counts and geometry are still illustrative; no survey data has been supplied. Browser checks do not replace a complete keyboard, screen-reader, native 200% zoom, touch-device or rendered contrast audit, and no accessibility conformance claim is made.

Next: confirm Building 1 and Building 2 room counts and surveyed floor details with the property owner before treating this as real floor data. Until then, retain “Not set” and the illustrative labels. Keep preview edits temporary; any persistence remains a separately reviewed database milestone.

## Admin/staff visual refinement - 19 Oct 2026

Refreshed shared design tokens with warm ivory/stone surfaces, charcoal text, ink-blue primary actions and restrained brass highlights. Updated staff navigation, workspace summaries, payment tabs, worklist, balance panels and paid-rent/receipt surfaces; added short hover/pressed states while retaining visible focus and reduced-motion behavior. Existing 18px body/form baseline and 44px control targets remain. Tenant records/auth boundaries and all financial rules/flows remain unchanged. No database, account, email or deployment activity.

Evidence: `npm test` passed 42/42; `npm run build` passed (Vite emitted its existing >500 kB minified chunk advisory); `node scripts/check-admin-worklist.mjs` and `node scripts/check-paid-rent.mjs` passed. Browser checks cover admin worklist navigation/filter/search/duplicate review and unchanged pending balance, paid-rent month totals/partial states/receipt behavior, no external preview requests/runtime errors, 320/390/768px reflow and 200% enlarged root text at 320px with visible 44px button checks. Narrowed an ambiguous test selector to the selected tenant’s balance card; no app behavior changed for that test fix. Updated and visually inspected [desktop worklist](screenshots/admin-worklist.png), [mobile worklist](screenshots/admin-worklist-mobile.png), [paid-rent view](screenshots/paid-rent.png) and [sample acknowledgment dialog](screenshots/cash-acknowledgment.png).

Limitations: 200% text enlargement is a root-font stress check, not native browser zoom; no complete keyboard, screen-reader, touch or rendered contrast audit was performed, so no WCAG conformance claim. Screenshots show fictional preview data. Cash migration remains unapplied and was not involved.

Next: inspect the refreshed running preview and review the remaining staff sections (directory, location, invitations and owner access) for any consistency gaps. Then conduct keyboard/screen-reader/native-zoom review before any accessibility claim. Keep financial activation as a separate, gated milestone.

## POS-style acknowledgment - 18 Oct 2026

Restyled acknowledgment as compact POS-inspired paper: RentByBob heading, receipt number, payment details, itemized rent coverage, cash total and remaining balance, dashed separators and 80mm content width in print. Preview-only Bob script placeholder explicitly says mock/design sample and not authorized; saved acknowledgments contain no fabricated signature. Tenant-account automatic access is not implemented; receipt remains staff-only. No email delivery. Build and paid-rent browser/PDF check pass. Physical thermal printer sizing is not verified; browser paper settings remain user-controlled.

## Cash persistence implementation and printable acknowledgment - 18 Oct 2026

User confirmed one responsible tenant per room and requested tenant payment acknowledgments issued by James. Added migration 202610180001_cash_rent_foundation.sql: agreements, monthly charges, pending cash, exact allocations, explicit identity-confirmed clerk verifier, staff MFA/RLS, property-first transaction locks, retry checks, oldest-first allocation and immutable acknowledgment JSON. No automatic monthly billing, rent amendments/move-out, reversals, advance credits, checks or email delivery. Each acknowledgment records original tenant/location, amount, actual date, issue timestamp, covered months and balance at issuance. It is not an official tax receipt.

SavedPayments connects authenticated admin screens to narrow RPCs; numeric amounts cross the read boundary as decimal strings. Normal users can record pending cash; only designated clerk can confirm. Owner does not implicitly have confirmation authority. Verifier assignment requires exact confirmed clerk ID/email. Preview can demonstrate sample receipt after confirmation in Paid rent; printable dialog uses a snapshot and clear SAMPLE marking. Tenant portal remains unchanged.

Actual verification: strict build; 42 isolated tests including real migration/RLS execution in disposable PGlite, role/MFA/revocation denial, retries, short months, split allocation, overpayment rollback, audit-failure rollback, immutable receipt and decimal-string reads. Paid-rent browser check covers preview receipt opening/closing, sample marking and PDF generation; sample PDF has one A4 page. Screen screenshot inspected. This is not live PostgREST/Auth or independent-session concurrency validation.

BLOCKED ACTIVATION: Supabase MCP tools are not exposed in this session. Local Docker was stopped; Docker Desktop was started, but docker ps still reports the Linux engine pipe absent, even outside the sandbox. No migration applied to local or hosted database; no existing account/data changed. Saved UI therefore cannot yet save against the existing unmigrated project. Preview still resets on reload.

Exact next steps: start/recover Docker engine or restore Supabase MCP; run live multi-session concurrency, direct API and authenticated browser tests against fictional development; apply migration only after those checks; designate the existing fictional James clerk by verified identity; test reload persistence and reprint snapshot. Do not claim completion of live saving or receipt delivery. Production/real data/email remain unauthorized.

## Paid rent summary - 18 Oct 2026

Added Paid rent view inside Payments and balances, alongside Record and confirm. Month selector uses actual cash receipt month; total includes only confirmed cash. Split allocations share a payment ID, so one payment covering several rent months appears once. Each row identifies tenant, room, date, amount and covered months; current remaining amount distinguishes partial payments from fully paid rent. Pending reports and uncleared checks excluded. View switching retains entry state.

Evidence: build and 41 isolated tests passed; check-paid-rent.mjs passed month filtering, pending exclusion, one count for split payment, full/partial labels, empty month, 320/390/768px reflow and zero external requests/runtime errors. Desktop screenshot inspected. No database/Auth changes or deployment. Preview resets on reload.

Next priority remains persisted agreement/charge/cash workflow described in CASH_PERSISTENCE_PLAN.md; printable tenant statement follows reliable database saving. These are not implemented by this summary milestone.

## Admin worklist and payment safeguards - 18 Oct 2026

Added searchable cross-tenant payment worklist (waiting for James, unpaid rent, setup needed, all accounts). Directory cards open the correct payment account and move focus. Pending records remain separately visible. Added same-amount/date duplicate review with explicit acknowledgment, immediate repeat-click guards, strict real-calendar validation, and account-switch prevention during cash entry/review. No schema/account/MFA/RLS changes; no tenant-portal features.

Evidence: build and 40 isolated tests passed. check-admin-worklist.mjs passes directory link, unpaid/search/pending filters, duplicate warning, unchanged pending balance, 320/390/768px reflow and doubled base text. Existing payment and workspace browser checks passed. Zero external requests/runtime errors. Desktop worklist screenshot visually inspected; no full accessibility claim.

Prepared CASH_PERSISTENCE_PLAN.md with schema invariants, explicit James capability, trusted operations, idempotency/concurrency requirements and remaining policy boundaries. This is a design contract, not implemented persistence. Next: agreement/charge database foundation and local transactional tests, then cash reporting/confirmation. Preview state still resets on reload. Room-layout questions remain deferred.

## Guided cash workflow - 18 Oct 2026

User accepted last-day-of-month fallback for move-in anniversaries and James-only cash verification. Implemented a simplified development preview: one balance/record action, three-field cash entry, oldest-first allocation review, pending queue, separate James confirmation, expandable monthly rent/history/setup. Bob and James records remain pending until explicit simulated James confirmation. Reallocation occurs at confirmation; excess is rejected, original due dates retained. Move-in anchor clamps short months without drift; monthly charges use room/month duplicate prevention and keep historical amounts. Cash only; checks cannot be settled here.

Validation: strict build and 39 tests pass; browser check passes pending non-settlement, oldest-first multi-charge allocation, reallocation after another payment, 320/390/768px reflow and zero external requests/runtime errors. Mobile screenshot inspected. No WCAG claim. All state is temporary, production excludes preview. No database/Auth/RLS/migrations changed.

Next required milestone: persisted agreement/occupancy model, explicit cash-verifier permission bound to James, transactional PostgreSQL cash/report/allocation functions with RLS/idempotency/concurrency tests. UI preview confirmation is not authorization. Automatic monthly posting, corrections/reversals, excess credits, check clearance and production saving remain unimplemented. User room-layout details remain deferred.

## Next financial milestone - 18 Oct 2026

Recorded user answers: move-in anniversary billing, oldest unpaid rent first, James-only cash verification as working direction; Bob records pending amount/date. Documentation only this turn; no application/database behavior changed. Next implement agreement/charge dependencies, then explicit oldest-first allocation and pending-to-confirmed workflow with trusted authorization and transactional tests. Resolve short-month anniversary dates before recurring generation; no new fees or credits inferred.

## Payment preview milestone ? 18 Oct 2026

User deferred room counts/capacities/entrances until later and confirmed rent is per room. Added development-only Payments and balances navigation with tenant selector, room/account balances, manual room charges and individual due dates, partial payments explicitly allocated to a charge, actual handover dates, review/edit/confirm and payment history. Sample amounts are clearly fictional. Pending reports and uncleared checks never reduce balance; settled cash is a simulation only. Exact bigint centavos; no automatic fees, billing, proration, credits or recurring rules. No database writes, migrations, emails, Auth/RLS changes or deployment.

Evidence: production build passed; 37 isolated tests passed; check-payments-preview.mjs passed exact partial amount, overpayment rejection, review/edit preservation, custom charge/due date, 320/390/768px reflow, reset and zero external requests/runtime errors. Existing workspace browser check passed. Desktop screenshot visually inspected. No accessibility or persisted financial-integrity claim.

Next: review preview at http://127.0.0.1:5173/?preview=1. Before persistence, agree charge schedules/grace, allocation and excess-payment policy, verified collectors and check-clearance authority; design transactional RLS-protected accounting with idempotency/concurrency tests. Pending-to-settled transitions, reversals, editing posted charges and split allocations are not implemented. Room totals include all recorded charges, not only current tenant records. Room configuration questions deferred until user can inspect property.

# Status - 17 Oct 2026, Asia/Manila

## Current milestone: connected three-section preview - 17 Oct 2026

Focused preview navigation on Tenant directory, Buildings and units, Add tenant record. Added shared typed preview state in property-preview-store.ts and a separate AddTenantPreview component. Tenant creation includes optional fictional contact, building/room selection or assign-later, named occupants, live summary, preserved draft, review/edit/confirm, duplicate-request protection and explicit temporary success. Newly confirmed records update directory counts/cards and the selected room. Directory has add action, sorting, filters, named occupant details and location navigation. Room tiles/rosters use person icons and dynamic people counts; Add tenant to this space prefills the form. The user specified a minimum of two occupants per room; validation applies to Room-type assignments in preview, with no invented maximum or financial rule.

Verification: strict TypeScript/production build, 34 isolated tests, existing dashboard/property browser checks, and check-workspace-preview.mjs pass. New browser checks cover three-link navigation, minimum occupancy and fictional-email errors, error-link focus, draft/review preservation, single confirmed record, directory/room synchronization, named occupants, room prefill, 320/390/768px reflow and 200% text sizing, reload reset, zero external requests/runtime errors. Screenshots visually inspected: workspace-directory.png, add-tenant-workflow.png, add-tenant-mobile.png and room-occupants.png. No WCAG audit or hosted integration claim.

Next: confirm room counts/labels per floor, maximum room capacity, and actual entrances/stairs/shared areas. Clarify independent renters versus a single household/agreement before a persisted occupancy model. Review these three screens first. No database/schema/account/MFA changes, real data, emails or production deployment.

## Previous milestone record

## Current milestone: interactive directory and property sketch - 17 Oct 2026

Implemented the user-supplied spatial sketch in development preview: Bob's house below the access road with six rental rooms; Buildings 1 and 2 have two floors with unconfirmed rental-room counts, with separate ground-floor apartment/gym; House 1 is a whole-house space; Yamaha and three stores retain sketch positions. Added clickable illustrated buildings, floor/room grids, room count/label edits, building rename, and Add building (unplaced until geometry is confirmed). Tenant cards default to active fictional tenants, with building/room details, search/status/building filters, expandable details and Locate room. Changing a room label updates its sample tenant card. Occupied sample rooms cannot be removed by reducing counts. New buildings and edits are in-memory only and reset on reload.

Verification: strict TypeScript/build and 34 isolated tests pass. Existing dashboard preview browser check passes. New check-property-preview.mjs passes active/details/location flows, floor count editing, apartment/gym preservation, occupied-room removal prevention, shared rename state, building addition, mobile list and 320/390/768px reflow, with zero external requests. Screenshots visually inspected in docs/screenshots (property-map-preview, tenant-cards-preview, property-mobile-preview). Map intentionally scrolls within its own region on narrow screens; list provides a reflowing alternative. No full accessibility or real occupancy/integration claim.

Next: user reviews the map and interactions; confirm room counts, actual room order/dimensions, entrances/stairs/shared areas, gym use and additional-building positions before accurate floor plans or persisted occupancy. Database model/access dependencies must be designed and tested before enabling real assignment/layout writes. No migrations, hosted edits, financial logic or real tenant data.

## Previous milestone record

## Current milestone: dashboard preview for UI debugging - 17 Oct 2026

User requested temporary sign-in bypass to debug the dashboard. Added `dev:preview` at http://127.0.0.1:5175 and explicit development-only `?preview=1`. Reuses the current App/workspace/components with fictional directory/location fixtures and an offline transport; every write/send fails without a network call. The actual authentication code remains executable for normal development rather than being commented out. No backend permissions, accounts, sessions, MFA or RLS were changed. Preview has a persistent notice and an exit action; production excludes its module.

Verification: 34 isolated tests and strict TypeScript/build pass. `node scripts/check-dashboard-preview.mjs` passed direct owner workspace entry, search/navigation, unsaved submission, reload/exit and zero external requests. Production output contains no preview module. This is UI debugging only, not authenticated integration testing. Next: debug/review the desired screens in preview; use normal hosted/local mode for actual saves and authentication tests.

## Previous milestone record

## Current milestone: hosted development connection

17 Oct 2026: inspected authorized empty project through MCP; applied all eleven reviewed migrations unchanged; deployed guarded invitation handler; connected loopback Vite using only a public publishable key. Signup and anonymous sign-in are verified disabled. User-created fictional owner was bootstrapped atomically with audit. Hosted Auth confirms one verified TOTP factor and an AAL2 owner session: actual hosted sign-in/MFA succeeded. User confirms settings saved. Local database/accounts were preserved.

Verification: 34 isolated tests, strict TypeScript/build, 22 local API checks and both local browser scenarios pass. Hosted read-only API and rolled-back SQL authorization/retry checks pass; hosted sign-in renders. Browser tests additionally refuse hosted Vite before submitting credentials. [Evidence, advisor notices, migration mapping and next steps](HOSTED_DEVELOPMENT.md). Hosted isolation/concurrency, email acceptance/redirects, backup/restore and independent review remain separate gates. No public frontend, production, real email/data or purchase.

## Previous milestone record

## Current milestone: frontend-first usability revision

User prioritized visual design and phone usability, using https://u-convertit-frontend.vercel.app as a visual reference. Implemented a branded RentByBob sign-in layout with stronger typography, a stacked phone form and split desktop composition. Preserved the ivory/white/sage/teal 60-30-10 palette. Simplified sign-in and authenticator guidance; setup now explicitly explains the same-phone manual key and one-time enrollment. This does not replace staff MFA or implement email-code sign-in.

Staff navigation now displays one task at a time instead of one long page of all forms. Inactive sections remain mounted but hidden, preserving drafts while switching sections; they are not an authorization boundary. Navigation closes the mobile menu and moves focus to the chosen section. Directory has a direct Add tenant action. Updated empty-state language and branding. Existing database, Auth and invitation contracts are unchanged.

Verification: 33 isolated tests passed; strict TypeScript/build passed; both browser scenarios passed, including actual local access workflows and a new draft-preservation/focus check. Existing responsive checks cover 160/320/360/390/430/768/1280px and enlarged text. Inspected screenshots of phone/desktop sign-in and fictional owner mobile directory. Initial browser run failed on recovery factor verification; the test now selects the intended enrolled factor explicitly instead of relying on provider ordering, and the rerun passed. No full accessibility/native phone audit is claimed. No database reset, migration, real invitation or hosted change.

Next: user visual review in the running local app, then refine the chosen design. User accepted email-code sign-in for renters as follow-up work; implement and test it separately with invited-only access and no staff MFA bypass. Invitation reissue/retention policy remains unresolved. Local loopback configuration does not support opening the app directly from another phone; use browser device emulation for this review until a separately reviewed network/hosted setup exists.

## Previous milestone record

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

## Single-origin account app and fictional preview - 19 Oct 2026

Replaced the separate preview port with the existing development origin: `http://127.0.0.1:5173/?preview=1`. The account app remains the default and uses whichever backend its launcher already configured. The preview is explicitly offline/fictional, never initializes the Supabase session, and has a header action back to the account app; the authenticated app has a development-only action to open the preview before sign-in and for staff only (not tenant accounts). `npm run dev:preview` reuses an existing RentByBob server on port 5173 without changing its backend selection, or starts the local authenticated app if no server exists. No hosted configuration, Auth, MFA, RLS, database, migration, financial records or production deployment was changed.

Verification: `npm.cmd run dev:preview` reused the existing RentByBob server on port 5173 and reported that its backend configuration was unchanged. `npm.cmd run build` passed strict TypeScript and Vite compilation (with the existing 503 kB chunk advisory); `npm.cmd test` passed all 42 tests; `git diff --check` passed. The dashboard, admin-worklist, paid-rent, payment-preview, property-preview and workspace-preview browser checks all passed against `/?preview=1`. The dashboard check verified preview entry, temporary sample data reset on reload, return to `?auth=1`, and no off-origin requests while using preview. The property check retained map landmark positions, unknown room counts, room tiles, transitions and reduced-motion behavior. Desktop/mobile dashboard and map/building captures were visually inspected. No sign-in was attempted and no hosted backend request was made by the verification. The previous `5175` URL is no longer supported.

Limitations: this keeps one URL/origin but still intentionally separates sample preview records from signed-in records. A local and hosted Vite configuration cannot both own port 5173 at once; `dev:local` and `dev:hosted` continue to require stopping the other server before switching backend configuration. `dev:preview` does not alter that configured target. Its clean-start fallback was not exercised because an existing server was intentionally left running; it delegates to the existing local launcher, which requires local Supabase.

Next: open http://127.0.0.1:5173/ for the configured account app, or choose “Open fictional preview” (also available via http://127.0.0.1:5173/?preview=1); use “Return to account app” to switch back. Starting local or hosted authenticated development still requires choosing its existing launcher and stopping the other Vite server first. No database or production step is part of this UI milestone.

## Saved cash readiness and over-balance prevention - 19 Oct 2026

Added a live saved-workflow checklist showing whether this property has an owner-designated verifier, saved room agreements, saved monthly charges, and pending/confirmed cash records. Owners can open the existing verifier assignment form from the missing-verifier state; explanatory copy requires identity confirmation of the actual account ID and confirmed email, not inference from a display name. Updated cash workflow wording to refer to the designated verifier rather than assume James is already assigned. No identity, tenant or financial record was created or changed.

Fixed an unsafe/useless form path: before saving a pending cash report, exact decimal strings are parsed as integer centavos and checked against the agreement's current recorded balance. Zero, malformed, out-of-range, and over-balance amounts are rejected before a database call. When no positive recorded rent balance exists, the cash form is replaced with an explanation to add only an approved monthly charge; advance credit remains unavailable. This aligns the UI with the existing transactional confirmation rule and prevents reports that can never be allocated. Pending cash still does not lower balances.

Verification: added focused exact-centavo unit tests, including one-cent boundaries, exact-balance acceptance, over-balance rejection, malformed precision and numeric range. Extended the isolated cash integration browser test to verify readiness display and that an over-balance amount creates no database record/RPC before the valid pending-to-confirmed flow. `npm test` passes 44 tests and `npm run build` passes strict TypeScript/Vite with the existing chunk-size advisory. `npm.cmd run test:cash:supabase` passed the full isolated Auth/MFA/RLS/idempotency/rollback/concurrency and authenticated browser flow, including the new over-balance rejection check and the existing valid pending-to-confirmed acknowledgment/reprint path. Its generated project used fictional `.invalid` identities and a unique disposable local stack; cleanup stopped that stack and removed its temporary workspace. The preserved local DB, hosted development and production were not used or modified.

Limitation: the readiness panel reports database setup state; it cannot prove that the entered agreement or verifier details were independently reviewed. Owner identity verification and rent-term approval remain required before the first real local transaction.

Next: only after owner verification of the exact clerk account and review of actual room/rent terms, exercise one approved local workflow. Do not seed or infer data to make the checklist look complete.

## Property-wide cash confirmation queue - 19 Oct 2026

Added a pending-cash queue to the saved Payments and balances screen. Staff can see pending report count and each report's responsible tenant, building/unit, amount, actual receipt date, collector and text status without selecting every agreement. The designated verifier can launch the existing confirmation review directly from the queue. Owners and other staff see the queue but not a confirmation action. Agreement-level cash history and acknowledgment reopening remain available. No schema or authorization changes; the queue reads the same MFA/RLS-protected workspace RPC and confirmation still uses the existing transactional RPC.

Verification: the isolated cash browser flow asserts existing pending reports are visible to the owner without confirmation controls, identifies a newly saved pending item by tenant/location, signs in as the designated MFA clerk, confirms it from the queue without first selecting the agreement, sees the acknowledgment, and verifies the item leaves the pending queue only after confirmed settlement. Full isolated cash tests, all 44 unit tests, strict build, and `git diff --check` pass. No preserved local financial records, hosted development, or production data were touched.

Next: the owner identity and actual rental terms still gate a first approved transaction in the preserved local database; the queue does not remove that review requirement.

## Saved staff account statement - 19 Oct 2026

Added a read-only statement for the selected tenant/room agreement in saved Payments and balances. It identifies the responsible tenant and rental space; lists saved rent charges by due date with the current remaining amount per charge; and lists confirmed cash by actual receipt date with the allocation months from the immutable acknowledgment. The agreement's existing saved balance remains the authoritative total. Pending cash reports appear in a separate section and are explicitly excluded from confirmed payments and balances. Staff can reopen the acknowledgment from a confirmed statement row. No migration, RPC, grant, financial write, tenant-facing view or export was added.

Verification: focused statement-model tests prove pending cash is excluded, confirmed allocation months are retained, stable date order and charge-before-payment order on the same date. The isolated Auth/MFA/RLS/concurrency cash integration browser flow verifies a pending report appears only in the pending section, then appears in confirmed history with allocation details after the designated clerk confirms it; acknowledgment and balance persistence still pass after reload. All 46 unit tests, strict TypeScript/Vite build, isolated cash integration flow and `git diff --check` pass. Build retains its existing >500 kB chunk advisory. No preserved local financial records, hosted development or production data were touched.

Limitations: this is an internal staff statement for one selected agreement, not a combined tenant-wide statement, tenant portal feature or downloadable report. The local database still requires owner verification of the clerk identity and actual tenant/room/rent terms before its first approved real workflow.

Next: complete that identity and terms review before exercising the saved workflow against preserved local records. Decide separately whether to add tenant-facing access or statement export after staff review.

## Cash statement accessibility and access-boundary checks - 19 Oct 2026

Hardened the small-screen cash workflow layout after a new reflow check found two overflow sources: intrinsic grid sizing in rent forms and non-wrapping pending-status chips. Rent forms now use a zero-minimum single column, pending labels wrap, and headings wrap at the narrowest effective viewport. The isolated authenticated browser flow now checks 390px, 320px, a 160-CSS-pixel effective viewport (narrow viewport approximation for 200% browser zoom), 768px, and 200% root text size at 320px. It asserts no page-level horizontal overflow and visible buttons remain at least 44px tall. It also keyboard-tabs to the acknowledgment action and asserts visible `:focus-visible`.

Security checks are repeated after disposable statement records exist: anonymous and unassigned accounts cannot call the MFA-protected workspace snapshot; pending cash appears only in the pending section, not as a confirmed statement event; and existing owner/clerk restrictions remain covered (owner cannot confirm, designated clerk requires MFA, browser direct writes denied, confirmation is transactional). No authorization, schema or data changes.

Evidence: `npm.cmd run test:cash:supabase` passed all isolated Auth/MFA/RLS/financial and browser assertions, including the new responsive, keyboard, pending-separation and access-denial checks. No preserved local financial records, hosted development or production data were accessed. This automated browser coverage is a useful regression gate, not a complete native browser zoom, assistive-technology, contrast, or WCAG 2.2 AA audit.

Next: owner identity and rent-terms review still gates the first approved saved transaction. Perform a manual screen-reader/keyboard and actual browser zoom review before claiming accessibility conformance; do not widen financial access or add tenant statements/exports without a separate authorization review.

## Validate saved financial snapshots before display - 19 Oct 2026

Added a runtime parser at the saved `read_rent_workspace` boundary. It rejects unexpected response shapes, non-string or malformed/out-of-range money, invalid dates/IDs, unknown cash collectors, inconsistent pending/confirmed/acknowledgment state, acknowledgments whose payment identity/details or allocation totals do not match the report, broken exposed relationships, charge remaining above its original amount, and agreement balances that do not equal the sum of their current charge remaining amounts. Malformed snapshots are withheld and a clear error is shown; no fallback or number coercion is used. Archived units are intentionally excluded from the active unit list, so historical agreements that reference an archived unit remain valid and render with the existing unavailable-location fallback.

Focused model tests cover valid data, malformed money/calendar values, mismatched totals and acknowledgments, settlement-state mismatch, and the archived-unit case. This is a defensive display-integrity check only: database authorization, transactional writes, and PostgreSQL constraints remain the source of truth. No migration, grant or data was changed.

Next: after owner verification of the clerk identity and real terms, exercise the first approved saved workflow locally. Treat the parser as defense in depth, not an independent security review.

Follow-up review: the snapshot parser now also rejects duplicate IDs and agreement tenant IDs that do not exist in the authorized tenant result loaded by the same staff workspace. Added regression tests for both cases. `npm.cmd test` passes 52 tests, `npm.cmd run build` passes, and `git diff --check` passes. The existing Vite chunk-size advisory remains. This change validates displayed data only; owner identity and rent-term review remain the gate before the first saved transaction.

## Admin capabilities inventory - 19 Oct 2026

Added [ADMIN_CAPABILITIES.md](ADMIN_CAPABILITIES.md) as a concise admin/staff feature and gap inventory. It separates authenticated database features from fictional previews, records the current empty financial tables and unassigned verifier, and lists owner decisions and release-readiness gates. Corrected README's stale claim that financial posting and saved balances do not exist: local saved cash/rent RPC workflows are implemented, but they are not yet operationally populated and are not migrated to hosted development or production.

This is documentation-only. No app, database, account, migration, hosted service or production state changed. `git diff --check` passed. Next operational action remains owner confirmation of the clerk identity and review of actual tenant/room/rent terms before the first saved local transaction; see [ADMIN_CAPABILITIES.md](ADMIN_CAPABILITIES.md).

## Prioritized admin project choices - 19 Oct 2026

Recorded four practical project candidates in [ADMIN_CAPABILITIES.md](ADMIN_CAPABILITIES.md): complete one owner-approved saved local cash workflow; persist the existing Paid rent report as read-only; add a strictly tenant-scoped read-only renter statement after clarifying household/business access; and implement check receipt/clearance after owner policy and evidence decisions. The first is the immediate prerequisite; the latter three are sequenced follow-on milestones and must not be bundled together.

Documentation-only; no product or database behavior changed. `git diff --check` passed. Next action remains owner-side clerk identity and terms review; until that happens, only independent UI/documentation work can progress without guessing financial facts.

## Persistent saved Paid rent report - 19 Oct 2026

Added a read-only Paid rent report view inside authenticated Payments and balances. It reuses the existing staff/MFA-authorized `read_rent_workspace` snapshot: confirmed cash is grouped by actual receipt month, and recorded rent charges with positive remaining amounts are listed separately by selected rent month. It retains renter/location, receipt date, amount, covered rent months, and acknowledgment access. An arrears list counts distinct recorded months with positive balances. Exact totals use integer minor units. Pending cash and checks are excluded; missing charge months are not labeled unpaid. No RPC, grant, table or financial write was added. Tenant-facing statements remain deferred per user direction. Check scope is clerk records receipt, owner clears, returned states and audit trail; evidence, postdated-check and correction/reversal rules remain open.

Evidence: `npm.cmd run build` passed with the existing >500 kB chunk advisory; `git diff --check` passed. Local Supabase API/browser verification was unavailable because Docker Desktop's engine is stopped and Windows denied a normal service start. No saved rows were loaded and no tests were added/run in this slice. The report is not yet integration-verified.

Blocked prerequisites: the first saved cash workflow still needs owner confirmation of the clerk identity and review of actual tenant/room/rent terms. Check receipt/clearance schema and write code must wait for the remaining policy decisions. Next: start Docker/local Supabase, sign into the local app, verify the saved report against fictional local records; separately complete the owner review for the cash workflow. Do not use real collections until approved.
