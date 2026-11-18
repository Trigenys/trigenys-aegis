import type { IncomingMessage, ServerResponse } from "node:http";
import { periodOf, type CockpitReadService } from "../application/cockpit-service.js";
import type { OperatorSessions } from "../application/operator-sessions.js";
import type { Clock } from "../application/tenancy-service.js";
import type { OperatorAuthenticator } from "../domain/operator.js";
import { DomainError } from "../domain/tenancy.js";
import { readForm } from "./body.js";
import { ERROR_STATUS } from "./errors.js";
import { UUID } from "./operator-cockpit-routes.js";
import { clientPage } from "./views/client.js";
import { errorPage } from "./views/layout.js";
import { loginPage } from "./views/login.js";
import { overviewPage } from "./views/overview.js";
import { reportPage } from "./views/report.js";
import { COCKPIT_CSS } from "./views/styles.js";

export const SESSION_COOKIE = "__Host-aegis_cockpit";

export interface CockpitWebDeps {
  operators?: OperatorAuthenticator;
  cockpit: CockpitReadService;
  sessions: OperatorSessions;
  clock: Clock;
  maxBodyBytes?: number;
}

const CLIENT_ROUTE = new RegExp(`^/cockpit/clients/(${UUID})(/report)?$`);

/** No script, no inline style, no framing: the pages only load the stylesheet served by this same origin. */
const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "cache-control": "no-store"
} as const;

/**
 * Server-rendered operator cockpit. Authentication is a browser session
 * (cookie) opened with the same operator token as the JSON API; the JSON API
 * itself never accepts that cookie.
 */
export async function routeCockpitWeb(
  deps: CockpitWebDeps,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await dispatch(deps, request, response, url);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const status = ERROR_STATUS[error.code] ?? 400;
    const signedIn = deps.sessions.isValid(sessionId(request));
    sendHtml(response, status, errorPage(status, messageFor(error), signedIn));
  }
}

async function dispatch(deps: CockpitWebDeps, request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const method = request.method ?? "GET";
  const path = url.pathname;

  if (path === "/cockpit/assets/cockpit.css") {
    if (method !== "GET") throw new DomainError("METHOD_NOT_ALLOWED", `${method} is not allowed here`);
    response.writeHead(200, {
      ...SECURITY_HEADERS,
      "cache-control": "public, max-age=300",
      "content-type": "text/css; charset=utf-8"
    });
    response.end(COCKPIT_CSS);
    return;
  }

  if (!deps.operators?.enabled) {
    sendHtml(response, 503, errorPage(503, "Le cockpit est désactivé : aucun opérateur n'est configuré.", false));
    return;
  }

  const current = sessionId(request);
  const signedIn = deps.sessions.isValid(current);

  if (path === "/cockpit/login") {
    if (method === "GET") {
      if (signedIn) return redirect(response, "/cockpit");
      return sendHtml(response, 200, loginPage());
    }
    if (method === "POST") {
      requireSameOrigin(request);
      const form = await readForm(request);
      const token = form.token ?? "";
      if (!deps.operators.verify(token)) {
        // No cookie, and nothing about the submitted value is echoed or logged.
        return sendHtml(response, 401, loginPage("Jeton invalide."));
      }
      deps.sessions.destroy(current);
      const id = deps.sessions.create();
      return redirect(response, "/cockpit", sessionCookie(id, Math.floor(deps.sessions.ttlMs / 1000)));
    }
    throw new DomainError("METHOD_NOT_ALLOWED", `${method} is not allowed here`);
  }

  if (path === "/cockpit/logout") {
    if (method !== "POST") throw new DomainError("METHOD_NOT_ALLOWED", `${method} is not allowed here`);
    requireSameOrigin(request);
    deps.sessions.destroy(current);
    return redirect(response, "/cockpit/login", sessionCookie("", 0));
  }

  if (!signedIn) return redirect(response, "/cockpit/login");

  const isClient = CLIENT_ROUTE.exec(path);
  if (path === "/cockpit" || path === "/cockpit/" || isClient) {
    if (method !== "GET") throw new DomainError("METHOD_NOT_ALLOWED", `${method} is not allowed here`);
    if (!isClient) return sendHtml(response, 200, overviewPage(await deps.cockpit.overview()));
    const clientId = isClient[1]!;
    if (isClient[2]) {
      const period = url.searchParams.get("period") ?? periodOf(deps.clock.now());
      return sendHtml(response, 200, reportPage(await deps.cockpit.monthlyReport(clientId, period)));
    }
    return sendHtml(response, 200, clientPage(await deps.cockpit.clientDashboard(clientId)));
  }

  throw new DomainError("NOT_FOUND", "not found");
}

/**
 * State-changing browser requests must come from this very origin. Browsers send Sec-Fetch-Site,
 * which is authoritative when present; some send `Origin: null` on same-origin form posts, so
 * "null" is accepted only alongside `Sec-Fetch-Site: same-origin`. A request with neither header
 * (non-browser client) is allowed: the session cookie is SameSite=Strict anyway.
 */
function requireSameOrigin(request: IncomingMessage): void {
  const refuse = (): never => {
    throw new DomainError("FORBIDDEN", "cross-origin request refused");
  };
  const site = request.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") refuse();
  const origin = request.headers.origin;
  if (origin === undefined) return;
  if (origin === "null") {
    if (site === "same-origin") return;
    refuse();
  }
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {
    host = null;
  }
  if (host === null || host !== request.headers.host) refuse();
}

function sessionId(request: IncomingMessage): string | undefined {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === SESSION_COOKIE) return part.slice(index + 1).trim();
  }
  return undefined;
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

function redirect(response: ServerResponse, location: string, cookie?: string): void {
  response.writeHead(303, { ...SECURITY_HEADERS, location, ...(cookie ? { "set-cookie": cookie } : {}) });
  response.end();
}

function sendHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

/** French, fixed messages: error details from the domain are never reflected into the page. */
function messageFor(error: DomainError): string {
  switch (error.code) {
    case "CLIENT_NOT_FOUND":
    case "NOT_FOUND":
      return "Page introuvable.";
    case "INVALID_PERIOD":
      return "Mois invalide : utilisez le format AAAA-MM, jusqu'au mois en cours.";
    case "FORBIDDEN":
      return "Requête refusée.";
    case "METHOD_NOT_ALLOWED":
      return "Action non autorisée ici.";
    case "PAYLOAD_TOO_LARGE":
    case "UNSUPPORTED_MEDIA_TYPE":
      return "Requête invalide.";
    default:
      return "Une erreur est survenue.";
  }
}
