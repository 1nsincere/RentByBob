# Operations and handover plan

## Current development environments ? 17 Oct 2026

Fictional hosted Supabase development is authorized/configured alongside preserved local stack. See [hosted startup, verification and next steps](HOSTED_DEVELOPMENT.md). Stop hosted Vite before local browser tests. Do not run remote CLI migrations without reconciling documented MCP/source version mapping. No public frontend or production deployment. Older local-only statements below are historical.

Development currently local and fake-data only. The user-authorized repository https://github.com/1nsincere/RentByBob is private; main tracks origin/main. No hosted Supabase or deployment service has been configured. Owner must control private GitHub, Cloudflare Pages, Supabase, billing, MFA recovery and any domain; developer receives limited access. Runtime must not depend on an AI subscription.

Deployment preparation (not executed): private GitHub -> Cloudflare Pages, build `npm ci && npm run build`, output `dist`, supported Node 24. Configure only public Supabase URL/publishable key in frontend. Separate development and production projects. Recheck official provider deployment/security documentation, pricing, limits, CSP/connect-src and redirect URLs before setup. Disable public signup via supported provider configuration and enforce trusted provisioning. No paid recommendation yet.

Release checklist: review migrations and grants, backup, tested recovery plan, staged migration, security/accounting/accessibility suite, owner acceptance, explicit production authorization. Record commit and migration identifiers and a versioned release record. Roll frontend back to previous known-good build; database changes require reviewed forward correction or tested restore, not blind destructive down-migration.

Recovery plan to complete before launch: agree RPO/RTO, retention, access and independent encrypted copies. Use provider-supported database backups plus required auth/storage/config recovery coverage; verify what each backup includes. Restore into a separate environment, reconcile charges/settlements/allocations and permissions, verify files/config/access and record duration/evidence. Excel exports are not backups. Never test restoration against live production. Schedule recovery drills and document owner-held access.

Handover must include startup/deploy/rollback commands, migration history, owner account inventory (no secrets), recovery ownership, approved billing rules, test results and known limitations. Proposed policies here are not evidence of completed restoration or operational readiness.

Local development bootstrap: see supabase/README.md. The administrative script creates only the first fictional owner/property for an existing confirmed .invalid Auth user. It never connects to a hosted database. No persistent owner account was retained from verification; test fixtures were removed. Production owner provisioning and recovery still require a separately reviewed procedure.

Local startup: start Docker Desktop, local Supabase, the invite-account function and npm.cmd run dev:local as described in README.md. Use npm.cmd run setup:local only for an uninitialized fictional database; never reset existing data to make bootstrap tests pass. See ONBOARDING.md for backup-factor recovery and unresolved all-factors-lost operations.

## Invitation operations and test cleanup

The current local schema includes migration `202610160009`; apply only with `npx.cmd supabase db push --local`. Keep `npx.cmd supabase functions serve invite-account` running for the frontend and API suite. An owner with MFA can inspect the latest 100 attempts and manually append an evidence/source review. A `dispatching` or `uncertain` attempt must not be retried. A `prepared` attempt is safe to continue only through its explicit same-attempt action. Provider issuance is not inbox delivery, and an accepted invitation is not application access.

There is no resend/reissue path for a previously attempted property/recipient. The unique-recipient guard depends on retaining the private attempt row indefinitely at present. Do not manually delete such rows or use a different identifier to try again; obtain the owner-approved reissue and retention policy first. A revocation can race after the transactional dispatch claim but before Auth is called; any issued invite still requires separate owner assignment.

The local API test registers intended recipient emails and attempt UUIDs before invoking Auth. Its cleanup queries only those UUIDs, this run's property, the created Auth users and matching Mailpit messages; it does not reset or delete existing fictional accounts, properties, MFA factors or directory records. PGlite/workflow fault tests simulate provider and audit failures; actual local Supabase Auth tests exercise successful dispatch, concurrent HTTP retries, acceptance and cleanup, not an injected Auth timeout. See STATUS.md for current counts and limitations.
