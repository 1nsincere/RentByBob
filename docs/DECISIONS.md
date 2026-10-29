## The clerk runs operations; the owner oversees - 28 Oct 2026 (owner decision)

"The owner's login is just to see what is going on and the inventory; the clerk manages it all." Any staff member with MFA may do day-to-day operations that used to be owner-only (removal, move-out, reversal, check handling, handovers, switches, layout, room rename, voiding maintenance). Cash confirmation (the approval) is done by any clerk. The owner keeps all powers except confirming cash (clerks only) and alone controls who may sign in (invitations, access assignment, access history). Trade-off accepted by the owner: one person can now record and confirm cash; the audit log shows who did what.

## Remove tenants with a room; maintenance in the monthly report - 28 Oct 2026 (owner requests)

The owner may remove a tenant who still has a room in one step. The room agreement ends (on its move-in date if nothing was ever recorded against it and it began before this month, otherwise today) and the tenant is hidden from all lists; records, rent history and the audit log stay. Maintenance (what, where, amount, per month) is recorded by staff, voided rather than edited, and listed with a total in that month's PDF report. It is an expense record only and never changes a tenant balance. The owner asked (28 Oct 2026) for an optional "paid rent minus maintenance" line at the very bottom of the monthly report and PDF; it is added, labelled information only (cash received is not profit; rent still due and other costs are excluded), calculated exactly in centavos.

## Past months from the notebook need a double check - 28 Oct 2026 (owner decisions)

Existing tenants predate the app and the only record is the paper notebook. Months entered from it are *waiting for a double check*, shown separately and **not counted as owed** (not in balances, the late-rent list or reminders) until a **different** staff member (clerk or owner) confirms them against the notebook; each entry must name the notes it came from. A best-guess move-in date is flagged and double checked the same way. Cash received meanwhile becomes advance credit, which pays the months automatically once they are confirmed.

## Building drawings follow the owner's sketch - 27 Oct 2026

- **Building 1 (owner sketch):** upstairs rooms on a balcony walkway, numbered from the stairs end, windows beside every other door; apartment with its own arched street door; Rooms 01-03 inside the gate along the hallway with the stairs. Used on the landing page and on every staff front view and room picker.
- **Building 2 (owner sketch, 27 Oct 2026):** windows left of upstairs doors; Room 08 in a left wing; gym double doors, a door to the stairs, and a hall door to Rooms 01-03 inside.
- **Other buildings (assistant assumption until sketched):** Bob's house rooms drawn as windows; House 1 a single door and window.

## Renter payment reports and private commercial spaces - 27 Oct 2026

- **Report a payment (owner request):** renters may tell the property they paid in person. A report is only a notice: it never reduces a balance and is not pending cash. Staff either record the cash through the normal flow (pending until the designated verifier confirms) and link it, or mark the report not received with a reason the renter sees. Collector choices: Bob, James, someone else. No online payment or GCash (assistant default: unchanged "pay your collector in person" rule). Limits chosen by the assistant: date within the last 90 days and not in the future; 5 waiting reports per room; 10 per person per day; reports older than 180 days drop off the renter list.
- **Stores and Yamaha are never public (owner decision):** commercial spaces cannot be listed, inquired about or auto-listed.

## Billing automation, advance payments, room changes, removal - 27 Oct 2026 (owner decisions)

- **Automatic monthly rent:** on the 1st of each month (Philippine time) every current agreement gets that month's rent at its agreed amount, due on its usual anniversary day; never twice; nothing after a move-out month. Owner switch per property (off until turned on; turning it on posts the current month at once). Hourly `pg_cron` job where available, plus a catch-up whenever staff open Payments. Charges are audited under the owner who turned it on.
- **Advance payments:** confirmed cash above what is owed is kept as advance credit on the same agreement and pays the next rent months automatically (oldest month first, oldest payment first) when they are added, manually or automatically. Reversing a payment also reopens months its credit paid. Credit is never paid out by the app; refunds stay outside it. The acknowledgment records the advance portion. Record cash starts with the agreed monthly rent and can be changed.
- **Room change while still renting:** same agreement, monthly rent, due day and balance; the room changes from a chosen date (not in the future); history kept in `agreement_room_changes`. Historical charges show the agreement's current room.
- **Remove tenant:** owner, with a reason, after move-out: hidden from every list; payment history stays in reports and the audit log (no physical deletion).
- **Map shows renter and rent:** occupied room tiles show the responsible renter's name and monthly rent (staff-only screen). Other occupants are still never stored or shown.
- **Paid rent report export:** Excel/CSV removed at the owner's request; replaced by a formatted PDF (browser "Save as PDF") with the same figures as the screen.
- **Navigation and app bar:** grouped menu (Daily work; Accounts & security folded under a toggle) and a standard app bar (theme icon, EN/CEB switch, account chip, Sign out).

