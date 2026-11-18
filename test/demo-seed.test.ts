import assert from "node:assert/strict";
import test from "node:test";
import { createCockpit } from "../src/composition.js";
import { seedDemo } from "../src/cli/demo-seed.js";

const AS_OF = new Date("2026-11-18T12:00:00.000Z");
const ENV = { AEGIS_ALLOW_DEMO_SEED: "1" } as NodeJS.ProcessEnv;
const fresh = () => createCockpit({ clock: { now: () => AS_OF } });

test("demo seed: refused unless explicitly allowed", async () => {
  const cockpit = fresh();
  await assert.rejects(seedDemo(cockpit.stores, AS_OF, {} as NodeJS.ProcessEnv), /AEGIS_ALLOW_DEMO_SEED/);
  assert.deepEqual(await cockpit.tenancy.listClients(), []);
});

test("demo seed: loads three clients with distinct health bands", async () => {
  const cockpit = fresh();
  const report = await seedDemo(cockpit.stores, AS_OF, ENV);
  assert.ok(report.created > 0);
  const overview = await cockpit.cockpit.overview();
  assert.equal(overview.clients.length, 3);
  assert.deepEqual(overview.clients.map((c) => c.band).sort(), ["critical", "healthy", "watch"]);
});

test("demo seed: replaying with the same instant writes nothing", async () => {
  const cockpit = fresh();
  const first = await seedDemo(cockpit.stores, AS_OF, ENV);
  assert.ok(first.writes > 0);
  const second = await seedDemo(cockpit.stores, AS_OF, ENV);
  assert.equal(second.writes, 0);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.equal((await cockpit.tenancy.listClients()).length, 3, "no duplicated client");
});

test("demo seed: refused when a non-demo client exists, and nothing is written", async () => {
  const cockpit = fresh();
  await cockpit.tenancy.createClient("Vrai Client SARL");
  await assert.rejects(seedDemo(cockpit.stores, AS_OF, ENV), /non-demo clients/);
  assert.equal((await cockpit.tenancy.listClients()).length, 1);
});
