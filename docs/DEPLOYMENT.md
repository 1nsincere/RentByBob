# Deployment runbook (staging first) — prepared 27 Oct 2026, not executed

Nothing here has been run. Each step that creates accounts, spends money, or touches real data needs the owner's explicit go-ahead. Use fictional data until the owner approves real records.

## 0. Before anything
1. `npm ci`, then `npm run verify:release` (unit tests, build, artifact check), `npm run test:offline`, `npm run test:csp`, and `npm.cmd run test:cash:supabase` (disposable stack). All must pass.
2. Back up the preserved local database (`scripts/backup-local.ps1`) if anything will be copied from it. Do not copy real tenant data into staging.

## 1. Staging Supabase project (owner creates it)
1. Create a separate project (region close to the Philippines, e.g. Singapore). Record its URL in `stagingUrl` in `src/access/connection.ts` through a reviewed commit (null = the app refuses to connect).
2. Link and push migrations: `npx.cmd supabase link --project-ref <ref>` then `npx.cmd supabase db push` (review the list first; it must end at the newest file in `supabase/migrations`).
3. Auth settings (dashboard → Authentication, or `npx.cmd supabase config push`): signups off, anonymous off, minimum password 12, secure password change on, TOTP MFA on, email max frequency 60 s, refresh-token rotation on, session timebox 12 h and inactivity 2 h (Pro), leaked-password protection on (Pro).
4. URL configuration: Site URL = the staging Pages address; redirect URLs = that address and `<address>/auth/callback` only.
5. SMTP: configure a real sender (owner account) so invitations and password resets reach people; the default Supabase sender is rate-limited and not for production.
6. Bootstrap the owner account with the documented script for hosted projects; set up TOTP; assign the cash verifier only after confirming the clerk's identity (see ROADMAP "Waiting on owner decisions").

## 2. Cloudflare Pages (owner authorizes)
1. Connect the private GitHub repository; production branch `main`; build command `npm ci && npm run build:staging` for staging (`npm run build` for production); output `dist`; Node 24.
2. Environment variables: only the public Supabase URL and publishable (anon) key, plus `VITE_SUPABASE_TARGET`. Never a service-role key.
3. `public/_headers` and `public/_redirects` deploy automatically. If the Supabase project uses a custom domain, add it to `connect-src` in `_headers` and rerun `npm run test:csp`.
4. After the first deploy: open `/` and `/rooms`, sign in as the owner with MFA, check the browser console for CSP reports, and confirm the response headers (`curl -I`).

## 3. Before real use (production)
- Separate production Supabase project and Pages project; repeat steps 1–2 with production values. Supabase Pro is recommended (no pausing, backups, session limits, leaked-password check).
- Owner decisions still open: returned-check communication, rent-change rule, CAPTCHA (Cloudflare Turnstile) for sign-in and `/rooms`, inquiry retention (90 days chosen), QR code for the final `/rooms` address.
- Run an accessibility session with real staff (older adults, Bisaya readers) and an independent security review.
- Schedule backups (OPERATIONS.md) and rehearse a restore from the hosted backup.

## Rollback
Pages: redeploy the previous successful build from the Pages dashboard. Database: migrations are forward-only; a fix is a new reviewed migration. Restore from backup only by the documented restore rehearsal procedure, into a new project first.
