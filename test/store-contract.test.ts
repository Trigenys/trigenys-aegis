import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import pg from "pg";
import {
  InMemoryEstateStore, InMemoryEventStore, InMemorySnapshotStore, InMemorySupportStore, InMemoryTenancyStore
} from "../src/adapters/persistence/memory.js";
import { MIGRATIONS, openPostgresPersistence } from "../src/adapters/persistence/postgres.js";
import { createCockpit } from "../src/composition.js";
import type { Asset, Contact, HealthSnapshot, SiteNetworkStatus, Ticket } from "../src/domain/estate.js";
import { EVENT_SCHEMA_VERSION, type NormalizedEvent } from "../src/domain/event.js";
import { DomainError, type StoredCredential } from "../src/domain/tenancy.js";
import type { EstateStore, EventStore, HealthSnapshotStore, SupportStore, TenancyStore } from "../src/ports/stores.js";
import { createTestDatabase, loadFixture, PG_ADMIN_URL } from "./helpers.js";

interface Stores {
  tenancy: TenancyStore;
  events: EventStore;
  estate: EstateStore;
  support: SupportStore;
  snapshots: HealthSnapshotStore;
}

/** Every persistence adapter must pass the same contract. */
const ADAPTERS: Record<string, (t: TestContext) => Promise<Stores>> = {
  memory: async () => {
    const tenancy = new InMemoryTenancyStore();
    return {
      tenancy, events: new InMemoryEventStore(), estate: new InMemoryEstateStore(tenancy),
      support: new InMemorySupportStore(tenancy), snapshots: new InMemorySnapshotStore(tenancy)
    };
  },
  postgres: async (t) => {
    const tdb = await createTestDatabase(t);
    const db = await openPostgresPersistence(tdb.url);
    tdb.defer(() => db.close());
    return {
      tenancy: db.tenancyStore, events: db.eventStore, estate: db.estateStore,
      support: db.supportStore, snapshots: db.snapshotStore
    };
  }
};
const NO_PG = PG_ADMIN_URL ? false : "AEGIS_TEST_DATABASE_URL not set: PostgreSQL integration tests skipped";
const skipFor = (adapter: string) => (adapter === "postgres" ? NO_PG : false);

const T0 = "2026-11-18T10:00:00.000Z";
const client = (id: string, name = id) => ({ id, name, createdAt: T0 });
const credential = (over: Partial<StoredCredential>): StoredCredential => ({
  id: "cred-1", clientId: "a", siteId: null, scopes: ["events:ingest"],
  secretHash: "a".repeat(64), createdAt: T0, revokedAt: null, ...over
});
const event = (clientId: string, id: string, receivedAt: string): NormalizedEvent => ({
  schemaVersion: EVENT_SCHEMA_VERSION,
  id,
  clientId,
  siteId: null,
  receivedAt,
  occurredAt: receivedAt,
  category: "authentication",
  severity: "low",
  title: `event ${id}`,
  source: { type: "wazuh", adapterVersion: "1.0.0", eventId: id },
  attributes: {}
} as unknown as NormalizedEvent);
const site = (clientId: string, id: string, city?: string) => ({
  id, clientId, name: `Site ${id}`, ...(city ? { city } : {}), createdAt: T0
});
const asset = (clientId: string, id: string, over: Partial<Asset> = {}): Asset => ({
  id, clientId, siteId: null, kind: "workstation", hostname: `HOST-${id}`, os: "Windows 11 Pro", hardware: null,
  user: null, lastSeenAt: T0, antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0,
  lastBackupSuccessAt: null, backupRequired: true, source: "test", observedAt: T0, ...over
});
const ticket = (clientId: string, id: string, ref: string, over: Partial<Ticket> = {}): Ticket => ({
  id, clientId, siteId: null, channel: "whatsapp", externalRef: ref, title: `Ticket ${ref}`, status: "open",
  openedAt: T0, closedAt: null, ...over
});
/** Adapters differ in the wording but not in refusing: a DomainError or a partition/foreign-key violation. */
const isDomainOrPartitionError = (error: unknown) =>
  error instanceof DomainError || /partition|foreign key|violates|not found|belong/i.test(String((error as Error)?.message));
const isConflict = (error: unknown) => error instanceof DomainError && error.code === "CONFLICT";

