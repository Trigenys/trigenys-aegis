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
- persistence: intentionally unspecified
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
- `src/adapters/persistence/sqlite.ts`: durable stores on Node's built-in SQLite (see Durable storage).
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

## Durable storage

`AEGIS_DATABASE_PATH` points to a SQLite file (for example `/var/lib/aegis/aegis.db`); without it the
stores are in memory and the startup log says `"persistence":"memory"`.

- Engine: `node:sqlite`, built into Node 24, so no runtime dependency and no database server. Chosen over
  PostgreSQL (`pg`) for the pilot: one file fits a few clients on a small VPS. A PostgreSQL adapter can
  later implement the same ports (`src/ports/stores.ts`) without touching the core.
- Schema: append-only migrations tracked with `PRAGMA user_version`; reopening an up-to-date file is a
  no-op, an older file is upgraded in a transaction, a file from a newer build is refused at startup.
- Isolation in the schema itself: every query is scoped by `client_id`, events are keyed by
  `(client_id, id)`, and a composite foreign key refuses a credential bound to another client's site.
- Idempotence: client and site names are unique on a normalized key (case, accents, spacing), events are
  inserted with `ON CONFLICT DO NOTHING`, revocation keeps the first timestamp.
- Only token hashes are stored. Protect the file and its `-wal`/`-shm` siblings like a secret store
  (owner-only permissions, encrypted backups); `sqlite3 aegis.db ".backup copy.db"` gives a consistent
  online copy.
- Contract: `test/store-contract.test.ts` runs the same suite against every adapter, plus restart and
  schema-version tests for SQLite.
