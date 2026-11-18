# ADR 0001 — PostgreSQL with row-level security for durable storage

- Status: accepted
- Date: 2026-11-18

## Context

Aegis stores, for several MSP clients in one deployment, their sites, hashed ingestion credentials and
normalized security events. The main risk is cross-client exposure: one client reading or writing another
client's data. The core already scopes every store call by `clientId` behind the ports in
`src/ports/stores.ts`; durable storage must keep that contract and add a second barrier.

A first iteration used SQLite (`node:sqlite`) without a recorded decision. It had no database-level
isolation, no concurrent writers across instances and no standard online backup tooling for a hosted
service. It was replaced before any release.

## Options

| Option | Isolation in the database | Ops | Verdict |
|---|---|---|---|
| SQLite file | none (code only) | trivial, single process | rejected: no second barrier, single node |
| PostgreSQL, one schema per client | strong | migrations × clients, pool per schema | rejected for now: heavy for a pilot |
| PostgreSQL, shared tables + RLS | policies on `client_id`, `FORCE ROW LEVEL SECURITY` | one schema, one migration path | **chosen** |

Driver: `pg` (node-postgres) adopted over `postgres` (postgres.js): wider use, mature pool, plain
parameterized queries; pinned exactly.

## Decision

- Shared tables keyed by `client_id`, RLS enabled and forced on every tenant table.
- Each statement runs in a transaction that sets `app.client_id` or a narrow `app.scope` (`operator`:
  list clients; `auth`: look up a credential by hash) with `set_config(..., true)`.
- The service refuses a superuser or `BYPASSRLS` role, and a schema migrated by a newer build.
- Migrations are append-only, versioned in `aegis_schema_migrations`, serialized by an advisory lock.
- The in-memory adapter stays for tests and trials; both adapters pass the same contract suite.

## Consequences

- PostgreSQL becomes a runtime requirement for durable deployments (a container on the VPS or a managed
  instance); without `AEGIS_DATABASE_URL` the service still runs, with volatile data.
- RLS guards against application bugs, not against SQL injection under the same role; parameterized SQL
  remains mandatory.
- Integration tests need a PostgreSQL instance (`AEGIS_TEST_DATABASE_URL`); CI provides one as a service.
- Moving a large client to its own database or schema later stays possible behind the same ports.
