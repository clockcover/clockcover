// The SQL Store against real SQLite: the core scenarios that exercise persistence
// (6, 7, 10, 11, 12 from docs/core-design.md), plus the roster/import writers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDailyDigest, runDetection, runEscalations, resolveByManager } from "@clockcover/core";
import type { DigestMessage, Employee } from "@clockcover/core";
import { testDb } from "./db.ts";
import { SqlStore } from "../src/adapters/store-d1/store.ts";
import { saveImport, saveRoster } from "../src/adapters/store-d1/imports.ts";
import { parseCsv, parseRoster } from "../src/adapters/csv.ts";
import * as s from "../src/adapters/store-d1/schema.ts";
import { readFileSync } from "node:fs";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url).pathname, "utf8");
const EMPLOYER = "emp-1";
const DAY = { from: "2026-03-02", to: "2026-03-02" };
const T0 = new Date("2026-03-02T18:00:00Z");
const HOURS = 3_600_000;
const SLA = 48 * HOURS;
const later = (h: number) => new Date(T0.getTime() + h * HOURS);

async function setup() {
  const db = await testDb();
  await db.insert(s.employers).values({ id: EMPLOYER, name: "Example Logistics", payrollEmail: "payroll@example.com" });
  const employees = await saveRoster(db, EMPLOYER, parseRoster(fixture("roster.csv")).rows);
  const store = new SqlStore(db);
  const sent: DigestMessage[] = [];
  const send = async (m: DigestMessage) => { sent.push(m); };
  const importCsv = async (name: string, now = T0) => {
    const saved = await saveImport(db, EMPLOYER, parseCsv(fixture(name)), now);
    return runDetection(store, EMPLOYER, DAY, saved, now);
  };
  return { db, store, employees, sent, send, importCsv };
}

const byExt = (employees: Employee[], ext: string) => employees.find((e) => e.externalId === ext)!;

test("roster upsert is idempotent and reassigns managers", async () => {
  const { db } = await setup();
  const again = await saveRoster(db, EMPLOYER, parseRoster(fixture("roster.csv")).rows);
  assert.equal(again.length, 3);
  assert.equal((await db.select().from(s.managers)).length, 2);
  const moved = parseRoster("employee_id,employee_name,manager_id,manager_name,manager_email\nE-001,Ada Sample,M-200,Manager South,south@example.com").rows;
  const after = await saveRoster(db, EMPLOYER, moved);
  const south = (await db.select().from(s.managers)).find((m) => m.externalId === "M-200")!;
  assert.equal(byExt(after, "E-001").managerId, south.id);
});

test("import + detection: gaps and unscheduled attendance land in SQL (scenarios 1-5 end to end)", async () => {
  const { db, store, employees, importCsv } = await setup();
  const { created } = await importCsv("day-1.csv");
  const types = Object.fromEntries(created.map((g) => [employees.find((e) => e.id === g.employeeId)!.externalId, g.gapType]));
  assert.deepEqual(types, { "E-001": "no_record_at_all", "E-002": "no_clockout" });
  assert.equal((await db.select().from(s.unscheduledAttendance)).length, 1);
  assert.equal((await db.select().from(s.imports)).length, 1);
  assert.equal((await store.listOpenGaps(EMPLOYER)).length, 2);
  assert.equal((await db.select().from(s.events)).filter((e) => e.type === "gap_detected").length, 2);
});

test("6. re-import of the same day → no duplicate gaps, no new events", async () => {
  const { db, importCsv } = await setup();
  await importCsv("day-1.csv");
  const second = await importCsv("day-1.csv", later(1));
  assert.equal(second.created.length, 0);
  assert.equal(second.resolved.length, 0);
  assert.equal((await db.select().from(s.gaps)).length, 2);
  assert.equal((await db.select().from(s.scheduledShifts)).length, 3, "shifts upserted, not duplicated");
  assert.equal((await db.select().from(s.events)).length, 2);
});

test("7. corrected import → gap resolved record_arrived", async () => {
  const { store, employees, importCsv } = await setup();
  await importCsv("day-1.csv");
  const { resolved } = await importCsv("day-1-corrected.csv", later(2));
  assert.equal(resolved.length, 1);
  assert.equal(byExt(employees, "E-001").id, resolved[0]?.employeeId);
  assert.equal(resolved[0]?.resolution, "record_arrived");
  assert.equal((await store.listOpenGaps(EMPLOYER)).length, 1);
});

test("9+10. digests per manager, idempotent per day, notified once", async () => {
  const { db, store, sent, send, importCsv } = await setup();
  await importCsv("day-1.csv");
  await runDailyDigest(store, EMPLOYER, T0, send);
  assert.deepEqual(sent.map((m) => [m.manager.email, m.gaps.length]), [["north@example.com", 2]]);
  const again = await runDailyDigest(store, EMPLOYER, later(3), send);
  assert.equal(again.length, 0);
  assert.equal(sent.length, 1);
  const gaps = await db.select().from(s.gaps);
  assert.ok(gaps.every((g) => g.managerNotifiedAt === T0.toISOString()));
});

test("11+12. escalation after SLA, once; none when resolved by manager", async () => {
  const { db, store, send, importCsv } = await setup();
  await importCsv("day-1.csv");
  await runDailyDigest(store, EMPLOYER, T0, send);
  const [first] = await store.listOpenGaps(EMPLOYER);
  await resolveByManager(store, first!.id, later(1), "called them");
  const escalated = await runEscalations(store, EMPLOYER, later(50), SLA);
  assert.equal(escalated.length, 1);
  assert.equal(escalated[0]?.escalatedTo, "payroll@example.com");
  assert.equal((await runEscalations(store, EMPLOYER, later(51), SLA)).length, 0);
  assert.equal((await db.select().from(s.escalations)).length, 1);
  const types = (await db.select().from(s.events)).map((e) => e.type).sort();
  assert.deepEqual(types, ["digest_sent", "escalated", "gap_detected", "gap_detected", "gap_resolved"]);
});

test("import skips employees missing from the roster and reports them", async () => {
  const { db } = await setup();
  const parsed = parseCsv("employee_id,date,planned_start,planned_end,clock_in,clock_out\nE-999,2026-03-02,08:00,16:00,,\nE-001,2026-03-02,08:00,16:00,,");
  const saved = await saveImport(db, EMPLOYER, parsed, T0);
  assert.deepEqual(saved.unknownEmployees, ["E-999"]);
  assert.equal(saved.shifts.length, 1);
});
