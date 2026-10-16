# Database migrations

`migrations/202610160001_access_foundation.sql` is the first ordered Supabase migration. It creates property, staff, tenant/contact and audit records with constraints, explicit grants, RLS, and transactional mutation functions. It does not create credentials or a public signup path.

## Run the isolated SQL checks

```powershell
npm.cmd ci
npm.cmd test
```

Tests create a fresh in-memory PostgreSQL engine using the development-only PGlite package, install a minimal `auth.users`, `auth.uid()` and `auth.jwt()` test contract, and apply every migration in filename order. PostgreSQL executes the actual RLS, grants, foreign keys and functions. Fixtures are fictional and discarded. The engine is only a test dependency, not another application database or backend. It is never imported into the frontend.

This does **not** run Supabase Auth, PostgREST, JWT signature verification or parallel database connections. Full Supabase HTTP isolation, MFA, concurrency and recovery tests are still required. The test harness supplies trusted claims just as an authenticated gateway would; real clients must never be allowed SQL access to set their claims.

## Full local Supabase environment

The Supabase CLI is a project-local development dependency. `supabase/config.toml` was generated in the existing project and reviewed: the API exposes only `public` and `graphql_public` (not `private`), new public objects are not automatically exposed, public signup and seed loading are disabled, and auth redirects are restricted to the local Vite origin. `supabase/.temp/` and `supabase/.branches/` are ignored.

The CLI configuration is not an application connection and does not create a hosted project. WSL 2 and Docker Desktop were installed and the local Docker engine verified during setup. Migrations `202610160001` through `202610160008` are applied to the local database. Running processes do not persist reliably across handoffs. Startup downloads the service images the first time. To start the stack:

```powershell
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
npx.cmd supabase --version
npx.cmd supabase start
```

In a separate terminal in this workspace, start the invitation handler if it is not already served, and keep that terminal open:

```powershell
npx.cmd supabase functions serve invite-account
```

