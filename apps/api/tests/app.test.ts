// HTTP surface and the scheduled job, against the in-memory SQL database and a fake mailer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb } from "./db.ts";
import { createApp, runScheduled } from "../src/app.ts";
import type { Deps } from "../src/app.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import type { Email } from "../src/adapters/email.ts";
import { signLink } from "../src/link.ts";
import { createApiKey } from "../src/api-keys.ts";
import * as s from "../src/adapters/store-d1/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const SECRET = "test-link-secret";
const WEB = "https://digest.example.com";
const T0 = new Date("2026-03-02T18:00:00Z");
const H = 3_600_000;

async function setup() {
  const db = await testDb();
  await db.insert(s.employers).values({ id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com", operatorEmail: "operator@example.com" });
  const emails: Email[] = [];
  let now = T0;
  const KEY = (await createApiKey(db, "emp-1", "tests", T0)).key;
  const deps: Deps = {
    db, store: new SqlStore(db), linkSecret: SECRET, webUrl: WEB, consoleUrl: "https://app.example.com", adminUrl: "https://admin.example.com", adminEmail: "owner@example.com", siteUrls: ["https://site.example.com"], contactEmail: "hello@example.com", slaHours: 48,
    sendEmail: async (e) => { emails.push(e); },
    now: () => now,
  };
  const app = createApp(deps);
  const post = (path: string, body: string, key = KEY) =>
    app.request(path, { method: "POST", body, headers: { authorization: `Bearer ${key}`, "content-type": "text/csv" } });
  const seed = async () => { await post("/employers/emp-1/roster", fixture("roster.csv")); await post("/employers/emp-1/imports", fixture("day-1.csv")); };
  const managerId = async (ext: string) => (await db.select().from(s.managers)).find((m) => m.externalId === ext)!.id;
  const link = async (ext: string, exp = now.getTime() + 24 * H) => signLink({ employerId: "emp-1", managerId: await managerId(ext), exp }, SECRET);
  return { app, deps, emails, post, seed, link, advance: (d: Date) => { now = d; } };
}

test("GET /health is open", async () => {
  const { app } = await setup();
  assert.equal((await app.request("/health")).status, 200);
});

test("upload endpoints need a live per-employer key; the key decides the employer", async () => {
  const { post, deps } = await setup();
  assert.equal((await post("/employers/emp-1/roster", fixture("roster.csv"), "wrong")).status, 401);
  assert.equal((await post("/employers/emp-1/roster", fixture("roster.csv"), "")).status, 401);
  await deps.db.insert(s.employers).values({ id: "emp-2", name: "Other", payrollEmail: "p2@example.com", operatorEmail: "o2@example.com" });
  const other = (await createApiKey(deps.db, "emp-2", "other", T0)).key;
  assert.equal((await post("/employers/emp-1/roster", fixture("roster.csv"), other)).status, 403, "another employer's key");
  assert.equal((await post("/employers/emp-2/roster", fixture("roster.csv"), other)).status, 200);
});

test("path/key mismatch → 403; bad csv → 400 with details", async () => {
  const { post } = await setup();
  assert.equal((await post("/employers/nope/roster", fixture("roster.csv"))).status, 403, "the key names emp-1, the path does not");
  const bad = await post("/employers/emp-1/imports", "employee_id,date\nE-001,yesterday");
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json() as { details: string[] }).details, ["line 2: date must be YYYY-MM-DD"]);
});

test("roster then import: detection runs and the response summarises it", async () => {
  const { post } = await setup();
  assert.deepEqual(await (await post("/employers/emp-1/roster", fixture("roster.csv"))).json(), { employees: 3 });
  const res = await post("/employers/emp-1/imports", fixture("day-1.csv"));
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body["gapsCreated"], 2);
  assert.deepEqual(body["period"], { from: "2026-03-01", to: "2026-03-02" });
});

