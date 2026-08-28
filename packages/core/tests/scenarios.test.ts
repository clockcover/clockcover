// The acceptance scenarios from docs/core-design.md, one test per row, same numbering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectGaps, runDetection } from "../src/detect.ts";
import { isoDate, runDailyDigest, resolveByManager } from "../src/digest.ts";
import { resolveByPayroll, runEscalations } from "../src/escalate.ts";
import type { DigestMessage } from "../src/digest.ts";
import { MemoryStore } from "../src/testing/memory-store.ts";
import { DAY, HOURS, at, employees, employer, managers, period, record, shift } from "../fixtures/synthetic.ts";

const { ada, ben, cyd } = employees;
const T0 = at(`${DAY}T18:00:00Z`);
const SLA = 48 * HOURS;

const setup = () => ({
  store: new MemoryStore([employer], Object.values(managers)),
  sent: [] as DigestMessage[],
});
const send = (sent: DigestMessage[]) => async (m: DigestMessage) => { sent.push(m); };
const detect = (store: MemoryStore, input: Parameters<typeof detectGaps>[0], now = T0) =>
  runDetection(store, employer.id, period, input, now);

test("1. shift scheduled, no attendance record → no_record_at_all, gap_detected event, manager snapshot", async () => {
  const { store } = setup();
  const { created } = await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  assert.equal(created.length, 1);
  assert.equal(created[0]?.gapType, "no_record_at_all");
  assert.equal(created[0]?.managerId, managers.north.id);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected"]);
});

test("2. record with clock_in only → no_clockout", () => {
  const { gaps } = detectGaps({ shifts: [shift(ada)], records: [record(ada, "08:02", null)], employees: [ada] }, T0);
  assert.deepEqual(gaps.map((g) => g.gapType), ["no_clockout"]);
});

test("3. record with clock_out only → no_clockin", () => {
  const { gaps } = detectGaps({ shifts: [shift(ada)], records: [record(ada, null, "16:05")], employees: [ada] }, T0);
  assert.deepEqual(gaps.map((g) => g.gapType), ["no_clockin"]);
});

test("4. full record → no gap", () => {
  const { gaps, unscheduled } = detectGaps({ shifts: [shift(ada)], records: [record(ada, "08:00", "16:00")], employees: [ada] }, T0);
  assert.equal(gaps.length, 0);
  assert.equal(unscheduled.length, 0);
});

test("5. record on a day with no shift → one unscheduled_attendance, zero gaps", async () => {
  const { store } = setup();
  const rec = record(ada, "08:00", "16:00");
  const { created } = await detect(store, { shifts: [], records: [rec], employees: [ada] });
  assert.equal(created.length, 0);
  assert.equal(store.unscheduled.length, 1);
  assert.equal(store.unscheduled[0]?.attendanceRecordId, rec.id);
});

test("6. same period detected twice → identical result, zero duplicates", async () => {
  const { store } = setup();
  const input = { shifts: [shift(ada), shift(ben)], records: [record(ben, "08:00", null)], employees: [ada, ben] };
  const first = await detect(store, input);
  const second = await detect(store, input, at(`${DAY}T19:00:00Z`));
  assert.equal(first.created.length, 2);
  assert.equal(second.created.length, 0);
  assert.equal(second.resolved.length, 0);
  assert.equal(store.gaps.length, 2);
  assert.equal(store.events.filter((e) => e.type === "gap_detected").length, 2);
});

test("7. corrected import supplies the record → resolved record_arrived, gap_resolved event", async () => {
  const { store } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  const later = at(`${DAY}T20:00:00Z`);
  const { resolved } = await detect(store, { shifts: [shift(ada)], records: [record(ada, "08:00", "16:00")], employees: [ada] }, later);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.resolution, "record_arrived");
  assert.equal(resolved[0]?.outcome, "present", "a record that arrives means the employee was there");
  assert.equal(resolved[0]?.resolvedAt, later);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "gap_resolved"]);
  assert.equal(await store.listOpenGaps(employer.id).then((g) => g.length), 0);
});

