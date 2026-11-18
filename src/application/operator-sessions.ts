import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "./tenancy-service.js";

export interface OperatorSessionOptions {
  clock: Clock;
  /** Lifetime of a session, in milliseconds. Defaults to 8 hours. */
  ttlMs?: number;
  /** Maximum number of live sessions; the oldest is evicted beyond it. */
  maxSessions?: number;
}

export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Browser sessions for the operator cockpit. The session id is 256 random bits
 * handed to the browser once; only its SHA-256 is kept in memory, so a memory
 * dump does not yield usable cookies. Sessions are volatile by design: a
 * restart logs everyone out.
 */
export class OperatorSessions {
  private readonly expiries = new Map<string, number>();
  private readonly clock: Clock;
  readonly ttlMs: number;
  private readonly maxSessions: number;

  constructor(options: OperatorSessionOptions) {
    this.clock = options.clock;
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.maxSessions = options.maxSessions ?? 100;
  }

  /** Opens a session and returns the id to put in the cookie. */
  create(): string {
    this.prune();
    while (this.expiries.size >= this.maxSessions) {
      const oldest = this.expiries.keys().next().value;
      if (oldest === undefined) break;
      this.expiries.delete(oldest);
    }
    const id = randomBytes(32).toString("base64url");
    this.expiries.set(digest(id), this.clock.now().getTime() + this.ttlMs);
    return id;
  }

  isValid(id: string | undefined): boolean {
    if (!id) return false;
    const key = digest(id);
    const expiresAt = this.expiries.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt <= this.clock.now().getTime()) {
      this.expiries.delete(key);
      return false;
    }
    return true;
  }

  destroy(id: string | undefined): void {
    if (id) this.expiries.delete(digest(id));
  }

  private prune(): void {
    const now = this.clock.now().getTime();
    for (const [key, expiresAt] of this.expiries) if (expiresAt <= now) this.expiries.delete(key);
  }
}

function digest(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}
