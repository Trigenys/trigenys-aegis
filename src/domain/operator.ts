import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Operator (MSP staff) authentication, deliberately separate from client
 * credentials: a client token can never act as an operator, and operator
 * tokens never touch the tenancy store.
 *
 * Operators are configured as SHA-256 hashes only (e.g. from an environment
 * variable), so the running service never holds a plain operator secret.
 */
export const OPERATOR_TOKEN_PREFIX = "aegis_op_";

export function generateOperatorToken(): { token: string; sha256: string } {
  const token = OPERATOR_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, sha256: sha256Hex(token) };
}

export interface OperatorAuthenticator {
  /** False when no operator is configured: the operator API is then disabled. */
  readonly enabled: boolean;
  verify(token: string): boolean;
}

export class HashedOperatorAuthenticator implements OperatorAuthenticator {
  private readonly hashes: readonly Buffer[];

  constructor(sha256Hashes: readonly string[]) {
    for (const hash of sha256Hashes) {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("operator token hashes must be 64 lowercase hex characters");
    }
    this.hashes = sha256Hashes.map((hash) => Buffer.from(hash, "hex"));
  }

  /** Parses a comma-separated list, as used in AEGIS_OPERATOR_TOKEN_SHA256. */
  static fromList(value: string | undefined): HashedOperatorAuthenticator {
    const hashes = (value ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return new HashedOperatorAuthenticator(hashes);
  }

  get enabled(): boolean {
    return this.hashes.length > 0;
  }

  verify(token: string): boolean {
    if (!/^aegis_op_[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const candidate = createHash("sha256").update(token, "utf8").digest();
    let match = false;
    // Compare against every configured hash to keep timing independent of position.
    for (const hash of this.hashes) match = timingSafeEqual(candidate, hash) || match;
    return match;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
