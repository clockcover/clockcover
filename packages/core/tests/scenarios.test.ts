// The acceptance scenarios from docs/core-design.md, one test per row, same numbering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectGaps, runDetection } from "../src/detect.ts";
import { isoDate, runDailyDigest, resolveByManager } from "../src/digest.ts";
import { resolveByPayroll, runEscalations } from "../src/escalate.ts";
import type { DigestMessage } from "../src/digest.ts";
import type { EscalationMessage } from "../src/escalate.ts";
import { MemoryStore } from "../src/testing/memory-store.ts";
import { DAY, HOURS, at, employees, employer, managers, period, record, shift } from "../fixtures/synthetic.ts";

const { ada, ben, cyd } = employees;
const T0 = at(`${DAY}T18:00:00Z`);
const SLA = employer.slaHours * HOURS;

const setup = () => ({
  store: new MemoryStore([employer], Object.values(managers)),
  sent: [] as DigestMessage[],
  escalated: [] as EscalationMessage[],
});
const send = (sent: DigestMessage[]) => async (m: DigestMessage) => { sent.push(m); };
const sendEsc = (escalated: EscalationMessage[]) => async (m: EscalationMessage) => { escalated.push(m); };
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
  const input = { shifts: [shift(ada), shift(ben)], records: [record(ben, "08:00", null), record(cyd, "08:00", "16:00")], employees: [ada, ben, cyd] };
  const first = await detect(store, input);
  const afterFirst = await store.listOpenGaps(employer.id);
  const second = await detect(store, input, at(`${DAY}T19:00:00Z`));
  assert.equal(first.created.length, 2);
  assert.equal(second.created.length, 0);
  assert.equal(second.resolved.length, 0);
  assert.deepEqual(await store.listOpenGaps(employer.id), afterFirst, "same gaps, same ids, same detectedAt");
  assert.equal(store.gaps.length, 2);
  assert.equal(store.unscheduled.length, 1, "Cyd's unscheduled day is not duplicated");
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
  const { store, sent, escalated } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const breach = new Date(T0.getTime() + SLA + HOURS);
  const first = await runEscalations(store, employer.id, breach, sendEsc(escalated));
  await runEscalations(store, employer.id, new Date(breach.getTime() + HOURS), sendEsc(escalated));
  await runEscalations(store, employer.id, new Date(breach.getTime() + 2 * HOURS), sendEsc(escalated));
  assert.equal(first.length, 1);
  assert.equal(first[0]?.escalatedTo, employer.payrollEmail);
  assert.equal(first[0]?.reason, "sla_breach");
  assert.equal(escalated.length, 1, "the payroll accountant is emailed once");
  assert.equal(escalated[0]?.gap.id, first[0]?.gapId);
  assert.equal(store.escalations.length, 1);
  assert.equal(store.events.filter((e) => e.type === "escalated").length, 1);
});

test("escalation send fails → nothing recorded; the next run retries and records once", async () => {
  const { store, sent, escalated } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const breach = new Date(T0.getTime() + SLA + HOURS);
  await assert.rejects(runEscalations(store, employer.id, breach, async () => { throw new Error("provider down"); }), /provider down/);
  assert.equal(store.escalations.length, 0);
  assert.equal(store.events.filter((e) => e.type === "escalated").length, 0);
  const retry = await runEscalations(store, employer.id, new Date(breach.getTime() + HOURS), sendEsc(escalated));
  assert.equal(retry.length, 1);
  assert.equal(escalated.length, 1);
  assert.equal(store.escalations.length, 1);
});

test("digest: gaps are marked notified before the digest row is written", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  store.saveDigest = async () => { throw new Error("db down"); };
  await assert.rejects(runDailyDigest(store, employer.id, T0, send(sent)), /db down/);
  assert.equal(sent.length, 1);
  assert.equal(store.gaps[0]?.managerNotifiedAt, T0, "the email went out, so the SLA timer is running");
  assert.equal(store.digests.length, 0);
});

test("12. notified, resolved by manager before SLA → no escalation", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const gap = await resolveByManager(store, store.gaps[0]!.id, new Date(T0.getTime() + HOURS), "present", "forgot to clock; confirmed by phone");
  assert.equal(gap.resolution, "manager_action");
  assert.equal(gap.outcome, "present");
  const escalations = await runEscalations(store, employer.id, new Date(T0.getTime() + SLA + HOURS), sendEsc([]));
  assert.equal(escalations.length, 0);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "digest_sent", "gap_resolved"]);
});

test("not notified yet → never escalates, however old", async () => {
  const { store } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  const escalations = await runEscalations(store, employer.id, new Date(T0.getTime() + 10 * SLA), sendEsc([]));
  assert.equal(escalations.length, 0);
});

test("the SLA comes from the employer: a 24 h employer escalates when a 48 h one would not", async () => {
  const store = new MemoryStore([{ ...employer, slaHours: 24 }], Object.values(managers));
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send([]));
  assert.equal((await runEscalations(store, employer.id, new Date(T0.getTime() + 25 * HOURS), sendEsc([]))).length, 1);
});

