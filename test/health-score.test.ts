import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadHealthRules } from "../src/adapters/config/health-rules-file.js";
import type { Asset, SiteNetworkStatus } from "../src/domain/estate.js";
import { bandOf, computeHealth, isOnline, type HealthInput } from "../src/domain/health.js";
import { DEFAULT_HEALTH_RULES, validateHealthRules } from "../src/domain/health-rules.js";

const NOW = new Date("2026-11-18T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, clientId: "c", siteId: "s", kind: "workstation", hostname: `H-${id}`, os: "Windows 11", hardware: null, user: null,
  lastSeenAt: minutesAgo(1), antivirus: "ok", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0,
  lastBackupSuccessAt: hoursAgo(1), backupRequired: true, source: "test", observedAt: NOW.toISOString(), ...over
});
const NO_ALERTS = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
const input = (assets: Asset[], over: Partial<HealthInput> = {}): HealthInput => ({
  assets, sites: [{ id: "s", name: "Siège" }], network: [], alertsBySeverity: NO_ALERTS, ...over
});
const score = (i: HealthInput) => computeHealth(i, DEFAULT_HEALTH_RULES, NOW);
const net = (over: Partial<SiteNetworkStatus>): SiteNetworkStatus =>
  ({ clientId: "c", siteId: "s", box: "up", vpn: "up", internet: "up", observedAt: NOW.toISOString(), ...over });

test("health: a clean estate scores 100 and is healthy", () => {
  const result = score(input([asset("1"), asset("2")]));
  assert.equal(result.score, 100);
  assert.equal(result.band, "healthy");
  assert.deepEqual(result.penalties, []);
  assert.equal(result.rulesetVersion, DEFAULT_HEALTH_RULES.version);
});

test("health: no assets at all is not penalised", () => {
  assert.equal(score(input([])).score, 100);
});

test("health: stale backup counts past the target and when never done, not for machines that need none", () => {
  const result = score(input([
    asset("1", { lastBackupSuccessAt: hoursAgo(49) }),
    asset("2", { lastBackupSuccessAt: null }),
    asset("3", { lastBackupSuccessAt: hoursAgo(47) }),
    asset("4", { lastBackupSuccessAt: null, backupRequired: false })
  ]));
  const penalty = result.penalties.find((p) => p.ruleId === "backup.stale")!;
  assert.equal(penalty.points, 16);
  assert.deepEqual([...penalty.assetIds].sort(), ["1", "2"]);
  assert.equal(result.score, 84);
});

test("health: offline uses the online window", () => {
  const rules = DEFAULT_HEALTH_RULES;
  assert.equal(isOnline({ lastSeenAt: minutesAgo(rules.onlineWithinMinutes) }, rules, NOW), true);
  assert.equal(isOnline({ lastSeenAt: minutesAgo(rules.onlineWithinMinutes + 1) }, rules, NOW), false);
  const result = score(input([asset("1", { lastSeenAt: minutesAgo(600) }), asset("2")]));
  assert.equal(result.penalties.find((p) => p.ruleId === "assets.offline")?.points, 5);
});

test("health: antivirus or firewall not ok, once per machine", () => {
  const result = score(input([
    asset("1", { antivirus: "disabled", firewall: "disabled" }),
    asset("2", { firewall: "outdated" }),
    asset("3", { antivirus: "unknown" })
  ]));
  assert.equal(result.penalties.find((p) => p.ruleId === "antivirus.unhealthy")?.points, 25, "three machines are capped at 25");
  const one = score(input([asset("1", { antivirus: "disabled", firewall: "disabled" })]));
  assert.equal(one.penalties.find((p) => p.ruleId === "antivirus.unhealthy")?.points, 10);
});

test("health: only critical updates are penalised", () => {
  const result = score(input([
    asset("1", { pendingUpdates: 9, criticalUpdates: 0 }),
    asset("2", { pendingUpdates: 2, criticalUpdates: 2 })
  ]));
  assert.equal(result.penalties.find((p) => p.ruleId === "updates.pending")?.points, 4);
});

test("health: each down link counts per site and names the site", () => {
  const result = score(input([asset("1")], { network: [net({ vpn: "down" })] }));
  const penalty = result.penalties.find((p) => p.ruleId === "network.down")!;
  assert.equal(penalty.points, 10);
  assert.match(penalty.detail, /Siège/);
  assert.equal(score(input([asset("1")], { network: [net({ vpn: "unknown" })] })).score, 100, "unknown is not down");
});

test("health: alerts at or above the minimum severity", () => {
  const result = score(input([asset("1")], { alertsBySeverity: { ...NO_ALERTS, medium: 9, high: 1, critical: 1 } }));
  assert.equal(result.penalties.find((p) => p.ruleId === "alerts.recent")?.points, 4);
});

