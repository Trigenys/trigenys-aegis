# ADR 0003 — Inventory pulled from Tactical RMM

- Status: accepted
- Date: 2026-11-18

## Context

The cockpit shows each client's machines (assets): presence, system, user, pending updates. Pilot clients are
managed with Tactical RMM (TRMM), which already knows those machines. Aegis needs that inventory without
re-typing it and without becoming a second RMM.

## Options

| Option | Verdict |
|---|---|
| Push: TRMM scripts or webhooks post inventory to an Aegis endpoint | rejected: one script per agent to maintain, a new ingestion credential per client, no full listing to detect machines that disappeared |
| Pull: a one-shot CLI reads the TRMM REST API and reconciles the estate store | **chosen** |
| Maintained third-party TRMM client library | none found; the sync needs three `GET` calls, so they are built in-house (reuse-first: Build) |

## Decision

- `npm run sync:inventory` reads `GET /clients/`, `GET /agents/?client=<id>` and, for Windows agents,
  `GET /winupdate/<agent_id>/`, authenticated with the `X-API-KEY` header. It writes through
  `EstateStore.upsertAsset`, the same path as the demo seed, so PostgreSQL row-level security applies per client.
- The Aegis client of every record comes from the configuration file only, never from the TRMM payload. A
  configured client is refused as a whole, before any write, when its TRMM name differs from the expected one,
  when an agent reports another client name, or when a mapped Aegis site belongs to another client.
  TRMM clients absent from the configuration are listed in the report and never read.
- Field ownership: TRMM owns identity, kind, hostname, system, hardware, user, last contact and update counts.
  Antivirus, firewall and backup fields are not reported by TRMM: they are kept from the stored asset
  (`unknown`, `null` and a kind-based default on first sync). `observedAt` is the agent's own last contact, so
  replaying an unchanged inventory writes nothing.
- Asset ids are `sourceRecordId(client, "tacticalrmm", agent_id)`, the same derivation as event ids.
- An agent in a TRMM site that is not mapped is stored without site and reported as a warning.
- Machines no longer reported are listed as `missing`; nothing is ever deleted.
- The API key is read from an environment variable named in the configuration; a key field in the file is
  refused. It never appears in logs, errors or reports.
- Scheduling (cron on the host) is outside this change.

## Security and licensing constraints

- The TRMM API key must be read-only and restricted to the pilot clients (a dedicated TRMM user whose role only
  lets it view those clients' agents). Aegis never calls a TRMM endpoint that changes state.
- Licence: Aegis only calls the API of a TRMM instance the operator runs; it does not include, modify or
  redistribute TRMM code. Whether a commercial cockpit fed by TRMM is acceptable under the TRMM licence is a grey
  area: obtain written confirmation from AmidaWare before Aegis is sold. Until then, the cockpit never exposes a
  TRMM action and never shows the TRMM brand to clients; TRMM stays an internal tool of the operator.

## Consequences

- One more secret to operate (rotation is a TRMM-side key change plus an environment update).
- Inventory freshness equals the sync interval; presence is still derived from `lastSeenAt` and the clock.
- Another RMM can be added as a separate adapter writing assets with its own `source`, without changing the core.
