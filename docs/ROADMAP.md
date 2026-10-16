# Roadmap — 16 Oct 2026
## Progress tracker

Use [STATUS.md](STATUS.md) for verification evidence and [DECISIONS.md](DECISIONS.md) for unresolved rules. Dates below are planning targets, not completion claims.

| Milestone | Current state | Remaining gate |
| --- | --- | --- |
| Local prototype and payment preview | Implemented with fictional data; non-saving | User readability review and full accessibility audit (selected browser checks pass) |
| Database access foundation | Eight migrations implemented; local SQL/API/browser checks | Parallel-connection tests and independent review |
| Local invitations | Dispatch, password setup/sign-in and link replay tested through APIs | Dispatch reconciliation, failure/retry, resend and real elapsed expiry (backdated expiry tested) |
| First-owner bootstrap | Implemented as a local administrative script | Parallel-session verification remains; no browser endpoint |
| Frontend authentication and onboarding | Local sign-in, callback, owner assignment, MFA and backup-factor/password recovery implemented | No-email onboarding, all-factors-lost recovery drill, independent review |
| Basic property and tenant directories | Authorized reads, tenant search/create, owner building/unit create/rename/archive, and owner access-audit review | Broader accessibility review; agreement/occupancy lifecycle remains out of scope |
| Financial workflows | Non-saving preview/exact-money foundation; policy-independent work may continue | BUSINESS_RULES.md maps policy-dependent features; no invented posting rules |
| Reports, recovery and pilot | Not implemented | Export verification, restore rehearsal, opening balances and owner acceptance |

Access work has advanced ahead of the original calendar because the latest direction prioritizes database/access dependencies while financial rules remain unresolved. This does not complete the cash-workflow milestone. Review findings in [SECURITY.md](SECURITY.md) must be addressed before invitations are relied on operationally.

## Original planning windows
There are 46 days to the 1 Dec pilot target. For a solo beginner the full brief is ambitious; policy decisions, onboarding and independent review are schedule risks.

1. 16–22 Oct: local setup, fake-data prototypes, readability review, landlord questions.
2. 23 Oct–5 Nov, conditional on decisions: schema and permission review, supported auth, one complete cash report -> verification -> settlement -> allocation -> acknowledgment workflow with accounting/RLS/concurrency tests.
3. 6–19 Nov: checks, approvals, reconciliation, move-out and minimal owner reports; test receipts separately from settlement.
4. 20–30 Nov: direct API security tests, accessibility review, representative Excel totals/formula injection/visual inspection, separate-environment restore, opening balances and pilot rehearsal.
5. From 1 Dec: parallel pilot alongside paper records for a full payment cycle; reconcile discrepancies and obtain James/owner acceptance. Release before 1 Jan only if that cycle and all gates finish. Otherwise move launch, not safeguards.

Defer email reminders, complex PDFs and nonessential polish. No production deployment until explicitly authorized. Full security, accounting and restore checks are launch gates, not optional scope cuts.
