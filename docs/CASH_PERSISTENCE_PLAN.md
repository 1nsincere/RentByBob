# Saved cash workflow: implementation contract

18 Oct 2026. Design only; no migration applied. The current admin screen is a temporary preview.

## Confirmed rules

- Rent is per room, not per named occupant.
- Monthly due dates use the original move-in day, clamped to the month's last day. The original anchor never changes after a short month or a late payment.
- Confirmed payments allocate oldest unpaid rent first, in due-date order with a stable tie-breaker.
- Bob records cash amount and actual receipt date. James verifies cash. Recording alone never settles a charge.
- James's cash-verification permission is explicit and independent of the owner role. Display names and a client-supplied collector name cannot establish authorization.
- Use Philippine business dates, UTC event timestamps, and exact monetary values.

## First persisted slice

Start with agreements and manually requested monthly rent charges, then cash reports and confirmation. Do not copy the preview's temporary state to localStorage or treat browser persistence as an accounting ledger.

Proposed entities:

| Entity | Required invariant |
| --- | --- |
| Room rental agreement | Links property, unit and responsible tenant; original move-in anchor and effective terms retained. Occupant roster is separate from payment responsibility. |
| Rent charge | Unique agreement and canonical rental month; room and original amount/date snapshot; no silent historical mutation. |
| Cash report | Actual receipt date, amount, collector, reporter identity, creation timestamp and stable request ID; pending until verified. |
| Cash settlement | One settlement per report; verifier identity, verification time and evidence reference; report remains traceable. |
| Allocation | Exact amount against a charge; sum equals settlement; never exceeds current unpaid amount. |
| Staff capability | Property-scoped cash verifier permission assigned to the approved James account, not every clerk or owner. |

## Trusted operations

1. Create agreement: require authorized staff with MFA, lock unit, validate property references and prevent conflicting current room agreements. Do not infer liability from a named co-occupant. Resolve shared-room responsibility before enabling this operation.
2. Create monthly charge: lock agreement, use effective terms and original anchor, enforce unique period and request identity. Retries return the existing result; changed payload under the same key fails.
3. Record cash: require authorized staff with MFA, validate date/amount, retain collector separately from authenticated reporter, record audit atomically. Similar amount/date produces a warning, not automatic deduplication of legitimate receipts.
4. Confirm cash: require the explicit verifier capability plus MFA. Lock report and agreement in a documented consistent order. Re-read unpaid charges, allocate oldest first, then commit settlement, allocations, report transition and audit together. A retried confirmation returns the original result. Concurrent confirmations cannot over-allocate.
5. Read statement: scope to authorized property/tenant; balances derive solely from charges and confirmed allocations. Show pending records separately.

Every exposed table requires RLS and restricted grants. Browser clients cannot insert settlements or update charge balances directly. Security-definer functions require pinned search paths and narrow execution grants.

## Verification required before enabling saving

- Anonymous, cross-property and tenant mutation attempts denied.
- Bob/ordinary staff cannot settle; explicit verifier with MFA can; revoked permission takes effect with an old session.
- Pending entries and uncleared checks never affect balances.
- Cash received in October can pay September without changing either date.
- Leap years, day 29/30/31, short months and Philippine day boundaries.
- Exact centavos; multi-period partial allocation; zero/negative/overpayment rejection.
- Duplicate request retry, changed-payload retry, concurrent confirmation, rollback on audit failure, concurrent charge generation.
- Preserve historical terms and balances after future rent changes.

## Boundaries still open

Opening balances and their supporting records, shared-room agreement responsibility, grace/late fees, advance/excess credit, rent amendments/proration, corrections/reversals and check-clearance authority need their own decisions. The first slice can reject excess payment and omit those unsupported operations explicitly. James's actual authorized account must be identified privately through existing account-management tools, not a hard-coded email or display name.

Local testing must preserve existing accounts/data and use disposable fictional fixtures. Hosted migration is a separate, reviewed milestone after the local slice and direct API/concurrency checks pass. No production or real data authorized.
