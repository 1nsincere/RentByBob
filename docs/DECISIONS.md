# Decisions and open questions
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