## Security defaults chosen by the assistant (user delegated: "tighten its security") - 27 Oct 2026

Staff are signed out after 30 minutes without activity (2-minute warning with Stay signed in); server sessions end after 12 hours or 2 hours idle; passwords need 12+ characters at the Auth server. These are adjustable defaults, not business rules: change `IDLE_WARN_MS`/`IDLE_GRACE_MS` in `src/access/idle-model.ts` and `[auth.sessions]` in `supabase/config.toml` if the office finds them too strict.

## Simple add-tenant and payments flow; preview features in live - 26 Oct 2026

User direction: payments were "too complicated" and adding a tenant had "too many steps"; the live app should work like the preview, and from now on every preview feature should be in the live app.

- **Add tenant in one step.** Name, type, optional vacant room with move-in date and monthly rent, review, then one save. Migration `202610270004_register_tenant.sql` adds `register_tenant`, which calls the existing `create_tenant` and `create_rental_agreement` in one transaction, so a refused room (taken, shared gym, bad rent) leaves no tenant behind. Same staff-MFA rule and retry-safe IDs. The vacant-room tile on the property map now says "Add tenant" and opens this form with the room chosen (it used to open the Payments agreement form).
- **Payments like the preview.** Main view: "What needs attention?" list beside the selected account; "Record cash payment" → amount/date/collector → review showing which months it would pay (oldest first, display only; the database still allocates on confirmation) → save as pending; the verifier uses "Review cash" on the same account. Account tabs: Rent by month (with add month), Payment history (statement, acknowledgments, owner reversal), Room rent setup (fixed rent/move-in, owner move-out). Less frequent work is under **More tools**: property-wide cash to confirm, checks & handovers, monthly rent for everyone, setup (verifier, giving an existing tenant a room, glossary).
- **Not carried over from the preview, by rule:** occupant names (the user decided "STRICTLY NO" names, only "occupied"); changing a saved rent (the preview simulated it, but the real rule is not decided: which month it starts and who may change it). The setup tab says so.
- A duplicate warning (same tenant, amount and date) must be ticked before saving, as in the preview.

## Real property layout, map and occupancy - 26 Oct 2026

User decisions: the preview layout is final. Building 1 and Building 2 have a ground and a second floor (Building 1: Apartment + 3 rooms ground, 6 rooms second; Building 2: shared Gym + 3 rooms ground, 5 rooms second); Bob's house has 6 rooms; House 1 is rented as a whole house (no people count); Yamaha property is a single commercial space; Stores 1–3 are single shops whose tenant is the business (owner/business name optional). The map uses the owner's fixed site sketch positions. **No occupant names are stored**: a room shows only Occupied or Vacant, derived from a current agreement. The only name staff see is the responsible tenant who pays rent; renter details are never public. Initial room numbers continue across floors within a building (unique names required) and the owner will rename them on site. The shared gym can never be rented or publicly listed.

## Public room listings and inquiries - 26 Oct 2026

Supersedes the open questions of 22 Oct. User decisions: staff explicitly mark a room "listed" (owner or clerk with MFA); the public sees only building, room, asking monthly rent and a short description (no photos in this slice); visitors leave an inquiry (name, phone or Messenger, message) that staff read later. Implementation rules: a listed room is hidden automatically while it has any current or upcoming agreement (never inferred available from missing data); visitors cannot read inquiries back; spam limits of 3 inquiries per contact per 24 hours and 20 per property per hour; inquiries older than 90 days are deleted (retention period adjustable by the owner). The public page is served at `/rooms`; a QR code should point to that address once a real public site exists. Public deployment still needs explicit owner authorization.

## Production-prep rules chosen by the user - 26 Oct 2026

