# Engineering lessons learned

This file is the default RAIDER failure-memory location for this service.

Record meaningful failures and near misses with:

- context and impact;
- root cause;
- resolution;
- recurrence-prevention guardrail;
- generalized lesson when applicable.

Before risky work that resembles a known incident, search this file first.

## 2026-11-18 — Storage engine chosen without a recorded decision

- Context and impact: durable storage was first shipped on SQLite for a multi-client security service.
  The choice was rejected in review; one commit of work was redone before any release. No data affected.
- Root cause: a structuring choice (database engine) was made from the immediate constraint ("pilot on a
  small VPS, zero dependency") without weighing the product's primary risk (cross-client isolation) and
  without an ADR.
- Classification: design decision process, near miss.
- Resolution: PostgreSQL with forced row-level security; decision and alternatives in
  `docs/adr/0001-postgresql-row-level-security.md`.
- Prevention: storage, tenancy, authentication or hosting choices require an ADR in `docs/adr/` in the same
  pull request; tenant isolation is enforced in the database and covered by `test/store-contract.test.ts`
  (RLS test detects a weakened policy).
- Lesson: pick infrastructure from the product's main risk, not from the cheapest pilot setup, and write
  the alternatives down before coding.
