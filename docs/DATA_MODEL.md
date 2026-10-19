## Cash foundation migration applied locally - 19 Oct 2026

Applied only to the preserved local Supabase database after live verification in a separate disposable Supabase stack; not applied to hosted or production. Adds `cash_verifiers`, `rental_agreements` (one per unit), `rent_charges` (agreement/month unique), `cash_records` (pending or confirmed with acknowledgment snapshot), and `cash_allocations`. All exposed tables use staff MFA/RLS and SELECT-only client grants. Narrow functions serialize mutations using a property row lock. Amounts are `numeric(14,2)` and fractional centavos are rejected; read RPC converts money to text. Snapshot preserves names/locations/dates/allocations/balance at issuance. Local tables currently contain no verifier, agreement, charge or cash record; see [STATUS](STATUS.md) for verification and next steps.

The staff account statement is a read-only projection of the authorized workspace snapshot: rent charges, confirmed cash with its acknowledgment allocation snapshot, and current remaining amounts per charge. Pending cash stays separate and is not a settled payment. This adds no table, RPC, grant or mutation.

The browser validates the returned snapshot's structure and exact decimal strings before use, including agreement totals against charge remaining values and confirmed cash against acknowledgment details. Archived unit IDs may be absent from the active-location list while their historical agreements remain visible; the client must not treat that expected archival case as corrupt financial data.

## Guided cash preview update - 18 Oct 2026

Pending Report stores tenant, cash amount, collector and actual date separately from settled per-charge Receipt allocations. Confirmation recalculates oldest-first allocation. Terms keep the original move-in date and example room rent. These are temporary objects only; transactionality, account permission and persistence are not claimed.

## 18 Oct 2026 ? temporary payment model

In-memory Charge stores ID, tenant ID, room ID, period description, due business date and bigint centavos; Receipt stores ID, target charge, actual date, bigint centavos, explicit status and optional reference. Remaining amount deducts only Settled cash examples. Room balances aggregate charge balances across tenant accounts. These are isolated preview objects, not PostgreSQL entities or an approved accounting schema. No persistence or automatic schedule.

# Data model — access foundation and first cash slice implemented

## Connected preview records - 17 Oct 2026

Temporary PreviewTenant now includes people: string[] (named occupants). Room people counts derive from active records referencing stable room IDs; business display names are not humans. New preview records use stable request IDs, are revalidated at confirmation, and update a single in-memory store used by directory/form/map. This is not an auth/contact/lease schema. No new PostgreSQL migration. Backend persistence still requires reviewed household/occupant identity, agreement relationships, capacity/overlap rules and authorization.

## Preview-only spatial model - 17 Oct 2026

PropertyPreview.tsx holds temporary building footprints, floor labels, nullable room counts and room IDs/labels/types, plus fictional tenant-to-room examples. This does not extend PostgreSQL buildings/units or implement agreements/occupancy. No migration. Before persistence, review floor/unit hierarchy, whole-space versus room rentals, shared gym areas, multiple occupants, occupancy conflicts, historical assignments and authorized transactional edits. Layout geometry does not establish rent or capacity.

## Hosted copy ? 17 Oct 2026

Same eleven reviewed migration contents now run in fictional hosted development alongside local. No new schema/financial rule. One user-created confirmed fictional Auth identity received fictional property/owner membership through atomic audited administrative bootstrap. [Hosted mapping and verification](HOSTED_DEVELOPMENT.md).

Migration `202610160001_access_foundation.sql` implements properties, staff_memberships, tenants, tenant_contacts and audit_events. Each exposed table has RLS, explicit SELECT grants and no browser mutation grants. Composite property/tenant foreign keys prevent cross-property contact links. Revocation is read from current database rows; role metadata in Auth is not authoritative. Owner/clerk access requires aal2. Tenant access derives from active contact membership and an unarchived tenant.

Narrow SQL functions implement tenant creation, owner-managed contact/staff access and identity archival with atomic audits. Property row locks serialize access changes; tenant creation uses a caller-generated UUID for retry protection. This is not financial idempotency infrastructure. Detailed contracts and testing limitations: `supabase/README.md`.

Properties, buildings/sections and units are implemented. Optional beds and agreements remain proposed. Tenants (person/business) are separate from auth users. Authorized contacts connect users to tenant records through revocable memberships. Agreements link tenants and occupancy targets with effective dates and preserved terms. Occupancy conflict constraints depend on confirmed unit/bed arrangement.

Separate records: charges (immutable historical amount/period/deadline), tenant payment reports (claims), instruments (cash/check receipt), settlement events, allocations, adjustments/reversals, collection handovers/reconciliation, issued acknowledgments and approval evidence. No financial migration until affected rules are confirmed. Audit events exist for access, tenant creation/archival and location creation.

