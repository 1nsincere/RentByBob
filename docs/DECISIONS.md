# Decisions and open questions
## Current access and repository decisions - 16 Oct 2026
- User authorized private GitHub repository 1nsincere/RentByBob; main is connected and prior commits preserved.
- Local access UI and basic directory creation are implemented. See STATUS.md for current evidence; earlier next-step notes below are historical.
- Every contact or staff assignment requires owner MFA and verified email/UUID binding. James's renter invitation authority does not include assignment authority.
- Keep email-based onboarding for this slice. Paper invitation links are a documented future delivery option, not username-only access. No fake operational emails or custom password storage.
- Backup authenticator recovery is implemented. Email password reset does not bypass MFA; all-factors-lost operator recovery requires a separate reviewed procedure.
- Next milestone is directory maintenance and audit review. Financial dependencies are mapped in BUSINESS_RULES.md; independent work may proceed.

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

Latest update on 16 Oct 2026: user chose email addresses instead. This supersedes the earlier no-email preference and proposed phone/password direction. Use Supabase email/password and the original brief's staff-initiated expiring invitation flow: the owner may invite renters or staff; James may invite renters only. The authenticated `invite-account` Edge Function implements that authorization and invitation dispatch. The recipient sets their own password; staff never see or retrieve permanent passwords. Public signup remains disabled; invitation alone must not grant staff roles or tenant access. Tests use only fictional `.invalid` accounts and local Mailpit; no real invitations/accounts were created.

Use real individual email addresses, including for business contacts. Verified link acceptance, recipient password setup and sign-in, one-time link/replay handling, invitation authority and local Mailpit delivery have been tested against local Supabase. Invitation lifetime is configured to one hour, but elapsed expiry has not been tested. Generic login/recovery responses, frontend setup and recovery, first-owner bootstrap, safe resend, access assignment after invitation, production redirect/email configuration and recovery operations remain open. Staff MFA was verified for trusted local calls; enrollment/recovery UX remains untested. No hosted email or purchase is authorized. Paper temporary passwords and voucher-only login are not the selected version-one path.
Approval evidence, authorized collectors, contact access after move-out, retention and issuance policy remain open.

## Review clarification — 16 Oct 2026

The current review reconciles the progress tracker and setup instructions; it does not start the next feature milestone or change financial policy. First-owner bootstrap remains the next planned development slice. Invitation audit provenance and partial-failure cleanup are open hardening work recorded in SECURITY.md and must be resolved before operational use.

## Official references checked
- https://vite.dev/guide/
- https://tailwindcss.com/docs/installation/using-vite
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/managing-user-data

## Local access hardening and bootstrap - 16 Oct 2026

Continue under the user's development authorization. Bootstrap is local-only, accepts an existing confirmed fictional .invalid Auth UUID, and creates the first fictional property/owner atomically. Identical retries are no-ops; any different initialized state is refused. No real owner account is created. Invitation outcome audit is service-only; uncertain dispatch still requires review before retrying. Next feature slice: frontend sign-in and invitation callback/password setup, followed by recovery/MFA and owner access-assignment UX.
