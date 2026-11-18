import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { InMemoryEstateStore, InMemoryTenancyStore } from "../src/adapters/persistence/memory.js";
import { openPostgresPersistence } from "../src/adapters/persistence/postgres.js";
import { createTrmmApi, TrmmApiError } from "../src/adapters/inventory/trmm-client.js";
import { validateTrmmSyncConfig, type TrmmSyncConfig } from "../src/adapters/inventory/trmm-config.js";
import { isTrmmSkip, mapTrmmAgent, trmmAssetId } from "../src/adapters/inventory/trmm-mapping.js";
import type { TrmmAgent, TrmmClient, TrmmWinUpdate } from "../src/adapters/inventory/trmm-types.js";
import { eventId } from "../src/application/ingestion-service.js";
import { syncInventory } from "../src/application/inventory-sync.js";
import { seedDemo } from "../src/cli/demo-seed.js";
import { runInventorySync, SYNC_EXIT } from "../src/cli/inventory-sync-cli.js";
import { createCockpit, type Persistence } from "../src/composition.js";
import { sourceRecordId, type Asset } from "../src/domain/estate.js";
import type { EstateStore, TenancyStore } from "../src/ports/stores.js";
import { createTestDatabase, loadFixture, PG_ADMIN_URL } from "./helpers.js";

const SENTINEL_KEY = "SENTINEL-trmm-key-7c41e9d2";
const BASE_URL = "https://trmm-api.example.test";
const T0 = "2026-11-18T09:00:00.000Z";
const NOW = { now: () => new Date(T0) };
const ALPHA = "aegis-alpha";
const BETA = "aegis-beta";
const PC01 = "kZqTRbVYhMwXnGfJcPaLsUeDoIyHtBNrKmQjWvCx";
const SRV01 = "PwErTyUiOpAsDfGhJkLzXcVbNmQwErTyUiOpAsDf";
const NAS = "LnXbAcKdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIj";

const fixture = <T>(name: string): T => structuredClone(loadFixture(`tacticalrmm/${name}`)) as T;
const agentsFixture = () => fixture<TrmmAgent[]>("agents-client-3.json");
const clientsFixture = () => fixture<TrmmClient[]>("clients.json");
const agentById = (id: string) => agentsFixture().find((agent) => agent.agent_id === id)!;

interface FakeTrmm {
  clients: TrmmClient[];
  agents: Record<number, TrmmAgent[]>;
  winupdates: Record<string, TrmmWinUpdate[]>;
  /** Forced HTTP status per path. */
  status: Record<string, number>;
  calls: string[];
  fetch: typeof fetch;
}

/** In-process stand-in for the Tactical RMM API, serving the fixtures and checking the key header. */
function fakeTrmm(): FakeTrmm {
  const fake: FakeTrmm = {
    clients: clientsFixture(),
    agents: { 3: agentsFixture() },
    winupdates: { [SRV01]: fixture<TrmmWinUpdate[]>(`winupdates-${SRV01}.json`) },
    status: {},
    calls: [],
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname + url.search;
      fake.calls.push(path);
      if (url.origin !== BASE_URL) return new Response("wrong host", { status: 404 });
      if (new Headers(init?.headers).get("x-api-key") !== SENTINEL_KEY) return new Response("{}", { status: 401 });
      if (fake.status[path]) return new Response("{}", { status: fake.status[path] });
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (path === "/clients/") return json(fake.clients);
      const agents = /^\/agents\/\?client=(\d+)$/.exec(path);
      if (agents) return json(fake.agents[Number(agents[1])] ?? []);
      const updates = /^\/winupdate\/([^/]+)\/$/.exec(path);
      if (updates && fake.winupdates[decodeURIComponent(updates[1]!)]) return json(fake.winupdates[decodeURIComponent(updates[1]!)]);
      return new Response("not found", { status: 404 });
    }) as typeof fetch
  };
  return fake;
}

const baseConfig = (over: Partial<TrmmSyncConfig> = {}): TrmmSyncConfig => validateTrmmSyncConfig({
  baseUrl: `${BASE_URL}/`,
  clients: [{
    trmmClientId: 3, trmmClientName: "PME Alpha", aegisClientId: ALPHA,
    sites: [{ trmmSiteName: "Douala", aegisSiteId: "alpha-douala" }, { trmmSiteName: "Yaounde", aegisSiteId: "alpha-yaounde" }]
  }],
  ...over
});

