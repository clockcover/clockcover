// Operator console (ADR-0005): sign-in by magic link, settings, imports, overview.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb } from "./db.ts";
import { createApp, runScheduled } from "../src/app.ts";
import type { Deps } from "../src/app.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import type { Email } from "../src/adapters/email.ts";
import { signLink, signOperator } from "../src/link.ts";
import * as s from "../src/adapters/store-d1/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const SECRET = "test-link-secret";
const WEB = "https://digest.example.com";
const CONSOLE = "https://app.example.com";
const T0 = new Date("2026-03-02T18:00:00Z");
const OPERATOR = "operator@example.com";

async function setup() {
  const db = await testDb();
  await db.insert(s.employers).values({ id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com", operatorEmail: OPERATOR, timezone: "UTC" });
  const emails: Email[] = [];
  let now = T0;
  const deps: Deps = { db, store: new SqlStore(db), linkSecret: SECRET, webUrl: WEB, consoleUrl: CONSOLE, adminUrl: "https://admin.example.com", adminEmail: "owner@example.com", siteUrls: ["https://site.example.com"], contactEmail: "hello@example.com", slaHours: 48, sendEmail: async (e) => { emails.push(e); }, now: () => now };
  const app = createApp(deps);
  const json = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const login = async (email: string) => app.request("/console/login", json({ email }));
  /** The single-use token from the last email — it sits in the URL fragment. */
  const tokenFromEmail = () => emails.at(-1)!.text.split(`${CONSOLE}/#`)[1]!.split(/\s/)[0]!;
  const exchange = (token: string) => app.request("/console/exchange", json({ token }));
  /** Request a link and exchange it: the session token the browser keeps. */
  const signIn = async (email = OPERATOR) => {
    await login(email);
    const res = await exchange(tokenFromEmail());
    assert.equal(res.status, 200, "exchange");
    return (await res.json() as { token: string }).token;
  };
  const authed = (token: string) => (path: string, init: RequestInit = {}) =>
    app.request(`/console${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
  return { app, db, deps, emails, login, tokenFromEmail, exchange, signIn, authed, advance: (d: Date) => { now = d; } };
}

test("login: same 202 for known and unknown addresses; only the known one gets a link", async () => {
  const { login, emails, tokenFromEmail } = await setup();
  assert.equal((await login("nobody@example.com")).status, 202);
  assert.equal(emails.length, 0);
  assert.equal((await login("  Operator@Example.com ")).status, 202);
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.to, "operator@example.com");
  assert.match(emails[0]!.subject, /^Sign in to the ClockCover console — Example Logistics/);
  assert.ok(emails[0]!.text.includes(`${CONSOLE}/#`), "link points at the console host, token in the fragment");
  assert.match(tokenFromEmail(), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "token is url-safe payload.signature");
  assert.equal((await login("not-an-email")).status, 400);
});

test("login: one link per address per minute, same 202 either way; a new minute gives a new, different link", async () => {
  const { login, emails, advance } = await setup();
  assert.equal((await login(OPERATOR)).status, 202);
  advance(new Date(T0.getTime() + 20_000));
  assert.equal((await login(OPERATOR)).status, 202);
  assert.equal(emails.length, 1, "second request within the minute sends nothing");
  advance(new Date(T0.getTime() + 61_000));
  await login(OPERATOR);
  assert.equal(emails.length, 2);
  assert.notEqual(emails[0]!.text, emails[1]!.text, "links are unique");
});

test("exchange: the emailed token becomes a 7-day session once; reuse, expiry, session tokens and link tokens on /me are refused", async () => {
  const { app, login, tokenFromEmail, exchange, authed, advance } = await setup();
  await login(OPERATOR);
  const link = tokenFromEmail();
  assert.equal((await authed(link)("/me")).status, 401, "the emailed token is not a session");
  const first = await exchange(link);
  assert.equal(first.status, 200);
  const { token, sessionExpires } = await first.json() as { token: string; sessionExpires: string };
  assert.equal(sessionExpires, new Date(T0.getTime() + 7 * 86_400_000).toISOString());
  assert.equal((await authed(token)("/me")).status, 200);
  assert.equal((await exchange(link)).status, 401, "single use");
  assert.equal((await exchange(token)).status, 401, "a session token cannot be exchanged");
  assert.equal((await exchange("not-a-token")).status, 401);

  advance(new Date(T0.getTime() + 61_000));
  await login(OPERATOR);
  const late = tokenFromEmail();
  advance(new Date(T0.getTime() + 61_000 + 16 * 60_000));
  assert.equal((await exchange(late)).status, 401, "15 minutes have passed");
  assert.equal((await app.request("/console/exchange", { method: "POST" })).status, 401, "no body");
});

test("exchange: two concurrent redemptions of one link yield exactly one session", async () => {
  const { login, tokenFromEmail, exchange } = await setup();
  await login(OPERATOR);
  const link = tokenFromEmail();
  const results = await Promise.all([exchange(link), exchange(link)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
});

test("console requires an operator token; a manager token is refused", async () => {
  const { app, signIn, authed } = await setup();
  assert.equal((await app.request("/console/me")).status, 401);
  const managerToken = await signLink({ employerId: "emp-1", managerId: "x", exp: T0.getTime() + 60_000 }, SECRET);
  assert.equal((await authed(managerToken)("/me")).status, 401);
  const res = await authed(await signIn())("/me");
  assert.equal(res.status, 200);
  const me = await res.json() as Record<string, unknown>;
  assert.equal(me["name"], "Example Logistics");
  assert.equal(me["slaHours"], 48);
  assert.equal(me["timezone"], "UTC");
});

test("token dies when the operator email changes or the session expires", async () => {
  const { db, signIn, authed, advance } = await setup();
  const api = authed(await signIn());
  await db.update(s.employers).set({ operatorEmail: "other@example.com" });
  assert.equal((await api("/me")).status, 401);
  await db.update(s.employers).set({ operatorEmail: OPERATOR });
  assert.equal((await api("/me")).status, 200);
  advance(new Date(T0.getTime() + 8 * 86_400_000));
  assert.equal((await api("/me")).status, 401, "7-day session expired");
});

test("settings: validated patch; SLA and timezone drive the daily job", async () => {
  const { signIn, authed, deps, emails } = await setup();
  const api = authed(await signIn());
  const patch = (body: unknown) => api("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  const bad = await patch({ timezone: "Mars/Olympus", slaHours: 0.5, payrollEmail: "nope" });
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json() as { details: string[] }).details.length, 3);

  const ok = await patch({ timezone: "Asia/Jerusalem", slaHours: 24, name: " Example Logistics Ltd " });
  assert.equal(ok.status, 200);
  const me = await ok.json() as Record<string, unknown>;
  assert.equal(me["timezone"], "Asia/Jerusalem");
  assert.equal(me["slaHours"], 24);
  assert.equal(me["name"], "Example Logistics Ltd");

  await api("/roster", { method: "POST", body: fixture("roster.csv") });
  await api("/imports", { method: "POST", body: fixture("day-1.csv") });
  emails.length = 0;
  await runScheduled(deps);
  assert.match(emails[0]!.text, /within 24 hours/);
  const [digest] = await deps.db.select().from(s.digests);
  assert.equal(digest!.digestDate, "2026-03-02", "18:00 UTC is still 2 March in Jerusalem");
});

test("imports through the console: history and outcome", async () => {
  const { signIn, authed } = await setup();
  const api = authed(await signIn());
  assert.deepEqual(await (await api("/roster", { method: "POST", body: fixture("roster.csv") })).json(), { employees: 3 });
  const imp = await (await api("/imports", { method: "POST", body: fixture("day-1.csv") })).json() as Record<string, unknown>;
  assert.equal(imp["gapsCreated"], 2);
  const bad = await api("/imports", { method: "POST", body: "employee_id,date\nE-001,nope" });
  assert.equal(bad.status, 400);
  const history = await (await api("/imports")).json() as { imports: Array<{ rowCount: number; trigger: string }> };
  assert.equal(history.imports.length, 1);
  assert.equal(history.imports[0]!.rowCount, 6);
  assert.equal(history.imports[0]!.trigger, "upload");
});

test("overview: open gaps by manager and the SLA metric from the event log", async () => {
  const { signIn, authed, deps, advance } = await setup();
  const api = authed(await signIn());
  await api("/roster", { method: "POST", body: fixture("roster.csv") });
  await api("/imports", { method: "POST", body: fixture("day-1.csv") });
  await runScheduled(deps); // digest → both gaps notified at T0

  // manager resolves one within SLA; the other escalates
  const [gap] = await deps.db.select().from(s.gaps);
  advance(new Date(T0.getTime() + 3_600_000));
  const north = await signLink({ employerId: "emp-1", managerId: gap!.managerId, exp: T0.getTime() + 86_400_000 * 2 }, SECRET);
  await (await setup()).app; // (no-op; keeps the helper shape obvious)
  const app = createApp(deps);
  assert.equal((await app.request(`/d/${north}/gaps/${gap!.id}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome: "present" }) })).status, 200);
  advance(new Date(T0.getTime() + 50 * 3_600_000));
  await runScheduled(deps);

  const ov = await (await api("/overview")).json() as Record<string, unknown> & { byManager: Array<Record<string, unknown>>; metric: Record<string, number> };
  assert.equal(ov["openGaps"], 1);
  assert.equal(ov["escalated"], 1);
  assert.deepEqual(ov.byManager.map((m) => [m["managerName"], m["openGaps"]]), [["Manager North", 1]]);
  assert.deepEqual(ov.metric, { windowDays: 30, notified: 2, actedWithinSla: 1, resolvedByRecord: 0, closedByPayroll: 0, escalated: 1, present: 1, absent: 0 });
});

test("console CORS is open to the app origin only; the digest origin is not enough", async () => {
  const { app } = await setup();
  const pre = (origin: string) => app.request("/console/me", { method: "OPTIONS", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
  assert.equal((await pre(CONSOLE)).headers.get("access-control-allow-origin"), CONSOLE);
  assert.notEqual((await pre(WEB)).headers.get("access-control-allow-origin"), WEB);
});

test("locale: settings switch to Hebrew; the next digest is Hebrew and right-to-left", async () => {
  const { signIn, login, authed, deps, emails, advance } = await setup();
  const api = authed(await signIn());
  const patch = (body: unknown) => api("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await patch({ locale: "fr" })).status, 400);
  const me = await (await patch({ locale: "he" })).json() as Record<string, unknown>;
  assert.equal(me["locale"], "he");
  await api("/roster", { method: "POST", body: fixture("roster.csv") });
  await api("/imports", { method: "POST", body: fixture("day-1.csv") });
  emails.length = 0;
  await runScheduled(deps);
  const digest = emails[0]!;
  assert.match(digest.subject, /^2 פערי החתמה בצוות שלך — יום ב׳ 2 מרץ$/);
  assert.match(digest.html, /<html lang="he" dir="rtl">/);
  assert.match(digest.text, /בוקר טוב Manager,/);
  assert.match(digest.text, /אין רישום כלל/);
  emails.length = 0;
  advance(new Date(T0.getTime() + 61_000)); // past the one-link-per-minute cooldown
  await login(OPERATOR);
  assert.match(emails[0]!.subject, /^כניסה ללוח הבקרה של ClockCover — Example Logistics$/, "sign-in mail follows the employer locale");
});

test("uploads larger than 10 MB are refused, by header and by body", async () => {
  const { app, signIn, authed } = await setup();
  const api = authed(await signIn());
  const declared = await api("/roster", { method: "POST", headers: { "content-length": String(11 * 1024 * 1024) }, body: fixture("roster.csv") });
  assert.equal(declared.status, 413);
  const big = "employee_id,date,planned_start,planned_end,clock_in,clock_out\n" + "E-001,2026-03-02,08:00,16:00,08:01,\n".repeat(320_000); // ~11 MB
  assert.equal((await api("/imports", { method: "POST", body: big })).status, 413);
  const key = (await (await api("/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "t" }) })).json() as { key: string }).key;
  assert.equal((await app.request("/employers/emp-1/imports", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: big })).status, 413);
});

test("corrections CSV: day bounds follow the employer's timezone", async () => {
  const { app, signIn, authed, deps, advance } = await setup();
  const api = authed(await signIn());
  await api("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ timezone: "Asia/Jerusalem" }) });
  await api("/roster", { method: "POST", body: fixture("roster.csv") });
  await api("/imports", { method: "POST", body: fixture("day-1.csv") });
  const [gap] = await deps.db.select().from(s.gaps);
  const north = await signLink({ employerId: "emp-1", managerId: gap!.managerId, exp: T0.getTime() + 86_400_000 }, SECRET);
  advance(new Date("2026-03-02T22:30:00Z")); // 00:30 on 3 March in Jerusalem (UTC+2)
  assert.equal((await app.request(`/d/${north}/gaps/${gap!.id}/resolve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ outcome: "present" }) })).status, 200);
  const rows = async (from: string, to: string) => (await (await api(`/resolutions.csv?from=${from}&to=${to}`)).text()).trim().split("\r\n").length - 1;
  assert.equal(await rows("2026-03-02", "2026-03-02"), 0, "not 2 March locally");
  assert.equal(await rows("2026-03-03", "2026-03-03"), 1, "it is 3 March in Jerusalem");
});

