// Owner admin area (ADR-0006): sign-in, employer list, create + invite, change operator.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb } from "./db.ts";
import { createApp } from "../src/app.ts";
import type { Deps } from "../src/app.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import type { Email } from "../src/adapters/email.ts";
import { signOperator } from "../src/link.ts";
import { createApiKey } from "../src/api-keys.ts";
import * as s from "../src/adapters/store-d1/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const SECRET = "test-link-secret";
const ADMIN = "https://admin.example.com", CONSOLE = "https://app.example.com";
const OWNER = "owner@example.com";
const T0 = new Date("2026-03-02T18:00:00Z");

async function setup() {
  const db = await testDb();
  await db.insert(s.employers).values({ id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com", operatorEmail: "operator@example.com", timezone: "UTC" });
  const emails: Email[] = [];
  let now = T0;
  const deps: Deps = { db, store: new SqlStore(db), linkSecret: SECRET, webUrl: "https://digest.example.com", consoleUrl: CONSOLE, adminUrl: ADMIN, adminEmail: OWNER, siteUrls: ["https://site.example.com"], contactEmail: "hello@example.com", slaHours: 48, sendEmail: async (e) => { emails.push(e); }, now: () => now };
  const app = createApp(deps);
  const json = (b: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const login = async (email: string) => app.request("/admin/login", json({ email }));
  /** The single-use token from the last email — in the URL fragment. */
  const tokenFromEmail = () => emails.at(-1)!.text.split(`${ADMIN}/#`)[1]!.split(/\s/)[0]!;
  const exchange = (token: string) => app.request("/admin/exchange", json({ token }));
  const signIn = async () => {
    await login(OWNER);
    const res = await exchange(tokenFromEmail());
    assert.equal(res.status, 200, "exchange");
    return (await res.json() as { token: string }).token;
  };
  const authed = (token: string) => (path: string, init: RequestInit = {}) =>
    app.request(`/admin${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
  return { app, db, deps, emails, json, login, tokenFromEmail, exchange, signIn, authed, advance: (d: Date) => { now = d; } };
}

test("only the owner's address gets a link; same 202 for anyone; one link per minute", async () => {
  const { login, emails, advance } = await setup();
  assert.equal((await login("operator@example.com")).status, 202);
  assert.equal(emails.length, 0, "an operator is not the owner");
  assert.equal((await login(" Owner@Example.com ")).status, 202);
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.subject, "Sign in to ClockCover admin");
  assert.ok(emails[0]!.text.includes(`${ADMIN}/#`));
  assert.equal((await login(OWNER)).status, 202);
  assert.equal(emails.length, 1, "cooldown: no second email within the minute");
  advance(new Date(T0.getTime() + 61_000));
  await login(OWNER);
  assert.equal(emails.length, 2);
});

test("exchange: emailed token → 7-day admin session, once; expired, reused or session tokens are refused", async () => {
  const { login, tokenFromEmail, exchange, authed, advance } = await setup();
  await login(OWNER);
  const link = tokenFromEmail();
  assert.equal((await authed(link)("/me")).status, 401, "the emailed token is not a session");
  const ok = await exchange(link);
  assert.equal(ok.status, 200);
  const { token } = await ok.json() as { token: string };
  assert.equal((await authed(token)("/me")).status, 200);
  assert.equal((await exchange(link)).status, 401, "single use");
  assert.equal((await exchange(token)).status, 401, "session token is not exchangeable");
  advance(new Date(T0.getTime() + 61_000));
  await login(OWNER);
  const late = tokenFromEmail();
  advance(new Date(T0.getTime() + 61_000 + 16 * 60_000));
  assert.equal((await exchange(late)).status, 401, "expired after 15 minutes");
});

test("admin endpoints refuse no token, operator tokens, and a changed ADMIN_EMAIL", async () => {
  const { app, deps, signIn, authed } = await setup();
  assert.equal((await app.request("/admin/employers")).status, 401);
  const opToken = await signOperator({ kind: "operator", employerId: "emp-1", email: "operator@example.com", exp: T0.getTime() + 60_000 }, SECRET);
  assert.equal((await authed(opToken)("/employers")).status, 401);
  const token = await signIn();
  const api = authed(token);
  assert.equal((await api("/me")).status, 200);
  deps.adminEmail = "someone-else@example.com";
  assert.equal((await authed(token)("/me")).status, 401, "token names an address that is no longer the owner");
});

test("employer list carries headcount, operator, open gaps, last import", async () => {
  const { app, db, signIn, authed, json } = await setup();
  const k = (await createApiKey(db, "emp-1", "test", T0)).key;
  await app.request("/employers/emp-1/roster", { method: "POST", headers: { authorization: `Bearer ${k}` }, body: fixture("roster.csv") });
  await app.request("/employers/emp-1/imports", { method: "POST", headers: { authorization: `Bearer ${k}` }, body: fixture("day-1.csv") });
  const api = authed(await signIn());
  const list = (await (await api("/employers")).json() as { employers: Array<Record<string, unknown>> }).employers;
  assert.equal(list.length, 1);
  const e = list[0]!;
  assert.equal(e["name"], "Example Logistics");
  assert.equal(e["activeEmployees"], 3);
  assert.equal(e["managers"], 2);
  assert.equal(e["openGaps"], 2);
  assert.equal(e["escalatedOpen"], 0);
  assert.equal(e["operatorEmail"], "operator@example.com");
  assert.equal(e["activeApiKeys"], 1);
  assert.ok(e["lastImportAt"]);
  void json;
});

test("create an employer → operator receives a console invite; validation; change operator re-invites", async () => {
  const { db, emails, signIn, authed, json } = await setup();
  const api = authed(await signIn());
  emails.length = 0;

  const bad = await api("/employers", json({ name: "", payrollEmail: "x", timezone: "Nowhere/City" }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json() as { details: string[] }).details.length, 4, "name empty, payroll not email, timezone invalid, operator required");

  const created = await api("/employers", json({ name: "Second Employer", payrollEmail: "pay2@example.com", operatorEmail: "Op2@Example.com", timezone: "Asia/Jerusalem", locale: "he" }));
  assert.equal(created.status, 201);
  const { id, invited } = await created.json() as { id: string; invited: boolean };
  assert.equal(invited, true);
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.to, "op2@example.com");
  assert.match(emails[0]!.subject, /^כניסה ללוח הבקרה של ClockCover — Second Employer$/, "invite in the employer's language");
  assert.ok(emails[0]!.text.includes(`${CONSOLE}/#`), "invite is a console link, not an admin link");
  const [row] = await db.select().from(s.employers).where((await import("drizzle-orm")).eq(s.employers.id, id));
  assert.equal(row!.timezone, "Asia/Jerusalem");
  assert.equal(row!.slaHours, 48);
  assert.equal(row!.locale, "he");

  emails.length = 0;
  assert.equal((await api(`/employers/${id}`, json({ name: "Second Employer Ltd" }, "PATCH"))).status, 200);
  assert.equal(emails.length, 0, "renaming does not re-invite");
  const changed = await (await api(`/employers/${id}`, json({ operatorEmail: "op3@example.com" }, "PATCH"))).json() as { invited: boolean };
  assert.equal(changed.invited, true);
  assert.equal(emails.at(-1)!.to, "op3@example.com");
  assert.equal((await api("/employers/nope", json({ name: "x" }, "PATCH"))).status, 404);

  emails.length = 0;
  assert.equal((await api(`/employers/${id}/invite`, { method: "POST" })).status, 200);
  assert.equal(emails.length, 1, "resend invite on demand");
});
