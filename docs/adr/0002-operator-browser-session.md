# ADR 0002 — Operator browser session for the web cockpit

- Status: accepted
- Date: 2026-11-18

## Context

The cockpit web UI (`/cockpit`) is used by MSP staff in a browser. The JSON operator API authenticates each
request with a long-lived bearer token (`Authorization: Bearer aegis_op_...`). A browser cannot hold that token
safely: pasting it in every request is impractical, and storing it in script-reachable storage would expose it
to any injected script. The UI is server-rendered HTML without JavaScript, so the browser needs a credential it
sends by itself and that page content cannot read.

## Options

| Option | Verdict |
|---|---|
| Keep the bearer token in the page or in `localStorage` | rejected: readable by any script, long-lived |
| Put the operator token itself in a cookie | rejected: the long-lived secret would travel on every request and sit in the browser |
| HTTP Basic auth | rejected: no logout, no expiry, password-style prompt |
| Opaque server-side session id in a hardened cookie, opened by presenting the operator token once | **chosen** |

## Decision

- `POST /cockpit/login` takes the operator token as a form field, checks it with the same
  `OperatorAuthenticator` as the API, and opens a session. The token is never echoed, stored or logged.
- The session id is 256 bits from `crypto.randomBytes`; only its SHA-256 is kept server-side. A stolen store
  dump therefore does not yield usable cookies.
- Cookie: `__Host-aegis_cockpit=<id>; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`. The `__Host-`
  prefix forbids a `Domain` attribute and requires `Secure` and `Path=/`.
- Lifetime: 8 hours absolute, measured with the injected `Clock` (testable, no sliding renewal). Logout deletes
  the session server-side, so the old cookie is dead even if a copy remains.
- CSRF: `SameSite=Strict` plus an explicit check on `POST`: when an `Origin` header is present its host must equal
  the `Host` header, otherwise 403. A request without `Origin` is accepted (non-browser clients, older agents);
  `SameSite=Strict` still protects the cookie in that case.
- Pages carry `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a
  CSP of `default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none';
  base-uri 'none'`. There is no script and no inline style; the stylesheet is served from
  `/cockpit/assets/cockpit.css`.
- The cookie only opens `/cockpit/*`. It never authorizes `/v1/*`, and the API keeps requiring the bearer token.
- Output escaping is done by a tagged template (`html`) that escapes every interpolation unless it is already
  marked safe, so ticket titles and client names cannot inject markup.

## Consequences

- Sessions are held in memory: a restart signs operators out, which is acceptable for a single-instance pilot.
  A shared store becomes necessary before running several instances.
- `Secure` cookies are not sent over plain `http://` except by browsers that treat `localhost` as secure. The
  local demo is meant to be opened on `http://127.0.0.1` through a browser that does so, or behind TLS.
- No per-operator identity yet: any valid operator token opens a session with full operator rights. Per-operator
  identity, roles, audit log and login rate limiting are the next steps.
- Introducing a database-backed session table later only requires a new `SessionStore` port; the cookie contract
  stays the same.
