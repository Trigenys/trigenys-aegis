import assert from "node:assert/strict";
import test from "node:test";
import { validateDraft, type NormalizedEventDraft } from "../src/domain/event.js";

const valid: NormalizedEventDraft = {
  schemaVersion: "1.0",
  source: { type: "wazuh", adapterVersion: "1.0.0", eventId: "1" },
  category: "security_alert",
  severity: "high",
  occurredAt: "2026-11-18T09:00:00.000Z",
  title: "Example",
  asset: null,
  rule: null,
  attributes: { "k": "v", "n": 1, "b": true }
};

test("schema 1.0: a well-formed draft is valid", () => {
  assert.deepEqual(validateDraft(valid), []);
});

test("schema 1.0: tenant fields are rejected as unexpected in a draft", () => {
  for (const field of ["clientId", "siteId", "id", "receivedAt"]) {
    const errors = validateDraft({ ...valid, [field]: "x" });
    assert.ok(errors.includes(`unexpected field: ${field}`), field);
  }
});

test("schema 1.0: invalid values are reported", () => {
  const cases: Array<[Partial<Record<keyof NormalizedEventDraft, unknown>>, RegExp]> = [
    [{ schemaVersion: "2.0" }, /schemaVersion/],
    [{ severity: "urgent" }, /severity/],
    [{ category: "misc" }, /category/],
    [{ occurredAt: "2026-11-18 09:00" }, /occurredAt/],
    [{ title: "" }, /title/],
    [{ attributes: { nested: { a: 1 } } }, /attributes\.nested/],
    [{ attributes: { n: Number.NaN } }, /attributes\.n/],
    [{ source: { type: "wazuh" } }, /source\.eventId/],
    [{ rule: { id: "1", description: "", groups: [1], mitreTechniques: [], mitreTactics: [] } }, /rule\.groups/]
  ];
  for (const [patch, expected] of cases) {
    const errors = validateDraft({ ...valid, ...patch });
    assert.ok(errors.some((e) => expected.test(e)), `${JSON.stringify(patch)} -> ${errors.join(", ")}`);
  }
  assert.deepEqual(validateDraft([]), ["event must be an object"]);
});
