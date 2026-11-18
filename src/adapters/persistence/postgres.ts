import pg from "pg";
import type { NormalizedEvent } from "../../domain/event.js";
import {
  DomainError, nameKey,
  type Client, type CredentialScope, type Site, type StoredCredential
} from "../../domain/tenancy.js";
import type { EventQuery, EventStore, TenancyStore } from "../../ports/stores.js";

/**
 * Durable adapters on PostgreSQL.
 *
 * Tenant isolation is enforced twice:
 * 1. in code, every query is scoped by client_id (as in every adapter);
 * 2. in the database, row-level security (FORCE'd, so it also binds the table
 *    owner) only exposes rows whose client_id equals the transaction setting
 *    `app.client_id`. A query that forgets its WHERE clause returns nothing
 *    from other clients instead of leaking them.
 *
 * Two narrow, read-only exceptions use `app.scope`: `operator` lists clients
 * (operator API) and `auth` looks a credential up by its hash (authentication,
 * before the client is known). Events have no exception at all.
 *
 * The connecting role must not be a superuser nor have BYPASSRLS: startup is
 * refused otherwise, because RLS would be silently ignored.
 *
 * Migrations are append-only, numbered and recorded in aegis_schema_migrations;
 * they run under an advisory lock so concurrent starts are safe. Never edit a
 * shipped migration: add a new one.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE clients (
     id         text COLLATE "C" PRIMARY KEY,
     name       text NOT NULL,
     name_key   text NOT NULL,
     created_at timestamptz NOT NULL,
     CONSTRAINT clients_name_unique UNIQUE (name_key)
   );
   CREATE TABLE sites (
     id         text COLLATE "C" PRIMARY KEY,
     client_id  text COLLATE "C" NOT NULL REFERENCES clients(id),
     name       text NOT NULL,
     name_key   text NOT NULL,
     created_at timestamptz NOT NULL,
     CONSTRAINT sites_name_unique UNIQUE (client_id, name_key),
     CONSTRAINT sites_client_scope UNIQUE (client_id, id)
   );
   CREATE TABLE credentials (
     id          text COLLATE "C" PRIMARY KEY,
     client_id   text COLLATE "C" NOT NULL REFERENCES clients(id),
     site_id     text COLLATE "C",
     scopes      text[] NOT NULL CHECK (cardinality(scopes) > 0),
     secret_hash text COLLATE "C" NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
     created_at  timestamptz NOT NULL,
     revoked_at  timestamptz,
     CONSTRAINT credentials_hash_unique UNIQUE (secret_hash),
     -- A site-bound credential can only reference a site of the same client.
     CONSTRAINT credentials_site_same_client FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id)
   );
   CREATE INDEX credentials_by_client ON credentials(client_id);
   CREATE TABLE events (
     client_id   text COLLATE "C" NOT NULL REFERENCES clients(id),
     id          text COLLATE "C" NOT NULL,
     received_at timestamptz NOT NULL,
     body        jsonb NOT NULL,
     PRIMARY KEY (client_id, id)
   );
   CREATE INDEX events_by_recency ON events(client_id, received_at DESC, id);

   ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
   ALTER TABLE clients FORCE ROW LEVEL SECURITY;
   ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sites FORCE ROW LEVEL SECURITY;
   ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
   ALTER TABLE credentials FORCE ROW LEVEL SECURITY;
   ALTER TABLE events ENABLE ROW LEVEL SECURITY;
   ALTER TABLE events FORCE ROW LEVEL SECURITY;

   CREATE POLICY tenant ON clients
     USING (id = current_setting('app.client_id', true));
   CREATE POLICY operator_read ON clients FOR SELECT
     USING (current_setting('app.scope', true) = 'operator');
   CREATE POLICY tenant ON sites
     USING (client_id = current_setting('app.client_id', true));
   CREATE POLICY tenant ON credentials
     USING (client_id = current_setting('app.client_id', true));
   CREATE POLICY auth_lookup ON credentials FOR SELECT
     USING (current_setting('app.scope', true) = 'auth');
   CREATE POLICY tenant ON events
     USING (client_id = current_setting('app.client_id', true));`
];

const MIGRATION_LOCK = 0x4165_6769; // "Aegi": serializes concurrent migrators.

type Context = { clientId: string } | { scope: "operator" | "auth" };
type Row = Record<string, unknown>;

export interface PostgresPersistence {
  readonly tenancyStore: PostgresTenancyStore;
  readonly eventStore: PostgresEventStore;
  readonly schemaVersion: number;
  close(): Promise<void>;
}

/** Connects, refuses a role that would bypass RLS, and brings the schema up to date. */
export async function openPostgresPersistence(connectionString: string, poolSize = 10): Promise<PostgresPersistence> {
  const pool = new pg.Pool({ connectionString, max: poolSize });
  // An idle connection dropped by the server must not crash the process; the
  // pool replaces it. Only the error code is logged, never connection details.
  pool.on("error", (error: Error & { code?: string }) => {
    console.error(JSON.stringify({ level: "error", event: "persistence.connection_lost", code: error.code ?? "UNKNOWN" }));
  });
  try {
    await assertRlsApplies(pool);
    const schemaVersion = await migrate(pool);
    const db = new Db(pool);
    return {
      tenancyStore: new PostgresTenancyStore(db),
      eventStore: new PostgresEventStore(db),
      schemaVersion,
      close: () => pool.end()
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

async function assertRlsApplies(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
  const role = rows[0] as { rolsuper: boolean; rolbypassrls: boolean } | undefined;
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      "the database role is a superuser or has BYPASSRLS, so tenant row-level security would not apply; "
      + "connect with a dedicated non-superuser role (see docs/architecture.md, Durable storage)"
    );
  }
}

export async function migrate(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS aegis_schema_migrations (
      version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query("SELECT coalesce(max(version), 0) AS v FROM aegis_schema_migrations");
    const current = Number((rows[0] as { v: number }).v);
    if (current > MIGRATIONS.length) {
      throw new Error(`database schema v${current} is newer than this build (v${MIGRATIONS.length}); refusing to start`);
    }
    for (let version = current; version < MIGRATIONS.length; version++) {
      await client.query(MIGRATIONS[version]!);
      await client.query("INSERT INTO aegis_schema_migrations (version) VALUES ($1)", [version + 1]);
    }
    await client.query("COMMIT");
    return MIGRATIONS.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Runs each statement in a transaction whose RLS context is set first. */
class Db {
  constructor(private readonly pool: pg.Pool) {}

  async query(context: Context, sql: string, params: unknown[] = []): Promise<pg.QueryResult<Row>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.client_id', $1, true), set_config('app.scope', $2, true)", [
        "clientId" in context ? context.clientId : "",
        "scope" in context ? context.scope : ""
      ]);
      const result = await client.query<Row>(sql, params);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === "23505" && e.constraint === constraint;
}

export class PostgresTenancyStore implements TenancyStore {
  constructor(private readonly db: Db) {}

  async insertClient(client: Client): Promise<void> {
    try {
      await this.db.query({ clientId: client.id },
        "INSERT INTO clients (id, name, name_key, created_at) VALUES ($1, $2, $3, $4)",
        [client.id, client.name, nameKey(client.name), client.createdAt]);
    } catch (error) {
      if (isUniqueViolation(error, "clients_name_unique")) {
        throw new DomainError("CONFLICT", "a client with this name already exists");
      }
      throw error;
    }
  }

  async getClient(clientId: string): Promise<Client | null> {
    const { rows } = await this.db.query({ clientId },
      "SELECT id, name, created_at FROM clients WHERE id = $1", [clientId]);
    return rows[0] ? toClient(rows[0]) : null;
  }

  async listClients(): Promise<Client[]> {
    const { rows } = await this.db.query({ scope: "operator" },
      "SELECT id, name, created_at FROM clients ORDER BY created_at, id");
    return rows.map(toClient);
  }

  async listCredentials(clientId: string): Promise<StoredCredential[]> {
    const { rows } = await this.db.query({ clientId },
      `SELECT ${CREDENTIAL_COLUMNS} FROM credentials WHERE client_id = $1 ORDER BY created_at, id`, [clientId]);
    return rows.map(toCredential);
  }

  async insertSite(site: Site): Promise<void> {
    try {
      await this.db.query({ clientId: site.clientId },
        "INSERT INTO sites (id, client_id, name, name_key, created_at) VALUES ($1, $2, $3, $4, $5)",
        [site.id, site.clientId, site.name, nameKey(site.name), site.createdAt]);
    } catch (error) {
      if (isUniqueViolation(error, "sites_name_unique")) {
        throw new DomainError("CONFLICT", "a site with this name already exists for this client");
      }
      throw error;
    }
  }

  async getSite(clientId: string, siteId: string): Promise<Site | null> {
    const { rows } = await this.db.query({ clientId },
      "SELECT id, client_id, name, created_at FROM sites WHERE client_id = $1 AND id = $2", [clientId, siteId]);
    return rows[0] ? toSite(rows[0]) : null;
  }

  async listSites(clientId: string): Promise<Site[]> {
    const { rows } = await this.db.query({ clientId },
      "SELECT id, client_id, name, created_at FROM sites WHERE client_id = $1 ORDER BY created_at, id", [clientId]);
    return rows.map(toSite);
  }

  async insertCredential(credential: StoredCredential): Promise<void> {
    await this.db.query({ clientId: credential.clientId },
      `INSERT INTO credentials (${CREDENTIAL_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [credential.id, credential.clientId, credential.siteId, [...credential.scopes],
        credential.secretHash, credential.createdAt, credential.revokedAt]);
  }

  async findCredentialByHash(secretHash: string): Promise<StoredCredential | null> {
    const { rows } = await this.db.query({ scope: "auth" },
      `SELECT ${CREDENTIAL_COLUMNS} FROM credentials WHERE secret_hash = $1`, [secretHash]);
    return rows[0] ? toCredential(rows[0]) : null;
  }

  async revokeCredential(clientId: string, credentialId: string, revokedAt: string): Promise<boolean> {
    // COALESCE keeps the first revocation time: revoking twice is a no-op.
    const result = await this.db.query({ clientId },
      "UPDATE credentials SET revoked_at = COALESCE(revoked_at, $1) WHERE id = $2 AND client_id = $3",
      [revokedAt, credentialId, clientId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresEventStore implements EventStore {
  constructor(private readonly db: Db) {}

  async append(clientId: string, event: NormalizedEvent): Promise<boolean> {
    if (event.clientId !== clientId) throw new Error("event clientId does not match partition");
    const result = await this.db.query({ clientId },
      "INSERT INTO events (client_id, id, received_at, body) VALUES ($1, $2, $3, $4) ON CONFLICT (client_id, id) DO NOTHING",
      [clientId, event.id, event.receivedAt, JSON.stringify(event)]);
    return result.rowCount === 1;
  }

  async get(clientId: string, eventId: string): Promise<NormalizedEvent | null> {
    const { rows } = await this.db.query({ clientId },
      "SELECT body FROM events WHERE client_id = $1 AND id = $2", [clientId, eventId]);
    return rows[0] ? rows[0].body as NormalizedEvent : null;
  }

  async list(clientId: string, query: EventQuery): Promise<NormalizedEvent[]> {
    const { rows } = await this.db.query({ clientId },
      "SELECT body FROM events WHERE client_id = $1 ORDER BY received_at DESC, id ASC LIMIT $2",
      [clientId, query.limit]);
    return rows.map((row) => row.body as NormalizedEvent);
  }
}

const CREDENTIAL_COLUMNS = "id, client_id, site_id, scopes, secret_hash, created_at, revoked_at";

const iso = (value: unknown): string => (value as Date).toISOString();

function toClient(row: Row): Client {
  return { id: row.id as string, name: row.name as string, createdAt: iso(row.created_at) };
}

function toSite(row: Row): Site {
  return { id: row.id as string, clientId: row.client_id as string, name: row.name as string, createdAt: iso(row.created_at) };
}

function toCredential(row: Row): StoredCredential {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    siteId: (row.site_id as string | null) ?? null,
    scopes: row.scopes as CredentialScope[],
    secretHash: row.secret_hash as string,
    createdAt: iso(row.created_at),
    revokedAt: row.revoked_at === null ? null : iso(row.revoked_at)
  };
}
