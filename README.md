## Cash acknowledgments and saved-flow status

Preview: confirm a sample cash payment, open Paid rent, then Open acknowledgment to print/save a clearly marked sample PDF. Saved admin workflow and SQL migration are implemented but NOT activated: local Docker engine is unavailable and Supabase MCP is absent in this session. Existing database has not changed. See docs/STATUS.md for the exact integration checks and activation steps remaining.

## Paid rent summary

In Payments and balances choose Paid rent. Select a payment month to see confirmed cash received, grouped payments, covered rental months and remaining rent. Pending entries are excluded; partial payments are explicit. Temporary preview only.

## Admin payment worklist

Open Payments and balances to search pending cash, unpaid rent and accounts needing rent setup. Tenant directory cards link straight to their payment account. Similar cash entries show a duplicate warning. Temporary preview only; see docs/CASH_PERSISTENCE_PLAN.md for the next database milestone.

## Simplified cash preview

Payments and balances now guides tenant selection, cash entry, review, pending record and simulated James confirmation. Allocation covers oldest unpaid rent first. Room rent setup uses move-in anniversary dates with last-day fallback in shorter months. This remains temporary development state; no database saving or real permission change.

## Payment records preview

At http://127.0.0.1:5175 choose Payments and balances. Enter fictional per-room charges with individual due dates, review partial cash/report/check entries, and see tenant/room balances and payment history. Only simulated settled cash reduces balances. All entries reset on reload; database payment saving and verification/clearance transitions are not implemented.

# Rental records

## Focused tenant workspace

Preview navigation now focuses on Tenant directory, Buildings and units, and Add tenant record. Add a fictional tenant with named occupants, select a room (or assign later), review and confirm. The directory and room people counts update together. Person icons show counts; selecting a room reveals names. User-specified minimum: two occupants per rental room; maximum remains unconfirmed. This workflow is in memory only and resets on reload at http://127.0.0.1:5175.

## Interactive property preview

Open http://127.0.0.1:5175 (`npm.cmd run dev:preview`). Tenant directory now has active sample tenant cards, building/room filters, expandable details and Locate room. Buildings and units has the clickable user-supplied site sketch, a mobile building list, floor selection, editable room counts/labels and Add building. Preview edits last until reload; nothing is sent to Supabase. The site footprint is fixed and not to scale. Unknown room counts stay unset.

## No-sign-in dashboard preview

Run `npm.cmd run dev:preview` and open http://127.0.0.1:5175. This temporarily skips sign-in for the current owner workspace with fictional in-memory directory/location records. Tenant additions and layout edits update temporary preview state; nothing is saved to the database or sent. Authentication code remains intact. Normal `dev:hosted` and `dev:local` still require sign-in/MFA. On either development server, `?preview=1` also selects preview; `?auth=1` exits it. Production builds exclude the preview module.

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

- Sign-in, callback/password setup, password recovery, MFA enrollment/challenge/backup factor, sign-out.
- Unassigned/disabled screens, tenant isolation, server-enforced role/MFA checks and revocation.
- Owner identity-confirmed access assignment and disabling; no browser ID-only access mutations.
- Durable invitation states and owner/MFA reconciliation; no automatic retry, resend or access assignment on acceptance.
- Authorized tenant directory/search/create; staff property/building/unit reads; owner location creation, rename/archive and access-history review.
- Mobile-first renter record view with clear access and empty states; staff get a labeled mobile workspace menu and desktop sidebar.
- No financial posting, balances, agreements, occupancy assignments or exports. Pending reports and uncleared checks must never reduce settled balances.

Renters have a single records destination and account sign-out; the app does not invent payment or dashboard tabs. Staff use workspace navigation to reach implemented directory, location, invitation, owner-access and security sections. Layouts stack on phones and add a staff sidebar on wide screens. See the [design system](docs/DESIGN_SYSTEM.md) for responsive behavior, contrast measurements and accessibility limitations.

Old fictional payment/design screens remain in `src/prototype/PrototypeApp.tsx`, separate from the runtime entry point and production bundle. Payment preview/domain tests are preserved. There is no runtime role selector.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:supabase
npm.cmd run test:browser
```

Browser tests use installed Microsoft Edge headlessly and real local Supabase with UUID-scoped disposable fixtures. No resets, real emails or production connections. They start the local frontend when needed; the invitation function must already be served. Traces/videos are disabled to avoid recording passwords and MFA secrets. See [status](docs/STATUS.md) for actual results and limitations.

## Project records

Read [AGENTS.md](AGENTS.md), [status](docs/STATUS.md), [roadmap](docs/ROADMAP.md), [decisions](docs/DECISIONS.md), [data model](docs/DATA_MODEL.md), [security](docs/SECURITY.md), [onboarding/recovery](docs/ONBOARDING.md), [business decisions by feature](docs/BUSINESS_RULES.md), and the [original brief](docs/USER_REQUIREMENTS.txt).

Git history is backed up to the user-authorized private repository [RentByBob](https://github.com/1nsincere/RentByBob), with `main` tracking `origin/main`. No hosted Supabase project, real account, deployment or purchase is authorized. Production readiness, independent review, backup/restore and full accessibility verification remain separate gates.