for (const [name, open] of Object.entries(ADAPTERS)) {
  test(`store contract [${name}]: clients and sites`, { skip: skipFor(name) }, async (t) => {
    const { tenancy } = await open(t);
    await tenancy.insertClient(client("a", "Garage Martin"));
    await tenancy.insertClient(client("b", "Boulangerie"));
    await assert.rejects(tenancy.insertClient(client("c", " GARAGE  MARTÍN ")), isConflict, "name collides on nameKey");
    assert.deepEqual(await tenancy.getClient("a"), client("a", "Garage Martin"));
    assert.equal(await tenancy.getClient("zz"), null);
    assert.equal((await tenancy.listClients()).length, 2);

    const site = { id: "s1", clientId: "a", name: "Siège", createdAt: T0 };
    await tenancy.insertSite(site);
    await assert.rejects(tenancy.insertSite({ ...site, id: "s2", name: "SIEGE" }), isConflict);
    await tenancy.insertSite({ ...site, id: "s3", clientId: "b" }); // same name, other client: fine
    await assert.rejects(tenancy.insertSite({ ...site, id: "s4", clientId: "zz" }), "unknown client");
    assert.deepEqual(await tenancy.getSite("a", "s1"), site);
    assert.equal(await tenancy.getSite("b", "s1"), null, "a site is only visible through its client");
    assert.deepEqual((await tenancy.listSites("a")).map((s) => s.id), ["s1"]);
  });

  test(`store contract [${name}]: credentials`, { skip: skipFor(name) }, async (t) => {
    const { tenancy } = await open(t);
    await tenancy.insertClient(client("a"));
    await tenancy.insertClient(client("b"));
    await tenancy.insertSite({ id: "sb", clientId: "b", name: "B1", createdAt: T0 });
    await tenancy.insertSite({ id: "sa", clientId: "a", name: "A1", createdAt: T0 });

    const stored = credential({ siteId: "sa", scopes: ["events:ingest", "events:read"] });
    await tenancy.insertCredential(stored);
    assert.deepEqual(await tenancy.findCredentialByHash(stored.secretHash), stored);
    assert.equal(await tenancy.findCredentialByHash("0".repeat(64)), null);
    await assert.rejects(tenancy.insertCredential(credential({ id: "x", secretHash: "b".repeat(64), siteId: "sb" })),
      "a credential cannot be bound to another client's site");
    await assert.rejects(tenancy.insertCredential(credential({ id: "y" })), "secret hashes are unique");
    assert.equal((await tenancy.listCredentials("a")).length, 1);
    assert.equal((await tenancy.listCredentials("b")).length, 0);

    assert.equal(await tenancy.revokeCredential("b", stored.id, "2026-11-18T11:00:00.000Z"), false);
    assert.equal(await tenancy.revokeCredential("a", stored.id, "2026-11-18T11:00:00.000Z"), true);
    assert.equal(await tenancy.revokeCredential("a", stored.id, "2026-11-18T12:00:00.000Z"), true);
    assert.equal((await tenancy.findCredentialByHash(stored.secretHash))?.revokedAt, "2026-11-18T11:00:00.000Z",
      "the first revocation time is kept");
    assert.equal(await tenancy.revokeCredential("a", "missing", T0), false);
  });

  test(`store contract [${name}]: events are partitioned, idempotent and ordered`, { skip: skipFor(name) }, async (t) => {
    const { tenancy, events } = await open(t);
    await tenancy.insertClient(client("a"));
    await tenancy.insertClient(client("b"));
    const e1 = event("a", "1".repeat(64), "2026-11-18T10:00:00.000Z");
    const e2 = event("a", "2".repeat(64), "2026-11-18T10:05:00.000Z");
    const e3 = event("a", "0".repeat(64), "2026-11-18T10:05:00.000Z");
    for (const e of [e1, e2, e3]) assert.equal(await events.append("a", e), true);
    assert.equal(await events.append("a", e1), false, "replay is a no-op");
    await assert.rejects(events.append("b", e1), /does not match partition/);

    assert.deepEqual((await events.list("a", { limit: 10 })).map((e) => e.id), [e3.id, e2.id, e1.id],
      "most recent first, ties by id");
    assert.deepEqual((await events.list("a", { limit: 1 })).map((e) => e.id), [e3.id]);
    assert.deepEqual(await events.get("a", e2.id), e2);
    assert.equal(await events.get("b", e2.id), null);
    assert.deepEqual(await events.list("b", { limit: 10 }), []);
  });

  test(`store contract [${name}]: estate upserts are idempotent and partitioned per client`, { skip: skipFor(name) }, async (t) => {
    const { tenancy, estate } = await open(t);
    await tenancy.insertClient(client("a"));
    await tenancy.insertClient(client("b"));
    await tenancy.insertSite(site("a", "sa", "Douala"));
    await tenancy.insertSite(site("b", "sb"));
    assert.equal((await tenancy.getSite("a", "sa"))?.city, "Douala");
    assert.equal((await tenancy.getSite("b", "sb"))?.city ?? null, null);

    const a1 = asset("a", "a1", { siteId: "sa" });
    assert.equal(await estate.upsertAsset("a", a1), "created");
    assert.equal(await estate.upsertAsset("a", a1), "unchanged", "replay is a no-op");
    assert.equal(await estate.upsertAsset("a", { ...a1, pendingUpdates: 3 }), "updated");
    assert.equal(await estate.upsertAsset("a", { ...a1, pendingUpdates: 3 }), "unchanged");
    await estate.upsertAsset("b", asset("b", "b1"));
    assert.deepEqual((await estate.listAssets("a")).map((x) => x.id), ["a1"]);
    assert.deepEqual((await estate.listAssets("b")).map((x) => x.id), ["b1"]);
    assert.deepEqual(await estate.listAssets("zz"), []);
    await assert.rejects(estate.upsertAsset("b", a1), isDomainOrPartitionError,
      "a record cannot be written into another client partition");
    await assert.rejects(estate.upsertAsset("b", asset("b", "b2", { siteId: "sa" })), isDomainOrPartitionError,
      "a site of another client cannot be referenced");
    assert.deepEqual((await estate.listAssets("b")).map((x) => x.id), ["b1"], "nothing leaked from the refused writes");

    const net: SiteNetworkStatus = { clientId: "a", siteId: "sa", box: "up", vpn: "down", internet: "up", observedAt: T0 };
    assert.equal(await estate.upsertSiteNetwork("a", net), "created");
    assert.equal(await estate.upsertSiteNetwork("a", net), "unchanged");
    assert.equal(await estate.upsertSiteNetwork("a", { ...net, vpn: "up" }), "updated");
    assert.deepEqual((await estate.listSiteNetwork("a")).map((x) => x.vpn), ["up"]);
    assert.deepEqual(await estate.listSiteNetwork("b"), []);
    await assert.rejects(estate.upsertSiteNetwork("b", { ...net, clientId: "b" }), isDomainOrPartitionError);
  });

  test(`store contract [${name}]: contacts, tickets and snapshots`, { skip: skipFor(name) }, async (t) => {
    const { tenancy, support, snapshots } = await open(t);
    await tenancy.insertClient(client("a"));
    await tenancy.insertClient(client("b"));
    await tenancy.insertSite(site("a", "sa"));

    const contact: Contact = { id: "c1", clientId: "a", name: "Awa", role: "Dirigeante", phone: null, email: "awa@exemple.test" };
    assert.equal(await support.upsertContact("a", contact), "created");
    assert.equal(await support.upsertContact("a", contact), "unchanged");
    assert.equal(await support.upsertContact("a", { ...contact, role: "Gérante" }), "updated");
    assert.deepEqual((await support.listContacts("a")).map((c) => c.role), ["Gérante"]);
    assert.deepEqual(await support.listContacts("b"), []);

    const open1 = ticket("a", "t1", "WA-1", { siteId: "sa", openedAt: "2026-11-10T08:00:00.000Z" });
    assert.equal(await support.upsertTicket("a", open1), "created");
    assert.equal(await support.upsertTicket("a", open1), "unchanged");
    const closed = { ...open1, id: "other-id", status: "closed" as const, closedAt: "2026-11-12T08:00:00.000Z" };
    assert.equal(await support.upsertTicket("a", closed), "updated", "keyed by channel and external reference");
    const listed = await support.listTickets("a");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.id, "t1", "the id given at creation is kept");
    assert.equal(listed[0]!.status, "closed");
    await support.upsertTicket("a", ticket("a", "t2", "WA-2", { openedAt: "2026-11-15T08:00:00.000Z" }));
    assert.deepEqual((await support.listTickets("a")).map((x) => x.externalRef), ["WA-2", "WA-1"], "most recently opened first");
    assert.deepEqual((await support.listTickets("a", { status: "open" })).map((x) => x.externalRef), ["WA-2"]);
    assert.deepEqual(
      (await support.listTickets("a", { closedSince: "2026-11-01T00:00:00.000Z", closedUntil: "2026-12-01T00:00:00.000Z" }))
        .map((x) => x.externalRef), ["WA-1"]);
    assert.deepEqual(await support.listTickets("b"), []);
    await assert.rejects(support.upsertTicket("b", ticket("b", "t3", "WA-3", { siteId: "sa" })), isDomainOrPartitionError,
      "a site of another client cannot be referenced");

    const snapshot: HealthSnapshot = {
      clientId: "a", period: "2026-10", score: 68, band: "watch", rulesetVersion: "v1",
      penalties: [{ ruleId: "backup.stale", label: "Sauvegardes", detail: "d", points: 8, assetIds: ["a1"] }],
      computedAt: T0
    };
    assert.equal(await snapshots.putSnapshot("a", snapshot), true);
    assert.equal(await snapshots.putSnapshot("a", { ...snapshot, score: 1 }), false, "a closed month is never rewritten");
    assert.deepEqual(await snapshots.getSnapshot("a", "2026-10"), snapshot);
    assert.equal(await snapshots.getSnapshot("b", "2026-10"), null);
    assert.equal(await snapshots.getSnapshot("a", "2026-09"), null);
  });

  test(`store contract [${name}]: event filters and severity counts`, { skip: skipFor(name) }, async (t) => {
    const { tenancy, events } = await open(t);
    await tenancy.insertClient(client("a"));
    await tenancy.insertClient(client("b"));
    const make = (clientId: string, id: string, receivedAt: string, severity: string, category: string) =>
      ({ ...event(clientId, id, receivedAt), severity, category }) as unknown as NormalizedEvent;
    await events.append("a", make("a", "1".repeat(64), "2026-11-01T00:00:00.000Z", "high", "security_alert"));
    await events.append("a", make("a", "2".repeat(64), "2026-11-10T00:00:00.000Z", "high", "security_alert"));
    await events.append("a", make("a", "3".repeat(64), "2026-11-20T00:00:00.000Z", "critical", "security_alert"));
    await events.append("a", make("a", "4".repeat(64), "2026-11-12T00:00:00.000Z", "low", "inventory"));
    await events.append("b", make("b", "5".repeat(64), "2026-11-10T00:00:00.000Z", "critical", "security_alert"));

    assert.equal((await events.list("a", { limit: 50, since: "2026-11-10T00:00:00.000Z" })).length, 3, "since is inclusive");
    assert.equal((await events.list("a", { limit: 50, until: "2026-11-10T00:00:00.000Z" })).length, 1, "until is exclusive");
    assert.equal((await events.list("a", { limit: 50, categories: ["inventory"] })).length, 1);
    const counts = await events.countBySeverity("a", {
      since: "2026-11-01T00:00:00.000Z", until: "2026-12-01T00:00:00.000Z", category: "security_alert"
    });
    assert.deepEqual(counts, { info: 0, low: 0, medium: 0, high: 2, critical: 1 });
    const narrow = await events.countBySeverity("a", { since: "2026-11-05T00:00:00.000Z", until: "2026-11-15T00:00:00.000Z" });
    assert.deepEqual(narrow, { info: 0, low: 1, medium: 0, high: 1, critical: 0 });
  });
}

