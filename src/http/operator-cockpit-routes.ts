import type { IncomingMessage, ServerResponse } from "node:http";
import type { CockpitReadService } from "../application/cockpit-service.js";
import { periodOf } from "../application/cockpit-service.js";
import type { Clock } from "../application/tenancy-service.js";
import type { OperatorAuthenticator } from "../domain/operator.js";
import { DomainError } from "../domain/tenancy.js";
import { sendJson } from "./body.js";
import { requireOperator } from "./operator-auth.js";

export const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const COCKPIT_ROUTE = new RegExp(`^/v1/operator/(?:(overview)|clients/(${UUID})/(?:(dashboard)|reports/(monthly)))$`);

export function matchOperatorCockpit(pathname: string): RegExpExecArray | null {
  return COCKPIT_ROUTE.exec(pathname);
}

export interface OperatorCockpitDeps {
  operators?: OperatorAuthenticator;
  cockpit: CockpitReadService;
  clock: Clock;
}

/**
 * Read-only cockpit API (overview, client dashboard, monthly report). Same
 * Bearer operator authentication as the rest of /v1/operator; a client
 * credential never reaches it.
 */
export async function routeOperatorCockpit(
  deps: OperatorCockpitDeps,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  [, overview, clientId, dashboard]: RegExpExecArray
): Promise<void> {
  requireOperator(deps.operators, request);
  const method = request.method ?? "GET";
  if (method !== "GET") throw new DomainError("METHOD_NOT_ALLOWED", `${method} is not allowed here`);

  if (overview) return sendJson(response, 200, await deps.cockpit.overview());
  if (dashboard) return sendJson(response, 200, await deps.cockpit.clientDashboard(clientId!));
  const period = url.searchParams.get("period") ?? periodOf(deps.clock.now());
  return sendJson(response, 200, await deps.cockpit.monthlyReport(clientId!, period));
}
