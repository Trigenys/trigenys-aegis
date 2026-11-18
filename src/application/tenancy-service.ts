import { randomUUID } from "node:crypto";
import { generateToken, hashToken, isWellFormedToken } from "../domain/credentials.js";
import {
  CREDENTIAL_SCOPES, DomainError, nameKey,
  type Client, type CredentialScope, type Principal, type Site, type StoredCredential
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

  /**
   * Client names are unique (see nameKey) so a retried creation cannot create a twin.
   * The check gives a helpful message; the store is the race-proof backstop.
   */
  async createClient(name: string): Promise<Client> {
    const clean = requireName(name);
    const existing = (await this.store.listClients()).find((c) => nameKey(c.name) === nameKey(clean));
    if (existing) throw new DomainError("CONFLICT", `client "${existing.name}" already exists (id ${existing.id})`);
    const client: Client = { id: randomUUID(), name: clean, createdAt: this.nowIso() };
    await this.store.insertClient(client);
    return client;
  }

  async listClients(): Promise<Client[]> {
    return (await this.store.listClients()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getClient(clientId: string): Promise<Client> {
    const client = await this.store.getClient(clientId);
    if (!client) throw new DomainError("CLIENT_NOT_FOUND", "unknown client");
    return client;
  }

  /** Site names are unique per client. */
  async createSite(clientId: string, name: string): Promise<Site> {
    await this.getClient(clientId);
    const clean = requireName(name);
    const existing = (await this.store.listSites(clientId)).find((s) => nameKey(s.name) === nameKey(clean));
    if (existing) throw new DomainError("CONFLICT", `site "${existing.name}" already exists (id ${existing.id})`);
    const site: Site = { id: randomUUID(), clientId, name: clean, createdAt: this.nowIso() };
    await this.store.insertSite(site);
    return site;
  }

  async listSites(clientId: string): Promise<Site[]> {
    await this.getClient(clientId);
    return this.store.listSites(clientId);
  }

  /** Credential metadata only: the hash is never exposed. */
  async listCredentials(clientId: string): Promise<CredentialView[]> {
    await this.getClient(clientId);
    return (await this.store.listCredentials(clientId)).map(({ secretHash: _hash, ...view }) => view);
  }

  async issueCredential(
    clientId: string,
    scopes: readonly CredentialScope[],
    siteId: string | null = null
  ): Promise<IssuedCredential> {
    if (!Array.isArray(scopes) || scopes.length === 0
      || !scopes.every((scope) => (CREDENTIAL_SCOPES as readonly unknown[]).includes(scope))) {
      throw new DomainError("INVALID_SCOPES", `scopes must be a non-empty subset of ${CREDENTIAL_SCOPES.join(", ")}`);
    }
    if (siteId !== null && typeof siteId !== "string") throw new DomainError("SITE_NOT_FOUND", "siteId must be a string");
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

export type CredentialView = Omit<StoredCredential, "secretHash">;

function requireName(name: unknown): string {
  if (typeof name !== "string") throw new DomainError("INVALID_NAME", "name must be a string");
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    throw new DomainError("INVALID_NAME", "name must be 1-200 characters");
  }
  return trimmed;
}
