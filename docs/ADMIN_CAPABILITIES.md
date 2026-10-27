# Admin and staff capabilities

Updated 27 Oct 2026. This is an implementation inventory, not a production-readiness claim. Evidence for each item is in [STATUS.md](STATUS.md); open policy questions are in [ROADMAP.md](ROADMAP.md) ("Waiting on owner decisions"). The local database must have every migration up to `202610270012` applied (`npx.cmd supabase db push --local`).

## Available in the authenticated workspace

| Area | What staff can do | Current boundary |
| --- | --- | --- |
| Sign-in and security | Password plus authenticator (MFA) for staff; backup authenticator; "Remember this device for 30 days" after a real code; list and remove remembered devices; password recovery and change; idle sign-out after 30 minutes (2-minute warning). Renters sign in without MFA. | All-factors-lost recovery needs an owner-run procedure and drill. |
| Dashboard | Philippine clock and month calendar with rent due days; current-month collection figures (confirmed cash, waiting for confirmation, rent still due, 2+ months owing); **late rent list** with days late, pending cash shown beside it, a copyable SMS/Messenger reminder (EN/CEB) and "Open account"; **due in the next 7 days**; alerts for new public inquiries and renter payment reports. | Reminders are copied and sent by staff; the app sends no SMS or email. No late fees or grace periods exist. |
| Tenants | One-step Add tenant (name, type, room, move-in date, monthly rent); directory with search and filters, renter-login status, current room; change room while renting; record move-out (owner); remove after move-out (owner; history kept). | No household/occupant list (by design: only the responsible renter is stored). Rent amount changes are not available yet. |
| Property map | Site plan and building front views drawn from entered rooms; occupied rooms show the renter and monthly rent; doors open room details; locate a tenant's room. | Geometry is a sketch, not a measured plan. |
| Payments | Record cash handed to Bob or James as pending (pre-filled with the agreed rent; overpayment becomes advance credit); designated MFA verifier confirms; oldest month paid first; permanent acknowledgment; reversal with reason (owner); monthly rent added by hand or automatically on the 1st (owner switch); check register (owner-controlled deposit, clearance, return); collection handover log; account statement. | Pending cash and uncleared checks never reduce balances. A verifier must be assigned (by the clerk's confirmed email) before cash can be confirmed. |
| Renter payment reports | Renters report a payment they made in person; staff see it in What needs attention and on the account; "Record this cash" pre-fills the entry and links it; "Not received" with a reason the renter sees. | A report never changes a balance. No photo upload or online payment. |
| Reports | Paid rent report by receipt month with outstanding rent by rent month and 2+ month arrears; saves as a formatted PDF. | No spreadsheet export (removed at the owner's request). |
| Public rooms | Public landing page and `/rooms` list only rooms staff choose to show, or every vacant room when automatic listing is on; occupied rooms are hidden automatically; commercial spaces (stores, Yamaha) are never public; inquiry inbox. | Not deployed. CAPTCHA, contact details and hosting need owner decisions. |
| Access | Owner assigns renter or staff access by exact email with audit; access history; invitations. | Clerks cannot grant access. No self-service renter linking. |

## Still needed before routine operational use

1. Apply the pending migrations locally (see above), then enter every current tenant, room and rent before turning on automatic rent or automatic listing.
2. Confirm James's exact account, then assign the cash verifier.
3. Run one month in parallel with the paper record and reconcile totals.
4. Separate staging project, independent security/accounting review, backup schedule with an off-machine copy, and owner acceptance. Production deployment is not authorized.

## Security and evidence boundaries

Financial writes use PostgreSQL functions with current authorization, staff MFA (or a remembered device), row/property locking, exact numeric amounts, idempotency, audit, and tested concurrency/rollback behavior. Financial tables have RLS and no direct browser writes. The live test suite runs on its own disposable local Supabase stack with fictional data.