test("a signed operator token for another employer's id, or an unknown employer, is refused", async () => {
  const { authed } = await setup();
  const forged = await signOperator({ kind: "operator", employerId: "emp-2", email: OPERATOR, exp: T0.getTime() + 60_000 }, SECRET);
  assert.equal((await authed(forged)("/me")).status, 401);
});

test("API keys: created once in plaintext, listed hashed, usable on uploads, revocable", async () => {
  const { app, signIn, authed } = await setup();
  const api = authed(await signIn());
  assert.equal((await api("/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 400, "name required");
  const created = await api("/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "HR scheduler" }) });
  assert.equal(created.status, 201);
  const { id, key, prefix } = await created.json() as { id: string; key: string; prefix: string };
  assert.match(key, /^ck_[A-Za-z0-9_-]{32}$/);
  assert.equal(prefix, key.slice(0, 12));
  const list = (await (await api("/api-keys")).json() as { keys: Array<Record<string, unknown>> }).keys;
  assert.equal(list.length, 1);
  assert.equal(list[0]!["name"], "HR scheduler");
  assert.equal(list[0]!["prefix"], prefix);
  assert.ok(!JSON.stringify(list).includes(key), "the plaintext never comes back");
  assert.equal(list[0]!["lastUsedAt"], null);

  const upload = await app.request("/employers/emp-1/roster", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: fixture("roster.csv") });
  assert.equal(upload.status, 200);
  const used = (await (await api("/api-keys")).json() as { keys: Array<Record<string, unknown>> }).keys[0]!;
  assert.ok(used["lastUsedAt"], "use is recorded");

  assert.equal((await api(`/api-keys/${id}`, { method: "DELETE" })).status, 200);
  assert.equal((await api(`/api-keys/${id}`, { method: "DELETE" })).status, 404, "already revoked");
  assert.equal((await app.request("/employers/emp-1/roster", { method: "POST", headers: { authorization: `Bearer ${key}` }, body: fixture("roster.csv") })).status, 401, "revoked key is dead");
});