interface Stores {
  tenancy: TenancyStore;
  estate: EstateStore;
}

async function seedTenancy(tenancy: TenancyStore): Promise<void> {
  await tenancy.insertClient({ id: ALPHA, name: "PME Alpha", createdAt: T0 });
  await tenancy.insertClient({ id: BETA, name: "Cabinet Beta", createdAt: T0 });
  await tenancy.insertSite({ id: "alpha-douala", clientId: ALPHA, name: "Douala", createdAt: T0 });
  await tenancy.insertSite({ id: "alpha-yaounde", clientId: ALPHA, name: "Yaounde", createdAt: T0 });
  await tenancy.insertSite({ id: "beta-siege", clientId: BETA, name: "Siege", createdAt: T0 });
}

const ADAPTERS: Record<string, (t: TestContext) => Promise<Stores>> = {
  memory: async () => {
    const tenancy = new InMemoryTenancyStore();
    await seedTenancy(tenancy);
    return { tenancy, estate: new InMemoryEstateStore(tenancy) };
  },
  postgres: async (t) => {
    const tdb = await createTestDatabase(t);
    const db = await openPostgresPersistence(tdb.url);
    tdb.defer(() => db.close());
    await seedTenancy(db.tenancyStore);
    return { tenancy: db.tenancyStore, estate: db.estateStore };
  }
};
const NO_PG = PG_ADMIN_URL ? false : "AEGIS_TEST_DATABASE_URL not set: PostgreSQL integration tests skipped";
const skipFor = (adapter: string) => (adapter === "postgres" ? NO_PG : false);

const sync = (stores: Stores, fake: FakeTrmm, config = baseConfig(), dryRun = false) => syncInventory({
  api: createTrmmApi({ baseUrl: config.baseUrl, apiKey: SENTINEL_KEY, fetch: fake.fetch }),
  config, tenancy: stores.tenancy, estate: stores.estate, clock: NOW, dryRun
});

// ---------------------------------------------------------------- identifiers

test("event ids are unchanged by the shared source record id", () => {
  assert.equal(eventId("client-a", "wazuh", "1731920400.123456"),
    "a10cc44cd03b806d5bfc8a3ad18aa8551026f3778133a173288d66b61c15999f");
  assert.equal(sourceRecordId("client-a", "wazuh", "x"), eventId("client-a", "wazuh", "x"));
  assert.equal(trmmAssetId(ALPHA, PC01), sourceRecordId(ALPHA, "tacticalrmm", PC01));
  assert.notEqual(trmmAssetId(ALPHA, PC01), trmmAssetId(BETA, PC01));
});

// ---------------------------------------------------------------- mapping

const context = { clientId: ALPHA, siteId: "alpha-douala", backupRequiredKinds: ["server"] as const };

test("mapping: a Windows workstation without fetched updates, field by field", () => {
  const asset = mapTrmmAgent(agentById(PC01), { ...context, updates: null });
  assert.deepEqual(asset, {
    id: trmmAssetId(ALPHA, PC01),
    clientId: ALPHA,
    siteId: "alpha-douala",
    kind: "workstation",
    hostname: "ALPHA-PC01",
    os: "Windows 11 Pro, 64 bit v23H2 (build 22631.4460)",
    hardware: "Dell Inc. OptiPlex 7090",
    user: "j.ngono",
    lastSeenAt: "2026-11-18T08:41:07.123Z",
    antivirus: "unknown",
    firewall: "unknown",
    pendingUpdates: 1,
    criticalUpdates: 0,
    lastBackupSuccessAt: null,
    backupRequired: false,
    source: "tacticalrmm",
    observedAt: "2026-11-18T08:41:07.123Z"
  });
});