Then run `npm.cmd run test:supabase` from the original terminal. Stop the function server with Ctrl+C when finished. Do not disable JWT verification to bypass a failed test. See [security review findings](../docs/SECURITY.md#review-findings--16-oct-2026) for outstanding audit and failure-cleanup limitations.

For a completely fresh local database, review the migrations and then apply them only to the disposable local instance with `npx.cmd supabase db push --local`. Never link to a hosted project or apply migrations remotely. A local reset destroys local data.

Run `npm.cmd run test:supabase` to verify the local migrations, anonymous denial, disabled public signup, real Auth sign-in and TOTP verification, tenant isolation through PostgREST, revocation with an existing JWT, and denial of staff authority based on forged user metadata. It also exercises invitation authority, audit privacy, the local Auth email delivery to Mailpit, recipient password setup/sign-in, confirmation that accepting an invitation grants no app membership, and one-time link replay rejection. The latest standard run passed 19 checks; the bootstrap-enabled run passed 20. The test creates fictional `.invalid` accounts and records, generates throwaway passwords in memory, and removes its fixtures. It reads local keys from the CLI process without displaying or saving them. Run only against the local stack; the script checks the API URL and refuses a non-local API.

Avoid copying `supabase status` output into chat, logs, or screenshots; the CLI includes local development keys in its output.

Public signup is disabled. The trusted `invite-account` Edge Function is implemented and locally tested; actual messages are delivered only to the local Mailpit catcher using fictional `.invalid` addresses. Do not use this test to send real email. One-time use/replay and provider expiry using backdated disposable fixture timestamps are verified. A real one-hour elapsed expiry test remains open.

The first property and owner membership require a one-time trusted bootstrap after an Auth user is provisioned. Supply the Auth UUID through a local administrative session; never add a browser bootstrap endpoint, password or privileged key to this repository. The local-only bootstrap below is implemented; application users cannot create their own owner membership. Later owners can use the narrow staff-access function for existing Auth users; creation of Auth accounts still requires a trusted server operation. Invitation does not grant role or tenant access; authorized owner assignment remains a separate operation.

## Function contract

| Function | Authority | Behavior |
| --- | --- | --- |
| `create_tenant(property_id, tenant_id, display_name, kind)` | Active owner/clerk with MFA | UUID supplied once per create intent; same ID/payload retry returns the record, conflicting payload rejected; audit atomic |
| `set_tenant_contact(tenant_id, user_id, enabled, reason)` | Internal only; browser execute revoked by 005 | Grants/revokes an existing Auth user's access to one active tenant; records user and tenant in audit |
| `set_staff_access(property_id, user_id, role, reason)` | Internal only; browser execute revoked by 005 | Sets owner/clerk or revokes with null role; protects last active owner |
| `my_access_state()` | Authenticated caller | Self-only routing state, no other identity or property details |
| `find_account_for_assignment(property, email)` | Owner with MFA | Exact-email account lookup for reviewed assignment |
| `assign_account_access(property, user, expected_email, kind, tenant, role, enabled, reason)` | Owner with MFA | Verified identity binding, property scope and atomic audited mutation |
| `create_property_location(property, id, label, building?)` | Owner with MFA | Building/unit creation with retry UUID and atomic audit |
| `manage_property_location(property, location, action, label, reason)` | Owner with MFA | Rename or archive a building/unit; building archival also archives child units atomically |
| `read_access_audit(property)` | Owner with MFA | Up to 100 recent access, tenant-archive and invitation-dispatch events with minimum necessary identity details; Auth email type compatibility is fixed in migration 008 |
| `archive_tenant(tenant_id, reason)` | Active owner with MFA | Archives identity record, revokes contacts atomically and retains record/audit; repeat is a no-op |

Definer functions use an empty search path and qualified relations. Staff operations check current membership and MFA; property mutations serialize through the property row. Self-routing is available before MFA and returns only minimal caller state. Anonymous execution is revoked. The two private policy helpers accept resource IDs but always derive the requesting user from Auth.

Tenant archival here is **not a completed move-out workflow**. Before agreements/payments are added, extend it to enforce the agreed move-out lifecycle and preserve occupancy/debt rules. Location archival retains records; archived buildings archive their units, archived parents reject new units, and archived names can be reused by new active records. No financial deletion or settlement operation is included. Membership history is retained through revocation timestamps and append-only application audit; only database administrators can bypass these controls.

Never rewrite a migration once applied to a shared environment. This migration is applied to the disposable local database and is also exercised in PGlite tests. Follow-up changes must become new versioned migrations after initial application.

References checked 16 Oct 2026: [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [functions](https://supabase.com/docs/guides/database/functions), [PGlite](https://pglite.dev/docs/).

## Local first-owner bootstrap

Use an existing confirmed fictional .invalid Auth user in the disposable local stack. The property table must be empty on the first run. Do not reset existing data to satisfy this condition. Run from the workspace, substituting UUIDs (never passwords or keys):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-local-owner.ps1 -OwnerId <fictional-auth-uuid> -PropertyId <new-property-uuid>
```

This creates a fixed-name fictional property, owner membership and audit record in one transaction. Preserve the same UUIDs for an identical retry. A different initialized state is refused, including a revoked owner. No browser RPC is created; MFA remains required for staff operations. The script validates loopback status and always uses db query --local; it prints no connection credentials.

For a disposable stack with no property records, run the full integration suite with bootstrap coverage:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-supabase-api.ps1 -TestBootstrap
```

The suite creates its own fictional Auth user, runs the actual bootstrap twice, exercises MFA/invitations and removes its fixtures. Ordinary npm.cmd run test:supabase does not require an empty property table. Isolated bootstrap tests also cover invalid identity, caller denial, audit rollback, conflicting retry and revoked-owner rejection. Parallel-session bootstrap behavior is not yet tested.

## Local UI and browser checks

See ../README.md for npm.cmd run setup:local (optional fresh fictional owner) and npm.cmd run dev:local. Run npm.cmd run test:browser with the stack and invitation function available; installed Microsoft Edge is used headlessly. Fixtures are scoped and cleaned up without resetting the database. Credentials are held in process memory; traces/videos are disabled. STATUS.md records results and accessibility limits.

Troubleshooting interactive setup: run `npm.cmd run setup:local -- -CheckOnly` for a read-only prerequisite check. Errors identify the stage without printing credentials. If failure occurs during Auth creation or bootstrap, review existing state before retrying; never reset the database to pass setup.
