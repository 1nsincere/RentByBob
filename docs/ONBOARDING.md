# Onboarding and recovery — local access milestone

## Using the app on a phone

Renters have one main destination: the real rental records authorized for their account. They see whether access is pending, ready or disabled, a useful empty state when no records are shared, and sign-out in the compact account header. There are no payment, balance or placeholder tabs. Staff use the labeled **Workspace navigation** menu to reach implemented directory, location, invitation and owner-review sections; on larger screens the same links appear in a sidebar. Navigation stays in document flow and does not cover content while scrolling or when the software keyboard opens. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for responsive behavior and verification limits.

## Identity and assignment contract

Invitation delivery and permission assignment are separate. Supabase Auth invitation acceptance verifies control of the invited email; it does not prove real-world identity or add an application membership. Staff actions require AAL2, enforced in PostgreSQL, not just the interface.

An owner first confirms the intended person/email and tenant relationship outside the app. In the app the owner chooses an authorized property, looks up the exact email, reviews the matched account/status and tenant/contact or staff target, gives a reason, and retypes the email. `assign_account_access` locks the property and matched Auth row, checks current owner authority/MFA, verified email-to-UUID equality and tenant/property scope, then calls the existing atomic audited mutation. Invalid roles and last-owner revocation are rejected. The legacy ID-only mutation RPCs no longer have browser execute permission. A changed/mistyped email or another account's UUID cannot pass this check. The owner remains responsible for selecting the correct real-world tenant; the system cannot infer that relationship from an email alone.

**Each tenant-access assignment requires an owner.** James may create tenant directory records and invite renters, but cannot assign contacts, grant staff roles, approve his own access or reset owner security. No new clerk authority was inferred.

| State | Meaning |
| --- | --- |
| Invitation pending | Owner exact-email lookup finds an unconfirmed identity, or dispatch just succeeded; this does not prove inbox delivery |
| Invitation accepted but access not assigned | Verified/signed-in account with no active or previous property/contact assignment |
| Account ready | At least one active assignment; staff must also complete MFA before data/actions |
| Access disabled | Previous assignment exists but none is active; archived tenant contacts also confer no access |

States are scoped to the selected property for owner lookup and to all the caller's assignments for self-routing. Disabling one membership does not remove other valid memberships. RLS checks each request. The UI refreshes access every 10 seconds, on focus and on demand; a previously rendered record can remain visible until that check. Failed checks hide records. This does not promise retroactive erasure of information already viewed or copied.

## Email and paper limitations

The implemented path requires an actual email identity in operation; local tests exclusively use `.invalid` fixtures. It does **not** implement username-only access or solve no-email onboarding. Staff never retrieve permanent passwords; recipients choose and reset their own through Supabase Auth.

A provider-supported paper-delivery design is possible using trusted Admin `generateLink({type: 'invite', email})` for a real, individually verified email identity, delivering the resulting short-lived bearer link/QR in a sealed handover rather than sending email. This is **documented, not implemented** as a paper-issuance feature. It still requires a legitimate email identity and a workable recovery channel. Handing over a printed link does not establish control of a mailbox and must not be called independent mailbox verification. If pursued, require owner-controlled identity verification and explicit paper-delivery provenance before assignment, minimum exposure to issuer/printer, no link logging or retained copies, expiry/replay tests, lost-slip invalidation and a reviewed reissue process. Never print a permanent password. A stolen/copied slip can be used by its holder before the intended recipient.

For users without usable email, evaluate Supabase phone-number/password authentication with a verified personal number and an SMS recovery/provisioning design. It requires explicit policy/provider setup and is not enabled here. Username-only accounts, invented email aliases and custom password storage are not acceptable substitutions. Users with neither usable email nor phone need an agreed assisted/manual process before account issuance.

