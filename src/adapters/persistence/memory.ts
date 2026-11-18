import type { NormalizedEvent } from "../../domain/event.js";
import { DomainError, nameKey, type Client, type Site, type StoredCredential } from "../../domain/tenancy.js";
import type { EventQuery, EventStore, TenancyStore } from "../../ports/stores.js";

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
    const events = [...(this.partitions.get(clientId)?.values() ?? [])];
    events.sort(compareEvents);
    return events.slice(0, query.limit);
  }
}

/** Shared ordering contract: most recent first, ties broken by id for stable pages. */
export function compareEvents(a: NormalizedEvent, b: NormalizedEvent): number {
  if (a.receivedAt !== b.receivedAt) return a.receivedAt < b.receivedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
