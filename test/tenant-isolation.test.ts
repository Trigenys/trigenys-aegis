import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { InMemoryEventStore, InMemoryTenancyStore } from "../src/adapters/persistence/memory.js";
import { TenancyService } from "../src/application/tenancy-service.js";
import { hashToken } from "../src/domain/credentials.js";
import type { NormalizedEvent } from "../src/domain/event.js";
import { loadFixture, startCockpit } from "./helpers.js";

/** Two clients, A and B, each with an ingest token bound to a site and a read token. */
async function twoClients(t: TestContext) {
  const ctx = await startCockpit(t);
  const setup = async (name: string) => {
    const client = await ctx.tenancy.createClient(name);
    const site = await ctx.tenancy.createSite(client.id, `${name} HQ`);
    const ingest = await ctx.tenancy.issueCredential(client.id, ["events:ingest"], site.id);
    const read = await ctx.tenancy.issueCredential(client.id, ["events:read"]);
    return { client, site, ingest: ingest.token, read: read.token };
  };
  return { ...ctx, a: await setup("Client A"), b: await setup("Client B") };
}

const listEvents = async (res: Response) => ((await res.json()) as { events: NormalizedEvent[] }).events;

test("isolation: events ingested by A are visible to A only", async (t) => {
  const { call, a, b } = await twoClients(t);
  const ingest = await call("POST", "/v1/sources/wazuh/events", a.ingest, loadFixture("wazuh/sshd-bruteforce.json"));
  assert.equal(ingest.status, 202);
  const { eventIds } = await ingest.json() as { eventIds: string[] };

  const forA = await listEvents(await call("GET", "/v1/events", a.read));
  assert.equal(forA.length, 1);
  assert.equal(forA[0]?.clientId, a.client.id);
  assert.equal(forA[0]?.siteId, a.site.id);

  assert.deepEqual(await listEvents(await call("GET", "/v1/events", b.read)), []);
  assert.equal((await call("GET", `/v1/events/${eventIds[0]}`, a.read)).status, 200);
  assert.equal((await call("GET", `/v1/events/${eventIds[0]}`, b.read)).status, 404,
    "B must not read A's event by id, and must not learn that it exists");
});

test("isolation: client and site claimed in the payload are ignored", async (t) => {
  const { call, a, b } = await twoClients(t);
  const payload = JSON.parse(JSON.stringify(loadFixture("wazuh/spoofed-tenant.json"))
    .replaceAll("__VICTIM_CLIENT_ID__", b.client.id)
    .replaceAll("__VICTIM_SITE_ID__", b.site.id));

  assert.equal((await call("POST", "/v1/sources/wazuh/events", a.ingest, payload)).status, 202);

  assert.deepEqual(await listEvents(await call("GET", "/v1/events", b.read)), [], "nothing injected into B");
  const forA = await listEvents(await call("GET", "/v1/events", a.read));
  assert.equal(forA.length, 1);
  assert.equal(forA[0]?.clientId, a.client.id);
  assert.equal(forA[0]?.siteId, a.site.id);
  assert.ok(!JSON.stringify(forA).includes(b.client.id));
});

test("isolation: the same source event id from two clients yields two distinct events", async (t) => {
  const { call, a, b } = await twoClients(t);
  const alert = loadFixture("wazuh/sshd-bruteforce.json");
  const ra = await (await call("POST", "/v1/sources/wazuh/events", a.ingest, alert)).json() as { eventIds: string[] };
  const rb = await (await call("POST", "/v1/sources/wazuh/events", b.ingest, alert)).json() as { eventIds: string[] };
  assert.notEqual(ra.eventIds[0], rb.eventIds[0]);
  assert.equal((await listEvents(await call("GET", "/v1/events", a.read))).length, 1);
  assert.equal((await listEvents(await call("GET", "/v1/events", b.read))).length, 1);
});

test("ingestion: replaying an alert is idempotent", async (t) => {
  const { call, a } = await twoClients(t);
  const alert = loadFixture("wazuh/batch-windows-defender.json");
  const first = await (await call("POST", "/v1/sources/wazuh/events", a.ingest, alert)).json();
  const second = await (await call("POST", "/v1/sources/wazuh/events", a.ingest, alert)).json();
  assert.deepEqual(first.accepted, 2);
  assert.deepEqual(second, { accepted: 0, duplicates: 2, eventIds: first.eventIds });
  assert.equal((await listEvents(await call("GET", "/v1/events", a.read))).length, 2);
});

