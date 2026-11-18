import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { createCockpit } from "../src/composition.js";
import type { OperatorAuthenticator } from "../src/domain/operator.js";
import { createServiceServer } from "../src/server.js";

/** Tests run from dist/test; fixtures stay in the source tree. */
export function loadFixture(name: string): unknown {
  const url = new URL(`../../test/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

export async function startCockpit(t: TestContext, maxBodyBytes?: number, operators?: OperatorAuthenticator) {
  const cockpit = createCockpit({ operators });
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
