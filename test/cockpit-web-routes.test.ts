import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { generateOperatorToken, HashedOperatorAuthenticator } from "../src/domain/operator.js";
import { startCockpit } from "./helpers.js";

const START = new Date("2026-11-18T12:00:00.000Z");
const COOKIE = "__Host-aegis_cockpit";
const XSS_TITLE = "<img src=x onerror=alert(1)>";
const XSS_NAME = "<script>alert(1)</script>";

async function web(t: TestContext, withOperator = true) {
  const operator = generateOperatorToken();
  let now = START.getTime();
  const clock = { now: () => new Date(now) };
  const ctx = await startCockpit(t, undefined, withOperator ? new HashedOperatorAuthenticator([operator.sha256]) : undefined, { clock });
  const client = await ctx.tenancy.createClient(XSS_NAME);
  const site = await ctx.tenancy.createSite(client.id, "Siège");
  await ctx.stores.estateStore.upsertAsset(client.id, {
    id: "a1", clientId: client.id, siteId: site.id, kind: "workstation", hostname: "POSTE-1", os: "Windows 11", hardware: null,
    user: null, lastSeenAt: START.toISOString(), antivirus: "disabled", firewall: "ok", pendingUpdates: 0, criticalUpdates: 0,
    lastBackupSuccessAt: null, backupRequired: true, source: "test", observedAt: START.toISOString()
  });
  await ctx.stores.supportStore.upsertTicket(client.id, {
    id: "t1", clientId: client.id, siteId: null, channel: "whatsapp", externalRef: "WA-1", title: XSS_TITLE,
    status: "open", openedAt: START.toISOString(), closedAt: null
  });
  await ctx.stores.supportStore.upsertTicket(client.id, {
    id: "t2", clientId: client.id, siteId: null, channel: "web", externalRef: "WEB-1", title: XSS_TITLE,
    status: "closed", openedAt: "2026-11-02T08:00:00.000Z", closedAt: "2026-11-03T08:00:00.000Z"
  });

  const get = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
    fetch(ctx.baseUrl + path, { redirect: "manual", headers: { ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}), ...headers } });
  const post = (path: string, form: Record<string, string>, cookie?: string, headers: Record<string, string> = {}) =>
    fetch(ctx.baseUrl + path, {
      method: "POST", redirect: "manual", body: new URLSearchParams(form).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}), ...headers }
    });
  const login = async () => {
    const res = await post("/cockpit/login", { token: operator.token });
    const setCookie = res.headers.get("set-cookie") ?? "";
    return { res, setCookie, id: new RegExp(`${COOKIE}=([^;]*)`).exec(setCookie)?.[1] ?? "" };
  };
  return { ...ctx, client, operator, get, post, login, advance: (ms: number) => { now += ms; } };
}

test("cockpit web: every page redirects to the login without a session", async (t) => {
  const { get, client } = await web(t);
  for (const path of ["/cockpit", "/cockpit/", `/cockpit/clients/${client.id}`, `/cockpit/clients/${client.id}/report?period=2026-11`]) {
    const res = await get(path);
    assert.equal(res.status, 303, path);
    assert.equal(res.headers.get("location"), "/cockpit/login", path);
    assert.equal(res.headers.get("set-cookie"), null);
  }
  const forged = await get("/cockpit", "not-a-real-session");
  assert.equal(forged.status, 303, "an unknown session id is no session");
});

test("cockpit web: a wrong token is refused without any cookie and is never echoed", async (t) => {
  const { post, operator } = await web(t);
  const wrong = `${operator.token}x`;
  const res = await post("/cockpit/login", { token: wrong });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.ok(!(await res.text()).includes(wrong));
  assert.equal((await post("/cockpit/login", {})).status, 401, "a missing token is refused too");
});

