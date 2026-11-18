import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { createCockpit, type CockpitOptions } from "../src/composition.js";
import type { OperatorAuthenticator } from "../src/domain/operator.js";
import { createServiceServer } from "../src/server.js";

/** Tests run from dist/test; fixtures stay in the source tree. */
export function loadFixture(name: string): unknown {
  const url = new URL(`../../test/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

export async function startCockpit(
  t: TestContext,
  maxBodyBytes?: number,
  operators?: OperatorAuthenticator,
  options: CockpitOptions = {}
) {
  const cockpit = createCockpit({ ...options, operators });
  const server = createServiceServer({ name: "aegis-test", version: "0.0.0" }, { ...cockpit, maxBodyBytes });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("server has no address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const call = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(baseUrl + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  return { ...cockpit, baseUrl, call };
}

/**
 * PostgreSQL integration tests need an admin connection string in
 * AEGIS_TEST_DATABASE_URL (any disposable server, e.g. the docker command in
 * docs/architecture.md). Each call creates a throwaway database owned by a
 * fresh non-superuser role, so row-level security applies as in production.
 */
export const PG_ADMIN_URL = process.env.AEGIS_TEST_DATABASE_URL?.trim() || undefined;

export interface TestDatabase {
  url: string;
  role: string;
  /** Registers a cleanup that runs (last-in, first-out) before the database is dropped. */
  defer(cleanup: () => unknown): void;
}

export async function createTestDatabase(t: TestContext): Promise<TestDatabase> {
  if (!PG_ADMIN_URL) throw new Error("AEGIS_TEST_DATABASE_URL is not set");
  const { default: pg } = await import("pg");
  const suffix = randomBytes(6).toString("hex");
  const role = `aegis_t_${suffix}`;
  const password = randomBytes(18).toString("base64url");
  const admin = new pg.Client({ connectionString: PG_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
    await admin.query(`CREATE DATABASE ${role} OWNER ${role}`);
  } finally {
    await admin.end();
  }
  const deferred: Array<() => unknown> = [];
  t.after(async () => {
    for (const fn of deferred.reverse()) await fn();
    const cleanup = new pg.Client({ connectionString: PG_ADMIN_URL });
    await cleanup.connect();
    try {
      await cleanup.query(`DROP DATABASE IF EXISTS ${role} WITH (FORCE)`);
      await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
    } finally {
      await cleanup.end();
    }
  });
  const url = new URL(PG_ADMIN_URL);
  url.username = role;
  url.password = password;
  url.pathname = `/${role}`;
  return { url: url.toString(), role, defer: (fn) => void deferred.push(fn) };
}
