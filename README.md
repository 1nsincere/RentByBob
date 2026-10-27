## Cash acknowledgments and saved-flow status

Preview: confirm a sample cash payment, open Paid rent, then Open acknowledgment to print/save a clearly marked sample PDF. The saved staff cash workflow is active against the local database: the reviewed cash migration has been applied locally after disposable Auth/API, MFA/RLS, concurrency, audit-rollback and authenticated browser checks. The local financial tables are empty and no verifier is assigned. Before confirming cash, the owner must verify James's exact existing confirmed clerk identity and assign it in Payments and balances; review real room/rent terms before creating agreements or charges. Hosted development and production remain unchanged. Run `npm.cmd run test:cash:supabase` to repeat the full cash integration checks on a separate disposable local stack. See [docs/STATUS.md](docs/STATUS.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for current evidence and next steps.

The current scope checklist and verification limits are recorded in [docs/STATUS.md](docs/STATUS.md). Going live (staging first, owner-authorized steps, security settings) is described in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Everyday local commands (start, stop, apply database updates, tests, backups) are in [LOCAL_COMMANDS.md](LOCAL_COMMANDS.md). The saved Paid rent view and check/handover integration additions are implemented but not yet verified against Supabase; the disposable run is blocked until Docker Desktop's Linux engine is available. Do not treat the offline preview or unit tests as evidence of saved database behavior.

In the saved Payments and balances screen, the workflow-readiness panel shows the current property's verifier, agreement, monthly-charge and cash-record state. Save pending cash only for money already handed to a collector and up to the displayed outstanding balance. The form rejects excess amounts before sending a request; advance payments are not configured. A positive approved rent charge must exist first. No verifier or rent data is invented by the app.

Before any first saved cash exercise, the owner must verify the designated clerk's exact Auth account ID and confirmed email, review the tenant/room/agreed rent terms, and approve a fictional local test fixture. See the step-by-step gate in [docs/OPERATIONS.md](docs/OPERATIONS.md). The drafted check/handover migration remains unapplied until isolated Supabase API and browser checks pass; the latest Docker preflight blocker and recovery rehearsal plan are recorded in [docs/STATUS.md](docs/STATUS.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Staff dashboard

Staff land on a dashboard greeting that identifies the current signed-in email and asks what they would like to do. Quick actions open the existing payment workflow, tenant form, property/building view or tenant directory. The dashboard is staff-only; tenant portal navigation and records are unchanged. In the fictional preview these actions use sample accounts and in-memory data, which resets on reload. No payment, tenant, or property is created merely by choosing an action.

## Paid rent summary

In authenticated Payments and balances choose Paid rent report. The on-screen saved report reads the existing authorized rent-workspace snapshot and shows confirmed cash by actual receipt month, renters who paid, payment count, receipt dates, amounts, rent months covered and acknowledgment access. Its separate rent-month view lists recorded charges with remaining balances, including partial payments, and the arrears list flags renters with positive balances in at least two distinct recorded rent months. It does not infer missing charges or overdue status. Pending entries and uncleared checks are excluded; a month with no rent charge is not labeled unpaid. Its pure calculation helper has fictional unit coverage for month separation, pending exclusion, balance selection and exact minor-unit totals. The local authenticated view is read-only; integration verification awaits the local Supabase service. The fictional preview report remains temporary, and no spreadsheet export or saved downloadable report is provided.

The saved staff workflow also shows a read-only account statement when an agreement is selected: rent charges, confirmed cash by actual receipt date, rent months covered, and remaining amount per charge. Pending reports remain separate and do not reduce the balance. This is staff-only; it is not a tenant portal statement or export.

## Admin payment worklist

Open Payments and balances to search pending cash, unpaid rent and accounts needing rent setup. Tenant directory cards link straight to their payment account. Similar cash entries show a duplicate warning. Temporary preview only; see docs/CASH_PERSISTENCE_PLAN.md for the next database milestone.

## Simplified cash preview

Payments and balances now guides tenant selection, cash entry, review, pending record and simulated James confirmation. Allocation covers oldest unpaid rent first. Room rent setup uses move-in anniversary dates with last-day fallback in shorter months. This remains temporary development state; no database saving or real permission change.

## Payment records preview

At http://127.0.0.1:5173/?preview=1 choose Payments and balances. Enter fictional per-room charges with individual due dates, review partial cash/report/check entries, and see tenant/room balances and payment history. Only simulated settled cash reduces balances. All entries reset on reload; database payment saving and verification/clearance transitions are not implemented.