test("health: every rule is capped by its own max", () => {
  const many = Array.from({ length: 12 }, (_, i) => asset(String(i), {
    lastBackupSuccessAt: null, lastSeenAt: minutesAgo(900), antivirus: "disabled", criticalUpdates: 1
  }));
  const result = computeHealth(input(many, {
    network: [net({ box: "down" }), net({ siteId: "s2", vpn: "down" }), net({ siteId: "s3", internet: "down" })],
    alertsBySeverity: { ...NO_ALERTS, critical: 40 }
  }), DEFAULT_HEALTH_RULES, NOW);
  const max = Object.fromEntries(DEFAULT_HEALTH_RULES.rules.map((r) => [r.id, r.max]));
  for (const penalty of result.penalties) assert.equal(penalty.points, max[penalty.ruleId], `${penalty.ruleId} is capped`);
  const total = DEFAULT_HEALTH_RULES.rules.reduce((sum, r) => sum + r.max, 0);
  assert.equal(result.score, Math.max(0, 100 - total));
});

test("health: the score never goes below zero", () => {
  const rules = validateHealthRules({
    version: "t", bands: { healthy: 80, watch: 50 }, onlineWithinMinutes: 30, alertWindowHours: 24, threatMinSeverity: "high",
    rules: [
      { id: "a", kind: "assets.offline", label: "A", detail: "{count}", points: 100, max: 100 },
      { id: "b", kind: "antivirus.unhealthy", label: "B", detail: "{count}", points: 100, max: 100 }
    ]
  });
  const result = computeHealth(input([asset("1", { lastSeenAt: minutesAgo(900), antivirus: "disabled" })]), rules, NOW);
  assert.equal(result.score, 0);
  assert.equal(result.band, "critical");
});

test("health: band boundaries are 80 and 50", () => {
  const rules = DEFAULT_HEALTH_RULES;
  assert.equal(bandOf(100, rules), "healthy");
  assert.equal(bandOf(80, rules), "healthy");
  assert.equal(bandOf(79, rules), "watch");
  assert.equal(bandOf(50, rules), "watch");
  assert.equal(bandOf(49, rules), "critical");
  assert.equal(bandOf(0, rules), "critical");
});

test("health: penalties are explained, largest first, with the affected machines", () => {
  const result = score(input([
    asset("1", { antivirus: "disabled", lastBackupSuccessAt: null }),
    asset("2", { lastSeenAt: minutesAgo(900) })
  ]));
  assert.deepEqual(result.penalties.map((p) => p.ruleId), ["antivirus.unhealthy", "backup.stale", "assets.offline"]);
  assert.deepEqual(result.assetFindings["1"], ["backup.stale", "antivirus.unhealthy"]);
  assert.match(result.penalties[0]!.detail, /H-1/);
  assert.ok(result.penalties.every((p) => p.label.length > 0));
});

test("health: the same input always gives the same result", () => {
  const i = input([asset("1", { antivirus: "disabled" }), asset("2", { lastBackupSuccessAt: null })]);
  assert.deepEqual(score(i), score(i));
});

test("health rules: invalid configurations are refused with an actionable message", () => {
  const valid = JSON.parse(JSON.stringify(DEFAULT_HEALTH_RULES));
  const broken = (mutate: (copy: Record<string, any>) => void) => {
    const copy = JSON.parse(JSON.stringify(valid));
    mutate(copy);
    return () => validateHealthRules(copy);
  };
  assert.doesNotThrow(() => validateHealthRules(valid));
  assert.throws(() => validateHealthRules("nope"), /health rules/);
  assert.throws(broken((c) => { c.rules = []; }), /rules must be a non-empty array/);
  assert.throws(broken((c) => { c.rules[0].kind = "made.up"; }), /kind must be one of/);
  assert.throws(broken((c) => { c.rules[1].id = c.rules[0].id; }), /duplicate rule id/);
  assert.throws(broken((c) => { c.rules[0].points = -1; }), /integer between/);
  assert.throws(broken((c) => { c.rules[0].max = "20"; }), /integer between/);
  assert.throws(broken((c) => { c.bands = { healthy: 50, watch: 80 }; }), /lower than/);
  assert.throws(broken((c) => { c.rules[0].label = ""; }), /non-empty string/);
});

test("health rules: an override file replaces the defaults, a broken file stops startup", () => {
  const dir = mkdtempSync(join(tmpdir(), "aegis-rules-"));
  try {
    assert.equal(loadHealthRules(undefined), DEFAULT_HEALTH_RULES);
    assert.equal(loadHealthRules("  "), DEFAULT_HEALTH_RULES);

    const custom = JSON.parse(JSON.stringify(DEFAULT_HEALTH_RULES));
    custom.version = "custom-1";
    custom.rules = custom.rules.filter((r: { id: string }) => r.id === "assets.offline");
    custom.rules[0].points = 20;
    custom.rules[0].max = 40;
    const file = join(dir, "rules.json");
    writeFileSync(file, JSON.stringify(custom));
    const loaded = loadHealthRules(file);
    assert.equal(loaded.version, "custom-1");
    const offline = [asset("1", { lastSeenAt: minutesAgo(900) })];
    assert.equal(computeHealth(input(offline), loaded, NOW).score, 80, "the custom weight applies");

    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json");
    assert.throws(() => loadHealthRules(bad), /cannot read/);
    assert.throws(() => loadHealthRules(join(dir, "missing.json")), /cannot read/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
