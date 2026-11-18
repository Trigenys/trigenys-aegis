import { DatabaseSync } from "node:sqlite";
import type { NormalizedEvent } from "../../domain/event.js";
import {
  DomainError, nameKey,
  type Client, type CredentialScope, type Site, type StoredCredential
} from "../../domain/tenancy.js";
import type { EventQuery, EventStore, TenancyStore } from "../../ports/stores.js";

/**
 * Durable adapters on the SQLite engine built into Node (node:sqlite): no
 * runtime dependency, one file per deployment. Tenant isolation is enforced
 * twice: every query is scoped by client_id, and the schema itself refuses a
 * credential bound to another client's site (composite foreign key).
 *
 * Migrations are append-only and tracked with PRAGMA user_version, so opening
 * an up-to-date database is a no-op and an older one is upgraded in place.
 * Never edit a shipped migration: add a new one.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE clients (
     id         TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     name_key   TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE sites (
     id         TEXT PRIMARY KEY,
     client_id  TEXT NOT NULL REFERENCES clients(id),
     name       TEXT NOT NULL,
     name_key   TEXT NOT NULL,
     created_at TEXT NOT NULL,
     UNIQUE (client_id, name_key),
     UNIQUE (client_id, id)
   ) STRICT;
   CREATE TABLE credentials (
     id          TEXT PRIMARY KEY,
     client_id   TEXT NOT NULL REFERENCES clients(id),
     site_id     TEXT,
     scopes      TEXT NOT NULL,
     secret_hash TEXT NOT NULL UNIQUE,
     created_at  TEXT NOT NULL,
     revoked_at  TEXT,
     FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id)
   ) STRICT;
   CREATE INDEX credentials_by_client ON credentials(client_id);
   CREATE TABLE events (
     client_id   TEXT NOT NULL REFERENCES clients(id),
     id          TEXT NOT NULL,
     received_at TEXT NOT NULL,
     body        TEXT NOT NULL,
     PRIMARY KEY (client_id, id)
   ) STRICT;
   CREATE INDEX events_by_recency ON events(client_id, received_at DESC, id);`
];

export interface SqlitePersistence {
  readonly tenancyStore: SqliteTenancyStore;
  readonly eventStore: SqliteEventStore;
  readonly schemaVersion: number;
  close(): void;
}

/** Opens (or creates) the database at `path` and brings its schema up to date. */
export function openSqlitePersistence(path: string): SqlitePersistence {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    const schemaVersion = migrate(db);
    return {
      tenancyStore: new SqliteTenancyStore(db),
      eventStore: new SqliteEventStore(db),
      schemaVersion,
      close: () => db.close()
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrate(db: DatabaseSync): number {
  const current = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (current > MIGRATIONS.length) {
    throw new Error(`database schema v${current} is newer than this build (v${MIGRATIONS.length}); refusing to start`);
  }
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return MIGRATIONS.length;
}

type Row = Record<string, unknown>;

function isUniqueViolation(error: unknown, column: string): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed") && error.message.includes(column);
}

export class SqliteTenancyStore implements TenancyStore {
  constructor(private readonly db: DatabaseSync) {}

  async insertClient(client: Client): Promise<void> {
    try {
      this.db.prepare("INSERT INTO clients (id, name, name_key, created_at) VALUES (?, ?, ?, ?)")
        .run(client.id, client.name, nameKey(client.name), client.createdAt);
    } catch (error) {
      if (isUniqueViolation(error, "clients.name_key")) {
        throw new DomainError("CONFLICT", "a client with this name already exists");
      }
      throw error;
    }
  }

  async getClient(clientId: string): Promise<Client | null> {
    const row = this.db.prepare("SELECT id, name, created_at FROM clients WHERE id = ?").get(clientId) as Row | undefined;
    return row ? toClient(row) : null;
  }

  async listClients(): Promise<Client[]> {
    return (this.db.prepare("SELECT id, name, created_at FROM clients ORDER BY created_at, id").all() as Row[]).map(toClient);
  }

  async listCredentials(clientId: string): Promise<StoredCredential[]> {
    return (this.db.prepare(`SELECT ${CREDENTIAL_COLUMNS} FROM credentials WHERE client_id = ? ORDER BY created_at, id`)
      .all(clientId) as Row[]).map(toCredential);
  }

  async insertSite(site: Site): Promise<void> {
    try {
      this.db.prepare("INSERT INTO sites (id, client_id, name, name_key, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(site.id, site.clientId, site.name, nameKey(site.name), site.createdAt);
    } catch (error) {
      if (isUniqueViolation(error, "sites.name_key")) {
        throw new DomainError("CONFLICT", "a site with this name already exists for this client");
      }
      throw error;
    }
  }

  async getSite(clientId: string, siteId: string): Promise<Site | null> {
    const row = this.db.prepare("SELECT id, client_id, name, created_at FROM sites WHERE client_id = ? AND id = ?")
      .get(clientId, siteId) as Row | undefined;
    return row ? toSite(row) : null;
  }

  async listSites(clientId: string): Promise<Site[]> {
    return (this.db.prepare("SELECT id, client_id, name, created_at FROM sites WHERE client_id = ? ORDER BY created_at, id")
      .all(clientId) as Row[]).map(toSite);
  }

  async insertCredential(credential: StoredCredential): Promise<void> {
    this.db.prepare(`INSERT INTO credentials (${CREDENTIAL_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      credential.id, credential.clientId, credential.siteId, JSON.stringify(credential.scopes),
      credential.secretHash, credential.createdAt, credential.revokedAt
    );
  }

  async findCredentialByHash(secretHash: string): Promise<StoredCredential | null> {
    const row = this.db.prepare(`SELECT ${CREDENTIAL_COLUMNS} FROM credentials WHERE secret_hash = ?`)
      .get(secretHash) as Row | undefined;
    return row ? toCredential(row) : null;
  }

  async revokeCredential(clientId: string, credentialId: string, revokedAt: string): Promise<boolean> {
    // COALESCE keeps the first revocation time: revoking twice is a no-op.
    const result = this.db.prepare(
      "UPDATE credentials SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND client_id = ?"
    ).run(revokedAt, credentialId, clientId);
    return Number(result.changes) > 0;
  }
}

export class SqliteEventStore implements EventStore {
  constructor(private readonly db: DatabaseSync) {}

  async append(clientId: string, event: NormalizedEvent): Promise<boolean> {
    if (event.clientId !== clientId) throw new Error("event clientId does not match partition");
    const result = this.db.prepare(
      "INSERT INTO events (client_id, id, received_at, body) VALUES (?, ?, ?, ?) ON CONFLICT (client_id, id) DO NOTHING"
    ).run(clientId, event.id, event.receivedAt, JSON.stringify(event));
    return Number(result.changes) === 1;
  }

  async get(clientId: string, eventId: string): Promise<NormalizedEvent | null> {
    const row = this.db.prepare("SELECT body FROM events WHERE client_id = ? AND id = ?")
      .get(clientId, eventId) as Row | undefined;
    return row ? JSON.parse(row.body as string) as NormalizedEvent : null;
  }

  async list(clientId: string, query: EventQuery): Promise<NormalizedEvent[]> {
    return (this.db.prepare(
      "SELECT body FROM events WHERE client_id = ? ORDER BY received_at DESC, id ASC LIMIT ?"
    ).all(clientId, query.limit) as Row[]).map((row) => JSON.parse(row.body as string) as NormalizedEvent);
  }
}

const CREDENTIAL_COLUMNS = "id, client_id, site_id, scopes, secret_hash, created_at, revoked_at";

function toClient(row: Row): Client {
  return { id: row.id as string, name: row.name as string, createdAt: row.created_at as string };
}

function toSite(row: Row): Site {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    name: row.name as string,
    createdAt: row.created_at as string
  };
}

function toCredential(row: Row): StoredCredential {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    siteId: (row.site_id as string | null) ?? null,
    scopes: JSON.parse(row.scopes as string) as CredentialScope[],
    secretHash: row.secret_hash as string,
    createdAt: row.created_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null
  };
}