test("postgres: data, tokens and revocations survive a restart; reopening is idempotent", { skip: NO_PG }, async (t) => {
  const { url } = await createTestDatabase(t);
  let db = await openPostgresPersistence(url);
  let cockpit = createCockpit({ tenancyStore: db.tenancyStore, eventStore: db.eventStore });
  const acme = await cockpit.tenancy.createClient("Acme");
  const site = await cockpit.tenancy.createSite(acme.id, "Atelier");
  const kept = await cockpit.tenancy.issueCredential(acme.id, ["events:ingest", "events:read"], site.id);
  const revoked = await cockpit.tenancy.issueCredential(acme.id, ["events:read"]);
  await cockpit.tenancy.revokeCredential(acme.id, revoked.credentialId);
  const principal = (await cockpit.tenancy.authenticate(kept.token))!;
  const first = await cockpit.ingestion.ingest(principal, "wazuh", loadFixture("wazuh/batch-windows-defender.json"));
  assert.ok(first.accepted > 0);
  await db.close();

  for (let restart = 0; restart < 2; restart++) {
    db = await openPostgresPersistence(url);
    assert.equal(db.schemaVersion, MIGRATIONS.length);
    cockpit = createCockpit({ tenancyStore: db.tenancyStore, eventStore: db.eventStore });
    const again = await cockpit.tenancy.authenticate(kept.token);
    assert.deepEqual(again, principal, "the issued token still authenticates after a restart");
    assert.equal(await cockpit.tenancy.authenticate(revoked.token), null, "a revocation survives a restart");
    assert.deepEqual(await cockpit.tenancy.listClients(), [acme]);
    assert.deepEqual(await cockpit.tenancy.listSites(acme.id), [site]);
    const listed = await cockpit.ingestion.listEvents(again!, 200);
    assert.deepEqual(listed.map((e) => e.id).sort(), [...first.eventIds].sort());
    const replay = await cockpit.ingestion.ingest(again!, "wazuh", loadFixture("wazuh/batch-windows-defender.json"));
    assert.equal(replay.accepted, 0, "replay after restart creates no duplicate");
    await assert.rejects(cockpit.tenancy.createClient("ACME"), isConflict);
    await db.close();
  }
});