- **Reversal of confirmed cash:** owner only (with MFA), written reason required. The cash record and acknowledgment are kept unchanged; the payment is marked reversed, its rent-month allocations move into an append-only reversal record, and the rent it paid becomes owed again. Renters no longer see a reversed payment as paid.
- **Monthly rent:** staff review, then one-click add. The screen lists active agreements missing a charge for the chosen month (amount and move-in due date shown); nothing is charged until staff confirm. No scheduled automatic charging.
- **Move-out:** owner records a move-out date and reason. Full months only (the move-out month is charged in full, no proration); no deposit handling; unpaid rent stays owed on the ended agreement; no charge may be added for a later month, and the move-out cannot precede an already-recorded later month. The room can take a new agreement starting the day after the move-out date.
- **Backups:** daily, keep 30 days, stored privately outside the repository; restore must be rehearsed on a throwaway copy.

## Draft safety and renter password change - 26 Oct 2026

Implementation choices within the user's "do what is best" direction: access is re-checked in place rather than by unmounting the workspace (the server still enforces access on every request); a renter password change requires the current password; and leaving with unsaved form typing asks first. Dashboard collection figures reuse the existing Paid rent report definitions and add no new financial rule.

## Renter self-service view - 26 Oct 2026

User chose that signed-in renters may see their room, rent, balance and confirmed payments, superseding the 19 Oct deferral of renter-facing statements. Sign-in stays invitation-based email + password; renters are not asked for staff MFA, and email one-time codes were not chosen. Rules applied: the balance uses the same rule as staff (confirmed cash and cleared checks only); pending cash and received/deposited checks are listed as "waiting for confirmation" and never reduce it; the view is read-only and states that payments are not made on the website. Not shown to renters: collectors' internal records, verifier/staff account IDs, handovers, other tenants. Returned or reversed checks are currently omitted from the renter view; how (or whether) to tell a renter about a returned check is an open owner decision. Monthly status words are descriptive ("Paid", "Partly paid", "Not paid yet"); no overdue, grace-period or late-fee rule is implied.

## Building sketch reflects entered room counts - 26 Oct 2026

User asked for the building sketch to depend on the number of rooms. This reverses the 19 Oct choice that facade doors were decorative and did not indicate a count. In the fictional preview, the front view now draws one door per entered space per floor, distinguishes rooms from apartments, shared and commercial spaces, marks example-occupied rooms with colour plus a person mark, and shows "Room count not set" instead of inventing doors. It remains illustrative and preview-only: no surveyed layout, capacity, vacancy or occupancy policy is implied, and the saved database still has no floor model.

## Dashboard-style visual theme - 26 Oct 2026

User supplied a property-management dashboard as inspiration and permitted routine UI decisions. Adopted its navy sidebar, bright-blue actions, gradient hero, tinted icon circles and motion. Deliberately not adopted: charts, revenue/overdue KPIs, search and notifications, because no approved data, report definition or workflow exists for them. Any future financial KPI needs an agreed definition and must exclude pending reports and uncleared checks.

## Language-switch copy and data boundary

Use the existing browser-persisted English/Bisaya preference and manually authored, simple Bisaya. Do not call an external translation service. Translate app-authored labels, instructions, statuses and errors only; retain user-entered names, emails, building/room labels, dates, amounts, IDs and records exactly. Keep technical/security/financial meaning accurate, mark Bisaya as unverified until reviewed by a fluent speaker, and do not describe it as authoritative before that review. This UI-only work does not change Auth, access assignment, financial rules, or database state.

## Public room availability request - 22 Oct 2026

The user wants prospective renters who inquire to reach a public, view-only listing through a website URL or QR code, grouped by building and showing rooms marked available. Implement a separate fictional development preview while the real publication model is pending. Do not connect it to tenant, staff, or payment snapshots; the current saved model does not track occupancy/vacancy. Do not assume a room is vacant because it has no saved agreement or charge.

Unresolved before real publication: owner-controlled publish/unpublish permissions; authoritative availability and freshness; exact public fields (including whether to show rent, photos, amenities, location or contact details); inquiry workflow; and public hosting approval. Never expose renter names, account data, financial records, or staff/security information. QR generation follows a stable, owner-authorized public URL; a QR code is not an access-control mechanism. This request does not add self-registration, public account access, online payments, or production deployment.

## Preview room-rent change interaction - 20 Oct 2026

