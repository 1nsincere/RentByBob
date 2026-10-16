# Rental records

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
- No financial posting, balances, agreements, occupancy assignments or exports. Pending reports and uncleared checks must never reduce settled balances.

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
