import type { NormalizedEvent } from "../domain/event.js";
import type { Client, Site, StoredCredential } from "../domain/tenancy.js";

/**
 * Persistence ports. Every tenant-scoped read or write takes the client id as
 * an explicit argument, supplied by the caller from the authenticated
 * principal; there is no unscoped query method.
 *
 * Shared contract (checked by test/store-contract.test.ts for every adapter):
 * names are unique per scope on nameKey (DomainError CONFLICT), a credential's
 * site belongs to its client, events list most recent first then by id.
 */
export interface TenancyStore {
  /** Throws DomainError CONFLICT when another client has the same nameKey. */
  insertClient(client: Client): Promise<void>;
  getClient(clientId: string): Promise<Client | null>;
  /** Operator-only: the single cross-client query, never reachable from a client credential. */
  listClients(): Promise<Client[]>;
  listCredentials(clientId: string): Promise<StoredCredential[]>;
  /** Throws DomainError CONFLICT when the client already has a site with the same nameKey. */
  insertSite(site: Site): Promise<void>;
  getSite(clientId: string, siteId: string): Promise<Site | null>;
  listSites(clientId: string): Promise<Site[]>;
  insertCredential(credential: StoredCredential): Promise<void>;
  findCredentialByHash(secretHash: string): Promise<StoredCredential | null>;
  revokeCredential(clientId: string, credentialId: string, revokedAt: string): Promise<boolean>;
}

export interface EventQuery {
  readonly limit: number;
}

export interface EventStore {
  /** Inserts the event unless one with the same id exists for the client. Returns true when inserted. */
  append(clientId: string, event: NormalizedEvent): Promise<boolean>;
  get(clientId: string, eventId: string): Promise<NormalizedEvent | null>;
  /** Most recent first by receivedAt. */
  list(clientId: string, query: EventQuery): Promise<NormalizedEvent[]>;
}
