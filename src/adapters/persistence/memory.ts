import type { NormalizedEvent } from "../../domain/event.js";
import type { Client, Site, StoredCredential } from "../../domain/tenancy.js";
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
    this.clients.set(client.id, client);
    this.sites.set(client.id, new Map());
  }

  async getClient(clientId: string): Promise<Client | null> {
    return this.clients.get(clientId) ?? null;
  }

  async insertSite(site: Site): Promise<void> {
    const partition = this.sites.get(site.clientId);
    if (!partition) throw new Error(`client ${site.clientId} does not exist`);
    if (partition.has(site.id)) throw new Error(`site ${site.id} already exists`);
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
    events.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return events.slice(0, query.limit);
  }
}