For the fictional Payments and balances preview only, keep a saved-in-preview room rent read-only by default. Staff may unlock the rate with an explicit checkbox, choose the first rent month at the proposed rate, and review the current/new amounts and due date before confirming. Confirmation adds that selected month's charge and uses the new rate for subsequent preview charges; previously recorded charges remain unchanged. The selected month must not already have a charge for that room. Returning to edit details preserves the uncommitted form draft; no preview term or charge changes until confirmation.

This does not authorize editing a saved database agreement. Any persisted rent change requires a separate decision on effective date and authorized role, plus a reviewed transactional database operation, audit behavior, idempotency and tests. Do not infer retroactive changes or other rent policy.

## Responsible tenant and acknowledgments - 18 Oct 2026

User confirmed one responsible tenant per room; others are occupants. A room cannot have a second agreement in this first slice; move-out/reletting must use a later reviewed lifecycle, not deletion. Confirmed cash issues a Cash Payment Acknowledgment for actual received money, including partial payments. Not restricted to fully paid months and not a tax receipt. Print/Save PDF is available to staff; no automatic email, public download or tenant portal delivery. James is a designated confirmed clerk identity, not a hard-coded name/email. Owner can designate verifier but cannot implicitly settle cash.

## Paid rent reporting basis - 18 Oct 2026

Paid rent means confirmed cash received in the selected receipt month, including partial payments. It does not mean every covered rent month is fully settled. Allocation rows show the current remaining charge balance across all receipt months. Payment IDs group split allocations without counting multiple receipts. No verification-date collection report or check-clearance total inferred.

## Saved staff account statement - 19 Oct 2026

The first saved statement is staff-only and read-only within the existing authorized Payments and balances workflow. It lists saved rent charges by due date and confirmed cash by actual receipt date, with rent-month allocation details and each charge's current remaining amount. The current agreement balance remains the authoritative total. Pending cash is shown separately and explicitly excluded from settled payments and balances. No tenant financial access, export, new accounting rule, check handling, or write action is part of this slice.

## Paid-rent report layout and outstanding list - 19 Oct 2026

The staff Paid rent preview uses separate month filters for cash received and rent charges. Its received-cash report lists confirmed payments with renter, rental space, actual received date, amount and rent months covered; the summary counts distinct renters and confirmed payment groups. A separate lower table lists recorded rent charges with a remaining balance for the selected rent month, including partial payments. No rent charge/setup for a month is not treated as unpaid. Pending reports and uncleared checks never reduce balances. This is a preview presentation choice only; no financial rule or saved report/API was added. The user selected “still has rent left for the selected rent month” as the meaning of the bottom outstanding section.

## Preview rent-month addition and arrears threshold - 19 Oct 2026

For the temporary Paid rent preview, the user chose to create a selected missed-month charge using the renter's existing rent amount and move-in-based due date, and to flag renters with two or more unpaid rent months. Require an explicit review/confirmation, block a duplicate room/month charge, and only offer renters with saved rent setup and an assigned room. Count distinct recorded charge months with a positive remaining balance; do not infer missing charges or overdue status. Pending entries and uncleared checks remain excluded from balances. This is preview behavior, not a new accounting rule or database write.

## Staff dashboard landing page - 19 Oct 2026

After staff access is ready, show a dashboard home by default with a greeting that identifies the signed-in account by its authenticated email (no unverified display name is assumed). Ask what the staff member wants to do and provide direct navigation to record a payment, add a tenant, view property/buildings, or find a tenant. Selecting an action only navigates to its existing workflow; it does not create data. Keep this landing page staff-only and do not change the tenant portal. Preview actions remain fictional and temporary.

## Autonomous admin milestone - 18 Oct 2026

User permits routine implementation decisions and will review the running app. Continue in reviewable milestones; production, real data and financial policy inference remain outside scope. Payment worklist prioritizes pending verification, then unpaid/setup filters. Similar date/amount entries require review but are not automatically rejected as duplicates. Date validation rejects impossible calendar days. See CASH_PERSISTENCE_PLAN.md before persisted financial work.

## Guided cash workflow - 18 Oct 2026

