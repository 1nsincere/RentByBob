## Billing decisions - 18 Oct 2026

User specifies per-room rent, monthly due dates based on move-in date, and oldest unpaid rent first. User prefers James only to verify cash; Bob records amount and actual payment date as pending evidence. Treat James-only cash verification as the working direction (user said "maybe"), with explicit permission review before enabling persisted settlement. Owner role must not implicitly grant cash verification. Pending Bob entries never reduce settled balances. Check clearance/reversals are separate and unconfirmed.

Still unresolved: move-ins on 29-31 in shorter months, grace/late-fee policy, advance/excess credit, initial balances, receipt verification evidence, and agreement responsibility for shared rooms. Do not invent these rules. Existing manual-allocation preview has not yet been changed to this agreed workflow.

# Business decisions mapped to affected features

Account access and directories can progress independently. Exact-centavo parsing, Philippine dates, non-saving payment preview, tenant isolation, auth, audited access and directory creation are implemented foundations. The entire financial area is not categorically blocked: pending-claim validation/status design, duplicate/idempotency infrastructure, non-settling report UX and acknowledgment layout can be developed without deciding charge amounts, provided no settled balance or unconfirmed policy is introduced.

Invitation reliability is a separate access/security slice, not a financial rule: stable request identifiers and no-duplicate dispatch are implemented, but no safe reissue policy is inferred. The unanswered owner decisions (evidence, waiting period, approvals, expiry and recipient retention) are tracked in DECISIONS.md and do not authorize any charge, settlement or balance behavior.

| Outstanding decision | Feature that must wait for it |
| --- | --- |
| Per-person, per-bed or per-unit charging; occupancy arrangement | Agreement pricing and occupancy/capacity constraints; directory labels do not depend on it |
| Calendar versus anniversary billing, charge schedule | Recurring charge generation and period keys |
| Due date and grace period; treatment of reported-but-unverified money | Overdue status and reminder wording/timing |
| Partial-payment allocation, advance/excess credit | Settlement allocation and available-credit balances |
| Move-in/out proration and effective occupancy release | Final charges/credits and complete move-out workflow |
| Utilities, deposits, discounts, penalties | Those charge categories, refunds and balance adjustments |
| Opening balances and historical evidence | Import, initial official balances and pilot reconciliation |
| Authorized collectors and evidence needed to verify receipt | Production report recipient choices and cash/check receipt verification |
| James's clearance/reversal approval, including whether every clearance needs Sir Bob's approval | Check clearance and compensating reversals; do not grant unconditional clerk authority |
| Postdated/returned checks and timely-payment policy | Check transitions beyond receipt, returned-check treatment and any fees |
| Commercial documentation requirements | Commercial acknowledgment/export wording; no claim of tax-receipt status |
| Contact access after move-out; retention | Complete move-out access lifecycle and later personal-data deletion |
| No-email onboarding and identity/recovery evidence | Phone or paper issuance workflow; current email-only limitation is explicit |

Independent work delivered after access: authorized property/building/section/unit directory reads, owner location creation, tenant search and staff tenant creation. Directory creation has RLS/MFA checks, atomic audit and retry IDs. It does not assign occupancy, beds, rent, dates or fees.

Completed policy-independent milestone: owner rename/archive of locations with retained history and account/contact audit review, verified through local SQL, Supabase API and browser tests. Continue collecting the decisions above in parallel, then implement only the corresponding confirmed financial slices. Pending claims and uncleared checks must never reduce settled balances.
