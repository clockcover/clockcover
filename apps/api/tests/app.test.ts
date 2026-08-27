// HTTP surface and the scheduled job, against the in-memory SQL database and a fake mailer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb } from "./db.ts";
import { createApp, runScheduled } from "../src/app.ts";
import type { Deps } from "../src/app.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import type { Email } from "../src/adapters/email.ts";
import * as s from "../src/adapters/store-d1/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const KEY = "test-api-key";
const T0 = new Date("2026-03-02T18:00:00Z");

async function setup() {
  const db = await testDb();
  await db.insert(s.employers).values({ id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com" });
  const emails: Email[] = [];
  let now = T0;
  const deps: Deps = {
    db, store: new SqlStore(db), apiKey: KEY, slaHours: 48,
    sendEmail: async (e) => { emails.push(e); },
    now: () => now,
  };
  const app = createApp(deps);
  const post = (path: string, body: string, key = KEY) =>
    app.request(path, { method: "POST", body, headers: { authorization: `Bearer ${key}`, "content-type": "text/csv" } });
  return { app, deps, emails, post, advance: (d: Date) => { now = d; } };
}

test("GET /health is open", async () => {
  const { app } = await setup();
  const res = await app.request("/health");
  assert.equal(res.status, 200);
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
  const roster = await post("/employers/emp-1/roster", fixture("roster.csv"));
  assert.deepEqual(await roster.json(), { employees: 3 });
  const res = await post("/employers/emp-1/imports", fixture("day-1.csv"));
  assert.equal(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assert.equal(body["gapsCreated"], 2);
  assert.equal(body["gapsResolved"], 0);
  assert.deepEqual(body["period"], { from: "2026-03-01", to: "2026-03-02" });
  assert.deepEqual(body["unknownEmployees"], []);
});

test("scheduled job sends one digest per manager with open gaps, then escalates after the SLA", async () => {
  const { deps, emails, post, advance } = await setup();
  await post("/employers/emp-1/roster", fixture("roster.csv"));
  await post("/employers/emp-1/imports", fixture("day-1.csv"));

  const day1 = await runScheduled(deps);
  assert.deepEqual(day1, { digests: 1, escalations: 0 });
  assert.equal(emails.length, 1);
  assert.equal(emails[0]?.to, "north@example.com");
  assert.match(emails[0]?.subject ?? "", /2 open clock gaps/);
  assert.match(emails[0]?.text ?? "", /Ada Sample\s+—\s+no clock entry at all/);
  assert.match(emails[0]?.text ?? "", /Ben Sample\s+—\s+no clock-out/);

  advance(new Date(T0.getTime() + 3 * 3_600_000));
  assert.deepEqual(await runScheduled(deps), { digests: 0, escalations: 0 }, "same day: nothing new");

  advance(new Date("2026-03-05T08:00:00Z"));
  const day3 = await runScheduled(deps);
  assert.equal(day3.escalations, 2);
  const escalationMails = emails.filter((e) => e.to === "payroll@example.com");
  assert.equal(escalationMails.length, 2);
  assert.match(escalationMails[0]?.subject ?? "", /^ClockCover escalation: /);
  assert.match(escalationMails[0]?.text ?? "", /Manager:\s+Manager North/);
});

test("a failing mailer leaves no digest row behind, so the next run retries", async () => {
  const { deps, post } = await setup();
  await post("/employers/emp-1/roster", fixture("roster.csv"));
  await post("/employers/emp-1/imports", fixture("day-1.csv"));
  deps.sendEmail = async () => { throw new Error("provider down"); };
  await assert.rejects(runScheduled(deps), /provider down/);
  assert.equal((await deps.db.select().from(s.digests)).length, 0);
});