Payment history separates pending and confirmed examples with status, amount, receipt date and collector labels. After a fictional rent setup is created, its room rate and move-in date are fixed by default. The room-rent control now stays fixed until a deliberate change is toggled on, and it resets cleanly if the change is toggled back off without saving. To test a proposed rate change, unlock the rate, select its first rent month, review the amount and due date, and explicitly confirm. Earlier charges are preserved; duplicate room/month charges are rejected. This updates only in-memory preview state, not saved agreements. Persisted rent-term editing is not implemented.

The invited-renter and owner-access workflow also now shows clearer status guidance: an active account can still be waiting for a shared property record, and the owner assignment review distinguishes between the invitation, the matched account, and the final access decision. This is a UX hardening step only; it does not bypass invitation or MFA rules.

# Rental records

## Focused tenant workspace

Preview navigation now focuses on Tenant directory, Buildings and units, and Add tenant record. Add a fictional tenant with named occupants, select a room (or assign later), review and confirm. The directory and room people counts update together. Person icons show counts; selecting a room reveals names. User-specified minimum: two occupants per rental room; maximum remains unconfirmed. This workflow is in memory only and resets on reload at http://127.0.0.1:5173/?preview=1.

## Interactive property preview

Open http://127.0.0.1:5173/?preview=1 (`npm.cmd run dev:preview`). Tenant directory now has active sample tenant cards, building/room filters, expandable details and Locate room. Buildings and units has the clickable user-supplied site sketch, a mobile building list, floor selection, editable room counts/labels and Add building. The current building layout reflects Bob's house at 6 rent rooms, Building 1 with an apartment plus 3 rentable rooms on the ground floor and 6 rentable rooms above, and Building 2 with a gym plus 3 rentable rooms below and 5 rentable rooms above. Floor counts can be increased later when the property grows, and preview edits last until reload; nothing is sent to Supabase. The site footprint is fixed and not to scale. Unknown room counts stay unset.

## Public room-listing concept preview

With the Vite development server running, open `http://127.0.0.1:5173/?availability=preview` to review a separate, fictional, view-only guest listing page. It demonstrates available-room cards grouped by building without initializing the authenticated app or reading rental records. It is not connected to saved availability and must never be shared as a real vacancy listing. A public URL and QR code for approved real listings remain planned work; owner-controlled publication and privacy boundaries must be designed first.

## No-sign-in dashboard preview

Run `npm.cmd run dev:preview` and open http://127.0.0.1:5173/?preview=1. The preview now uses the same development origin as the account app. If RentByBob is already running on port 5173, the command reuses it without changing its local-versus-hosted backend configuration. Otherwise, it starts the authenticated local app, which requires local Supabase. The header button switches between fictional preview and the account app; `?auth=1` always selects the account app. Preview records are in-memory and fictional, do not load or modify an account session, and make no Supabase requests. The account app still requires its configured sign-in/MFA flow. Production builds exclude the preview module.

## Hosted development ? current

The authorized fictional Supabase project `vyzexanzktskvjxjpphp` now has all eleven reviewed migrations and a guarded connection. Run `npm.cmd run dev:hosted` for hosted Supabase or `npm.cmd run dev:local` for the preserved local database; stop the other Vite process first. Open http://127.0.0.1:5173. Signup is disabled, staff MFA is required, and hosted invitation/recovery email is unavailable. See [hosted setup and verification](docs/HOSTED_DEVELOPMENT.md). This supersedes older local-only authorization statements below; production, real data and purchases remain unauthorized.

Local React/strict TypeScript/Vite/Tailwind application connected to actual local Supabase Auth and PostgreSQL. Runtime screens show authorized database results, explicit empty states or errors. There is no prototype-data fallback.

## Start the working application

Use Node 24, Docker Desktop and this existing workspace. Install dependencies with `npm.cmd ci` when needed. Start local Supabase with `npx.cmd supabase start`, then apply reviewed local migrations with `npx.cmd supabase db push --local`. Never use a hosted link or remote migration command. Supabase startup/status output can contain keys; do not copy it into chat or screenshots.

In a separate terminal, keep the invitation handler running:

```powershell
npx.cmd supabase functions serve invite-account
```

If the local database has no property yet, create a fictional owner interactively:

```powershell
npm.cmd run setup:local
```

Choose a fictional `.invalid` email and your own hidden test password. This optional seed helper refuses an existing property; it never resets data, overwrites an account or creates a bypass user. Existing databases must use their existing owner. See [local setup](supabase/README.md).

Start the frontend:

```powershell
npm.cmd run dev:local
```

Open **http://127.0.0.1:5173**. Sign in and enroll an authenticator; MFA is required before staff data/actions. The launcher captures the local public URL/anonymous key into the child process without printing or writing keys. Service credentials never go to Vite. Plain `npm.cmd run dev` without configuration shows a configuration screen.

