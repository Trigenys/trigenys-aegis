import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import pg from "pg";
import { InMemoryEventStore, InMemoryTenancyStore } from "../src/adapters/persistence/memory.js";
import { MIGRATIONS, openPostgresPersistence } from "../src/adapters/persistence/postgres.js";
import { createCockpit } from "../src/composition.js";
import { EVENT_SCHEMA_VERSION, type NormalizedEvent } from "../src/domain/event.js";
import { DomainError, type StoredCredential } from "../src/domain/tenancy.js";
import type { EventStore, TenancyStore } from "../src/ports/stores.js";
import { createTestDatabase, loadFixture, PG_ADMIN_URL } from "./helpers.js";

interface Stores {
  tenancy: TenancyStore;
  events: EventStore;
}

/** Every persistence adapter must pass the same contract. */
const ADAPTERS: Record<string, (t: TestContext) => Promise<Stores>> = {
  memory: async () => ({ tenancy: new InMemoryTenancyStore(), events: new InMemoryEventStore() }),
  postgres: async (t) => {
    const tdb = await createTestDatabase(t);
    const db = await openPostgresPersistence(tdb.url);
    tdb.defer(() => db.close());
    return { tenancy: db.tenancyStore, events: db.eventStore };
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