test("mapping: Windows updates count pending non-ignored ones and their critical subset", () => {
  const updates = fixture<TrmmWinUpdate[]>(`winupdates-${SRV01}.json`);
  const asset = mapTrmmAgent(agentById(SRV01), { ...context, updates }) as Asset;
  assert.equal(asset.kind, "server");
  assert.equal(asset.user, null, "'-' means nobody is logged in");
  assert.equal(asset.pendingUpdates, 2);
  assert.equal(asset.criticalUpdates, 1);
  assert.equal(asset.backupRequired, true);
  assert.equal((mapTrmmAgent(agentById(SRV01), { ...context, updates: [] }) as Asset).pendingUpdates, 0);
});

test("mapping: defaults for a Linux agent and for missing fields", () => {
  const nas = mapTrmmAgent(agentById(NAS), { ...context, siteId: null, updates: null }) as Asset;
  assert.equal(nas.os, "linux");
  assert.equal(nas.hardware, null);
  assert.equal(nas.user, null);
  assert.equal(nas.siteId, null);
  assert.equal(nas.pendingUpdates, 0, "non-Windows agents never count Windows updates");
  assert.equal(nas.lastSeenAt, "2026-11-17T21:05:12.500Z", "offsets are normalized to UTC");

  const bare = mapTrmmAgent({ agent_id: "a1", hostname: "H", last_seen: "2026-11-18 08:00:00" }, { ...context, updates: null }) as Asset;
  assert.equal(bare.kind, "workstation");
  assert.equal(bare.os, "unknown");
  assert.equal(bare.lastSeenAt, "2026-11-18T08:00:00.000Z");
  assert.equal((mapTrmmAgent({ agent_id: "a2", hostname: "H", monitoring_type: "mobile", last_seen: T0 }, context) as Asset).kind, "workstation");
});

test("mapping: agents without hostname or valid last_seen are skipped", () => {
  const blank = mapTrmmAgent(agentsFixture()[3]!, context);
  assert.ok(isTrmmSkip(blank));
  assert.match(blank.skip, /hostname/);
  const noSeen = mapTrmmAgent({ ...agentById(PC01), last_seen: null }, context);
  assert.ok(isTrmmSkip(noSeen) && /last_seen/.test(noSeen.skip));
  assert.ok(isTrmmSkip(mapTrmmAgent({ ...agentById(PC01), last_seen: "yesterday" }, context)));
});

test("mapping: fields Tactical RMM does not report are kept from the stored asset", () => {
  const existing = mapTrmmAgent(agentById(SRV01), { ...context, updates: [] }) as Asset;
  const curated: Asset = {
    ...existing, antivirus: "ok", firewall: "disabled", lastBackupSuccessAt: "2026-11-17T23:00:00.000Z", backupRequired: false
  };
  const merged = mapTrmmAgent(agentById(SRV01), { ...context, existing: curated, updates: [] }) as Asset;
  assert.equal(merged.antivirus, "ok");
  assert.equal(merged.firewall, "disabled");
  assert.equal(merged.lastBackupSuccessAt, "2026-11-17T23:00:00.000Z");
  assert.equal(merged.backupRequired, false);
});

// ---------------------------------------------------------------- sync, every store adapter

