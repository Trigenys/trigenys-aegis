import type { IncomingMessage, ServerResponse } from "node:http";
import { DomainError } from "../domain/tenancy.js";

export const DEFAULT_MAX_BODY = 1024 * 1024;

async function readBytes(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers["content-length"] ?? "0");
  if (declared > maxBytes) throw new DomainError("PAYLOAD_TOO_LARGE", `body exceeds ${maxBytes} bytes`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new DomainError("PAYLOAD_TOO_LARGE", `body exceeds ${maxBytes} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    throw new DomainError("UNSUPPORTED_MEDIA_TYPE", "content-type must be application/json");
  }
  const bytes = await readBytes(request, maxBytes);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new DomainError("INVALID_JSON", "body is not valid JSON");
  }
}

export async function readObject(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const body = await readJson(request, maxBytes);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new DomainError("INVALID_BODY", "body must be a JSON object");
  }
  return body as Record<string, unknown>;
}

/** Reads a small `application/x-www-form-urlencoded` body (the login form). The limit is deliberately tight. */
export async function readForm(request: IncomingMessage, maxBytes = 8 * 1024): Promise<Record<string, string>> {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/x-www-form-urlencoded\b/i.test(contentType)) {
    throw new DomainError("UNSUPPORTED_MEDIA_TYPE", "content-type must be application/x-www-form-urlencoded");
  }
  const bytes = await readBytes(request, maxBytes);
  const fields: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(bytes.toString("utf8"))) fields[key] ??= value;
  return fields;
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