test("8. employee reassigned after detection → gap keeps original manager, digest goes to them", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  const reassigned = { ...ada, managerId: managers.south.id };
  await detect(store, { shifts: [shift(reassigned)], records: [], employees: [reassigned] }, at(`${DAY}T19:00:00Z`));
  assert.equal(store.gaps.length, 1);
  assert.equal(store.gaps[0]?.managerId, managers.north.id);
  await runDailyDigest(store, employer.id, at(`${DAY}T20:00:00Z`), send(sent));
  assert.deepEqual(sent.map((m) => m.manager.id), [managers.north.id]);
});

test("9. two managers, mixed gaps → each digest contains only that manager's gaps", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada), shift(ben), shift(cyd)], records: [], employees: [ada, ben, cyd] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const byManager = Object.fromEntries(sent.map((m) => [m.manager.id, m.gaps.map((g) => g.employeeId).sort()]));
  assert.deepEqual(byManager, { [managers.north.id]: [ada.id, ben.id], [managers.south.id]: [cyd.id] });
});

test("10. runDailyDigest twice in one day → one digest row per manager, one event, second run sends nothing", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const second = await runDailyDigest(store, employer.id, at(`${DAY}T21:00:00Z`), send(sent));
  assert.equal(second.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(store.digests.length, 1);
  assert.equal(store.events.filter((e) => e.type === "digest_sent").length, 1);
  assert.equal(store.gaps[0]?.managerNotifiedAt, T0);
});

test("11. notified, SLA elapsed, unresolved → one escalation, one event; third run adds nothing", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const breach = new Date(T0.getTime() + SLA + HOURS);
  const first = await runEscalations(store, employer.id, breach, SLA);
  await runEscalations(store, employer.id, new Date(breach.getTime() + HOURS), SLA);
  await runEscalations(store, employer.id, new Date(breach.getTime() + 2 * HOURS), SLA);
  assert.equal(first.length, 1);
  assert.equal(first[0]?.escalatedTo, employer.payrollEmail);
  assert.equal(first[0]?.reason, "sla_breach");
  assert.equal(store.escalations.length, 1);
  assert.equal(store.events.filter((e) => e.type === "escalated").length, 1);
});

test("12. notified, resolved by manager before SLA → no escalation", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const gap = await resolveByManager(store, store.gaps[0]!.id, new Date(T0.getTime() + HOURS), "present", "forgot to clock; confirmed by phone");
  assert.equal(gap.resolution, "manager_action");
  assert.equal(gap.outcome, "present");
  const escalations = await runEscalations(store, employer.id, new Date(T0.getTime() + SLA + HOURS), SLA);
  assert.equal(escalations.length, 0);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "digest_sent", "gap_resolved"]);
});

test("not notified yet → never escalates, however old", async () => {
  const { store } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  const escalations = await runEscalations(store, employer.id, new Date(T0.getTime() + 10 * SLA), SLA);
  assert.equal(escalations.length, 0);
});

test("digest date follows the employer's timezone (decided 2026-08-28)", async () => {
  const late = at("2026-03-02T23:30:00Z"); // already 3 March in Berlin
  assert.equal(isoDate(late), "2026-03-02");
  assert.equal(isoDate(late, "Europe/Berlin"), "2026-03-03");
  assert.equal(isoDate(late, "America/Los_Angeles"), "2026-03-02");
  const store = new MemoryStore([{ ...employer, timezone: "Europe/Berlin" }], Object.values(managers));
  await runDetection(store, employer.id, period, { shifts: [shift(ada)], records: [], employees: [ada] }, late);
  const [digest] = await runDailyDigest(store, employer.id, late, async () => {});
  assert.equal(digest?.digestDate, "2026-03-03");
});

test("payroll closes an escalated gap with a note; nothing escalates again", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const breach = new Date(T0.getTime() + SLA + HOURS);
  const [esc] = await runEscalations(store, employer.id, breach, SLA);
  const gap = await resolveByPayroll(store, esc!.gapId, new Date(breach.getTime() + HOURS), "absent", "employee left on 1 March");
  assert.equal(gap.resolution, "payroll_action");
  assert.equal(gap.outcome, "absent");
  assert.equal(gap.resolutionNote, "employee left on 1 March");
  assert.equal((await store.listOpenGaps(employer.id)).length, 0);
  assert.equal((await runEscalations(store, employer.id, new Date(breach.getTime() + 2 * HOURS), SLA)).length, 0);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "digest_sent", "escalated", "gap_resolved"]);
});