test("cockpit web: a good token opens a hardened session cookie that is not the token", async (t) => {
  const { login, operator, get } = await web(t);
  const { res, setCookie, id } = await login();
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/cockpit");
  assert.ok(setCookie.startsWith(`${COOKIE}=`));
  for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Strict", "Max-Age=28800"]) {
    assert.ok(setCookie.includes(attribute), `${attribute} in ${setCookie.replace(id, "<id>")}`);
  }
  assert.ok(!/domain=/i.test(setCookie), "host-only cookie");
  assert.ok(id.length >= 40, "at least 256 bits of entropy, encoded");
  assert.notEqual(id, operator.token);
  assert.ok(!setCookie.includes(operator.token));

  const page = await get("/cockpit", id);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Parc clients/);
  assert.equal((await get("/cockpit/login", id)).status, 303, "already signed in goes to the cockpit");
});

test("cockpit web: security headers, no script and no inline style anywhere", async (t) => {
  const { login, get, client } = await web(t);
  const { id } = await login();
  const csp = "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
  for (const path of ["/cockpit/login", "/cockpit", `/cockpit/clients/${client.id}`, `/cockpit/clients/${client.id}/report?period=2026-11`, "/cockpit/assets/cockpit.css"]) {
    const res = await get(path, path === "/cockpit/login" ? undefined : id);
    assert.equal(res.headers.get("content-security-policy"), csp, path);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(res.headers.get("referrer-policy"), "same-origin", path);
    if (!path.endsWith(".css")) {
      assert.equal(res.headers.get("cache-control"), "no-store", path);
      const body = await res.text();
      assert.ok(!/<script/i.test(body.replace(/&lt;script/gi, "")), `${path}: no script element`);
      assert.ok(!/\sstyle\s*=/i.test(body), `${path}: no inline style attribute`);
      assert.ok(!/<style/i.test(body), `${path}: no style element`);
      assert.match(body, /href="\/cockpit\/assets\/cockpit\.css"/, path);
    }
  }
  const css = await get("/cockpit/assets/cockpit.css");
  assert.equal(css.status, 200, "the stylesheet needs no session");
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  const text = await css.text();
  assert.match(text, /prefers-color-scheme:\s*dark/);
  assert.match(text, /@media print/);
  assert.match(text, /@page/);
});

test("cockpit web: client view and monthly report render, with the signature", async (t) => {
  const { login, get, client } = await web(t);
  const { id } = await login();
  const view = await get(`/cockpit/clients/${client.id}`, id);
  assert.equal(view.status, 200);
  assert.match(await view.text(), /Pourquoi \d+ \?/);
  const report = await get(`/cockpit/clients/${client.id}/report?period=2026-11`, id);
  assert.equal(report.status, 200);
  const body = await report.text();
  assert.match(body, /Trigenys Group/);
  assert.match(body, /novembre 2026/);
  assert.equal((await get(`/cockpit/clients/${client.id}/report?period=2027-05`, id)).status, 422, "a future month is refused");
  assert.equal((await get(`/cockpit/clients/${client.id}/report?period=zz`, id)).status, 422);
  assert.equal((await get("/cockpit/clients/6b0f3d6e-2a53-4f0e-9a43-6f9e0f1d2c3b", id)).status, 404);
  assert.equal((await get("/cockpit/unknown", id)).status, 404);
});

test("cockpit web: ticket titles and client names are escaped everywhere", async (t) => {
  const { login, get, client } = await web(t);
  const { id } = await login();
  for (const path of ["/cockpit", `/cockpit/clients/${client.id}`, `/cockpit/clients/${client.id}/report?period=2026-11`]) {
    const body = await (await get(path, id)).text();
    assert.ok(!body.includes(XSS_TITLE), `${path}: raw ticket title`);
    assert.ok(!body.includes(XSS_NAME), `${path}: raw client name`);
    assert.ok(!/<img\b/i.test(body), `${path}: no injected element`);
    assert.ok(body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), `${path}: client name shown escaped`);
  }
  const view = await (await get(`/cockpit/clients/${client.id}`, id)).text();
  assert.ok(view.includes("&lt;img src=x onerror=alert(1)&gt;"), "ticket title shown escaped");
});

