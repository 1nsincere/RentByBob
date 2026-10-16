# Business decisions mapped to affected features

Account access and directories can progress independently. Exact-centavo parsing, Philippine dates, non-saving payment preview, tenant isolation, auth, audited access and directory creation are implemented foundations. The entire financial area is not categorically blocked: pending-claim validation/status design, duplicate/idempotency infrastructure, non-settling report UX and acknowledgment layout can be developed without deciding charge amounts, provided no settled balance or unconfirmed policy is introduced.

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

Next policy-independent milestone: directory maintenance (owner rename/archive of locations, retained history and account/contact audit review), with direct API and browser tests. Collect the decisions above in parallel, then implement only the corresponding confirmed financial slices. Pending claims and uncleared checks must never reduce settled balances.
