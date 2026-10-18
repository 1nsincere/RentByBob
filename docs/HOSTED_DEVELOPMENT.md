# Hosted development — 17 Oct 2026

Authorized project: `vyzexanzktskvjxjpphp`. Fictional data only. Hosted Supabase backend, loopback Vite frontend; no public website or production deployment. The user reports the previously exposed secret revoked. No privileged key was requested, saved in frontend configuration or committed.

## Start and switch

Run `npm.cmd run dev:hosted`, then open http://127.0.0.1:5173. Stop any other Vite process on that port first. The separate ignored `.env.hosted-development.local` JSON contains only `url` and the project's public publishable `key`. The launcher validates the exact project/key format and verifies disabled signup/anonymous sign-in before starting. Failed/unavailable settings checks fail closed. Production builds cannot connect to this hosted project through the client guard.

To return to the preserved local database, stop hosted Vite and run `npm.cmd run dev:local`. Local startup, bootstrap, API tests and fixtures still target loopback Supabase only. Browser global setup rejects hosted Vite before test credentials are submitted. Stop hosted Vite before `test:browser`.

## Auth and email

The public settings endpoint confirms `disable_signup=true`, `external.anonymous_users=false`, Email enabled. It does not expose redirect/TOTP configuration. Dashboard settings requested: Site URL `http://127.0.0.1:5173`, exact redirect `http://127.0.0.1:5173/auth/callback`, TOTP enrollment and verification enabled. Local `supabase/config.toml` does not update hosted Auth. MCP has no Auth-configuration/user-administration tool, and no dashboard browser was connected.

The user created confirmed `owner@example.invalid` through Dashboard Create user with a private password. `scripts/bootstrap-hosted-development.sql` assigned the first fictional property/owner membership atomically with locking, audit and identical-retry protection. No local Auth records were imported and no password or MFA bypass was used. User reported reaching the staff security check, then confirmed settings saved. MCP subsequently confirmed one verified owner TOTP factor and one AAL2 owner session, proving hosted sign-in/MFA succeeded. Redirect values are user-confirmed, not independently read; hosted email/redirect acceptance remains untested.

Hosted recovery email requests are blocked in the UI. Deployed `invite-account` blocks hosted dispatch before preparing/claiming an attempt; local Mailpit remains functional. JWT verification stays enabled; `withSupabase({auth:'user'})` authenticates callers; SQL checks role/MFA; exact loopback CORS is retained. Platform-provided privileged credentials stay server-side and were not retrieved. Direct provider email endpoints are not disabled by a UI restriction: this is not a server-wide email kill switch. Do not send real emails or run Mailpit acceptance tests against hosted Auth.

## Migration history

Initial MCP inspection: no public tables, migration history, Edge Functions, Auth users or storage buckets. All eleven reviewed files were applied unchanged, in order. MCP assigned hosted timestamps and retained source versions in names:

| Source version | Hosted version |
| --- | --- |
| 202610160001 | 20261017063053 |
| 202610160002 | 20261017063054 |
| 202610160003 | 20261017063056 |
| 202610160004 | 20261017063057 |
| 202610160005 | 20261017063058 |
| 202610160006 | 20261017063059 |
| 202610160007 | 20261017063101 |
| 202610160008 | 20261017063102 |
| 202610160009 | 20261017063103 |
| 202610160010 | 20261017063105 |
| 202610160011 | 20261017063106 |

Do not run remote CLI `db push`: its source versions differ from MCP history and it could replay DDL. Reconcile history explicitly before future CLI migration work. Local files/history were not rewritten; no hosted CLI link was created. Roll frontend selection back with `dev:local`; retain hosted data and use reviewed forward schema corrections.

## Evidence and limitations

- 34 isolated tests pass; strict TypeScript/Vite build passes.
- 22 local Auth/API/MFA/invitation checks and both local browser scenarios pass. Scoped fixture cleanup completed; no local reset. A subsequent browser guard check correctly refused hosted Vite before submitting credentials.
- `npm.cmd run check:hosted` passes: signup/anonymous sign-in disabled; anonymous reads denied on all seven public application tables; anonymous RPC/function denied; actual Edge runtime returns 204 for permitted CORS preflight and 403 for an unapproved origin. No email/login calls in this script.
- All nine public/private application tables have RLS, no anonymous SELECT, and no authenticated direct writes. Definer functions have empty search paths.
- Hosted `scripts/verify-hosted-rls.sql` passes: AAL1 staff read/write denied; AAL2 owner read/RPC allowed; identical tenant retry creates one record/audit; direct writes denied. Fictional writes rolled back. Administrator-supplied claims are **not** proof of hosted JWT/MFA or concurrency behavior.
- Headless Edge rendered the sign-in screen with hosted Vite configuration. Hosted authenticated browser automation and email/redirect acceptance are not claimed.
- Security advisor: 14 authenticated SECURITY DEFINER warnings (intentional guarded RPCs) and two private RLS-without-policy informational notices (intentional deny-direct-access tables). Do not weaken RLS/grants to clear notices. [Definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [private-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Performance advisor: eight unindexed foreign keys and six unused indexes on the new database. Review with representative load separately; do not remove access indexes based on empty-project statistics. [Foreign-key advisory](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused-index advisory](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Next: review the fictional directory in the hosted-connected app. Owner TOTP/sign-in is complete and settings user-confirmed; no further connection setup action is currently required. Hosted authenticated isolation/revocation/concurrency, email/expiry/recovery, backup/restore and independent security review remain separate gates. No real data, purchases, financial feature or production deployment.

Provider references: [Auth settings API](https://supabase.com/docs/reference/api/v1-update-auth-service-config), [Edge authentication](https://supabase.com/docs/guides/functions/auth).