test("authentication: missing, malformed, unknown and revoked tokens are rejected before persistence", async (t) => {
  const { call, a, tenancy } = await twoClients(t);
  const alert = loadFixture("wazuh/sshd-bruteforce.json");
  const forged = "aegis_" + "A".repeat(43);
  for (const token of [undefined, "garbage", forged, a.client.id]) {
    assert.equal((await call("POST", "/v1/sources/wazuh/events", token, alert)).status, 401, String(token));
    assert.equal((await call("GET", "/v1/events", token)).status, 401, String(token));
  }

  const issued = await tenancy.issueCredential(a.client.id, ["events:ingest"]);
  assert.equal((await call("POST", "/v1/sources/wazuh/events", issued.token, alert)).status, 202);
  assert.equal(await tenancy.revokeCredential(a.client.id, issued.credentialId), true);
  assert.equal((await call("POST", "/v1/sources/wazuh/events", issued.token, alert)).status, 401);
  assert.equal((await listEvents(await call("GET", "/v1/events", a.read))).length, 1, "only the authorized write landed");
});

test("authorization: scopes are enforced per credential", async (t) => {
  const { call, a } = await twoClients(t);
  assert.equal((await call("GET", "/v1/events", a.ingest)).status, 403, "ingest token cannot read");
  assert.equal(
    (await call("POST", "/v1/sources/wazuh/events", a.read, loadFixture("wazuh/sshd-bruteforce.json"))).status,
    403, "read token cannot ingest");
});

test("ingestion: invalid requests are rejected and nothing is stored", async (t) => {
  const ctx = await startCockpit(t, 2048);
  const client = await ctx.tenancy.createClient("C");
  const ingest = (await ctx.tenancy.issueCredential(client.id, ["events:ingest", "events:read"])).token;

  assert.equal((await ctx.call("POST", "/v1/sources/unknown/events", ingest, {})).status, 404);
  assert.equal((await ctx.call("POST", "/v1/sources/wazuh/events", ingest, { rule: {} })).status, 422);
  const badJson = await fetch(ctx.baseUrl + "/v1/sources/wazuh/events", {
    method: "POST", headers: { authorization: `Bearer ${ingest}`, "content-type": "application/json" }, body: "{"
  });
  assert.equal(badJson.status, 400);
  const noType = await fetch(ctx.baseUrl + "/v1/sources/wazuh/events", {
    method: "POST", headers: { authorization: `Bearer ${ingest}` }, body: "{}"
  });
  assert.equal(noType.status, 415);
  const big = await ctx.call("POST", "/v1/sources/wazuh/events", ingest, { pad: "x".repeat(4096) });
  assert.equal(big.status, 413);

  // A batch with one invalid alert is rejected as a whole.
  const batch = loadFixture("wazuh/batch-windows-defender.json") as unknown[];
  assert.equal((await ctx.call("POST", "/v1/sources/wazuh/events", ingest, [batch[0], { rule: {} }])).status, 422);
  assert.deepEqual(await listEvents(await ctx.call("GET", "/v1/events", ingest)), []);
});

test("tenancy: tokens are stored hashed and site binding cannot cross clients", async () => {
  const store = new InMemoryTenancyStore();
  const tenancy = new TenancyService(store);
  const a = await tenancy.createClient("A");
  const b = await tenancy.createClient("B");
  const siteB = await tenancy.createSite(b.id, "B site");

  const issued = await tenancy.issueCredential(a.id, ["events:ingest"]);
  const stored = await store.findCredentialByHash(hashToken(issued.token));
  assert.ok(stored);
  assert.ok(!JSON.stringify(stored).includes(issued.token), "plain token must not be persisted");
  assert.equal(await store.findCredentialByHash(issued.token), null);

  await assert.rejects(tenancy.issueCredential(a.id, ["events:ingest"], siteB.id), /SITE_NOT_FOUND|unknown site/);
  assert.equal(await store.getSite(a.id, siteB.id), null);
  assert.equal(await tenancy.revokeCredential(b.id, issued.credentialId), false, "B cannot revoke A's credential");
  await assert.rejects(tenancy.createSite("missing", "x"), /unknown client/);
});

test("event store: partitions are keyed by client and reject mismatched writes", async () => {
  const store = new InMemoryEventStore();
  const event = { id: "e1", clientId: "A", receivedAt: "2026-11-18T00:00:00.000Z" } as NormalizedEvent;
  assert.equal(await store.append("A", event), true);
  await assert.rejects(store.append("B", event), /does not match/);
  assert.equal(await store.get("B", "e1"), null);
  assert.deepEqual(await store.list("B", { limit: 10 }), []);
});
