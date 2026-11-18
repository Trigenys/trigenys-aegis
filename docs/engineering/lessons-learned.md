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

## 2026-11-18 — Cockpit login refused by a real browser while tests passed

- Context and impact: the operator cockpit login form returned 403 in Chrome. Automated tests and curl
  checks were green; found during manual browser verification before the pull request. No release affected.
- Root cause: pages were served with `Referrer-Policy: no-referrer`, which makes Chrome send `Origin: null`
  on same-origin form posts; the same-origin check only compared `Origin` with `Host` and refused "null".
  Tests built request headers by hand and never reproduced what a browser actually sends.
- Classification: test fidelity gap, near miss.
- Resolution: `Sec-Fetch-Site` is authoritative when present (only `same-origin` passes); `Origin: null`
  is accepted only together with `Sec-Fetch-Site: same-origin`; pages now use `Referrer-Policy: same-origin`.
- Prevention: `test/cockpit-web-routes.test.ts` replays the exact browser header set (`Origin: null` +
  `Sec-Fetch-Site`) and the cross-site variants; any browser-facing flow is checked once in a real browser
  before its pull request is opened.
- Lesson: security checks on browser requests must be tested with the headers browsers really send, not
  with headers chosen by the test author.
