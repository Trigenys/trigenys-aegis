import { isDeepStrictEqual } from "node:util";
import type {
  Asset, Contact, HealthSnapshot, SiteNetworkStatus, Ticket, UpsertResult
} from "../../domain/estate.js";
import { SEVERITIES, type NormalizedEvent, type Severity } from "../../domain/event.js";
import { DomainError, nameKey, type Client, type Site, type StoredCredential } from "../../domain/tenancy.js";
import type {
  EstateStore, EventCountQuery, EventQuery, EventStore, HealthSnapshotStore, SupportStore, TenancyStore, TicketQuery
} from "../../ports/stores.js";

/**
 * In-memory adapters for tests and local development. Data is partitioned by
 * client id at the top level, mirroring the isolation contract that a durable
 * adapter must also honour.
 */
export class InMemoryTenancyStore implements TenancyStore {
  private readonly clients = new Map<string, Client>();
  private readonly sites = new Map<string, Map<string, Site>>();
  private readonly credentialsByHash = new Map<string, StoredCredential>();

  async insertClient(client: Client): Promise<void> {
    if (this.clients.has(client.id)) throw new Error(`client ${client.id} already exists`);
    const key = nameKey(client.name);
    if ([...this.clients.values()].some((c) => nameKey(c.name) === key)) {
      throw new DomainError("CONFLICT", "a client with this name already exists");
    }
    this.clients.set(client.id, client);
    this.sites.set(client.id, new Map());
  }

  async getClient(clientId: string): Promise<Client | null> {
    return this.clients.get(clientId) ?? null;
  }

  async listClients(): Promise<Client[]> {
    return [...this.clients.values()];
  }

  async listCredentials(clientId: string): Promise<StoredCredential[]> {
    return [...this.credentialsByHash.values()].filter((c) => c.clientId === clientId);
  }

  async insertSite(site: Site): Promise<void> {
    const partition = this.sites.get(site.clientId);
    if (!partition) throw new Error(`client ${site.clientId} does not exist`);
    if (partition.has(site.id)) throw new Error(`site ${site.id} already exists`);
    const key = nameKey(site.name);
    if ([...partition.values()].some((s) => nameKey(s.name) === key)) {
      throw new DomainError("CONFLICT", "a site with this name already exists for this client");
    }
    partition.set(site.id, site);
  }

  async getSite(clientId: string, siteId: string): Promise<Site | null> {
    return this.sites.get(clientId)?.get(siteId) ?? null;
  }

  async listSites(clientId: string): Promise<Site[]> {
    return [...(this.sites.get(clientId)?.values() ?? [])];
  }

  async insertCredential(credential: StoredCredential): Promise<void> {
    if (this.credentialsByHash.has(credential.secretHash)) throw new Error("credential hash collision");
    if (!this.clients.has(credential.clientId)) throw new Error(`client ${credential.clientId} does not exist`);
    if (credential.siteId !== null && !(await this.getSite(credential.clientId, credential.siteId))) {
      throw new Error("credential site must belong to the same client");
    }
    this.credentialsByHash.set(credential.secretHash, credential);
  }

  async findCredentialByHash(secretHash: string): Promise<StoredCredential | null> {
    return this.credentialsByHash.get(secretHash) ?? null;
  }

  async revokeCredential(clientId: string, credentialId: string, revokedAt: string): Promise<boolean> {
    for (const [hash, credential] of this.credentialsByHash) {
      if (credential.id === credentialId && credential.clientId === clientId) {
        if (credential.revokedAt === null) this.credentialsByHash.set(hash, { ...credential, revokedAt });
        return true;
      }
    }
    return false;
  }
}

export class InMemoryEventStore implements EventStore {
  private readonly partitions = new Map<string, Map<string, NormalizedEvent>>();

  async append(clientId: string, event: NormalizedEvent): Promise<boolean> {
    if (event.clientId !== clientId) throw new Error("event clientId does not match partition");
    let partition = this.partitions.get(clientId);
    if (!partition) {
      partition = new Map();
      this.partitions.set(clientId, partition);
    }
    if (partition.has(event.id)) return false;
    partition.set(event.id, event);
    return true;
  }

  async get(clientId: string, eventId: string): Promise<NormalizedEvent | null> {
    return this.partitions.get(clientId)?.get(eventId) ?? null;
  }

  async list(clientId: string, query: EventQuery): Promise<NormalizedEvent[]> {
    const events = [...(this.partitions.get(clientId)?.values() ?? [])]
      .filter((e) => (query.since === undefined || e.receivedAt >= query.since)
        && (query.until === undefined || e.receivedAt < query.until)
        && (query.categories === undefined || query.categories.includes(e.category)));
    events.sort(compareEvents);
    return events.slice(0, query.limit);
  }

  async countBySeverity(clientId: string, query: EventCountQuery): Promise<Record<Severity, number>> {
    const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<Severity, number>;
    for (const e of this.partitions.get(clientId)?.values() ?? []) {
      if (e.receivedAt >= query.since && e.receivedAt < query.until
        && (query.category === undefined || e.category === query.category)) {
        counts[e.severity] += 1;
      }
    }
    return counts;
  }
}