test("postgres: row-level security hides other clients even without a WHERE clause", { skip: NO_PG }, async (t) => {
  const { url, defer } = await createTestDatabase(t);
  const db = await openPostgresPersistence(url);
  defer(() => db.close());
  await db.tenancyStore.insertClient(client("a"));
  await db.tenancyStore.insertClient(client("b"));
  await db.eventStore.append("a", event("a", "1".repeat(64), T0));
  await db.eventStore.append("b", event("b", "2".repeat(64), T0));
  await db.tenancyStore.insertCredential(credential({ clientId: "b" }));

  const raw = new pg.Client({ connectionString: url });
  await raw.connect();
  defer(() => raw.end());
  const asContext = async (clientId: string, scope: string, sql: string) => {
    await raw.query("BEGIN");
    await raw.query("SELECT set_config('app.client_id', $1, true), set_config('app.scope', $2, true)", [clientId, scope]);
    try {
      return (await raw.query(sql)).rows;
    } finally {
      await raw.query("ROLLBACK");
    }
  };

  assert.deepEqual((await asContext("a", "", "SELECT client_id FROM events")).map((r) => r.client_id), ["a"]);
  assert.equal((await asContext("", "", "SELECT * FROM events")).length, 0, "no context, no rows");
  assert.equal((await asContext("", "operator", "SELECT * FROM events")).length, 0, "operators cannot read events");
  assert.equal((await asContext("", "auth", "SELECT * FROM events")).length, 0);
  assert.equal((await asContext("a", "", "SELECT * FROM credentials")).length, 0);
  assert.equal((await asContext("a", "", "SELECT * FROM clients")).length, 1);
  assert.equal((await asContext("", "operator", "SELECT * FROM clients")).length, 2);
  assert.equal((await asContext("a", "", "UPDATE credentials SET revoked_at = now() RETURNING id")).length, 0);
  assert.equal((await asContext("", "auth", "UPDATE credentials SET revoked_at = now() RETURNING id")).length, 0,
    "the auth scope is read-only");
  await assert.rejects(
    asContext("a", "", "INSERT INTO events (client_id, id, received_at, body) VALUES ('b', 'x', now(), '{}')"),
    /row-level security/, "a client context cannot write into another client");
});

