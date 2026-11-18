import pg from "pg";
import type {
  Asset, Contact, HealthPenalty, HealthSnapshot, SiteNetworkStatus, Ticket, UpsertResult
} from "../../domain/estate.js";
import { SEVERITIES, type NormalizedEvent, type Severity } from "../../domain/event.js";
import {
  DomainError, nameKey,
  type Client, type CredentialScope, type Site, type StoredCredential
} from "../../domain/tenancy.js";
import type {
  EstateStore, EventCountQuery, EventQuery, EventStore, HealthSnapshotStore, SupportStore, TenancyStore, TicketQuery
} from "../../ports/stores.js";

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
     USING (client_id = current_setting('app.client_id', true));`,

  // v2: site city, client estate (assets, network, contacts, tickets) and monthly health snapshots.
  `ALTER TABLE sites ADD COLUMN city text;

   CREATE TABLE assets (
     client_id              text COLLATE "C" NOT NULL REFERENCES clients(id),
     id                     text COLLATE "C" NOT NULL,
     site_id                text COLLATE "C",
     kind                   text NOT NULL CHECK (kind IN ('workstation', 'server')),
     hostname               text NOT NULL,
     os                     text NOT NULL,
     hardware               text,
     user_name              text,
     last_seen_at           timestamptz NOT NULL,
     antivirus              text NOT NULL CHECK (antivirus IN ('ok', 'disabled', 'outdated', 'unknown')),
     firewall               text NOT NULL CHECK (firewall IN ('ok', 'disabled', 'outdated', 'unknown')),
     pending_updates        integer NOT NULL CHECK (pending_updates >= 0),
     critical_updates       integer NOT NULL CHECK (critical_updates >= 0),
     last_backup_success_at timestamptz,
     backup_required        boolean NOT NULL,
     source                 text NOT NULL,
     observed_at            timestamptz NOT NULL,
     PRIMARY KEY (client_id, id),
     CONSTRAINT assets_site_same_client FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id)
   );
   CREATE TABLE site_network_status (
     client_id   text COLLATE "C" NOT NULL REFERENCES clients(id),
     site_id     text COLLATE "C" NOT NULL,
     box         text NOT NULL CHECK (box IN ('up', 'down', 'unknown')),
     vpn         text NOT NULL CHECK (vpn IN ('up', 'down', 'unknown')),
     internet    text NOT NULL CHECK (internet IN ('up', 'down', 'unknown')),
     observed_at timestamptz NOT NULL,
     PRIMARY KEY (client_id, site_id),
     CONSTRAINT site_network_same_client FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id)
   );
   CREATE TABLE contacts (
     client_id text COLLATE "C" NOT NULL REFERENCES clients(id),
     id        text COLLATE "C" NOT NULL,
     name      text NOT NULL,
     role      text NOT NULL,
     phone     text,
     email     text,
     PRIMARY KEY (client_id, id)
   );
   CREATE TABLE tickets (
     client_id    text COLLATE "C" NOT NULL REFERENCES clients(id),
     id           text COLLATE "C" NOT NULL,
     site_id      text COLLATE "C",
     channel      text NOT NULL CHECK (channel IN ('whatsapp', 'web')),
     external_ref text NOT NULL,
     title        text NOT NULL,
     status       text NOT NULL CHECK (status IN ('open', 'closed')),
     opened_at    timestamptz NOT NULL,
     closed_at    timestamptz,
     PRIMARY KEY (client_id, id),
     CONSTRAINT tickets_external_unique UNIQUE (client_id, channel, external_ref),
     CONSTRAINT tickets_site_same_client FOREIGN KEY (client_id, site_id) REFERENCES sites(client_id, id)
   );
   CREATE INDEX tickets_by_status ON tickets(client_id, status, opened_at DESC);
   CREATE TABLE health_snapshots (
     client_id       text COLLATE "C" NOT NULL REFERENCES clients(id),
     period          text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
     score           integer NOT NULL CHECK (score BETWEEN 0 AND 100),
     band            text NOT NULL CHECK (band IN ('healthy', 'watch', 'critical')),
     ruleset_version text NOT NULL,
     penalties       jsonb NOT NULL,
     computed_at     timestamptz NOT NULL,
     PRIMARY KEY (client_id, period)
   );

   ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
   ALTER TABLE assets FORCE ROW LEVEL SECURITY;
   ALTER TABLE site_network_status ENABLE ROW LEVEL SECURITY;
   ALTER TABLE site_network_status FORCE ROW LEVEL SECURITY;
   ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
   ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
   ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
   ALTER TABLE tickets FORCE ROW LEVEL SECURITY;
   ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
   ALTER TABLE health_snapshots FORCE ROW LEVEL SECURITY;

   CREATE POLICY tenant ON assets USING (client_id = current_setting('app.client_id', true));
   CREATE POLICY tenant ON site_network_status USING (client_id = current_setting('app.client_id', true));
   CREATE POLICY tenant ON contacts USING (client_id = current_setting('app.client_id', true));
   CREATE POLICY tenant ON tickets USING (client_id = current_setting('app.client_id', true));
   CREATE POLICY tenant ON health_snapshots USING (client_id = current_setting('app.client_id', true));`
];

const MIGRATION_LOCK = 0x4165_6769; // "Aegi": serializes concurrent migrators.

type Context = { clientId: string } | { scope: "operator" | "auth" };
type Row = Record<string, unknown>;

export interface PostgresPersistence {
  readonly tenancyStore: PostgresTenancyStore;
  readonly eventStore: PostgresEventStore;
  readonly estateStore: PostgresEstateStore;
  readonly supportStore: PostgresSupportStore;
  readonly snapshotStore: PostgresSnapshotStore;
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
      estateStore: new PostgresEstateStore(db),
      supportStore: new PostgresSupportStore(db),
      snapshotStore: new PostgresSnapshotStore(db),
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
        "INSERT INTO sites (id, client_id, name, name_key, city, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [site.id, site.clientId, site.name, nameKey(site.name), site.city ?? null, site.createdAt]);
    } catch (error) {
      if (isUniqueViolation(error, "sites_name_unique")) {
        throw new DomainError("CONFLICT", "a site with this name already exists for this client");
      }
      throw error;
    }
  }

  async getSite(clientId: string, siteId: string): Promise<Site | null> {
    const { rows } = await this.db.query({ clientId },
      "SELECT id, client_id, name, city, created_at FROM sites WHERE client_id = $1 AND id = $2", [clientId, siteId]);
    return rows[0] ? toSite(rows[0]) : null;
  }

  async listSites(clientId: string): Promise<Site[]> {
    const { rows } = await this.db.query({ clientId },
      "SELECT id, client_id, name, city, created_at FROM sites WHERE client_id = $1 ORDER BY created_at, id", [clientId]);
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
    const params: unknown[] = [clientId];
    const filters = ["client_id = $1"];
    if (query.since !== undefined) filters.push(`received_at >= $${params.push(query.since)}`);
    if (query.until !== undefined) filters.push(`received_at < $${params.push(query.until)}`);
    if (query.categories !== undefined) filters.push(`body->>'category' = ANY($${params.push([...query.categories])}::text[])`);
    const limit = `$${params.push(query.limit)}`;
    const { rows } = await this.db.query({ clientId },
      `SELECT body FROM events WHERE ${filters.join(" AND ")} ORDER BY received_at DESC, id ASC LIMIT ${limit}`,
      params);
    return rows.map((row) => row.body as NormalizedEvent);
  }

  async countBySeverity(clientId: string, query: EventCountQuery): Promise<Record<Severity, number>> {
    const params: unknown[] = [clientId, query.since, query.until];
    const filters = ["client_id = $1", "received_at >= $2", "received_at < $3"];
    if (query.category !== undefined) filters.push(`body->>'category' = $${params.push(query.category)}`);
    const { rows } = await this.db.query({ clientId },
      `SELECT body->>'severity' AS severity, count(*)::int AS n FROM events WHERE ${filters.join(" AND ")} GROUP BY 1`,
      params);
    const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<Severity, number>;
    for (const row of rows) counts[row.severity as Severity] = Number(row.n);
    return counts;
  }
}

/**
 * Idempotent upsert: the WHERE clause skips the write when the stored row is
 * identical, so an unchanged record reports rowCount 0 and costs no new tuple.
 * `xmax = 0` is true only for a row inserted by this very statement.
 */
function outcome(result: pg.QueryResult<Row>): UpsertResult {
  if ((result.rowCount ?? 0) === 0) return "unchanged";
  return result.rows[0]?.inserted === true ? "created" : "updated";
}

export class PostgresEstateStore implements EstateStore {
  constructor(private readonly db: Db) {}

  async upsertAsset(clientId: string, asset: Asset): Promise<UpsertResult> {
    requireSameClient(clientId, asset.clientId);
    return outcome(await this.db.query({ clientId },
      `INSERT INTO assets AS t (${ASSET_COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (client_id, id) DO UPDATE SET ${assignments(ASSET_COLUMNS, 2)}
       WHERE (t.*) IS DISTINCT FROM (EXCLUDED.*)
       RETURNING (xmax = 0) AS inserted`,
      [asset.clientId, asset.id, asset.siteId, asset.kind, asset.hostname, asset.os, asset.hardware, asset.user,
        asset.lastSeenAt, asset.antivirus, asset.firewall, asset.pendingUpdates, asset.criticalUpdates,
        asset.lastBackupSuccessAt, asset.backupRequired, asset.source, asset.observedAt]));
  }

  async listAssets(clientId: string): Promise<Asset[]> {
    const { rows } = await this.db.query({ clientId },
      `SELECT ${ASSET_COLUMNS} FROM assets WHERE client_id = $1 ORDER BY hostname COLLATE "C", id`, [clientId]);
    return rows.map(toAsset);
  }

  async upsertSiteNetwork(clientId: string, status: SiteNetworkStatus): Promise<UpsertResult> {
    requireSameClient(clientId, status.clientId);
    return outcome(await this.db.query({ clientId },
      `INSERT INTO site_network_status AS t (${NETWORK_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id, site_id) DO UPDATE SET ${assignments(NETWORK_COLUMNS, 2)}
       WHERE (t.*) IS DISTINCT FROM (EXCLUDED.*)
       RETURNING (xmax = 0) AS inserted`,
      [status.clientId, status.siteId, status.box, status.vpn, status.internet, status.observedAt]));
  }

  async listSiteNetwork(clientId: string): Promise<SiteNetworkStatus[]> {
    const { rows } = await this.db.query({ clientId },
      `SELECT ${NETWORK_COLUMNS} FROM site_network_status WHERE client_id = $1 ORDER BY site_id`, [clientId]);
    return rows.map((row) => ({
      clientId: row.client_id as string, siteId: row.site_id as string,
      box: row.box as SiteNetworkStatus["box"], vpn: row.vpn as SiteNetworkStatus["vpn"],
      internet: row.internet as SiteNetworkStatus["internet"], observedAt: iso(row.observed_at)
    }));
  }
}

export class PostgresSupportStore implements SupportStore {
  constructor(private readonly db: Db) {}

  async upsertContact(clientId: string, contact: Contact): Promise<UpsertResult> {
    requireSameClient(clientId, contact.clientId);
    return outcome(await this.db.query({ clientId },
      `INSERT INTO contacts AS t (${CONTACT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id, id) DO UPDATE SET ${assignments(CONTACT_COLUMNS, 2)}
       WHERE (t.*) IS DISTINCT FROM (EXCLUDED.*)
       RETURNING (xmax = 0) AS inserted`,
      [contact.clientId, contact.id, contact.name, contact.role, contact.phone, contact.email]));
  }

  async listContacts(clientId: string): Promise<Contact[]> {
    const { rows } = await this.db.query({ clientId },
      `SELECT ${CONTACT_COLUMNS} FROM contacts WHERE client_id = $1 ORDER BY name COLLATE "C", id`, [clientId]);
    return rows.map((row) => ({
      id: row.id as string, clientId: row.client_id as string, name: row.name as string, role: row.role as string,
      phone: (row.phone as string | null) ?? null, email: (row.email as string | null) ?? null
    }));
  }

  async upsertTicket(clientId: string, ticket: Ticket): Promise<UpsertResult> {
    requireSameClient(clientId, ticket.clientId);
    // The id is not updated and not compared: (channel, external_ref) is the idempotency key.
    return outcome(await this.db.query({ clientId },
      `INSERT INTO tickets AS t (${TICKET_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_id, channel, external_ref) DO UPDATE
         SET site_id = EXCLUDED.site_id, title = EXCLUDED.title, status = EXCLUDED.status,
             opened_at = EXCLUDED.opened_at, closed_at = EXCLUDED.closed_at
       WHERE (t.site_id, t.title, t.status, t.opened_at, t.closed_at)
         IS DISTINCT FROM (EXCLUDED.site_id, EXCLUDED.title, EXCLUDED.status, EXCLUDED.opened_at, EXCLUDED.closed_at)
       RETURNING (xmax = 0) AS inserted`,
      [ticket.clientId, ticket.id, ticket.siteId, ticket.channel, ticket.externalRef, ticket.title, ticket.status,
        ticket.openedAt, ticket.closedAt]));
  }

  async listTickets(clientId: string, query: TicketQuery = {}): Promise<Ticket[]> {
    const params: unknown[] = [clientId];
    const filters = ["client_id = $1"];
    if (query.status !== undefined) filters.push(`status = $${params.push(query.status)}`);
    if (query.closedSince !== undefined) filters.push(`closed_at >= $${params.push(query.closedSince)}`);
    if (query.closedUntil !== undefined) filters.push(`closed_at < $${params.push(query.closedUntil)}`);
    const { rows } = await this.db.query({ clientId },
      `SELECT ${TICKET_COLUMNS} FROM tickets WHERE ${filters.join(" AND ")} ORDER BY opened_at DESC, id`, params);
    return rows.map((row) => ({
      id: row.id as string, clientId: row.client_id as string, siteId: (row.site_id as string | null) ?? null,
      channel: row.channel as Ticket["channel"], externalRef: row.external_ref as string, title: row.title as string,
      status: row.status as Ticket["status"], openedAt: iso(row.opened_at),
      closedAt: row.closed_at === null ? null : iso(row.closed_at)
    }));
  }
}

export class PostgresSnapshotStore implements HealthSnapshotStore {
  constructor(private readonly db: Db) {}

  async putSnapshot(clientId: string, snapshot: HealthSnapshot): Promise<boolean> {
    requireSameClient(clientId, snapshot.clientId);
    const result = await this.db.query({ clientId },
      `INSERT INTO health_snapshots (${SNAPSHOT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (client_id, period) DO NOTHING`,
      [snapshot.clientId, snapshot.period, snapshot.score, snapshot.band, snapshot.rulesetVersion,
        JSON.stringify(snapshot.penalties), snapshot.computedAt]);
    return result.rowCount === 1;
  }

  async getSnapshot(clientId: string, period: string): Promise<HealthSnapshot | null> {
    const { rows } = await this.db.query({ clientId },
      `SELECT ${SNAPSHOT_COLUMNS} FROM health_snapshots WHERE client_id = $1 AND period = $2`, [clientId, period]);
    const row = rows[0];
    return row ? {
      clientId: row.client_id as string, period: row.period as string, score: Number(row.score),
      band: row.band as HealthSnapshot["band"], rulesetVersion: row.ruleset_version as string,
      penalties: row.penalties as HealthPenalty[], computedAt: iso(row.computed_at)
    } : null;
  }
}

function requireSameClient(clientId: string, recordClientId: string): void {
  if (clientId !== recordClientId) throw new Error("record clientId does not match partition");
}

/** `col = EXCLUDED.col` for every column after the first `skip` key columns. */
function assignments(columns: string, skip: number): string {
  return columns.split(", ").slice(skip).map((column) => `${column} = EXCLUDED.${column}`).join(", ");
}

const ASSET_COLUMNS = "client_id, id, site_id, kind, hostname, os, hardware, user_name, last_seen_at, antivirus, "
  + "firewall, pending_updates, critical_updates, last_backup_success_at, backup_required, source, observed_at";
const NETWORK_COLUMNS = "client_id, site_id, box, vpn, internet, observed_at";
const CONTACT_COLUMNS = "client_id, id, name, role, phone, email";
const TICKET_COLUMNS = "client_id, id, site_id, channel, external_ref, title, status, opened_at, closed_at";
const SNAPSHOT_COLUMNS = "client_id, period, score, band, ruleset_version, penalties, computed_at";
const CREDENTIAL_COLUMNS = "id, client_id, site_id, scopes, secret_hash, created_at, revoked_at";

const iso = (value: unknown): string => (value as Date).toISOString();

function toClient(row: Row): Client {
  return { id: row.id as string, name: row.name as string, createdAt: iso(row.created_at) };
}

function toSite(row: Row): Site {
  const site = { id: row.id as string, clientId: row.client_id as string, name: row.name as string, createdAt: iso(row.created_at) };
  return row.city === null ? site : { ...site, city: row.city as string };
}

function toAsset(row: Row): Asset {
  const nullableIso = (value: unknown) => (value === null ? null : iso(value));
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    siteId: (row.site_id as string | null) ?? null,
    kind: row.kind as Asset["kind"],
    hostname: row.hostname as string,
    os: row.os as string,
    hardware: (row.hardware as string | null) ?? null,
    user: (row.user_name as string | null) ?? null,
    lastSeenAt: iso(row.last_seen_at),
    antivirus: row.antivirus as Asset["antivirus"],
    firewall: row.firewall as Asset["firewall"],
    pendingUpdates: Number(row.pending_updates),
    criticalUpdates: Number(row.critical_updates),
    lastBackupSuccessAt: nullableIso(row.last_backup_success_at),
    backupRequired: row.backup_required as boolean,
    source: row.source as string,
    observedAt: iso(row.observed_at)
  };
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