User accepted last-day-of-month fallback for move-in anniversaries and James-only cash verification. Implemented a simplified development preview: one balance/record action, three-field cash entry, oldest-first allocation review, pending queue, separate James confirmation, expandable monthly rent/history/setup. Bob and James records remain pending until explicit simulated James confirmation. Reallocation occurs at confirmation; excess is rejected, original due dates retained. Move-in anchor clamps short months without drift; monthly charges use room/month duplicate prevention and keep historical amounts. Cash only; checks cannot be settled here.

Validation: strict build and 39 tests pass; browser check passes pending non-settlement, oldest-first multi-charge allocation, reallocation after another payment, 320/390/768px reflow and zero external requests/runtime errors. Mobile screenshot inspected. No WCAG claim. All state is temporary, production excludes preview. No database/Auth/RLS/migrations changed.

Next required milestone: persisted agreement/occupancy model, explicit cash-verifier permission bound to James, transactional PostgreSQL cash/report/allocation functions with RLS/idempotency/concurrency tests. UI preview confirmation is not authorization. Automatic monthly posting, corrections/reversals, excess credits, check clearance and production saving remain unimplemented. User room-layout details remain deferred.

## Billing decisions - 18 Oct 2026

User specifies per-room rent, monthly due dates based on move-in date, and oldest unpaid rent first. User prefers James only to verify cash; Bob records amount and actual payment date as pending evidence. Treat James-only cash verification as the working direction (user said "maybe"), with explicit permission review before enabling persisted settlement. Owner role must not implicitly grant cash verification. Pending Bob entries never reduce settled balances. Check clearance/reversals are separate and unconfirmed.

Still unresolved: move-ins on 29-31 in shorter months, grace/late-fee policy, advance/excess credit, initial balances, receipt verification evidence, and agreement responsibility for shared rooms. Do not invent these rules. Existing manual-allocation preview has not yet been changed to this agreed workflow.

## 18 Oct 2026 ? per-room payment preview

User confirms rent is per room, not per person; room-count/capacity/entrance details deferred. Preview permits explicit charge amounts, rent-period descriptions and agreed due dates instead of inferring a schedule from late payments. Actual receipt date remains independent. Partial receipts explicitly target one charge. No maximum capacity or financial fee inferred. Duplicate same-room period labels are blocked as a preview safeguard, not a complete occupancy/charge uniqueness model. Persisted billing needs canonical period keys and agreement ownership.

# Decisions and open questions

## Renter statements and check authority - 19 Oct 2026

- Renter-facing financial statements are deferred; keep them out of the renter portal for now.
- For a future check workflow, a clerk may record physical receipt; only an owner may mark a check cleared. Returned checks and an audit trail are required. Pending and returned checks must not reduce settled balances.
- Superseded by the detailed check-recording decisions below; retain as historical context only.

## Basic check tracking - 19 Oct 2026

- Keep renter-facing financial statements out of the portal for now.
- Clerk records check receipt. Owner records deposit, clearance, or return. Only a bank-confirmed check may be cleared; a postdated check may be recorded when received but remains unsettled until bank confirmation. Returned checks do not reduce balances.
- A cleared check allocates to oldest due rent first. The owner may reverse a cleared check only with a reason and audit trail.
- Keep the record form minimal: generate a short sequential display reference such as `CHK-0001`, unique per property, while retaining an internal UUID. Capture renter/agreement, amount, actual receipt date, check date, collector and status. Do not require bank name or bank check number for this basic list. Do not collect bank account numbers or check images.
- Reversal after clearance reopens the allocated rent balance. Returned/reversed checks are retained in history and excluded from settled balances. Every transition is transactional and audited.

## Collection handover log - 19 Oct 2026

- Record clerk-to-owner handovers as operational evidence, separate from tenant payments and balances.
- At handover creation, capture the recorded cash and check totals as a snapshot, plus the responsible clerk and handover date. The owner records the actual amounts received and a reason for any difference. Keep every handover and its audit history; do not silently reconcile or change tenant balances from a difference.

## Occupant display and focused workflow - 17 Oct 2026

User requested focus on three sections and named room occupants with a person icon/count, stating each room has a minimum of two occupants. Implement minimum two only for preview Room-type assignments, counting existing active occupants plus the submitted record. No maximum assumed. Individual tenant name is counted once as primary occupant; additional names are explicit. Business name is not counted as a person. Shared gym is not selectable as a rental space. Assign-later records remain allowed without implying occupancy. Named people are separate from authenticated accounts and payment liability. Independent renters versus households/agreements remains unresolved before persistence.

