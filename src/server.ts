import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CockpitReadService } from "./application/cockpit-service.js";
import type { IngestionService } from "./application/ingestion-service.js";
import type { OperatorSessions } from "./application/operator-sessions.js";
import { systemClock, type Clock, type TenancyService } from "./application/tenancy-service.js";
import type { OperatorAuthenticator } from "./domain/operator.js";
import { DomainError, type Principal } from "./domain/tenancy.js";
import { DEFAULT_MAX_BODY, readJson, readObject, sendJson } from "./http/body.js";
import { routeCockpitWeb } from "./http/cockpit-web-routes.js";
import { ERROR_STATUS } from "./http/errors.js";
import { requireOperator } from "./http/operator-auth.js";
import { matchOperatorCockpit, routeOperatorCockpit, UUID } from "./http/operator-cockpit-routes.js";

export interface ServiceInfo {
  name: string;
  version: string;
}

/** Optional capabilities; without them the server only exposes /health. */
export interface ServiceDependencies {
  tenancy: TenancyService;
  ingestion: IngestionService;
  /** Operator (MSP staff) authentication; when absent or empty the operator API answers 503. */
  operators?: OperatorAuthenticator;
  /** Read models for the cockpit; without them the cockpit API and pages are not served. */
  cockpit?: CockpitReadService;
  /** Browser sessions for the cockpit pages; the pages need both `cockpit` and `sessions`. */
  sessions?: OperatorSessions;
  clock?: Clock;
  /** Maximum accepted request body, in bytes. Defaults to 1 MiB. */
  maxBodyBytes?: number;
}

const INGEST_ROUTE = /^\/v1\/sources\/([a-z][a-z0-9-]{1,31})\/events$/;
const EVENT_ROUTE = /^\/v1\/events\/([a-f0-9]{64})$/;
const OPERATOR_ROUTE = new RegExp(
  `^/v1/operator/clients(?:/(${UUID})(?:/(sites|credentials)(?:/(${UUID}))?)?)?$`
);

export function createServiceServer(info: ServiceInfo, deps?: ServiceDependencies) {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    route(info, deps, request, response).catch((error: unknown) => {
      if (error instanceof DomainError) {
        sendJson(response, ERROR_STATUS[error.code] ?? 400, { error: error.code, message: error.message });
        return;
      }
      // Never echo internal errors or request content back to the caller.
      console.error(JSON.stringify({ level: "error", event: "request.failed", service: info.name }));
      if (!response.headersSent) sendJson(response, 500, { error: "INTERNAL" });
    });
  });
}

async function route(
  info: ServiceInfo,
  deps: ServiceDependencies | undefined,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: info.name, version: info.version });
    return;
  }

  if (deps?.cockpit && deps.sessions && (url.pathname === "/cockpit" || url.pathname.startsWith("/cockpit/"))) {
    await routeCockpitWeb({ ...deps, cockpit: deps.cockpit, sessions: deps.sessions, clock: deps.clock ?? systemClock },
      request, response, url);
    return;
  }

  if (deps?.cockpit && url.pathname.startsWith("/v1/operator/")) {
    const cockpitMatch = matchOperatorCockpit(url.pathname);
    if (cockpitMatch) {
      await routeOperatorCockpit({ ...deps, cockpit: deps.cockpit, clock: deps.clock ?? systemClock },
        request, response, url, cockpitMatch);
      return;
    }
  }

  if (deps && url.pathname.startsWith("/v1/operator/")) {
    const operatorMatch = OPERATOR_ROUTE.exec(url.pathname);
    if (operatorMatch) {
      await routeOperator(deps, request, response, operatorMatch);
      return;
    }
  }

  if (deps) {
    const ingestMatch = INGEST_ROUTE.exec(url.pathname);
    if (request.method === "POST" && ingestMatch) {
      const principal = await authenticate(deps, request);
      const payload = await readJson(request, deps.maxBodyBytes ?? DEFAULT_MAX_BODY);
      const result = await deps.ingestion.ingest(principal, ingestMatch[1]!, payload);
      sendJson(response, 202, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/events") {
      const principal = await authenticate(deps, request);
      const limit = Number(url.searchParams.get("limit") ?? "50");
      sendJson(response, 200, { events: await deps.ingestion.listEvents(principal, limit) });
      return;
    }

    const eventMatch = EVENT_ROUTE.exec(url.pathname);
    if (request.method === "GET" && eventMatch) {
      const principal = await authenticate(deps, request);
      const event = await deps.ingestion.getEvent(principal, eventMatch[1]!);
      // Another client's event and a missing event are indistinguishable.
      if (!event) throw new DomainError("NOT_FOUND", "event not found");
      sendJson(response, 200, event);
      return;
    }
  }

  sendJson(response, 404, { error: "NOT_FOUND" });
}

/**
 * Operator API: create and list clients, sites and client credentials, and
 * revoke credentials. Reachable only with an operator token, never with a
 * client credential.
 */
async function routeOperator(
  deps: ServiceDependencies,
  request: IncomingMessage,
  response: ServerResponse,
  [, clientId, collection, itemId]: RegExpExecArray
): Promise<void> {
  requireOperator(deps.operators, request);

  const { tenancy } = deps;
  const method = request.method ?? "GET";
  const maxBody = deps.maxBodyBytes ?? DEFAULT_MAX_BODY;

  if (!clientId) {
    if (method === "GET") return sendJson(response, 200, { clients: await tenancy.listClients() });
    if (method === "POST") {
      const body = await readObject(request, maxBody);
      return sendJson(response, 201, await tenancy.createClient(body.name as string));
    }
  } else if (!collection) {
    if (method === "GET") return sendJson(response, 200, await tenancy.getClient(clientId));
  } else if (collection === "sites" && !itemId) {
    if (method === "GET") return sendJson(response, 200, { sites: await tenancy.listSites(clientId) });
    if (method === "POST") {
      const body = await readObject(request, maxBody);
      return sendJson(response, 201, await tenancy.createSite(clientId, body.name as string, body.city));
    }
  } else if (collection === "credentials" && !itemId) {
    if (method === "GET") return sendJson(response, 200, { credentials: await tenancy.listCredentials(clientId) });
    if (method === "POST") {
      const body = await readObject(request, maxBody);
      const siteId = body.siteId === undefined ? null : body.siteId;
      const issued = await tenancy.issueCredential(clientId, body.scopes as never, siteId as string | null);
      // The plain token is returned exactly once and must not be cached anywhere.
      response.setHeader("cache-control", "no-store");
      return sendJson(response, 201, issued);
    }
  } else if (collection === "credentials" && itemId) {
    if (method === "DELETE") {
      await tenancy.getClient(clientId);
      // Revoking twice is a no-op; a credential of another client is not found.
      if (!(await tenancy.revokeCredential(clientId, itemId))) {
        throw new DomainError("CREDENTIAL_NOT_FOUND", "unknown credential for this client");
      }
      response.writeHead(204);
      response.end();
      return;
    }
  } else {
    throw new DomainError("NOT_FOUND", "not found");
  }
  throw new DomainError("METHOD_NOT_ALLOWED", `${method} is not allowed here`);
}

async function authenticate(deps: ServiceDependencies, request: IncomingMessage): Promise<Principal> {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  const principal = match ? await deps.tenancy.authenticate(match[1]!) : null;
  if (!principal) throw new DomainError("UNAUTHORIZED", "missing or invalid credential");
  return principal;
}
