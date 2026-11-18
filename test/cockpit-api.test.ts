import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { Asset } from "../src/domain/estate.js";
import { EVENT_SCHEMA_VERSION, type NormalizedEvent } from "../src/domain/event.js";
import { generateOperatorToken, HashedOperatorAuthenticator } from "../src/domain/operator.js";
import type { ClientDashboard, MonthlyReport, Overview } from "../src/application/cockpit-service.js";
import { startCockpit } from "./helpers.js";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const clock = { now: () => NOW };
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const asset = (clientId: string, siteId: string | null, id: string, hostname: string, over: Partial<Asset> = {}): Asset => ({
  id, clientId, siteId, kind: "workstation", hostname, os: "Windows 11 Pro", hardware: null, user: null,
  lastSeenAt: minutesAgo(2), antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0,
  lastBackupSuccessAt: hoursAgo(3), backupRequired: true, source: "test", observedAt: NOW.toISOString(), ...over
});
const alert = (clientId: string, id: string, hostname: string, severity: "high" | "critical", receivedAt: string): NormalizedEvent => ({
  schemaVersion: EVENT_SCHEMA_VERSION, id, clientId, siteId: null, receivedAt, occurredAt: receivedAt,
  source: { type: "wazuh", adapterVersion: "1.0.0", eventId: id }, category: "security_alert", severity,
  title: `alert ${id}`, asset: { id: null, hostname, ip: null }, rule: null, attributes: {}
});

/** Two clients with distinct, recognisable data; A scores 75 (watch), B scores 98 (healthy). */
async function seeded(t: TestContext, withOperator = true) {
  const operator = generateOperatorToken();
  const ctx = await startCockpit(t, undefined, withOperator ? new HashedOperatorAuthenticator([operator.sha256]) : undefined, { clock });
  const a = await ctx.tenancy.createClient("Cabinet A");
  const b = await ctx.tenancy.createClient("Labo B");
  const siteA = await ctx.tenancy.createSite(a.id, "Siège A", "Douala");
  const siteB = await ctx.tenancy.createSite(b.id, "Siège B", "Yaoundé");
  const { estateStore, supportStore, eventStore } = ctx.stores;
  await estateStore.upsertAsset(a.id, asset(a.id, siteA.id, "a1", "A-POSTE-OK"));
  await estateStore.upsertAsset(a.id, asset(a.id, siteA.id, "a2", "A-POSTE-VIEUX", {
    lastSeenAt: hoursAgo(10), antivirus: "disabled", lastBackupSuccessAt: null
  }));
  await estateStore.upsertAsset(b.id, asset(b.id, siteB.id, "b1", "SECRET-B-HOST"));
  await eventStore.append(a.id, alert(a.id, "a-event-1", "A-POSTE-OK", "high", hoursAgo(1)));
  await eventStore.append(b.id, alert(b.id, "b-event-secret", "SECRET-B-HOST", "high", hoursAgo(1)));
  await supportStore.upsertTicket(a.id, {
    id: "t-a", clientId: a.id, siteId: null, channel: "whatsapp", externalRef: "WA-1", title: "Imprimante A",
    status: "open", openedAt: hoursAgo(5), closedAt: null
  });
  await supportStore.upsertTicket(a.id, {
    id: "t-a2", clientId: a.id, siteId: null, channel: "web", externalRef: "WEB-9", title: "Compte créé",
    status: "closed", openedAt: "2026-10-03T08:00:00.000Z", closedAt: "2026-10-05T08:00:00.000Z"
  });
  return { ...ctx, op: operator.token, a, b };
}

test("cockpit api: overview lists every client, weakest first, with coherent totals", async (t) => {
  const { call, op, a, b } = await seeded(t);
  const res = await call("GET", "/v1/operator/overview", op);
  assert.equal(res.status, 200);
  const overview = await res.json() as Overview;
  assert.deepEqual(overview.clients.map((c) => c.clientId), [a.id, b.id]);
  assert.deepEqual(overview.clients.map((c) => c.score), [75, 98]);
  assert.deepEqual(overview.totals, { clients: 2, healthy: 1, watch: 1, critical: 0, openTickets: 1, recentAlerts: 2 });
  assert.equal(overview.clients[0]!.assetsOnline, 1);
  assert.equal(overview.clients[0]!.assets, 2);
  assert.match(overview.clients[0]!.mainIssue ?? "", /A-POSTE-VIEUX/);
});

test("cockpit api: a client dashboard never carries another client's data", async (t) => {
  const { call, op, a } = await seeded(t);
  const res = await call("GET", `/v1/operator/clients/${a.id}/dashboard`, op);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes("SECRET-B-HOST"), "no hostname of another client");
  assert.ok(!text.includes("b-event-secret"), "no event of another client");
  const dashboard = JSON.parse(text) as ClientDashboard;
  assert.equal(dashboard.client.id, a.id);
  assert.equal(dashboard.score, 75);
  assert.equal(dashboard.band, "watch");
  assert.deepEqual(dashboard.penalties.map((p) => p.ruleId), ["antivirus.unhealthy", "backup.stale", "assets.offline", "alerts.recent"]);
  assert.equal(dashboard.assets.length, 2);
  assert.deepEqual([...(dashboard.assets.find((x) => x.hostname === "A-POSTE-VIEUX")?.findings ?? [])].sort(),
    ["antivirus.unhealthy", "assets.offline", "backup.stale"]);
  assert.equal(dashboard.assets.find((x) => x.hostname === "A-POSTE-OK")?.online, true);
  assert.deepEqual(dashboard.alerts.map((x) => x.eventId), ["a-event-1"]);
  assert.deepEqual(dashboard.openTickets.map((x) => x.externalRef), ["WA-1"]);
  assert.equal(dashboard.sites[0]!.city, "Douala");
});

