import { createHash, randomBytes } from "node:crypto";

/** Prefix that makes leaked tokens easy to recognize by secret scanners. */
export const TOKEN_PREFIX = "aegis_";

/** 256 bits of entropy: a fast hash (SHA-256) is sufficient, no slow KDF needed. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cheap syntactic check that rejects garbage before any store lookup. */
export function isWellFormedToken(token: string): boolean {
  return /^aegis_[A-Za-z0-9_-]{43}$/.test(token);
}