/** Shared ordering contract: most recent first, ties broken by id for stable pages. */
export function compareEvents(a: NormalizedEvent, b: NormalizedEvent): number {
  if (a.receivedAt !== b.receivedAt) return a.receivedAt < b.receivedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Estate adapters keep one Map per client and verify, through the tenancy
 * store, that the client exists and that a referenced site belongs to it (the
 * rule PostgreSQL enforces with composite foreign keys).
 */
async function requireSite(tenancy: TenancyStore, clientId: string, siteId: string | null): Promise<void> {
  if (!(await tenancy.getClient(clientId))) throw new Error(`client ${clientId} does not exist`);
  if (siteId !== null && !(await tenancy.getSite(clientId, siteId))) {
    throw new Error("site must belong to the same client");
  }
}

function requireSameClient(clientId: string, recordClientId: string): void {
  if (clientId !== recordClientId) throw new Error("record clientId does not match partition");
}

function partitionOf<T>(map: Map<string, Map<string, T>>, clientId: string): Map<string, T> {
  let partition = map.get(clientId);
  if (!partition) {
    partition = new Map();
    map.set(clientId, partition);
  }
  return partition;
}

function upsertInto<T>(partition: Map<string, T>, key: string, record: T): UpsertResult {
  const existing = partition.get(key);
  if (existing === undefined) {
    partition.set(key, record);
    return "created";
  }
  if (isDeepStrictEqual(existing, record)) return "unchanged";
  partition.set(key, record);
  return "updated";
}

export class InMemoryEstateStore implements EstateStore {
  private readonly assets = new Map<string, Map<string, Asset>>();
  private readonly network = new Map<string, Map<string, SiteNetworkStatus>>();

  constructor(private readonly tenancy: TenancyStore) {}

  async upsertAsset(clientId: string, asset: Asset): Promise<UpsertResult> {
    requireSameClient(clientId, asset.clientId);
    await requireSite(this.tenancy, clientId, asset.siteId);
    return upsertInto(partitionOf(this.assets, clientId), asset.id, asset);
  }

  async listAssets(clientId: string): Promise<Asset[]> {
    return [...(this.assets.get(clientId)?.values() ?? [])]
      .sort((a, b) => compareText(a.hostname, b.hostname) || compareText(a.id, b.id));
  }

  async upsertSiteNetwork(clientId: string, status: SiteNetworkStatus): Promise<UpsertResult> {
    requireSameClient(clientId, status.clientId);
    await requireSite(this.tenancy, clientId, status.siteId);
    return upsertInto(partitionOf(this.network, clientId), status.siteId, status);
  }

  async listSiteNetwork(clientId: string): Promise<SiteNetworkStatus[]> {
    return [...(this.network.get(clientId)?.values() ?? [])].sort((a, b) => compareText(a.siteId, b.siteId));
  }
}

export class InMemorySupportStore implements SupportStore {
  private readonly contacts = new Map<string, Map<string, Contact>>();
  private readonly tickets = new Map<string, Map<string, Ticket>>();

  constructor(private readonly tenancy: TenancyStore) {}

  async upsertContact(clientId: string, contact: Contact): Promise<UpsertResult> {
    requireSameClient(clientId, contact.clientId);
    await requireSite(this.tenancy, clientId, null);
    return upsertInto(partitionOf(this.contacts, clientId), contact.id, contact);
  }

  async listContacts(clientId: string): Promise<Contact[]> {
    return [...(this.contacts.get(clientId)?.values() ?? [])]
      .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
  }

  async upsertTicket(clientId: string, ticket: Ticket): Promise<UpsertResult> {
    requireSameClient(clientId, ticket.clientId);
    await requireSite(this.tenancy, clientId, ticket.siteId);
    const partition = partitionOf(this.tickets, clientId);
    const key = JSON.stringify([ticket.channel, ticket.externalRef]);
    const existing = partition.get(key);
    // The id given at creation is kept: it is not part of the idempotency key.
    return upsertInto(partition, key, existing ? { ...ticket, id: existing.id } : ticket);
  }

  async listTickets(clientId: string, query: TicketQuery = {}): Promise<Ticket[]> {
    return [...(this.tickets.get(clientId)?.values() ?? [])]
      .filter((t) => (query.status === undefined || t.status === query.status)
        && (query.closedSince === undefined || (t.closedAt !== null && t.closedAt >= query.closedSince))
        && (query.closedUntil === undefined || (t.closedAt !== null && t.closedAt < query.closedUntil)))
      .sort((a, b) => compareText(b.openedAt, a.openedAt) || compareText(a.id, b.id));
  }
}

export class InMemorySnapshotStore implements HealthSnapshotStore {
  private readonly snapshots = new Map<string, Map<string, HealthSnapshot>>();

  constructor(private readonly tenancy: TenancyStore) {}

  async putSnapshot(clientId: string, snapshot: HealthSnapshot): Promise<boolean> {
    requireSameClient(clientId, snapshot.clientId);
    await requireSite(this.tenancy, clientId, null);
    const partition = partitionOf(this.snapshots, clientId);
    if (partition.has(snapshot.period)) return false;
    partition.set(snapshot.period, snapshot);
    return true;
  }

  async getSnapshot(clientId: string, period: string): Promise<HealthSnapshot | null> {
    return this.snapshots.get(clientId)?.get(period) ?? null;
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