## Property sketch interaction - 17 Oct 2026

Treat the supplied sketch as relative site placement, not surveyed dimensions. Keep existing footprints fixed while editing illustrative interiors. Bob's house starts with six rooms without inventing a floor count; Buildings 1/2 have two user-described floors and unknown rental-room counts. Preserve apartment and gym separately. House 1/Yamaha/stores are whole spaces, not invented subdivisions. New buildings remain outside the fixed sketch until placement is confirmed. Prototype limits: 1-5 floors when adding a building and 0-40 rental rooms per floor; these are UI bounds, not confirmed property rules. Only fictional tenants/assignments are shown. Changes reset on reload; no persistence or real occupancy policy implied.

## Temporary UI debugging mode - 17 Oct 2026

Implement the requested no-sign-in dashboard as an explicit development preview using the current workspace components. Preserve authentication code for resumption; no server-side auth/MFA/RLS weakening. Fixture data and non-network transport are isolated in a development-only module; writes/sends unavailable. Normal hosted/local launches retain authentication.

## Hosted development authorization ? 17 Oct 2026

User authorizes inspecting project `vyzexanzktskvjxjpphp`, applying reviewed migrations if empty, and connecting fictional hosted development. This supersedes earlier local-only restrictions for this project only. Preserve local data/accounts, staff MFA, RLS and disabled signup. No production, purchases, real emails or real data. Exact-project/development-only guard, separate public configuration and signup-disabled launcher implemented. Hosted invitations are blocked server-side; recovery/invitation UI explains unavailability. User privately created confirmed fictional owner; audited bootstrap grants membership without password handling or MFA bypass. [Operational record](HOSTED_DEVELOPMENT.md).

## Current access and repository decisions - 16 Oct 2026
- User authorized private GitHub repository 1nsincere/RentByBob; main is connected and prior commits preserved.
- Local access UI, directory maintenance, owner account/contact access-audit review, durable invitation tracking and owner invitation reconciliation are implemented locally. See STATUS.md for current evidence; earlier next-step notes below are historical.
- Every contact or staff assignment requires owner MFA and verified email/UUID binding. James's renter invitation authority does not include assignment authority.
- One stable UUID represents a single invitation intent. Same-ID/same-payload retries read saved state; changed payloads are rejected. A property/recipient may have only one recorded attempt, so reissue is intentionally unavailable until a separate policy is approved.
- Provider acceptance is not inbox delivery; account existence is not attempt evidence. Only a provider-linked Auth account confirmed after the request can move an issued attempt to accepted. Owner review preserves unresolved status and does not send or assign access.
- Keep recipient data in the restricted attempt table indefinitely for now to enforce no reissue. Retention duration is not a policy decision and must be confirmed before changing this guard or removing records.
- Keep email-based onboarding for this slice. Paper invitation links are a documented future delivery option, not username-only access. No fake operational emails or custom password storage.
- Backup authenticator recovery is implemented. Email password reset does not bypass MFA; all-factors-lost operator recovery requires a separate reviewed procedure.
- Migration 202610160007 adds owner/MFA-only directory maintenance and a bounded access-audit view. Financial dependencies are mapped in BUSINESS_RULES.md; independent work may proceed.

## Earlier confirmed decisions, still applicable unless superseded
- Use existing `C:\Users\acegr\Desktop\Rent Tracker System`; skip creating/resolving a replacement Desktop folder.
- User has not discussed rental rules with landlord; defer all affected financial implementation.
- Latest user choice: use email addresses for authentication instead of the previously proposed phone/voucher direction. Use email/password with staff-issued accounts and no public signup.
- Invitation authority: the owner may initiate renter or staff invitations; James may initiate renter invitations only. Invitations do not assign staff roles or tenant access. The owner grants roles and tenant-contact relationships separately through trusted operations.
- James may clear checks and reverse payments with Sir Bob's approval. Confirm whether approval is needed for every clearance as well as each reversal and how approval is recorded. Do not silently grant unconditional authority.
- Local-only, fake-data prototype; validate readability before expansion.
- Current registry checked: Vite 8.3.4, React plugin 6.1.2, Tailwind Vite plugin 4.3.3 supports Vite 8. Node installed satisfies their requirements. Use lockfile for exact resolved dependencies.