test("postgres: refuses a role that bypasses row-level security", { skip: NO_PG }, async () => {
  await assert.rejects(openPostgresPersistence(PG_ADMIN_URL!), /superuser or has BYPASSRLS/);
});

test("postgres: refuses a database migrated by a newer build", { skip: NO_PG }, async (t) => {
  const { url } = await createTestDatabase(t);
  await (await openPostgresPersistence(url)).close();
  const raw = new pg.Client({ connectionString: url });
  await raw.connect();
  await raw.query("INSERT INTO aegis_schema_migrations (version) VALUES ($1)", [MIGRATIONS.length + 1]);
  await raw.end();
  await assert.rejects(openPostgresPersistence(url), /newer than this build/);
});

test("postgres: concurrent starts migrate once", { skip: NO_PG }, async (t) => {
  const { url } = await createTestDatabase(t);
  const opened = await Promise.all([1, 2, 3].map(() => openPostgresPersistence(url, 2)));
  await Promise.all(opened.map((db) => db.close()));
  const raw = new pg.Client({ connectionString: url });
  await raw.connect();
  const { rows } = await raw.query("SELECT count(*)::int AS n FROM aegis_schema_migrations");
  await raw.end();
  assert.equal(rows[0].n, MIGRATIONS.length);
});

test("postgres: every tenant table has forced row-level security and estate rows are hidden across clients", { skip: NO_PG }, async (t) => {
  const { url, defer } = await createTestDatabase(t);
  const db = await openPostgresPersistence(url);
  defer(() => db.close());
  await db.tenancyStore.insertClient(client("a"));
  await db.tenancyStore.insertClient(client("b"));
  await db.tenancyStore.insertSite(site("a", "sa"));
  await db.estateStore.upsertAsset("a", asset("a", "a1", { siteId: "sa" }));
  await db.estateStore.upsertAsset("b", asset("b", "b1"));
  await db.supportStore.upsertContact("a", { id: "c1", clientId: "a", name: "Awa", role: "x", phone: null, email: null });
  await db.supportStore.upsertContact("b", { id: "c2", clientId: "b", name: "Bob", role: "x", phone: null, email: null });
  await db.supportStore.upsertTicket("a", ticket("a", "t1", "WA-1"));
  await db.supportStore.upsertTicket("b", ticket("b", "t2", "WA-1"));
  const snap = (clientId: string, score: number): HealthSnapshot =>
    ({ clientId, period: "2026-10", score, band: "critical", rulesetVersion: "v", penalties: [], computedAt: T0 });
  await db.snapshotStore.putSnapshot("a", snap("a", 1));
  await db.snapshotStore.putSnapshot("b", snap("b", 2));
  await db.estateStore.upsertSiteNetwork("a", { clientId: "a", siteId: "sa", box: "up", vpn: "up", internet: "up", observedAt: T0 });

  const raw = new pg.Client({ connectionString: url });
  await raw.connect();
  defer(() => raw.end());

  // Guard: a new public table without forced row-level security fails here, not in production.
  const tables = (await raw.query(
    "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
    + "WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'aegis_schema_migrations'")).rows;
  assert.ok(tables.length >= 9, "all tenant tables are listed");
  for (const row of tables) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: row-level security enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: row-level security forced`);
  }

  const asClient = async (clientId: string, sql: string) => {
    await raw.query("BEGIN");
    await raw.query("SELECT set_config('app.client_id', $1, true), set_config('app.scope', '', true)", [clientId]);
    try {
      return (await raw.query(sql)).rows;
    } finally {
      await raw.query("ROLLBACK");
    }
  };
  for (const table of ["assets", "contacts", "tickets", "health_snapshots", "site_network_status"]) {
    const rows = await asClient("a", `SELECT client_id FROM ${table}`);
    assert.ok(rows.length >= 1, `${table}: client a sees its own rows`);
    assert.ok(rows.every((r) => r.client_id === "a"), `${table}: only client a rows without a WHERE clause`);
    assert.equal((await asClient("", `SELECT client_id FROM ${table}`)).length, 0, `${table}: no context, no rows`);
  }
});

test("postgres: a v1 database with data is upgraded to the current schema without loss", { skip: NO_PG }, async (t) => {
  const { url, defer } = await createTestDatabase(t);
  const raw = new pg.Client({ connectionString: url });
  await raw.connect();
  defer(() => raw.end());
  await raw.query("CREATE TABLE aegis_schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  await raw.query(MIGRATIONS[0]!);
  await raw.query("INSERT INTO aegis_schema_migrations (version) VALUES (1)");
  await raw.query("BEGIN");
  await raw.query("SELECT set_config('app.scope', 'operator', true), set_config('app.client_id', 'a', true)");
  await raw.query("INSERT INTO clients (id, name, name_key, created_at) VALUES ('a', 'Acme', 'acme', now())");
  await raw.query("INSERT INTO sites (id, client_id, name, name_key, created_at) VALUES ('s1', 'a', 'Atelier', 'atelier', now())");
  await raw.query("COMMIT");

  const db = await openPostgresPersistence(url);
  defer(() => db.close());
  assert.equal(db.schemaVersion, MIGRATIONS.length);
  const sites = await db.tenancyStore.listSites("a");
  assert.deepEqual(sites.map((s) => s.name), ["Atelier"], "existing rows survive");
  assert.equal(sites[0]!.city ?? null, null, "existing sites simply have no city");
  assert.equal(await db.estateStore.upsertAsset("a", asset("a", "a1", { siteId: "s1" })), "created");
});
