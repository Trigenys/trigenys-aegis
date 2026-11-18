import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { generateOperatorToken, HashedOperatorAuthenticator } from "../src/domain/operator.js";
import type { Client, Site } from "../src/domain/tenancy.js";
import { loadFixture, startCockpit } from "./helpers.js";

async function withOperator(t: TestContext) {
  const operator = generateOperatorToken();
  const ctx = await startCockpit(t, undefined, new HashedOperatorAuthenticator([operator.sha256]));
  return { ...ctx, op: operator.token };
}

test("operator: full onboarding flow, then the issued token ingests for its client and site", async (t) => {
  const { call, op } = await withOperator(t);

  const created = await call("POST", "/v1/operator/clients", op, { name: "Boulangerie Dupont" });
  assert.equal(created.status, 201);
  const client = await created.json() as Client;

  const siteRes = await call("POST", `/v1/operator/clients/${client.id}/sites`, op, { name: "Atelier" });
  assert.equal(siteRes.status, 201);
  const site = await siteRes.json() as Site;
  assert.equal(site.clientId, client.id);

  const ingestRes = await call("POST", `/v1/operator/clients/${client.id}/credentials`, op,
    { scopes: ["events:ingest"], siteId: site.id });
  assert.equal(ingestRes.status, 201);
  assert.equal(ingestRes.headers.get("cache-control"), "no-store");
  const ingest = await ingestRes.json() as { credentialId: string; token: string };
  const read = await (await call("POST", `/v1/operator/clients/${client.id}/credentials`, op,
    { scopes: ["events:read"] })).json() as { token: string };

  assert.equal((await call("POST", "/v1/sources/wazuh/events", ingest.token,
    loadFixture("wazuh/sshd-bruteforce.json"))).status, 202);
  const events = (await (await call("GET", "/v1/events", read.token)).json()).events;
  assert.equal(events[0].clientId, client.id);
  assert.equal(events[0].siteId, site.id);

  assert.deepEqual((await (await call("GET", "/v1/operator/clients", op)).json()).clients, [client]);
  assert.deepEqual((await (await call("GET", `/v1/operator/clients/${client.id}`, op)).json()), client);
  assert.deepEqual((await (await call("GET", `/v1/operator/clients/${client.id}/sites`, op)).json()).sites, [site]);

  const credentials = (await (await call("GET", `/v1/operator/clients/${client.id}/credentials`, op)).json()).credentials;
  assert.equal(credentials.length, 2);
  const listed = JSON.stringify(credentials);
  assert.ok(!listed.includes("secretHash") && !listed.includes(ingest.token), "no secret material is listed");
});

test("operator: revocation is immediate, idempotent and scoped to the client", async (t) => {
  const { call, op } = await withOperator(t);
  const a = await (await call("POST", "/v1/operator/clients", op, { name: "A" })).json() as Client;
  const b = await (await call("POST", "/v1/operator/clients", op, { name: "B" })).json() as Client;
  const issued = await (await call("POST", `/v1/operator/clients/${a.id}/credentials`, op,
    { scopes: ["events:ingest"] })).json() as { credentialId: string; token: string };
  const alert = loadFixture("wazuh/sshd-bruteforce.json");

  assert.equal((await call("DELETE", `/v1/operator/clients/${b.id}/credentials/${issued.credentialId}`, op)).status, 404,
    "a credential cannot be revoked through another client");
  assert.equal((await call("POST", "/v1/sources/wazuh/events", issued.token, alert)).status, 202);

  const path = `/v1/operator/clients/${a.id}/credentials/${issued.credentialId}`;
  assert.equal((await call("DELETE", path, op)).status, 204);
  assert.equal((await call("DELETE", path, op)).status, 204, "second revocation is a no-op");
  assert.equal((await call("POST", "/v1/sources/wazuh/events", issued.token, alert)).status, 401);

  const listed = (await (await call("GET", `/v1/operator/clients/${a.id}/credentials`, op)).json()).credentials;
  assert.ok(listed[0].revokedAt);
});

test("operator: retries do not create twins (case-insensitive names)", async (t) => {
  const { call, op } = await withOperator(t);
  const client = await (await call("POST", "/v1/operator/clients", op, { name: "Garage Martin" })).json() as Client;
  assert.equal((await call("POST", "/v1/operator/clients", op, { name: " garage martin " })).status, 409);
  await call("POST", `/v1/operator/clients/${client.id}/sites`, op, { name: "Siège" });
  assert.equal((await call("POST", `/v1/operator/clients/${client.id}/sites`, op, { name: "SIÈGE" })).status, 409);
  assert.equal((await (await call("GET", "/v1/operator/clients", op)).json()).clients.length, 1);
});