## Blocking financial rules
On 16 Oct the user authorized continued development with available information. Continue policy-independent improvements to existing prototypes and tests; this does not confirm rental policies or constitute completed readability acceptance.

Per-unit/bed/person charging; calendar/anniversary billing; deadline and grace period; advance credit/excess and allocation policy; proration/move-out; deposits/utilities/discounts/penalties; commercial documentation; opening balances; postdated checks, timely-payment and returned-check rules. No fees assumed. Oldest-unpaid-first is a proposal only.

## Blocking access rules
Latest user direction supersedes the earlier readability gate: routine UI decisions may proceed without approval; build small complete slices beginning with migrations. Live database modifications, public deployment, purchases and real-data import remain unauthorized.

Current invitation implementation: the owner may invite renters or staff; James may invite renters only. The recipient sets their own password; invitation acceptance assigns no staff role or tenant access. Public signup remains disabled. Tests use fictional `.invalid` accounts and local Mailpit; no real invitations/accounts were created.

Use of real individual email addresses, including for business contacts, remains an operational policy choice. Local link acceptance, recipient password setup/sign-in, one-time replay rejection, invitation authority, stable attempt retry, owner reconciliation and Mailpit delivery are tested. Invitation lifetime is configured to one hour, but elapsed expiry has not been tested. The system cannot prove inbox delivery. Safe resend/reissue and recipient retention remain undecided and unavailable; owner/MFA assignment remains separate. No hosted email, purchase or production redirect is authorized. Paper temporary passwords and voucher-only login are not the selected version-one path.
Approval evidence, authorized collectors, contact access after move-out, retention and issuance policy remain open.

## Historical review clarification — 16 Oct 2026

At that review, first-owner bootstrap remained the next planned development slice. Migration 009 and the current invitation reliability milestone supersede that direction. Historical invitation findings are addressed as described in SECURITY.md; no financial policy is changed here.

## Official references checked
- https://vite.dev/guide/
- https://tailwindcss.com/docs/installation/using-vite
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/managing-user-data

## Historical local access hardening and bootstrap - 16 Oct 2026

Bootstrap is local-only, accepts an existing confirmed fictional .invalid Auth UUID, and creates the first fictional property/owner atomically. Identical retries are no-ops; any different initialized state is refused. This is a historical completed slice; see current STATUS.md. No real owner account is created.

## Directory maintenance and access-audit decisions — 16 Oct 2026

Migration 202610160007 adds owner/MFA-authorized rename and archive for buildings and units. Archiving a building archives all its units in the same transaction. Archived records remain visible to staff with their history, cannot be renamed or reactivated through the UI, and cannot parent new units. Active labels must be unique; labels from archived records may be reused because identity and audit history remain attached to the original IDs. These location labels do not imply occupancy, capacity or rent rules.

The owner access-history view exposes at most 100 recent access assignment/revocation, tenant archival and invitation-dispatch events. It displays event time, action, actor/target email where applicable, tenant name and reason. Access is enforced by a trusted owner/MFA database function. Invitation outcomes remain dispatch results, not proof of inbox delivery. This migration must be locally applied only after migration, API and browser checks pass.

## Invitation retry and retention policy — unresolved

Migration 202610160009 makes a best-effort external dispatch safe by refusing to repeat a provider call once the database claim is made. It cannot determine whether a crashed `dispatching` attempt reached Auth. Definitive provider rejection, uncertain outcome, expired invitations, and issued-but-undelivered invitations all currently remain non-reissuable for the same property/recipient. No resend UI or manual status override exists.

Before relaxing that guard, decide who may authorize reissue, what evidence qualifies, whether any waiting period applies, how provider expiry is proven, and whether provider API behavior supports a safe resend. Also decide recipient-data retention duration and archival/deletion effects on idempotency. Do not infer these rules from Auth account existence, delivery assumptions, or a local test.


## User direction - 17 Oct 2026
Prioritize frontend UX and responsiveness before further backend work. Use U-ConvertIT as a visual reference while retaining readable RentByBob styling. Renter email-code login is accepted follow-up scope, not implemented in this UI milestone; staff authenticator MFA remains required. Do not display a nonworking email-code button or weaken trusted assurance checks.
