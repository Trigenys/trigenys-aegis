import assert from "node:assert/strict";
import test from "node:test";
import { AdapterError } from "../src/adapters/sources/contract.js";
import { parseWazuhTimestamp, WazuhAdapter, wazuhLevelToSeverity } from "../src/adapters/sources/wazuh.js";
import { validateDraft } from "../src/domain/event.js";
import { loadFixture } from "./helpers.js";

const adapter = new WazuhAdapter();

test("wazuh: sshd brute-force alert maps to a valid normalized security alert", () => {
  const [event] = adapter.normalize(loadFixture("wazuh/sshd-bruteforce.json"));
  assert.ok(event);
  assert.deepEqual(validateDraft(event), []);
  assert.deepEqual(event, {
    schemaVersion: "1.0",
    source: { type: "wazuh", adapterVersion: "1.0.0", eventId: "1763428424.4428121" },
    category: "security_alert",
    severity: "medium",
    occurredAt: "2026-11-18T01:13:44.512Z",
    title: "sshd: brute force trying to get access to the system. Non existent user.",
    asset: { id: "003", hostname: "srv-files-01", ip: "10.10.1.20" },
    rule: {
      id: "5712",
      description: "sshd: brute force trying to get access to the system. Non existent user.",
      groups: ["syslog", "sshd", "authentication_failures"],
      mitreTechniques: ["T1110"],
      mitreTactics: ["Credential Access"]
    },
    attributes: {
      "wazuh.rule.level": 10,
      "wazuh.location": "/var/log/auth.log",
      "wazuh.decoder": "sshd",
      "wazuh.manager": "wazuh-manager",
      "wazuh.rule.firedtimes": 3
    }
  });
});

test("wazuh: raw logs and free-form data are not carried into the normalized event", () => {
  const serialized = JSON.stringify(adapter.normalize(loadFixture("wazuh/sshd-bruteforce.json")));
  assert.ok(!serialized.includes("Invalid user"), "full_log/previous_output must be dropped");
  assert.ok(!serialized.includes("203.0.113.7"), "data.srcip must be dropped");
  const batch = JSON.stringify(adapter.normalize(loadFixture("wazuh/batch-windows-defender.json")));
  assert.ok(!batch.includes("jdoe"));
});

test("wazuh: a batch yields one event per alert with severities from rule level", () => {
  const events = adapter.normalize(loadFixture("wazuh/batch-windows-defender.json"));
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.severity), ["info", "critical"]);
  assert.deepEqual(events[0]?.asset, { id: "007", hostname: "PC-COMPTA-02", ip: null });
  for (const event of events) assert.deepEqual(validateDraft(event), []);
});

test("wazuh: tenant-like fields in the alert never appear in the draft", () => {
  const [event] = adapter.normalize(loadFixture("wazuh/spoofed-tenant.json"));
  assert.ok(event);
  assert.ok(!JSON.stringify(event).includes("__VICTIM"));
  assert.ok(!("clientId" in event) && !("siteId" in event));
});

test("wazuh: level-to-severity boundaries", () => {
  const cases: Array<[number, string]> = [[0, "info"], [3, "info"], [4, "low"], [6, "low"], [7, "medium"],
    [11, "medium"], [12, "high"], [14, "high"], [15, "critical"]];
  for (const [level, severity] of cases) assert.equal(wazuhLevelToSeverity(level), severity, `level ${level}`);
});

test("wazuh: timestamps with and without colon offsets normalize to UTC", () => {
  assert.equal(parseWazuhTimestamp("2026-11-18T09:12:44.123+0000"), "2026-11-18T09:12:44.123Z");
  assert.equal(parseWazuhTimestamp("2026-11-18T09:12:44.123-05:00"), "2026-11-18T14:12:44.123Z");
  assert.equal(parseWazuhTimestamp("yesterday"), null);
  assert.equal(parseWazuhTimestamp(1763428424), null);
});

test("wazuh: missing alert id falls back to a stable content hash", () => {
  const alert = { timestamp: "2026-11-18T09:00:00.000+0000", rule: { id: "1", level: 5, description: "x" } };
  const first = adapter.normalize(alert)[0]?.source.eventId;
  assert.match(first ?? "", /^sha256:[a-f0-9]{64}$/);
  assert.equal(adapter.normalize(structuredClone(alert))[0]?.source.eventId, first);
});

test("wazuh: malformed alerts are rejected with an adapter error", () => {
  const invalid: unknown[] = [
    null, "text", [], { rule: { id: "1", level: 3 } },
    { timestamp: "2026-11-18T09:00:00Z", rule: { level: 3 } },
    { timestamp: "2026-11-18T09:00:00Z", rule: { id: "1", level: 16 } },
    { timestamp: "nope", rule: { id: "1", level: 3 } }
  ];
  for (const payload of invalid) {
    assert.throws(() => adapter.normalize(payload), AdapterError, JSON.stringify(payload));
  }
  assert.throws(() => adapter.normalize(new Array(501).fill({})), /batch exceeds/);
});