Sources: [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [password-based Auth](https://supabase.com/docs/guides/auth/passwords).

## MFA and recovery

Staff enroll a TOTP authenticator and verify a current code. On later sign-in they challenge an enrolled factor. An AAL1 session can learn its own routing state but cannot read staff property data or mutate staff records. Enrollment secrets are shown only during enrollment, never in application logs or audit. Phones cannot open the computer's loopback website, but can scan its on-screen QR with an authenticator app.

Working self-service recovery: enroll a second authenticator on a separately controlled device while already signed in with MFA. If the first is lost, choose the backup on the challenge screen. Tests exercise this path. Supabase does not provide recovery codes for this flow. Password reset via email restores password access, **not MFA assurance**; tests confirm owner recovery still requires a factor and clerk credentials cannot invoke owner factor administration.

If all factors are lost, stop self-service recovery. The infrastructure owner must verify identity outside the app and use separately secured provider administrative recovery under a recorded, reviewed procedure. No clerk endpoint, hidden owner, bypass password or automatic factor deletion is implemented. A production all-factors-lost procedure and recovery drill remain required before launch; the UI gives an honest contact-owner instruction. Do not weaken database MFA checks for demonstrations.

Sources: [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [JavaScript MFA limitations](https://supabase.com/docs/reference/javascript/auth-mfa).

## Invitation states and reconciliation

Each invitation form creates one UUID for the user intent and keeps it for retries. The same UUID and exact property, account type and normalized `.invalid` address return the saved attempt; a changed payload is rejected. A repeated request never repeats the external provider call after dispatch has been claimed. Owners with MFA can open **Invitation attempts and reconciliation** to review masked recipients and statuses, refresh evidence, and append a reason/evidence-source note. A review preserves the state. It does not send, assign access or prove delivery.

| Status | Plain-language meaning and next step |
| --- | --- |
| Prepared | The request and audit were saved; the provider call has not started. An owner may explicitly continue this exact saved request. |
| Dispatching | The provider may or may not have processed it. Do not retry; check local Auth/Mailpit or provider evidence and leave unresolved if inconclusive. |
| Issued | Supabase Auth confirmed issuance, not delivery to an inbox. Await the recipient or review delivery evidence; no reissue is available. |
| Rejected | Auth returned a definitive allowlisted rejection. Review its HTTP status; reissue remains disabled pending policy approval. |
| Uncertain | The provider outcome could not be established. Do not resend; an owner may record what evidence was checked without changing status. |
| Accepted | The exact Auth user ID returned for the attempt has the same invited email confirmed after the request baseline. This confirms that Auth account's email, not real-world identity or app access. |

PostgreSQL and Auth cannot commit atomically. The process may die after a `dispatching` claim but before calling Auth; or Auth may succeed while outcome/audit persistence or the response fails. Such attempts remain unresolved rather than being converted to success/failure, and they are never retried automatically. A stable-ID retry reads stored state. Access revocation is checked at claim but can race before the external call; an issued invite still creates no property membership. Every tenant/staff assignment remains a separate owner/MFA action.

Safe resend/reissue is deliberately unavailable for the same property/recipient after any recorded attempt, including a definitive rejection. The owner must decide what evidence, wait period, expiry proof and approval could permit a reissue and how long recipient data is retained. Addresses are held in a restricted private table for attempt matching and this no-reissue guard, masked in the owner list and excluded from general audit reasons. They are retained indefinitely until a retention policy is approved.

Tests apply the actual migration and exercise SQL rollback, authorization, idempotency, concurrency and owner review. Workflow fault tests simulate provider timeout, provider success followed by audit failure and lost responses; they do not call real Auth. The local Supabase suite exercises actual local Auth/MFA, concurrent same-ID HTTP calls, Mailpit delivery, recipient acceptance, persisted audit and fixture cleanup. It does not simulate an Auth timeout or test hosted-provider behavior. Invitation lifetime is configured to one hour; elapsed-time expiry and safe reissue remain unverified. This is not a full accessibility or production audit.
