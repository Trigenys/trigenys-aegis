# Architecture

```text
HTTP transport
     |
     v
application/domain core
     |
     +--> ports/interfaces
              |
              +--> persistence adapter
              +--> external provider adapter
              +--> queue/worker adapter
```

The initial blueprint ships only a health endpoint. Product-specific capabilities should preserve these boundaries rather than coupling the domain to a framework, database or cloud runtime.

## Defaults

- runtime: Node.js 24
- language: TypeScript
- HTTP: native Node server for a dependency-light bootstrap
- persistence: PostgreSQL with row-level security ([ADR 0001](adr/0001-postgresql-row-level-security.md)); in-memory without configuration
- hosting: intentionally unspecified
- secrets: runtime/environment-specific, never committed

## Evolution

Adopt a framework, persistence layer or hosting target only when requirements justify it. Public contracts should be versioned before external consumers depend on them.

## Cockpit P0: ingestion core

```text
POST /v1/sources/{adapter}/events  (Bearer token, scope events:ingest)
     |  token -> SHA-256 -> stored credential -> Principal { clientId, siteId, scopes }
     v
SourceAdapter.normalize(payload) -> NormalizedEventDraft[]   (no tenant fields)
     |  validateDraft (schema 1.0, unknown keys rejected, whole batch or nothing)
     v
core stamps clientId / siteId / receivedAt from the Principal,
id = sha256(clientId, source, sourceEventId)  -> replay is a no-op
     v
EventStore.append(clientId, event)   (every port method is client-scoped)

GET /v1/events, GET /v1/events/{id}  (scope events:read, own client only;
another client's event answers 404)
```

- `src/domain`: client/site/credential model, normalized event schema `1.0`.
- `src/ports`: `TenancyStore`, `EventStore`; no unscoped query exists.
- `src/adapters/sources`: `SourceAdapter` contract, registry, `WazuhAdapter` (rule level 0-3 info, 4-6 low, 7-11 medium, 12-14 high, 15 critical; `full_log` and `data` dropped).
- `src/adapters/persistence/memory.ts`: volatile in-memory stores (tests, local trials).
- `src/adapters/persistence/postgres.ts`: durable stores on PostgreSQL with row-level security (see Durable storage).
- A client's identity is never read from the payload; tokens are 256-bit random values stored as SHA-256 hashes only.

### Operator API

MSP staff manage clients with a separate operator token (`Authorization: Bearer aegis_op_...`).
Client credentials are rejected there, and operator tokens are rejected on client routes.

| Route | Effect |
| --- | --- |
| `GET/POST /v1/operator/clients` | list / create a client (`{ "name" }`, unique, case-insensitive: 409 on retry) |
| `GET /v1/operator/clients/{id}` | read a client |
| `GET/POST /v1/operator/clients/{id}/sites` | list / create a site (`{ "name" }`, unique per client) |
| `GET/POST /v1/operator/clients/{id}/credentials` | list metadata / issue a token (`{ "scopes": [...], "siteId"? }`); the token is returned once, `cache-control: no-store` |
| `DELETE /v1/operator/clients/{id}/credentials/{credentialId}` | revoke (204, idempotent) |

Configuration: `npm run operator:token` prints a new token and its SHA-256; only the hash goes in
`AEGIS_OPERATOR_TOKEN_SHA256` (comma-separated for several operators). Without it, the operator API answers 503.

Not yet covered: operator audit log, per-operator identity and roles, rate limiting, timestamp windows.

### Cockpit web

Server-rendered HTML with no JavaScript, served by the same process as the API (`src/http/`).

| Route | Effect |
| --- | --- |
| `GET /cockpit/login`, `POST /cockpit/login` | form; a valid operator token opens a session cookie (303 to `/cockpit`), a wrong one answers 401 with no cookie |
| `POST /cockpit/logout` | destroys the session server-side and clears the cookie |
| `GET /cockpit` | overview of every client, weakest first |
| `GET /cockpit/clients/{id}` | client view: score and its explanation, estate, alerts, tickets |
| `GET /cockpit/clients/{id}/report?period=YYYY-MM` | printable monthly report |
| `GET /cockpit/assets/cockpit.css` | stylesheet (public, light/dark, print) |