test("scheduled job: digest email carries the signed link and the design's copy; escalations follow the SLA", async () => {
  const { deps, emails, seed, advance } = await setup();
  await seed();

  assert.deepEqual(await runScheduled(deps), { imports: 0, importFailures: 0, digests: 1, escalations: 0 });
  const digest = emails[0]!;
  assert.equal(digest.to, "north@example.com");
  assert.equal(digest.subject, "2 clock gaps on your team — Mon 2 Mar");
  assert.match(digest.text, /^Good morning Manager —/);
  assert.match(digest.text, /Mon 2 Mar\s+Ada Sample\s+—\s+no record/);
  assert.match(digest.text, /Ben Sample\s+—\s+no clock-out/);
  const link = digest.text.match(/Review and resolve: (\S+)/)?.[1];
  assert.ok(link?.startsWith(`${WEB}/d/`), "link points at apps/web");
  assert.match(digest.html, /Review and resolve<\/a>/);
  assert.ok(digest.html.includes(`href="${WEB}/d/`), "html CTA links to apps/web");
  assert.match(digest.text, /expires 16 Mar 2026/);

  advance(new Date(T0.getTime() + 3 * H));
  assert.deepEqual(await runScheduled(deps), { imports: 0, importFailures: 0, digests: 0, escalations: 0 }, "same day: nothing new");

  advance(new Date("2026-03-05T08:00:00Z"));
  assert.equal((await runScheduled(deps)).escalations, 2);
  const esc = emails.filter((e) => e.to === "payroll@example.com");
  assert.equal(esc.length, 2);
  assert.match(esc[0]!.subject, /^Escalation — gap unresolved after 48 h \(/);
  assert.match(esc[0]!.text, /Manager:\s+Manager North/);
  assert.match(esc[0]!.text, /Notified:\s+Mon 2 Mar, 18:00 — no action recorded since/);
  assert.match(esc[0]!.html, /SLA breach/);
  assert.ok(esc[0]!.text.includes(`${WEB}/e/`), "escalation carries the payroll handle link");
});

test("payroll handle link: shows the gap, requires a note, closes once, never escalates again", async () => {
  const { app, deps, emails, seed, advance } = await setup();
  await seed();
  await runScheduled(deps);
  advance(new Date("2026-03-05T08:00:00Z"));
  await runScheduled(deps);
  const esc = emails.filter((e) => e.to === "payroll@example.com");
  const token = esc[0]!.text.split(`${WEB}/e/`)[1]!.split(/\s/)[0]!;

  const page = await app.request(`/e/${token}`);
  assert.equal(page.status, 200);
  const body = await page.json() as { gap: Record<string, unknown>; manager: { fullName: string } };
  assert.equal(body.manager.fullName, "Manager North");
  assert.ok(body.gap["escalatedAt"]);
  assert.equal(body.gap["resolvedAt"], null);

  const json = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await app.request(`/e/${token}/handle`, json({ outcome: "absent" }))).status, 400, "note required");
  assert.equal((await app.request(`/e/${token}/handle`, json({ note: "x" }))).status, 400, "outcome required");
  const ok = await app.request(`/e/${token}/handle`, json({ outcome: "absent", note: "employee left the company on 1 March" }));
  assert.equal(ok.status, 200);
  const done = await ok.json() as Record<string, unknown>;
  assert.equal(done["resolution"], "payroll_action");
  assert.equal(done["outcome"], "absent");
  assert.equal((await app.request(`/e/${token}/handle`, json({ outcome: "absent", note: "again" }))).status, 409);

  // a manager token cannot be used on /e, a payroll token cannot be used on /d
  const gapId = body.gap["id"] as string;
  const managerToken = await signLink({ employerId: "emp-1", managerId: "x", exp: Date.now() + 60_000 }, SECRET);
  assert.equal((await app.request(`/e/${managerToken}`)).status, 401);
  assert.equal((await app.request(`/d/${token}`)).status, 401);
  assert.equal((await app.request(`/d/${token}/gaps/${gapId}/resolve`, { method: "POST" })).status, 401);

  advance(new Date("2026-03-06T08:00:00Z"));
  const again = await runScheduled(deps);
  assert.equal(again.escalations, 0);
  assert.equal(emails.filter((e) => e.to === "payroll@example.com").length, 2, "no new escalation mail");
});

test("a failing mailer leaves no digest row behind, so the next run retries", async () => {
  const { deps, seed } = await setup();
  await seed();
  deps.sendEmail = async () => { throw new Error("provider down"); };
  await assert.rejects(runScheduled(deps), /provider down/);
  assert.equal((await deps.db.select().from(s.digests)).length, 0);
});