test("resolving an already-resolved gap throws and changes nothing", async () => {
  const { store } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  const first = await resolveByManager(store, store.gaps[0]!.id, T0, "present");
  await assert.rejects(store.resolveGap(first.id, "payroll_action", new Date(T0.getTime() + HOURS), "absent", "late"), /already resolved/);
  assert.deepEqual(store.gaps[0], first);
});

test("listOpenGaps is ordered by date, then employee", async () => {
  const { store } = setup();
  const earlier = "2026-03-01";
  await runDetection(store, employer.id, { from: earlier, to: DAY }, { shifts: [shift(cyd), shift(ada), shift(ben, earlier)], records: [], employees: [ada, ben, cyd] }, T0);
  assert.deepEqual((await store.listOpenGaps(employer.id)).map((g) => [g.gapDate, g.employeeId]), [[earlier, ben.id], [DAY, ada.id], [DAY, cyd.id]]);
});

test("runDetection ignores rows of another employer", async () => {
  const { store } = setup();
  const stranger = { ...cyd, id: "e-zed", employerId: "emp-2" };
  const foreignShift = { ...shift(stranger), employerId: "emp-2" };
  const { created } = await detect(store, { shifts: [shift(ada), foreignShift], records: [], employees: [ada, stranger] });
  assert.deepEqual(created.map((g) => g.employeeId), [ada.id]);
  assert.ok(store.gaps.every((g) => g.employerId === employer.id));
});

test("13. digest date follows the employer's timezone (decided 2026-08-28)", async () => {
  const late = at("2026-03-02T23:30:00Z"); // already 3 March in Berlin
  assert.equal(isoDate(late), "2026-03-02");
  assert.equal(isoDate(late, "Europe/Berlin"), "2026-03-03");
  assert.equal(isoDate(late, "America/Los_Angeles"), "2026-03-02");
  const store = new MemoryStore([{ ...employer, timezone: "Europe/Berlin" }], Object.values(managers));
  await runDetection(store, employer.id, period, { shifts: [shift(ada)], records: [], employees: [ada] }, late);
  const [digest] = await runDailyDigest(store, employer.id, late, async () => {});
  assert.equal(digest?.digestDate, "2026-03-03");
});

test("14. payroll closes an escalated gap with a note; nothing escalates again", async () => {
  const { store, sent } = setup();
  await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] });
  await runDailyDigest(store, employer.id, T0, send(sent));
  const breach = new Date(T0.getTime() + SLA + HOURS);
  const [esc] = await runEscalations(store, employer.id, breach, sendEsc([]));
  const gap = await resolveByPayroll(store, esc!.gapId, new Date(breach.getTime() + HOURS), "absent", "employee left on 1 March");
  assert.equal(gap.resolution, "payroll_action");
  assert.equal(gap.outcome, "absent");
  assert.equal(gap.resolutionNote, "employee left on 1 March");
  assert.equal((await store.listOpenGaps(employer.id)).length, 0);
  assert.equal((await runEscalations(store, employer.id, new Date(breach.getTime() + 2 * HOURS), sendEsc([]))).length, 0);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "digest_sent", "escalated", "gap_resolved"]);
});

test("15. gap detected, roster re-uploaded without the employee → gap stays open", async () => {
  const { store } = setup();
  await detect(store, { shifts: [shift(ada), shift(ben)], records: [], employees: [ada, ben] });
  // Ada left the roster: the next import carries neither her shift nor a record for her.
  const { resolved } = await detect(store, { shifts: [shift(ben)], records: [], employees: [ben] }, at(`${DAY}T19:00:00Z`));
  assert.equal(resolved.length, 0);
  assert.deepEqual((await store.listOpenGaps(employer.id)).map((g) => g.employeeId).sort(), [ada.id, ben.id]);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "gap_detected"], "no gap_resolved without a record");
  // Same when only the shift disappears from a re-import while she is still on the roster.
  const { resolved: again } = await detect(store, { shifts: [shift(ben)], records: [], employees: [ada, ben] }, at(`${DAY}T20:00:00Z`));
  assert.equal(again.length, 0);
  assert.equal((await store.listOpenGaps(employer.id)).length, 2);
});

test("16. open no_record_at_all, then a record with clock-in only → same gap becomes no_clockout, SLA timer untouched", async () => {
  const { store, sent } = setup();
  const [before] = (await detect(store, { shifts: [shift(ada)], records: [], employees: [ada] })).created;
  await runDailyDigest(store, employer.id, T0, send(sent));
  const later = at(`${DAY}T22:00:00Z`);
  const outcome = await detect(store, { shifts: [shift(ada)], records: [record(ada, "08:02", null)], employees: [ada] }, later);
  assert.equal(outcome.created.length, 0);
  assert.equal(outcome.resolved.length, 0, "not present: the clock-out is still missing");
  const open = await store.listOpenGaps(employer.id);
  assert.equal(open.length, 1);
  assert.equal(open[0]?.id, before?.id);
  assert.equal(open[0]?.gapType, "no_clockout");
  assert.equal(open[0]?.managerNotifiedAt, T0);
  assert.deepEqual(store.events.map((e) => e.type), ["gap_detected", "digest_sent"]);
});
