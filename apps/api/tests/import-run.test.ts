// Scheduled import from URLs, "Run import now", and the corrections CSV.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDb } from "./db.ts";
import { createApp, runScheduled } from "../src/app.ts";
import type { Deps } from "../src/app.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import type { Email } from "../src/adapters/email.ts";
import { resolutionsCsv } from "../src/adapters/store-d1/console-queries.ts";
import { validateSourceUrl } from "../src/import-run.ts";
import * as s from "../src/adapters/store-d1/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const SECRET = "test-link-secret";
const CONSOLE = "https://app.example.com";
const T0 = new Date("2026-03-02T18:00:00Z");
const OPERATOR = "operator@example.com";

/** A fake internet: url → body or status. */
function fakeFetch(files: Record<string, string | number>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = files[url];
    if (body === undefined) return new Response("not found", { status: 404 });
    if (typeof body === "number") return new Response("nope", { status: body });
    return new Response(body, { status: 200, headers: { "content-type": "text/csv" } });
  }) as typeof fetch;
}

async function setup(urls: { importUrl?: string; rosterUrl?: string }, files: Record<string, string | number>) {
  const db = await testDb();
  await db.insert(s.employers).values({ id: "emp-1", name: "Example Logistics", payrollEmail: "payroll@example.com", operatorEmail: OPERATOR, timezone: "UTC", importUrl: urls.importUrl ?? null, rosterUrl: urls.rosterUrl ?? null });
  const emails: Email[] = [];
  let now = T0;
  const deps: Deps = { db, store: new SqlStore(db), apiKey: "k", linkSecret: SECRET, webUrl: "https://digest.example.com", consoleUrl: CONSOLE, slaHours: 48, sendEmail: async (e) => { emails.push(e); }, now: () => now, fetch: fakeFetch(files) };
  const app = createApp(deps);
  const login = async () => { await app.request("/console/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OPERATOR }) }); return emails.pop()!.text.split(`${CONSOLE}/console/`)[1]!.split(/\s/)[0]!; };
  const authed = (token: string) => (path: string, init: RequestInit = {}) => app.request(`/console${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
  return { app, db, deps, emails, login, authed, advance: (d: Date) => { now = d; } };
}

const ROSTER = "https://files.example.com/roster.csv", EXPORT = "https://files.example.com/export.csv";

test("the daily job fetches roster and export before the digest; the digest reflects them", async () => {
  const { deps, emails } = await setup({ rosterUrl: ROSTER, importUrl: EXPORT }, { [ROSTER]: fixture("roster.csv"), [EXPORT]: fixture("day-1.csv") });
  const r = await runScheduled(deps);
  assert.deepEqual(r, { imports: 1, importFailures: 0, digests: 1, escalations: 0 });
  assert.equal(emails.length, 1, "one digest, no failure mail");
  assert.match(emails[0]!.subject, /^2 clock gaps/);
  const runs = await deps.db.select().from(s.imports);
  assert.equal(runs[0]!.trigger, "url");
});

test("a failing fetch or a bad file emails the operator with the reason; digests still go out", async () => {
  const { deps, emails, advance } = await setup({ rosterUrl: ROSTER, importUrl: EXPORT }, { [ROSTER]: fixture("roster.csv"), [EXPORT]: fixture("day-1.csv") });
  await runScheduled(deps); // seed via fetch
  emails.length = 0;
  deps.fetch = fakeFetch({ [ROSTER]: fixture("roster.csv"), [EXPORT]: 500 });
  advance(new Date("2026-03-03T08:00:00Z"));
  const r = await runScheduled(deps);
  assert.equal(r.importFailures, 1);
  assert.equal(r.digests, 1, "yesterday's data still produces today's digest");
  const failure = emails.find((e) => e.to === OPERATOR)!;
  assert.match(failure.subject, /import import failed/);
  assert.match(failure.text, /HTTP 500 from files\.example\.com/);
  assert.ok(failure.text.includes(`${CONSOLE}/console/imports`));

  deps.fetch = fakeFetch({ [ROSTER]: fixture("roster.csv"), [EXPORT]: "employee_id,date\nE-001,not-a-date\n" });
  advance(new Date("2026-03-04T08:00:00Z"));
  emails.length = 0;
  await runScheduled(deps);
  assert.match(emails.find((e) => e.to === OPERATOR)!.text, /line 2: date must be YYYY-MM-DD/);
});

test("Run import now: on demand from the console, clear error when nothing is configured", async () => {
  const { login, authed, deps } = await setup({}, {});
  const api = authed(await login());
  assert.equal((await api("/imports/run", { method: "POST" })).status, 400);
  await api("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ importUrl: EXPORT, rosterUrl: ROSTER }) });
  deps.fetch = fakeFetch({ [ROSTER]: fixture("roster.csv"), [EXPORT]: fixture("day-1.csv") });
  const run = await api("/imports/run", { method: "POST" });
  assert.equal(run.status, 200);
  const body = await run.json() as { roster: { employees: number }; import: { gapsCreated: number } };
  assert.equal(body.roster.employees, 3);
  assert.equal(body.import.gapsCreated, 2);
  deps.fetch = fakeFetch({ [ROSTER]: fixture("roster.csv"), [EXPORT]: 404 });
  const bad = await api("/imports/run", { method: "POST" });
  assert.equal(bad.status, 502);
  assert.match((await bad.json() as { error: string }).error, /HTTP 404/);
});

test("settings validate source URLs: https only, empty clears", async () => {
  const { login, authed } = await setup({}, {});
  const api = authed(await login());
  const patch = (b: unknown) => api("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await patch({ importUrl: "http://insecure.example.com/x.csv" })).status, 400);
  assert.equal((await patch({ importUrl: "not a url" })).status, 400);
  const ok = await (await patch({ importUrl: EXPORT })).json() as Record<string, unknown>;
  assert.equal(ok["importUrl"], EXPORT);
  const cleared = await (await patch({ importUrl: "" })).json() as Record<string, unknown>;
  assert.equal(cleared["importUrl"], null);
  assert.deepEqual(validateSourceUrl(" "), { url: null });
});

test("corrections CSV: only human resolutions in the range, with planned hours for approved days", async () => {
  const { app, deps, login, authed, advance } = await setup({ rosterUrl: ROSTER, importUrl: EXPORT }, { [ROSTER]: fixture("roster.csv"), [EXPORT]: fixture("day-1.csv") });
  await runScheduled(deps);
  const gaps = await deps.db.select().from(s.gaps);
  const ada = gaps.find((g) => g.gapType === "no_record_at_all")!, ben = gaps.find((g) => g.gapType === "no_clockout")!;
  const { signLink } = await import("../src/link.ts");
  const north = await signLink({ employerId: "emp-1", managerId: ada.managerId, exp: T0.getTime() + 86_400_000 }, SECRET);
  const json = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  advance(new Date("2026-03-02T19:00:00Z"));
  assert.equal((await app.request(`/d/${north}/gaps/${ada.id}/resolve`, json({ outcome: "absent", note: "sick, called in \"late\"" }))).status, 200);
  advance(new Date("2026-03-02T19:30:00Z"));
  assert.equal((await app.request(`/d/${north}/gaps/${ben.id}/resolve`, json({ outcome: "present" }))).status, 200);

  const api = authed(await login());
  assert.equal((await api("/resolutions.csv?from=2026-03-02")).status, 400);
  const res = await api("/resolutions.csv?from=2026-03-02&to=2026-03-02");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /clockcover-corrections-2026-03-02-2026-03-02\.csv/);
  const lines = (await res.text()).trim().split("\r\n");
  assert.equal(lines[0], "date,employee_id,employee_name,manager_name,gap_type,outcome,resolution,resolved_by,resolved_at,note,planned_start,planned_end,planned_hours,clock_in,clock_out");
  assert.equal(lines.length, 3);
  assert.match(lines[1]!, /^2026-03-02,E-001,Ada Sample,Manager North,no_record_at_all,absent,manager_action,manager,2026-03-02T19:00:00\.000Z,"sick, called in ""late""",08:00,16:00,,,$/);
  assert.match(lines[2]!, /^2026-03-02,E-002,Ben Sample,Manager North,no_clockout,present,manager_action,manager,2026-03-02T19:30:00\.000Z,,08:00,16:00,8\.00,08:01,$/);
  const empty = await api("/resolutions.csv?from=2026-03-03&to=2026-03-09");
  assert.equal((await empty.text()).trim().split("\r\n").length, 1, "header only");
  assert.equal(resolutionsCsv([]).split("\r\n").length, 2);
});