test("GET /d/:token returns only that manager's gaps, with shift/record detail", async () => {
  const { app, seed, link } = await setup();
  await seed();
  const res = await app.request(`/d/${await link("M-100")}`);
  assert.equal(res.status, 200);
  const body = await res.json() as { manager: { fullName: string }; employer: { name: string }; gaps: Array<Record<string, unknown>>; unscheduled: unknown[]; slaHours: number };
  assert.equal(body.manager.fullName, "Manager North");
  assert.equal(body.employer.name, "Example Logistics");
  assert.equal(body.slaHours, 48);
  assert.deepEqual(body.gaps.map((g) => [g["employeeName"], g["gapType"]]).sort(), [["Ada Sample", "no_record_at_all"], ["Ben Sample", "no_clockout"]]);
  const ben = body.gaps.find((g) => g["employeeName"] === "Ben Sample")!;
  assert.deepEqual(ben["shift"], { plannedStart: "08:00", plannedEnd: "16:00" });
  assert.deepEqual(ben["record"], { clockIn: "08:01", clockOut: null });
  assert.equal(ben["escalated"], false);
  assert.deepEqual(body.unscheduled, [], "Cyd's unscheduled day belongs to the other manager");

  const south = await (await app.request(`/d/${await link("M-200")}`)).json() as { gaps: unknown[]; unscheduled: Array<Record<string, unknown>> };
  assert.equal(south.gaps.length, 0, "all clear for Manager South");
  assert.equal(south.unscheduled.length, 1);
  assert.equal(south.unscheduled[0]!["employeeName"], "Cyd Sample");
});

test("expired or forged links are refused", async () => {
  const { app, seed, link } = await setup();
  await seed();
  assert.equal((await app.request(`/d/${await link("M-100", T0.getTime() - 1)}`)).status, 401);
  assert.equal((await app.request(`/d/not-a-token`)).status, 401);
});

test("POST resolve: own gap only, once, with an optional note", async () => {
  const { app, deps, seed, link } = await setup();
  await seed();
  const north = await link("M-100"), south = await link("M-200");
  const gaps = await deps.db.select().from(s.gaps);
  const gapId = gaps[0]!.id;

  assert.equal((await app.request(`/d/${south}/gaps/${gapId}/resolve`, { method: "POST" })).status, 404, "another manager's gap");

  const json = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await app.request(`/d/${north}/gaps/${gapId}/resolve`, json({}))).status, 400, "outcome required");
  assert.equal((await app.request(`/d/${north}/gaps/${gapId}/resolve`, json({ outcome: "absent" }))).status, 400, "absence needs a note");
  const ok = await app.request(`/d/${north}/gaps/${gapId}/resolve`, json({ outcome: "present", note: "  badge left at home  " }));
  assert.equal(ok.status, 200);
  const body = await ok.json() as Record<string, unknown>;
  assert.equal(body["resolution"], "manager_action");
  assert.equal(body["outcome"], "present");
  assert.equal(body["note"], "badge left at home");

  assert.equal((await app.request(`/d/${north}/gaps/${gapId}/resolve`, { method: "POST" })).status, 409, "already resolved");
  const events = (await deps.db.select().from(s.events)).map((e) => e.type);
  assert.equal(events.filter((t) => t === "gap_resolved").length, 1);
  const page = await (await app.request(`/d/${north}`)).json() as { gaps: unknown[] };
  assert.equal(page.gaps.length, 1);
});

test("CORS is open only to the web origin", async () => {
  const { app } = await setup();
  const res = await app.request("/d/x", { method: "OPTIONS", headers: { origin: WEB, "access-control-request-method": "GET" } });
  assert.equal(res.headers.get("access-control-allow-origin"), WEB);
  const other = await app.request("/d/x", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
  assert.notEqual(other.headers.get("access-control-allow-origin"), "https://evil.example");
});

test("contact form: validated, honeypot silently dropped, emailed to us with reply address", async () => {
  const { app, emails } = await setup();
  const post = (b: unknown, origin = "https://site.example.com") => app.request("/contact", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(b) });
  const bad = await post({ name: "", email: "nope", message: "hi" });
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json() as { fields: string[] }).fields, ["name", "email", "message"]);
  assert.equal((await post({ name: "Bot", email: "b@example.com", message: "buy now buy now", website: "http://spam" })).status, 202);
  assert.equal(emails.length, 0, "honeypot filled → nothing sent");
  const ok = await post({ name: "Dana Sample", email: "dana@example.com", employer: "Example Logistics", message: "We use an old terminal system, can you read its CSV?", locale: "he" });
  assert.equal(ok.status, 202);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://site.example.com");
  assert.equal(emails.length, 1);
  assert.equal(emails[0]!.to, "hello@example.com");
  assert.equal(emails[0]!.subject, "Contact form: Dana Sample (Example Logistics)");
  assert.match(emails[0]!.text, /From: Dana Sample <dana@example.com>/);
  assert.match(emails[0]!.text, /old terminal system/);
});