for (const adapter of Object.keys(ADAPTERS)) {
  test(`[${adapter}] first sync creates, a replay writes nothing, a new last_seen updates one asset`, { skip: skipFor(adapter) }, async (t) => {
    const stores = await ADAPTERS[adapter]!(t);
    const fake = fakeTrmm();

    const first = await sync(stores, fake);
    assert.equal(first.generatedAt, T0);
    assert.deepEqual(first.unmappedClients, [{ trmmClientId: 7, name: "Cabinet Beta" }]);
    assert.ok(!fake.calls.some((path) => path.includes("client=7")), "unmapped clients are never read");
    const alpha = first.clients[0]!;
    assert.equal(alpha.status, "ok");
    assert.deepEqual([alpha.created, alpha.updated, alpha.unchanged, alpha.skipped.length], [3, 0, 0, 1]);
    assert.ok(alpha.warnings.some((warning) => /Entrepot/.test(warning)), "unmapped site is reported");
    assert.ok(alpha.warnings.some((warning) => /ALPHA-PC01: Windows updates unavailable/.test(warning)));

    const stored = await stores.estate.listAssets(ALPHA);
    assert.deepEqual(stored.map((asset) => asset.hostname), ["ALPHA-PC01", "ALPHA-SRV01", "alpha-nas"]);
    const nas = stored.find((asset) => asset.hostname === "alpha-nas")!;
    assert.equal(nas.siteId, null);
    assert.equal(stored.find((asset) => asset.hostname === "ALPHA-SRV01")!.siteId, "alpha-yaounde");

    const replay = await sync(stores, fake);
    assert.deepEqual([replay.clients[0]!.created, replay.clients[0]!.updated, replay.clients[0]!.unchanged], [0, 0, 3]);
    assert.deepEqual(await stores.estate.listAssets(ALPHA), stored);

    fake.agents[3]![0] = { ...fake.agents[3]![0]!, last_seen: "2026-11-18T08:59:00Z" };
    const moved = await sync(stores, fake);
    assert.deepEqual([moved.clients[0]!.created, moved.clients[0]!.updated, moved.clients[0]!.unchanged], [0, 1, 2]);
  });

  test(`[${adapter}] curated antivirus and backup fields survive a sync`, { skip: skipFor(adapter) }, async (t) => {
    const stores = await ADAPTERS[adapter]!(t);
    const fake = fakeTrmm();
    await sync(stores, fake);
    const id = trmmAssetId(ALPHA, SRV01);
    const before = (await stores.estate.listAssets(ALPHA)).find((asset) => asset.id === id)!;
    await stores.estate.upsertAsset(ALPHA, { ...before, antivirus: "ok", firewall: "ok", lastBackupSuccessAt: "2026-11-18T02:00:00.000Z" });
    const replay = await sync(stores, fake);
    assert.equal(replay.clients[0]!.unchanged, 3);
    const after = (await stores.estate.listAssets(ALPHA)).find((asset) => asset.id === id)!;
    assert.deepEqual([after.antivirus, after.firewall, after.lastBackupSuccessAt], ["ok", "ok", "2026-11-18T02:00:00.000Z"]);
  });

  test(`[${adapter}] a client whose agents name another client is refused as a whole, others proceed`, { skip: skipFor(adapter) }, async (t) => {
    const stores = await ADAPTERS[adapter]!(t);
    const fake = fakeTrmm();
    fake.agents[3]!.push({ ...agentById(PC01), agent_id: "intruder", hostname: "BETA-PC09", client_name: "Cabinet Beta" });
    fake.agents[7] = [{ ...agentById(PC01), agent_id: "beta-1", hostname: "BETA-PC01", client_name: "Cabinet Beta", site_name: "Siege" }];
    const config = baseConfig({
      clients: [
        ...baseConfig().clients,
        { trmmClientId: 7, trmmClientName: "Cabinet Beta", aegisClientId: BETA, sites: [{ trmmSiteName: "Siege", aegisSiteId: "beta-siege" }] }
      ]
    });
    const report = await sync(stores, fake, config);
    const [alpha, beta] = report.clients;
    assert.equal(alpha!.status, "error");
    assert.match(alpha!.error!, /another client/);
    assert.equal(alpha!.created, 0);
    assert.deepEqual(await stores.estate.listAssets(ALPHA), [], "nothing written for the refused client");
    assert.equal(beta!.status, "ok");
    assert.equal(beta!.created, 1);
    assert.deepEqual(report.unmappedClients, []);
  });

  test(`[${adapter}] dry-run reports the same outcome and writes nothing`, { skip: skipFor(adapter) }, async (t) => {
    const stores = await ADAPTERS[adapter]!(t);
    const report = await sync(stores, fakeTrmm(), baseConfig(), true);
    assert.equal(report.dryRun, true);
    assert.equal(report.clients[0]!.created, 3);
    assert.deepEqual(await stores.estate.listAssets(ALPHA), []);
  });
}

// ---------------------------------------------------------------- sync guards (memory)

