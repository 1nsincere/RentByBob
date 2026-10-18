# Add missed rent month and track arrears - 19 Oct 2026

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

Next: review preview at http://127.0.0.1:5175. Before persistence, agree charge schedules/grace, allocation and excess-payment policy, verified collectors and check-clearance authority; design transactional RLS-protected accounting with idempotency/concurrency tests. Pending-to-settled transitions, reversals, editing posted charges and split allocations are not implemented. Room totals include all recorded charges, not only current tenant records. Room configuration questions deferred until user can inspect property.

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
