import type { Asset, Contact, HealthSnapshot, SiteNetworkStatus, Ticket, TicketStatus, UpsertResult } from "../domain/estate.js";
import type { EventCategory, NormalizedEvent, Severity } from "../domain/event.js";
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
  /** Inclusive lower bound on receivedAt (ISO instant). */
  readonly since?: string;
  /** Exclusive upper bound on receivedAt (ISO instant). */
  readonly until?: string;
  readonly categories?: readonly EventCategory[];
}

export interface EventCountQuery {
  /** Inclusive lower bound on receivedAt. */
  readonly since: string;
  /** Exclusive upper bound on receivedAt. */
  readonly until: string;
  readonly category?: EventCategory;
}

export interface EventStore {
  /** Inserts the event unless one with the same id exists for the client. Returns true when inserted. */
  append(clientId: string, event: NormalizedEvent): Promise<boolean>;
  get(clientId: string, eventId: string): Promise<NormalizedEvent | null>;
  /** Most recent first by receivedAt. */
  list(clientId: string, query: EventQuery): Promise<NormalizedEvent[]>;
  /** Number of events per severity (every severity present, zero included) in the window. */
  countBySeverity(clientId: string, query: EventCountQuery): Promise<Record<Severity, number>>;
}

/**
 * Estate ports. Same isolation contract as above: the client id comes first,
 * a site referenced by a record must belong to that client (the call throws
 * otherwise), and every upsert reports whether it created, changed or left the
 * record as it was, so that replaying a sync is a no-op.
 */
export interface EstateStore {
  upsertAsset(clientId: string, asset: Asset): Promise<UpsertResult>;
  /** Ordered by hostname then id. */
  listAssets(clientId: string): Promise<Asset[]>;
  upsertSiteNetwork(clientId: string, status: SiteNetworkStatus): Promise<UpsertResult>;
  /** Ordered by site id. */
  listSiteNetwork(clientId: string): Promise<SiteNetworkStatus[]>;
}

export interface TicketQuery {
  readonly status?: TicketStatus;
  /** Inclusive lower bound on closedAt. */
  readonly closedSince?: string;
  /** Exclusive upper bound on closedAt. */
  readonly closedUntil?: string;
}

export interface SupportStore {
  upsertContact(clientId: string, contact: Contact): Promise<UpsertResult>;
  /** Ordered by name then id. */
  listContacts(clientId: string): Promise<Contact[]>;
  /**
   * Keyed by (channel, externalRef) within the client: the id given at creation
   * is kept, later calls only change the other fields.
   */
  upsertTicket(clientId: string, ticket: Ticket): Promise<UpsertResult>;
  /** Most recently opened first, then by id. */
  listTickets(clientId: string, query?: TicketQuery): Promise<Ticket[]>;
}

export interface HealthSnapshotStore {
  /** Inserts the snapshot unless the client already has one for that period. Returns true when inserted. */
  putSnapshot(clientId: string, snapshot: HealthSnapshot): Promise<boolean>;
  getSnapshot(clientId: string, period: string): Promise<HealthSnapshot | null>;
}