test("mismatched client name, unknown Aegis client or foreign site refuse the client before any read of agents", async (t) => {
  const cases: Array<[string, (fake: FakeTrmm) => TrmmSyncConfig, RegExp]> = [
    ["renamed", (fake) => { fake.clients[0] = { ...fake.clients[0]!, name: "Autre" }; return baseConfig(); }, /named "Autre"/],
    ["unknown aegis client", () => baseConfig({ clients: [{ ...baseConfig().clients[0]!, aegisClientId: "nope" }] }), /does not exist/],
    ["foreign site", () => baseConfig({
      clients: [{ ...baseConfig().clients[0]!, sites: [{ trmmSiteName: "Douala", aegisSiteId: "beta-siege" }] }]
    }), /does not belong/],
    ["absent from TRMM", (fake) => { fake.clients = fake.clients.filter((c) => c.id !== 3); return baseConfig(); }, /not found/]
  ];
  for (const [label, prepare, expected] of cases) {
    const stores = await ADAPTERS.memory!(t);
    const fake = fakeTrmm();
    const report = await sync(stores, fake, prepare(fake));
    assert.equal(report.clients[0]!.status, "error", label);
    assert.match(report.clients[0]!.error!, expected, label);
    assert.ok(!fake.calls.some((path) => path.startsWith("/agents/")), `${label}: agents not read`);
    assert.deepEqual(await stores.estate.listAssets(ALPHA), [], label);
  }
});

test("assets no longer reported are listed as missing and never deleted", async (t) => {
  const stores = await ADAPTERS.memory!(t);
  const fake = fakeTrmm();
  await sync(stores, fake);
  fake.agents[3] = fake.agents[3]!.filter((agent) => agent.agent_id !== NAS);
  const report = await sync(stores, fake);
  assert.deepEqual(report.clients[0]!.missing, [{ assetId: trmmAssetId(ALPHA, NAS), hostname: "alpha-nas" }]);
  assert.equal((await stores.estate.listAssets(ALPHA)).length, 3);
});

test("demo assets of the target client are left intact and never reported missing", async () => {
  const cockpit = createCockpit({ clock: NOW });
  await seedDemo(cockpit.stores, new Date(T0), { AEGIS_ALLOW_DEMO_SEED: "1" } as NodeJS.ProcessEnv);
  const demoClient = (await cockpit.stores.tenancyStore.listClients())[0]!;
  const demoSite = (await cockpit.stores.tenancyStore.listSites(demoClient.id))[0]!;
  const before = await cockpit.stores.estateStore.listAssets(demoClient.id);
  assert.ok(before.length > 0);

  const report = await syncInventory({
    api: createTrmmApi({ baseUrl: BASE_URL, apiKey: SENTINEL_KEY, fetch: fakeTrmm().fetch }),
    config: baseConfig({
      clients: [{ trmmClientId: 3, trmmClientName: "PME Alpha", aegisClientId: demoClient.id, sites: [{ trmmSiteName: "Douala", aegisSiteId: demoSite.id }] }]
    }),
    tenancy: cockpit.stores.tenancyStore, estate: cockpit.stores.estateStore, clock: NOW
  });
  assert.equal(report.clients[0]!.status, "ok");
  assert.deepEqual(report.clients[0]!.missing, []);
  const after = await cockpit.stores.estateStore.listAssets(demoClient.id);
  assert.equal(after.length, before.length + 3);
  for (const asset of before) assert.deepEqual(after.find((candidate) => candidate.id === asset.id), asset);
});

// ---------------------------------------------------------------- configuration

test("configuration: defaults and normalization", () => {
  const config = baseConfig();
  assert.equal(config.baseUrl, BASE_URL);
  assert.equal(config.apiKeyEnv, "AEGIS_TRMM_API_KEY");
  assert.equal(config.fetchWindowsUpdates, true);
  assert.deepEqual(config.backupRequiredKinds, ["server"]);
  assert.equal(validateTrmmSyncConfig({ baseUrl: "http://127.0.0.1:8000", clients: baseConfig().clients }).baseUrl, "http://127.0.0.1:8000");
});