test("operator: a client cannot be given a credential bound to another client's site", async (t) => {
  const { call, op } = await withOperator(t);
  const a = await (await call("POST", "/v1/operator/clients", op, { name: "A" })).json() as Client;
  const b = await (await call("POST", "/v1/operator/clients", op, { name: "B" })).json() as Client;
  const siteB = await (await call("POST", `/v1/operator/clients/${b.id}/sites`, op, { name: "B1" })).json() as Site;
  const res = await call("POST", `/v1/operator/clients/${a.id}/credentials`, op, { scopes: ["events:ingest"], siteId: siteB.id });
  assert.equal(res.status, 422);
  assert.equal((await (await call("GET", `/v1/operator/clients/${a.id}/credentials`, op)).json()).credentials.length, 0);
});

test("operator: input validation", async (t) => {
  const { call, op } = await withOperator(t);
  const client = await (await call("POST", "/v1/operator/clients", op, { name: "V" })).json() as Client;
  const creds = `/v1/operator/clients/${client.id}/credentials`;
  const cases: Array<[string, string, unknown, number]> = [
    ["POST", "/v1/operator/clients", { name: "" }, 422],
    ["POST", "/v1/operator/clients", { name: 42 }, 422],
    ["POST", "/v1/operator/clients", ["x"], 422],
    ["POST", creds, { scopes: [] }, 422],
    ["POST", creds, { scopes: ["admin"] }, 422],
    ["POST", creds, { scopes: "events:read" }, 422],
    ["POST", creds, { scopes: ["events:read"], siteId: 7 }, 422],
    ["GET", "/v1/operator/clients/00000000-0000-4000-8000-000000000000", undefined, 404],
    ["POST", "/v1/operator/clients/00000000-0000-4000-8000-000000000000/sites", { name: "x" }, 404],
    ["PUT", "/v1/operator/clients", { name: "x" }, 405],
    ["GET", "/v1/operator/clients/not-a-uuid", undefined, 404]
  ];
  for (const [method, path, body, status] of cases) {
    assert.equal((await call(method, path, op, body)).status, status, `${method} ${path} ${JSON.stringify(body)}`);
  }
});

test("operator: client credentials and bad tokens never reach the operator API", async (t) => {
  const { call, op, tenancy } = await withOperator(t);
  const client = await tenancy.createClient("C");
  const clientToken = (await tenancy.issueCredential(client.id, ["events:ingest", "events:read"])).token;
  const other = generateOperatorToken().token;
  const tampered = op.slice(0, -1) + (op.endsWith("A") ? "B" : "A");
  for (const token of [undefined, clientToken, other, tampered]) {
    assert.equal((await call("GET", "/v1/operator/clients", token)).status, 401, String(token));
    assert.equal((await call("POST", "/v1/operator/clients", token, { name: "Evil" })).status, 401);
  }
  // And the operator token is not a client credential.
  assert.equal((await call("GET", "/v1/events", op)).status, 401);
  assert.equal((await call("GET", "/v1/operator/clients", op)).status, 200);
});

test("operator: the API is disabled (503) when no operator is configured", async (t) => {
  const unconfigured = await startCockpit(t);
  assert.equal((await unconfigured.call("GET", "/v1/operator/clients", generateOperatorToken().token)).status, 503);
  const empty = await startCockpit(t, undefined, HashedOperatorAuthenticator.fromList(" , "));
  assert.equal((await empty.call("GET", "/v1/operator/clients")).status, 503);
});

test("operator authenticator: config parsing and verification", () => {
  const one = generateOperatorToken();
  const two = generateOperatorToken();
  const auth = HashedOperatorAuthenticator.fromList(` ${one.sha256.toUpperCase()} ,${two.sha256}`);
  assert.equal(auth.enabled, true);
  assert.equal(auth.verify(one.token), true);
  assert.equal(auth.verify(two.token), true);
  assert.equal(auth.verify(generateOperatorToken().token), false);
  assert.equal(auth.verify(one.sha256), false, "the hash itself is not a token");
  assert.throws(() => HashedOperatorAuthenticator.fromList("not-a-hash"), /64 lowercase hex/);
});
