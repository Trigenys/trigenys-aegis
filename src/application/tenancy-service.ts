import { randomUUID } from "node:crypto";
import { generateToken, hashToken, isWellFormedToken } from "../domain/credentials.js";
import {
  DomainError,
  type Client, type CredentialScope, type Principal, type Site
} from "../domain/tenancy.js";
import type { TenancyStore } from "../ports/stores.js";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface IssuedCredential {
  readonly credentialId: string;
  /** Shown once at issuance; only its hash is persisted. */
  readonly token: string;
}

export class TenancyService {
  constructor(
    private readonly store: TenancyStore,
    private readonly clock: Clock = systemClock
  ) {}

  async createClient(name: string): Promise<Client> {
    const client: Client = { id: randomUUID(), name: requireName(name), createdAt: this.nowIso() };
    await this.store.insertClient(client);
    return client;
  }

  async createSite(clientId: string, name: string): Promise<Site> {
    if (!(await this.store.getClient(clientId))) throw new DomainError("CLIENT_NOT_FOUND", "unknown client");
    const site: Site = { id: randomUUID(), clientId, name: requireName(name), createdAt: this.nowIso() };
    await this.store.insertSite(site);
    return site;
  }

  async issueCredential(
    clientId: string,
    scopes: readonly CredentialScope[],
    siteId: string | null = null
  ): Promise<IssuedCredential> {
    if (scopes.length === 0) throw new DomainError("INVALID_SCOPES", "at least one scope is required");
    if (!(await this.store.getClient(clientId))) throw new DomainError("CLIENT_NOT_FOUND", "unknown client");
    // A site-bound credential can only reference a site of the same client.
    if (siteId !== null && !(await this.store.getSite(clientId, siteId))) {
      throw new DomainError("SITE_NOT_FOUND", "unknown site for this client");
    }
    const token = generateToken();
    const credentialId = randomUUID();
    await this.store.insertCredential({
      id: credentialId,
      clientId,
      siteId,
      scopes: [...new Set(scopes)],
      secretHash: hashToken(token),
      createdAt: this.nowIso(),
      revokedAt: null
    });
    return { credentialId, token };
  }

  async revokeCredential(clientId: string, credentialId: string): Promise<boolean> {
    return this.store.revokeCredential(clientId, credentialId, this.nowIso());
  }

  /** Resolves a bearer token to its principal, or null when unknown, malformed or revoked. */
  async authenticate(token: string): Promise<Principal | null> {
    if (!isWellFormedToken(token)) return null;
    const credential = await this.store.findCredentialByHash(hashToken(token));
    if (!credential || credential.revokedAt !== null) return null;
    return {
      credentialId: credential.id,
      clientId: credential.clientId,
      siteId: credential.siteId,
      scopes: credential.scopes
    };
  }

  private nowIso(): string {
    return this.clock.now().toISOString();
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    throw new DomainError("INVALID_NAME", "name must be 1-200 characters");
  }
  return trimmed;
}