Reports: pending -> needs clarification / verified / cancelled. Permit withdrawal under confirmed policy; allow matching to an existing instrument without creating a duplicate. Cash receipt verification may settle atomically. Checks: received -> deposited/awaiting clearance -> cleared or returned/cancelled, with explicit allowed transitions. No timer-based clearance. A returned check is not settled. Reversing cleared funds creates a retained compensating event, never deletes history.

Use PostgreSQL numeric(14,2) with positive amounts/constraints; decimal strings at API boundaries and exact decimal or integer-minor-unit application arithmetic. Serialize dates as YYYY-MM-DD, real event timestamps as timestamptz; Asia/Manila for reports. Historical charges independent of future agreement changes.

Transactional functions must authorize, lock affected rows, deduplicate idempotency keys, recheck state, validate allocation totals and remaining charges, create settlement/allocation/audit/acknowledgment records together. Unique agreement-period charge keys prevent duplicate generation. Pending intentions must be revalidated at settlement; excess policy unresolved. Settled balance derives from charges, authorized adjustments, settled allocations and reversals only.

Acknowledgment snapshots stay stable with unique references and linked later reversals/status. HTML first; not tax receipts. Allocation, receipt date, settlement date and rental period stay distinct. Archive units/agreements rather than deleting history; move-out releases occupancy on its effective date without erasing debt.

Migration `202610160004` separates caller invitation-request audit from service-only outcome completion; it adds no tables. Outcome transitions lock the request audit row. Local bootstrap uses a separate administrative transaction, not a persistent database function. Financial model remains proposed.


Migration 202610160005 adds self-only access routing, owner exact-email identity lookup and verified email/UUID-bound assignment. It removes browser grants from ID-only role/contact functions while preserving those functions internally. Migration 202610160006 adds buildings and units with staff-scoped RLS, composite property/building foreign keys and owner/MFA-only audited, retry-safe creation.

Migration 202610160007 adds `archived_at` to buildings and units. Active names are unique within a property/building, while archived names may be reused without removing prior records. Owner/MFA-only transactional maintenance renames or archives records; archiving a building archives its units atomically. Archived locations remain readable to authorized staff but cannot be renamed/reactivated, and no new unit may be created under an archived building. Migration 202610160008 casts Supabase Auth email fields to the declared text output type for `read_access_audit(property_id)`, which exposes the 100 most recent access-relevant events to the owner with MFA, including action, event time, actor/target email where applicable, tenant name and reason. This does not implement occupancy, agreements, move-out, retention policy or financial history.

## Invitation dispatch model — migrations 202610160009 through 202610160011

`private.invitation_attempts` records one stable client-generated attempt UUID, property, requesting staff user, account type, normalized recipient email, state and provider evidence. Recipient addresses are retained only here, under private-schema RLS and revoked direct grants; the trusted Edge Function can read the address only through a service-role-only function when an owner/staff-authorized `prepared` attempt is explicitly continued. Owner list results mask both the local part and domain. No recipient address is included in invitation audit reasons.

`private.invitation_attempts.dispatch_actor_id`, added in migration 010, records the currently authorized staff member who actually claimed the provider dispatch; outcome audit events attribute to that dispatcher, not automatically to the original requester. Migration 011 attributes automatic acceptance audit to the current owner who reconciles it, not the original requester. `private.invitation_attempt_reviews` is append-only by the exposed API: it records attempt, current owner actor, short reason and evidence source. Owner/MFA list/review functions validate property scope. Review leaves the attempt state and original provider evidence unchanged.

State transitions:

- `prepared` is committed with the request audit before any provider call.
- Current property membership, invitation type and AAL2 are rechecked while claiming `prepared` to `dispatching`; a dispatch-start audit is in that transaction.
- Trusted service completion changes `dispatching` to exactly one of `issued`, `rejected` or `uncertain` with its audit in one transaction.
- `issued` may become `accepted` only on owner/MFA reconciliation when the returned Auth user ID still has the exact recipient email confirmed after the request baseline. This proves linked email confirmation, not inbox delivery or real-world identity.
- A repeat with the same UUID and payload returns the stored state. Reuse with changed payload is rejected. The unique `(property_id, recipient_email)` index prevents creating another intent for the same recipient, including after `rejected` or `issued`; it is intentionally stricter than a temporary idempotency window.

The external Auth call is not transactional with PostgreSQL. `dispatching` means the provider might or might not have been called. Auth success followed by database/audit failure leaves this state unresolved; a lost client response is recovered through the same attempt ID. No state indicates confirmed inbox delivery. Only HTTP 400/401/403/404/422 are currently treated as definitive provider rejections; other errors remain uncertain. Revocation can race after the claim commits and before the provider call, but the resulting invitation alone still grants no app membership.

The recipient uniqueness guard and no-reissue policy currently require indefinite recipient retention; actual legal/operational retention and safe-reissue rules remain owner decisions. Do not delete attempts or alter the index until those rules preserve retry safety. No financial entities or posting behavior were added.