test("cockpit web: logout destroys the session and clears the cookie", async (t) => {
  const { login, get, post } = await web(t);
  const { id } = await login();
  assert.equal((await get("/cockpit", id)).status, 200);
  const out = await post("/cockpit/logout", {}, id);
  assert.equal(out.status, 303);
  assert.equal(out.headers.get("location"), "/cockpit/login");
  assert.match(out.headers.get("set-cookie") ?? "", /Max-Age=0/);
  const again = await get("/cockpit", id);
  assert.equal(again.status, 303, "the old cookie is dead server-side, not only in the browser");
  assert.equal((await get("/cockpit/logout", id)).status, 405, "logout is POST only");
});

test("cockpit web: a session expires after its lifetime", async (t) => {
  const { login, get, advance } = await web(t);
  const { id } = await login();
  advance(8 * 3_600_000 - 1000);
  assert.equal((await get("/cockpit", id)).status, 200, "still valid just before the lifetime");
  advance(2000);
  const expired = await get("/cockpit", id);
  assert.equal(expired.status, 303);
  assert.equal(expired.headers.get("location"), "/cockpit/login");
});

test("cockpit web: state-changing requests from another origin are refused", async (t) => {
  const { login, post, operator, baseUrl } = await web(t);
  const foreign = { origin: "https://evil.example" };
  const bad = await post("/cockpit/login", { token: operator.token }, undefined, foreign);
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get("set-cookie"), null, "no session is opened for a cross-origin login");
  assert.equal((await post("/cockpit/login", { token: operator.token }, undefined, { origin: "null" })).status, 403);

  const { id } = await login();
  const logout = await post("/cockpit/logout", {}, id, foreign);
  assert.equal(logout.status, 403);
  const same = await post("/cockpit/logout", {}, id, { origin: baseUrl });
  assert.equal(same.status, 303, "the same origin is accepted");
});

test("cockpit web: a real browser form post (Sec-Fetch-Site, Origin null) logs in; a cross-site one does not", async (t) => {
  const { post, operator } = await web(t);
  const browser = await post("/cockpit/login", { token: operator.token }, undefined, { origin: "null", "sec-fetch-site": "same-origin" });
  assert.equal(browser.status, 303, "Chrome sends Origin: null on same-origin form posts under a strict referrer policy");
  assert.notEqual(browser.headers.get("set-cookie"), null);
  for (const site of ["cross-site", "same-site", "none"]) {
    const refused = await post("/cockpit/login", { token: operator.token }, undefined, { origin: "null", "sec-fetch-site": site });
    assert.equal(refused.status, 403, `Sec-Fetch-Site: ${site} is refused`);
    assert.equal(refused.headers.get("set-cookie"), null);
  }
  const spoofed = await post("/cockpit/login", { token: operator.token }, undefined, { origin: "https://evil.example", "sec-fetch-site": "same-origin" });
  assert.equal(spoofed.status, 403, "a foreign Origin is refused even with Sec-Fetch-Site: same-origin");
});

test("cockpit web: the session cookie never opens the JSON API, and the API token needs no cookie", async (t) => {
  const { login, baseUrl, operator } = await web(t);
  const { id } = await login();
  const withCookie = await fetch(`${baseUrl}/v1/operator/overview`, { headers: { cookie: `${COOKIE}=${id}` } });
  assert.equal(withCookie.status, 401);
  const asBearer = await fetch(`${baseUrl}/v1/operator/overview`, { headers: { authorization: `Bearer ${operator.token}` } });
  assert.equal(asBearer.status, 200);
});

test("cockpit web: without a configured operator the cockpit is disabled", async (t) => {
  const { get, post } = await web(t, false);
  assert.equal((await get("/cockpit/login")).status, 503);
  assert.equal((await post("/cockpit/login", { token: "whatever" })).status, 503);
  assert.equal((await get("/cockpit")).status, 503);
});
