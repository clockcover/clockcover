// Operator console (ADR-0005): sign-in by magic link, settings, imports, overview.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb } from "./db.ts";
import { createApp, runScheduled } from "../src/app.ts";
import type { Deps } from "../src/app.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import type { Email } from "../src/adapters/email.ts";
import { signLink } from "../src/link.ts";
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
  const deps: Deps = { db, store: new SqlStore(db), apiKey: "k", linkSecret: SECRET, webUrl: WEB, consoleUrl: CONSOLE, adminUrl: "https://admin.example.com", adminEmail: "owner@example.com", slaHours: 48, sendEmail: async (e) => { emails.push(e); }, now: () => now };
  const app = createApp(deps);
  const login = async (email: string) => app.request("/console/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  const tokenFromEmail = () => emails.at(-1)!.text.split(`${CONSOLE}/console/`)[1]!.split(/\s/)[0]!;
  const authed = (token: string) => (path: string, init: RequestInit = {}) =>
    app.request(`/console${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
  return { app, db, deps, emails, login, tokenFromEmail, authed, advance: (d: Date) => { now = d; } };
}

test("login: same 202 for known and unknown addresses; only the known one gets a link", async () => {
  const { login, emails, tokenFromEmail } = await setup();
  assert.equal((await login("nobody@example.com")).status, 202);
  assert.equal(emails.length, 0);
  assert.equal((await login("  Operator@Example.com ")).status, 202);
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.to, "operator@example.com");
  assert.match(emails[0]!.subject, /^Sign in to the ClockCover console — Example Logistics/);
  assert.ok(emails[0]!.text.includes(`${CONSOLE}/console/`), "link points at the console host, not the digest host");
  assert.match(tokenFromEmail(), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "token is url-safe payload.signature");
  assert.equal((await login("not-an-email")).status, 400);
});

test("login links requested within a minute are identical (rate limit by construction)", async () => {
  const { login, emails, advance } = await setup();
  await login(OPERATOR);
  advance(new Date(T0.getTime() + 20_000));
  await login(OPERATOR);
  assert.equal(emails[0]!.text, emails[1]!.text);
});

test("console requires an operator token; a manager token is refused", async () => {
  const { app, login, tokenFromEmail, authed } = await setup();
  assert.equal((await app.request("/console/me")).status, 401);
  const managerToken = await signLink({ employerId: "emp-1", managerId: "x", exp: T0.getTime() + 60_000 }, SECRET);
  assert.equal((await authed(managerToken)("/me")).status, 401);
  await login(OPERATOR);
  const res = await authed(tokenFromEmail())("/me");
  assert.equal(res.status, 200);
  const me = await res.json() as Record<string, unknown>;
  assert.equal(me["name"], "Example Logistics");
  assert.equal(me["slaHours"], 48);
  assert.equal(me["timezone"], "UTC");
});

test("token dies when the operator email changes or the session expires", async () => {
  const { db, login, tokenFromEmail, authed, advance } = await setup();
  await login(OPERATOR);
  const api = authed(tokenFromEmail());
  await db.update(s.employers).set({ operatorEmail: "other@example.com" });
  assert.equal((await api("/me")).status, 401);
  await db.update(s.employers).set({ operatorEmail: OPERATOR });
  assert.equal((await api("/me")).status, 200);
  advance(new Date(T0.getTime() + 8 * 86_400_000));
  assert.equal((await api("/me")).status, 401, "7-day session expired");
});

test("settings: validated patch; SLA and timezone drive the daily job", async () => {
  const { login, tokenFromEmail, authed, deps, emails } = await setup();
  await login(OPERATOR);
  const api = authed(tokenFromEmail());
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
  const { login, tokenFromEmail, authed } = await setup();
  await login(OPERATOR);
  const api = authed(tokenFromEmail());
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
  const { login, tokenFromEmail, authed, deps, advance } = await setup();
  await login(OPERATOR);
  const api = authed(tokenFromEmail());
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
  const { login, tokenFromEmail, authed, deps, emails } = await setup();
  await login(OPERATOR);
  const api = authed(tokenFromEmail());
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
  await login(OPERATOR);
  assert.match(emails[0]!.subject, /^כניסה ללוח הבקרה של ClockCover — Example Logistics$/, "sign-in mail follows the employer locale");
});
