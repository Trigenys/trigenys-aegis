import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { IngestionService } from "./application/ingestion-service.js";
import type { TenancyService } from "./application/tenancy-service.js";
import type { OperatorAuthenticator } from "./domain/operator.js";
import { DomainError, type Principal } from "./domain/tenancy.js";

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
  /** Maximum accepted request body, in bytes. Defaults to 1 MiB. */
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY = 1024 * 1024;
const INGEST_ROUTE = /^\/v1\/sources\/([a-z][a-z0-9-]{1,31})\/events$/;
const EVENT_ROUTE = /^\/v1\/events\/([a-f0-9]{64})$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OPERATOR_ROUTE = new RegExp(
  `^/v1/operator/clients(?:/(${UUID})(?:/(sites|credentials)(?:/(${UUID}))?)?)?$`
);

const ERROR_STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  CLIENT_NOT_FOUND: 404,
  CREDENTIAL_NOT_FOUND: 404,
  SITE_NOT_FOUND: 422,
  INVALID_NAME: 422,
  INVALID_SCOPES: 422,
  INVALID_BODY: 422,
  METHOD_NOT_ALLOWED: 405,
  OPERATOR_API_DISABLED: 503,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNKNOWN_SOURCE: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INVALID_JSON: 400,
  INVALID_PAYLOAD: 422,
  INVALID_EVENT: 422
};

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
  if (!deps.operators?.enabled) {
    throw new DomainError("OPERATOR_API_DISABLED", "no operator credential is configured");
  }
  const header = request.headers.authorization ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  if (!match || !deps.operators.verify(match[1]!)) {
    throw new DomainError("UNAUTHORIZED", "missing or invalid operator credential");
  }

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
      return sendJson(response, 201, await tenancy.createSite(clientId, body.name as string));
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

async function readObject(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const body = await readJson(request, maxBytes);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new DomainError("INVALID_BODY", "body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

async function authenticate(deps: ServiceDependencies, request: IncomingMessage): Promise<Principal> {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  const principal = match ? await deps.tenancy.authenticate(match[1]!) : null;
  if (!principal) throw new DomainError("UNAUTHORIZED", "missing or invalid credential");
  return principal;
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    throw new DomainError("UNSUPPORTED_MEDIA_TYPE", "content-type must be application/json");
  }
  const declared = Number(request.headers["content-length"] ?? "0");
  if (declared > maxBytes) throw new DomainError("PAYLOAD_TOO_LARGE", `body exceeds ${maxBytes} bytes`);

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new DomainError("PAYLOAD_TOO_LARGE", `body exceeds ${maxBytes} bytes`);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("INVALID_JSON", "body is not valid JSON");
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