Local invitations/reset messages appear in Mailpit at **http://127.0.0.1:54324**. Use the link to set a password. Each attempt has a stable reference; repeating it checks persisted state rather than sending again. Owners with MFA can review masked attempts, continue only requests known not yet sent, and append evidence notes without changing unresolved state. Provider issuance does not prove inbox delivery. An owner must separately look up the exact email and assign contact/staff access. James/clerk may invite renters but cannot assign access or staff roles. Reissue for the same property/recipient is unavailable pending an approved policy.

## Working features and boundaries

- The header offers saved day/night and English/Bisaya preferences. Shared surfaces and report rows adapt to the saved theme; filled actions keep a separate high-contrast ink-blue treatment in both themes. Language coverage now spans the authenticated staff shell and major renter/property/payment/access/report screens, plus the fictional preview workflows; generic sign-in callback, session, access-check and sign-out failures also follow the selected language. App-authored copy is manually translated; names, emails, building/room labels, dates, amounts and saved records are unchanged and no translation service is used. Coverage is not yet complete; some preview and provider-returned error text may remain English. Bisaya has not had fluent-speaker review and is not authoritative. See [status](docs/STATUS.md) for verification and the next step.

- Sign-in, callback/password setup, password recovery, MFA enrollment/challenge/backup factor, sign-out.
- Unassigned/disabled screens, tenant isolation, server-enforced role/MFA checks and revocation.
- Owner identity-confirmed access assignment and disabling; no browser ID-only access mutations.
- Durable invitation states and owner/MFA reconciliation; no automatic retry, resend or access assignment on acceptance.
- Authorized tenant directory/search/create; staff property/building/unit reads; owner location creation, rename/archive and access-history review.
- Mobile-first renter record view with clear access and empty states; staff get a labeled mobile workspace menu and desktop sidebar.
- Local-only saved rent agreements, manual monthly charges, pending cash reports, designated-verifier confirmation, oldest-first cash allocation, printable/reopenable acknowledgment, and a read-only staff account statement. The local financial tables are currently empty and no verifier is assigned; first use is gated on owner identity and real-term review.
- In the fictional payment preview, pending cash is visibly labeled as unconfirmed and not part of the rent balance. Monthly entries separate rent charged from the amount still to pay, with clear due dates and a separately labeled room total. These are presentation clarifications only; calculations and financial rules are unchanged.
- Fictional preview-only paid-rent, outstanding-rent and arrears reports. No saved report or spreadsheet export. Pending cash and uncleared checks do not reduce settled balances.

The current admin feature inventory, working limits and exact operational gaps are in [admin capabilities](docs/ADMIN_CAPABILITIES.md). The basic check register and owner-entered handover log have UI and a new locally un-applied migration; integration verification is still required. General reconciliation, tenant-facing financial statements, excess credit and exports remain unavailable. No production deployment is authorized.

Renters have a single records destination and account sign-out; the app does not invent payment or dashboard tabs. Staff use workspace navigation to reach implemented directory, location, invitation, owner-access and security sections. Layouts stack on phones and add a staff sidebar on wide screens. See the [design system](docs/DESIGN_SYSTEM.md) for responsive behavior, contrast measurements and accessibility limitations.

Old fictional payment/design screens remain in `src/prototype/PrototypeApp.tsx`, separate from the runtime entry point and production bundle. Payment preview/domain tests are preserved. There is no runtime role selector.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run verify:release
npm.cmd run test:supabase
npm.cmd run test:browser
```

Browser tests use installed Microsoft Edge headlessly and real local Supabase with UUID-scoped disposable fixtures. No resets, real emails or production connections. They start the local frontend when needed; the invitation function must already be served. Traces/videos are disabled to avoid recording passwords and MFA secrets. See [status](docs/STATUS.md) for actual results and limitations.

GitHub Actions runs `npm ci` and `npm run verify:release` on pull requests and pushes to `main`. It does not deploy. Staging and production remain gated on a separately owner-controlled Supabase project, project-specific connection configuration, live verification, recovery/accessibility review, and explicit authorization; see [operations](docs/OPERATIONS.md).

## Project records

Read [AGENTS.md](AGENTS.md), [status](docs/STATUS.md), [roadmap](docs/ROADMAP.md), [decisions](docs/DECISIONS.md), [data model](docs/DATA_MODEL.md), [security](docs/SECURITY.md), [onboarding/recovery](docs/ONBOARDING.md), [business decisions by feature](docs/BUSINESS_RULES.md), and the [original brief](docs/USER_REQUIREMENTS.txt).

Git history is backed up to the user-authorized private repository [RentByBob](https://github.com/1nsincere/RentByBob), with `main` tracking `origin/main`. No hosted Supabase project, real account, deployment or purchase is authorized. Production readiness, independent review, backup/restore and full accessibility verification remain separate gates.
