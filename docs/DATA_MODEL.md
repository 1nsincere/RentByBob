# Data model — access foundation implemented, financial model proposed
Migration `202610160001_access_foundation.sql` implements properties, staff_memberships, tenants, tenant_contacts and audit_events. Each exposed table has RLS, explicit SELECT grants and no browser mutation grants. Composite property/tenant foreign keys prevent cross-property contact links. Revocation is read from current database rows; role metadata in Auth is not authoritative. Owner/clerk access requires aal2. Tenant access derives from active contact membership and an unarchived tenant.

Narrow SQL functions implement tenant creation, owner-managed contact/staff access and identity archival with atomic audits. Property row locks serialize access changes; tenant creation uses a caller-generated UUID for retry protection. This is not financial idempotency infrastructure. Detailed contracts and testing limitations: `supabase/README.md`.

Properties, buildings/sections and units are implemented. Optional beds and agreements remain proposed. Tenants (person/business) are separate from auth users. Authorized contacts connect users to tenant records through revocable memberships. Agreements link tenants and occupancy targets with effective dates and preserved terms. Occupancy conflict constraints depend on confirmed unit/bed arrangement.

Separate records: charges (immutable historical amount/period/deadline), tenant payment reports (claims), instruments (cash/check receipt), settlement events, allocations, adjustments/reversals, collection handovers/reconciliation, issued acknowledgments and approval evidence. No financial migration until affected rules are confirmed. Audit events exist for access, tenant creation/archival and location creation.

Reports: pending -> needs clarification / verified / cancelled. Permit withdrawal under confirmed policy; allow matching to an existing instrument without creating a duplicate. Cash receipt verification may settle atomically. Checks: received -> deposited/awaiting clearance -> cleared or returned/cancelled, with explicit allowed transitions. No timer-based clearance. A returned check is not settled. Reversing cleared funds creates a retained compensating event, never deletes history.

Use PostgreSQL numeric(14,2) with positive amounts/constraints; decimal strings at API boundaries and exact decimal or integer-minor-unit application arithmetic. Serialize dates as YYYY-MM-DD, real event timestamps as timestamptz; Asia/Manila for reports. Historical charges independent of future agreement changes.

Transactional functions must authorize, lock affected rows, deduplicate idempotency keys, recheck state, validate allocation totals and remaining charges, create settlement/allocation/audit/acknowledgment records together. Unique agreement-period charge keys prevent duplicate generation. Pending intentions must be revalidated at settlement; excess policy unresolved. Settled balance derives from charges, authorized adjustments, settled allocations and reversals only.

Acknowledgment snapshots stay stable with unique references and linked later reversals/status. HTML first; not tax receipts. Allocation, receipt date, settlement date and rental period stay distinct. Archive units/agreements rather than deleting history; move-out releases occupancy on its effective date without erasing debt.

Migration `202610160004` separates caller invitation-request audit from service-only outcome completion; it adds no tables. Outcome transitions lock the request audit row. Local bootstrap uses a separate administrative transaction, not a persistent database function. Financial model remains proposed.


Migration 202610160005 adds self-only access routing, owner exact-email identity lookup and verified email/UUID-bound assignment. It removes browser grants from ID-only role/contact functions while preserving those functions internally. Migration 202610160006 adds buildings and units with staff-scoped RLS, composite property/building foreign keys and owner/MFA-only audited, retry-safe creation. Locations have no occupancy, capacity, rent or financial policy. Rename/archive is the next migration slice.
