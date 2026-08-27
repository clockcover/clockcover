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
import * as s from "../src/adapters/store-d1/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const KEY = "test-api-key";
const SECRET = "test-link-secret";
const WEB = "https://digest.example.com";
const T0 = new Date("2026-03-02T18:00:00Z");
const H = 3_600_000;

async function setup() {
  const db = await testDb();
  await db.insert(s.employers).values({ id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com" });
  const emails: Email[] = [];
  let now = T0;
  const deps: Deps = {
    db, store: new SqlStore(db), apiKey: KEY, linkSecret: SECRET, webUrl: WEB, slaHours: 48,
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

test("import endpoints require the API key", async () => {
  const { post } = await setup();
  assert.equal((await post("/employers/emp-1/roster", fixture("roster.csv"), "wrong")).status, 401);
  assert.equal((await post("/employers/emp-1/roster", fixture("roster.csv"), "")).status, 401);
});

test("unknown employer → 404; bad csv → 400 with details", async () => {
  const { post } = await setup();
  assert.equal((await post("/employers/nope/roster", fixture("roster.csv"))).status, 404);
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

  assert.deepEqual(await runScheduled(deps), { digests: 1, escalations: 0 });
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
  assert.deepEqual(await runScheduled(deps), { digests: 0, escalations: 0 }, "same day: nothing new");

  advance(new Date("2026-03-05T08:00:00Z"));
  assert.equal((await runScheduled(deps)).escalations, 2);
  const esc = emails.filter((e) => e.to === "payroll@example.com");
  assert.equal(esc.length, 2);
  assert.match(esc[0]!.subject, /^Escalation — gap unresolved after 48 h \(/);
  assert.match(esc[0]!.text, /Manager:\s+Manager North/);
  assert.match(esc[0]!.text, /Notified:\s+Mon 2 Mar, 18:00 — no action recorded since/);
  assert.match(esc[0]!.html, /SLA breach/);
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

  const ok = await app.request(`/d/${north}/gaps/${gapId}/resolve`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "  badge left at home  " }),
  });
  assert.equal(ok.status, 200);
  const body = await ok.json() as Record<string, unknown>;
  assert.equal(body["resolution"], "manager_action");
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
