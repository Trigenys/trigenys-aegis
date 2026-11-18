import type { IncomingMessage } from "node:http";
import type { OperatorAuthenticator } from "../domain/operator.js";
import { DomainError } from "../domain/tenancy.js";

/** Bearer operator authentication for the JSON API: 503 when no operator is configured, 401 otherwise on a bad token. */
export function requireOperator(operators: OperatorAuthenticator | undefined, request: IncomingMessage): void {
  if (!operators?.enabled) {
    throw new DomainError("OPERATOR_API_DISABLED", "no operator credential is configured");
  }
  const header = request.headers.authorization ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  if (!match || !operators.verify(match[1]!)) {
    throw new DomainError("UNAUTHORIZED", "missing or invalid operator credential");
  }
}
