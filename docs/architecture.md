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
- `src/adapters/persistence/memory.ts`: volatile in-memory stores until a durable adapter is chosen.
- A client's identity is never read from the payload; tokens are 256-bit random values stored as SHA-256 hashes only.

Not yet covered: operator API to create clients/sites/tokens, durable persistence, rate limiting, timestamp windows.
