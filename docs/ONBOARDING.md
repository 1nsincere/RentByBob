# Onboarding and recovery — local access milestone

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

## Invitation failures and local verification limits

The interface attempts a send once. A failure/uncertain outcome disables further sends in that form and asks for owner review. Refreshing or another client can still start another request: backend cross-request dispatch idempotency/reconciliation is not solved. An audit `sent` outcome records the trusted dispatch response, not delivery or acceptance. Do not automatically resend.

Browser tests cover valid setup, invalid/missing callbacks, replay and provider expiry after backdating only a disposable Auth fixture's invitation timestamps. That exercises expiry enforcement without waiting one real hour; elapsed wall-clock expiry and safe reissue remain open. No production email/origin/recovery behavior is claimed.