test("configuration: invalid files are refused with the offending path, secrets are never echoed", () => {
  const client = { trmmClientId: 3, trmmClientName: "PME Alpha", aegisClientId: ALPHA, sites: [] };
  const cases: Array<[unknown, RegExp]> = [
    [[], /JSON object/],
    [{ baseUrl: BASE_URL, clients: [] }, /clients must be a non-empty array/],
    [{ baseUrl: BASE_URL, clients: [client, { ...client, aegisClientId: BETA }] }, /clients\[1\]\.trmmClientId 3 is mapped twice/],
    [{ baseUrl: BASE_URL, clients: [client, { ...client, trmmClientId: 4 }] }, /clients\[1\]\.aegisClientId .* mapped twice/],
    [{ baseUrl: "http://trmm.example.test", clients: [client] }, /https/],
    [{ baseUrl: "https://user:pw@trmm.example.test", clients: [client] }, /credentials/],
    [{ baseUrl: "not a url", clients: [client] }, /absolute URL/],
    [{ baseUrl: BASE_URL, apiKey: SENTINEL_KEY, clients: [client] }, /apiKey is not allowed/],
    [{ baseUrl: BASE_URL, clients: [{ ...client, token: SENTINEL_KEY }] }, /clients\[0\]\.token is not allowed/],
    [{ baseUrl: BASE_URL, clients: [{ ...client, trmmClientId: "3" }] }, /clients\[0\]\.trmmClientId must be a positive integer/],
    [{ baseUrl: BASE_URL, clients: [{ ...client, sites: [{ trmmSiteName: "A", aegisSiteId: "x" }, { trmmSiteName: "A", aegisSiteId: "y" }] }] },
      /clients\[0\]\.sites\[1\]\.trmmSiteName "A" is mapped twice/],
    [{ baseUrl: BASE_URL, backupRequiredKinds: ["printer"], clients: [client] }, /backupRequiredKinds\[0\]/],
    [{ baseUrl: BASE_URL, apiKeyEnv: "not valid", clients: [client] }, /apiKeyEnv/]
  ];
  for (const [input, expected] of cases) {
    assert.throws(() => validateTrmmSyncConfig(input), (error: Error) => {
      assert.match(error.message, expected);
      assert.ok(!error.message.includes(SENTINEL_KEY), "secret echoed in a configuration error");
      return true;
    });
  }
});

// ---------------------------------------------------------------- API client

test("API client: sends the key in X-API-KEY, errors carry status and path but never the key", async () => {
  const fake = fakeTrmm();
  const api = createTrmmApi({ baseUrl: `${BASE_URL}/`, apiKey: SENTINEL_KEY, fetch: fake.fetch });
  assert.equal((await api.listClients()).length, 2);
  assert.equal((await api.listAgents(3)).length, 4);
  assert.equal((await api.listWinUpdates(SRV01)).length, 5);
  assert.deepEqual(fake.calls, ["/clients/", "/agents/?client=3", `/winupdate/${SRV01}/`]);

  const wrongKey = createTrmmApi({ baseUrl: BASE_URL, apiKey: `${SENTINEL_KEY}-wrong`, fetch: fake.fetch });
  await assert.rejects(wrongKey.listClients(), (error: unknown) => {
    assert.ok(error instanceof TrmmApiError);
    assert.equal(error.status, 401);
    assert.equal(error.unauthorized, true);
    assert.equal(error.path, "/clients/");
    assert.ok(!error.message.includes(SENTINEL_KEY) && !error.message.includes(BASE_URL));
    return true;
  });

  const unreachable = createTrmmApi({
    baseUrl: BASE_URL, apiKey: SENTINEL_KEY,
    fetch: (async () => { throw new TypeError(`fetch failed for key ${SENTINEL_KEY}`); }) as typeof fetch
  });
  await assert.rejects(unreachable.listClients(), (error: unknown) => {
    assert.ok(error instanceof TrmmApiError && error.status === 0);
    assert.ok(!error.message.includes(SENTINEL_KEY), "underlying error text is not propagated");
    return true;
  });

  const notArray = createTrmmApi({
    baseUrl: BASE_URL, apiKey: SENTINEL_KEY, fetch: (async () => new Response(JSON.stringify({ detail: "x" }))) as typeof fetch
  });
  await assert.rejects(notArray.listClients(), /unexpected response shape/);
});

// ---------------------------------------------------------------- CLI