test("cockpit api: unknown client is 404, malformed path is 404, writes are refused", async (t) => {
  const { call, op } = await seeded(t);
  const unknown = await call("GET", "/v1/operator/clients/6b0f3d6e-2a53-4f0e-9a43-6f9e0f1d2c3b/dashboard", op);
  assert.equal(unknown.status, 404);
  assert.equal(((await unknown.json()) as { error: string }).error, "CLIENT_NOT_FOUND");
  assert.equal((await call("GET", "/v1/operator/clients/not-a-uuid/dashboard", op)).status, 404);
  assert.equal((await call("POST", "/v1/operator/overview", op, {})).status, 405);
});

test("cockpit api: a client credential cannot read the operator cockpit", async (t) => {
  const { call, op, a, tenancy } = await seeded(t);
  const issued = await tenancy.issueCredential(a.id, ["events:read"]);
  for (const path of ["/v1/operator/overview", `/v1/operator/clients/${a.id}/dashboard`, `/v1/operator/clients/${a.id}/reports/monthly`]) {
    assert.equal((await call("GET", path, issued.token)).status, 401, path);
    assert.equal((await call("GET", path)).status, 401, `${path} without a token`);
    assert.equal((await call("GET", path, op)).status, 200, `${path} with the operator token`);
  }
});

test("cockpit api: without a configured operator the cockpit routes answer 503", async (t) => {
  const { call, a } = await seeded(t, false);
  assert.equal((await call("GET", "/v1/operator/overview", "anything")).status, 503);
  assert.equal((await call("GET", `/v1/operator/clients/${a.id}/dashboard`, "anything")).status, 503);
});

test("cockpit api: report periods are validated (422 INVALID_PERIOD)", async (t) => {
  const { call, op, a } = await seeded(t);
  for (const period of ["2026-13", "2026-00", "202611", "garbage", "2026-1", "2027-01", "2026-12"]) {
    const res = await call("GET", `/v1/operator/clients/${a.id}/reports/monthly?period=${period}`, op);
    assert.equal(res.status, 422, period);
    assert.equal(((await res.json()) as { error: string }).error, "INVALID_PERIOD", period);
  }
  const current = await call("GET", `/v1/operator/clients/${a.id}/reports/monthly?period=2026-11`, op);
  assert.equal(current.status, 200, "the current month is allowed");
  const defaulted = await call("GET", `/v1/operator/clients/${a.id}/reports/monthly`, op);
  assert.equal(((await defaulted.json()) as MonthlyReport).period, "2026-11", "defaults to the current month");
});

test("cockpit api: monthly report figures, previous score, and an idempotent month close", async (t) => {
  const { call, op, a, cockpit, stores } = await seeded(t);

  const live = await (await call("GET", `/v1/operator/clients/${a.id}/reports/monthly?period=2026-10`, op)).json() as MonthlyReport;
  assert.equal(live.basis, "live", "an open month is computed from live data");
  assert.equal(live.requestsHandled, 1, "tickets closed in the month");
  assert.deepEqual(live.done, ["Compte créé"]);
  assert.deepEqual(live.backups, { ok: 1, required: 2 });
  assert.equal(live.previousScore, null);

  const first = await cockpit.closeMonth(a.id, "2026-10");
  assert.equal(first.created, true);
  assert.equal(first.snapshot.score, 75);
  // The estate degrades afterwards: the frozen month must not move.
  await stores.estateStore.upsertAsset(a.id, asset(a.id, null, "a3", "A-NOUVEAU", { antivirus: "disabled", lastBackupSuccessAt: null }));
  const second = await cockpit.closeMonth(a.id, "2026-10");
  assert.equal(second.created, false, "closing again is a no-op");
  assert.deepEqual(second.snapshot, first.snapshot);

  const closed = await (await call("GET", `/v1/operator/clients/${a.id}/reports/monthly?period=2026-10`, op)).json() as MonthlyReport;
  assert.equal(closed.basis, "snapshot");
  assert.equal(closed.score, 75);

  const november = await (await call("GET", `/v1/operator/clients/${a.id}/reports/monthly?period=2026-11`, op)).json() as MonthlyReport;
  assert.equal(november.previousScore, 75, "the previous month's frozen score is reported");
  assert.equal((await (await call("GET", `/v1/operator/clients/${a.id}/dashboard`, op)).json() as ClientDashboard).previousScore, 75);

  await assert.rejects(cockpit.closeMonth(a.id, "2027-01"), /future/);
  await assert.rejects(cockpit.closeMonth(a.id, "nope"), /YYYY-MM/);
});