Without a session every page answers 303 to the login. Session, cookie and CSRF design: [ADR 0002](adr/0002-operator-browser-session.md).
JSON equivalents for tooling: `GET /v1/operator/overview`, `GET /v1/operator/clients/{id}/dashboard`,
`GET /v1/operator/clients/{id}/reports/monthly?period=YYYY-MM` (bearer token; 422 `INVALID_PERIOD` on a bad or future month).

Local demo: `npm run demo` starts an in-memory instance loaded with three fictional SMEs and prints a throwaway
operator token. `npm run demo:seed` does the same against `AEGIS_DATABASE_URL` and is refused without
`AEGIS_ALLOW_DEMO_SEED=1` or when a non-demo client exists. `npm run report:close-month -- --period 2026-10`
freezes each client's score for that month (idempotent).

### Health score

`100 - sum of capped penalties`, floored at 0, computed by a pure function (`src/domain/health.ts`) from declarative
rules (`src/domain/health-rules.ts`). Bands: healthy from 80, watch from 50, critical below. Default ruleset
`2026.11-default`:

| Rule | Points per item | Cap |
| --- | --- | --- |
| `backup.stale` (no successful backup within 48 h, or never; machines needing none excluded) | 8 | 20 |
| `assets.offline` (not seen within 30 min) | 5 | 15 |
| `antivirus.unhealthy` (antivirus or firewall not ok, once per machine) | 10 | 25 |
| `updates.pending` (critical updates only) | 4 | 15 |
| `network.down` (box, VPN or internet link down; unknown is not down) | 10 | 20 |
| `alerts.recent` (high or critical alerts in the last 24 h) | 2 | 10 |

Each penalty carries a readable label, detail and the affected machines, so the UI answers "why this number".
`AEGIS_HEALTH_RULES_PATH` points to a JSON file that replaces the defaults; an invalid file stops startup with an
actionable message. A closed month stores a snapshot with its `rulesetVersion`, so a later rule change never
rewrites history.

## Durable storage

`AEGIS_DATABASE_URL` (for example `postgres://aegis:***@db:5432/aegis`) selects PostgreSQL; without it the
stores are in memory and the startup log says `"persistence":"memory"`. Decision and alternatives:
[ADR 0001](adr/0001-postgresql-row-level-security.md).

- Driver: `pg` (node-postgres), pinned exactly. Pool size 10.
- Role: a dedicated login role that owns the database, **not** a superuser and **without** `BYPASSRLS`.
  The service refuses to start otherwise, because such a role would silently ignore row-level security.
- Schema: append-only migrations in `aegis_schema_migrations`, applied under a transaction-scoped advisory
  lock, so concurrent starts migrate once. Reopening an up-to-date database is a no-op; a database
  migrated by a newer build is refused at startup.
- Isolation, twice: every query is scoped by `client_id` in code, and PostgreSQL enforces it again with
  `FORCE ROW LEVEL SECURITY` on `clients`, `sites`, `credentials` and `events`. Each statement runs in a
  transaction that sets `app.client_id` (or `app.scope`) locally; policies only expose the rows of that
  client. Two narrow scopes exist: `operator` may list clients, `auth` may look up a credential by hash;
  neither can read events or write. No context means no rows.
- Limit: the context is a session setting, so RLS protects against application bugs (a forgotten
  `WHERE`), not against SQL injection running as the same role. All SQL is parameterized.
- Integrity: events keyed by `(client_id, id)` and inserted with `ON CONFLICT DO NOTHING`; client and site
  names unique on a normalized key (case, accents, spacing); a composite foreign key refuses a credential
  bound to another client's site; only SHA-256 token hashes are stored.
- Backups: `pg_dump --format=custom` with the service role; restore into an empty database owned by the
  same kind of role.
- Contract: `test/store-contract.test.ts` runs the same suite against every adapter, plus restart, RLS,
  role-refusal, schema-version and concurrent-migration tests on PostgreSQL. Those need
  `AEGIS_TEST_DATABASE_URL` (an admin URL; each test creates and drops its own database and role) and are
  skipped without it:

  ```bash
  docker run -d --name aegis-pg-test -e POSTGRES_PASSWORD=admin -p 55432:5432 postgres:17-alpine
  AEGIS_TEST_DATABASE_URL=postgres://postgres:admin@localhost:55432/postgres npm run check
  ```