async function cli(t: TestContext, options: { config?: unknown; env?: Record<string, string>; argv?: string[]; fake?: FakeTrmm } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "aegis-trmm-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "trmm-sync.json");
  writeFileSync(path, JSON.stringify(options.config ?? { baseUrl: BASE_URL, clients: baseConfig().clients }));
  const stores = await ADAPTERS.memory!(t);
  const persistence: Persistence = {
    kind: "memory", tenancyStore: stores.tenancy, estateStore: stores.estate,
    eventStore: undefined as never, supportStore: undefined as never, snapshotStore: undefined as never, close: async () => {}
  };
  const out: string[] = [];
  const err: string[] = [];
  const code = await runInventorySync({
    argv: options.argv ?? ["--config", path],
    env: { AEGIS_DATABASE_URL: "postgres://unused", AEGIS_TRMM_API_KEY: SENTINEL_KEY, ...options.env } as NodeJS.ProcessEnv,
    openPersistence: async () => persistence,
    fetch: (options.fake ?? fakeTrmm()).fetch,
    clock: NOW,
    out: (line) => out.push(line),
    err: (line) => err.push(line)
  });
  const all = [...out, ...err].join("\n");
  assert.ok(!all.includes(SENTINEL_KEY), "the API key reached the output");
  return { code, out, err, stores, path };
}

test("CLI: a successful run prints one line per client and per unmapped client, exit 0", async (t) => {
  const { code, out, stores } = await cli(t);
  assert.equal(code, SYNC_EXIT.ok);
  assert.ok(out.some((line) => /trmm client 3 "PME Alpha" -> aegis-alpha: created=3 updated=0 unchanged=0 skipped=1 missing=0/.test(line)));
  assert.ok(out.some((line) => /trmm client 7 "Cabinet Beta": not mapped, ignored/.test(line)));
  assert.equal((await stores.estate.listAssets(ALPHA)).length, 3);
});

test("CLI: --json and --dry-run", async (t) => {
  const { code, path } = await cli(t, { argv: [] });
  assert.equal(code, SYNC_EXIT.config, "no --config and no AEGIS_TRMM_CONFIG");
  const run = await cli(t, { argv: ["--dry-run", "--json"], env: { AEGIS_TRMM_CONFIG: path } });
  assert.equal(run.code, SYNC_EXIT.ok);
  const report = JSON.parse(run.out.join("\n"));
  assert.equal(report.dryRun, true);
  assert.equal(report.clients[0].created, 3);
  assert.deepEqual(await run.stores.estate.listAssets(ALPHA), []);
});

test("CLI: exit 1 when a client is refused, 2 on configuration or environment problems, 3 when the API refuses the key", async (t) => {
  const refused = fakeTrmm();
  refused.clients[0] = { ...refused.clients[0]!, name: "Renamed" };
  assert.equal((await cli(t, { fake: refused })).code, SYNC_EXIT.clientError);

  const secretInFile = await cli(t, { config: { baseUrl: BASE_URL, apiKey: SENTINEL_KEY, clients: baseConfig().clients } });
  assert.equal(secretInFile.code, SYNC_EXIT.config);
  assert.match(secretInFile.err.join("\n"), /apiKey is not allowed/);
  assert.equal((await cli(t, { config: { baseUrl: "http://remote.example.test", clients: baseConfig().clients } })).code, SYNC_EXIT.config);
  assert.equal((await cli(t, { env: { AEGIS_DATABASE_URL: "" } })).code, SYNC_EXIT.config);
  const noKey = await cli(t, { env: { AEGIS_TRMM_API_KEY: "" } });
  assert.equal(noKey.code, SYNC_EXIT.config);
  assert.match(noKey.err.join("\n"), /AEGIS_TRMM_API_KEY/);
  assert.equal((await cli(t, { argv: ["--bogus"] })).code, SYNC_EXIT.config);

  const wrongKey = await cli(t, { env: { AEGIS_TRMM_API_KEY: `${SENTINEL_KEY}-revoked` } });
  assert.equal(wrongKey.code, SYNC_EXIT.source);
  assert.match(wrongKey.err.join("\n"), /HTTP 401/);
  const down = fakeTrmm();
  down.status["/clients/"] = 503;
  assert.equal((await cli(t, { fake: down })).code, SYNC_EXIT.source);
});
