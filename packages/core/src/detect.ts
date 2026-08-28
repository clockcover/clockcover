// Matching engine — docs/core-design.md § Matching Engine.
import type { Store } from "./store.ts";
import type {
  AttendanceRecord, Employee, Gap, Id, IsoDate, NewGap, NewUnscheduledAttendance, ScheduledShift,
} from "./types.ts";

export interface DetectionInput {
  shifts: ScheduledShift[];
  records: AttendanceRecord[];
  employees: Employee[];
}

export interface DetectionResult {
  gaps: NewGap[];
  unscheduled: NewUnscheduledAttendance[];
}

/** Pure: compares scheduled shifts against attendance records per employee and date. No I/O. */
export function detectGaps({ shifts, records, employees }: DetectionInput, now: Date): DetectionResult {
  const gaps: NewGap[] = [];
  const unscheduled: NewUnscheduledAttendance[] = [];

  for (const employee of employees) {
    const scheduled = shifts.filter((s) => s.employeeId === employee.id);
    const actual = records.filter((r) => r.employeeId === employee.id);
    const emit = (gapDate: IsoDate, gapType: NewGap["gapType"]) =>
      gaps.push({ employerId: employee.employerId, employeeId: employee.id, gapDate, gapType, managerId: employee.managerId, detectedAt: now });

    for (const shift of scheduled) {
      const record = actual.find((r) => r.recordDate === shift.shiftDate);
      if (!record) emit(shift.shiftDate, "no_record_at_all");
      else if (record.clockIn === null) emit(shift.shiftDate, "no_clockin");
      else if (record.clockOut === null) emit(shift.shiftDate, "no_clockout");
    }

    for (const record of actual) {
      if (scheduled.some((s) => s.shiftDate === record.recordDate)) continue;
      unscheduled.push({
        employerId: employee.employerId, employeeId: employee.id, recordDate: record.recordDate,
        attendanceRecordId: record.id, detectedAt: now,
      });
    }
  }
  return { gaps, unscheduled };
}

export interface DetectionOutcome {
  created: Gap[];
  /** Previously open gaps in the period whose record has since arrived. */
  resolved: Gap[];
}

/**
 * Runs detection for one employer and period and persists the outcome:
 * upserts gaps (idempotent), appends `gap_detected` for new ones, changes the type
 * of an open gap whose record partly arrived (same id, SLA timer untouched), and
 * resolves open gaps whose record has fully arrived (`record_arrived`, `present`).
 * Only rows belonging to `employerId` take part — a mixed-tenant input cannot
 * create cross-tenant gaps.
 */
export async function runDetection(
  store: Store,
  employerId: Id,
  period: { from: IsoDate; to: IsoDate },
  input: DetectionInput,
  now: Date,
): Promise<DetectionOutcome> {
  const own = <T extends { employerId: Id }>(rows: T[]) => rows.filter((r) => r.employerId === employerId);
  const employees = own(input.employees);
  const records = own(input.records);
  const { gaps, unscheduled } = detectGaps({ shifts: own(input.shifts), records, employees }, now);
  const openBefore = await store.listOpenGaps(employerId, period);
  const created: Gap[] = [];
  const stillOpen = new Set<string>();

  for (const g of gaps) {
    // Same day, different type (e.g. no_record_at_all → no_clockout): the gap is the same
    // one, so it keeps its id and manager_notified_at instead of being closed and reopened.
    const prior = openBefore.find((o) => o.employeeId === g.employeeId && o.gapDate === g.gapDate && o.gapType !== g.gapType);
    const retyped = prior ? await store.retypeGap(prior.id, g.gapType) : null;
    if (retyped) {
      stillOpen.add(gapKey(retyped));
      stillOpen.add(gapKey(prior!));
      continue;
    }
    const { gap, created: isNew } = await store.upsertGap(g);
    stillOpen.add(gapKey(gap));
    if (isNew) {
      created.push(gap);
      await store.appendEvent({ employerId, occurredAt: now, type: "gap_detected", gapId: gap.id, managerId: gap.managerId, payload: { gapType: gap.gapType } });
    }
  }
  for (const u of unscheduled) await store.upsertUnscheduledAttendance(u);

  // An open gap closes only when this input actually carries the employee and a record
  // for that day. A gap whose employee left the roster, or whose shift disappeared from
  // a re-import, is still unexplained and stays open (core-design.md § Roster).
  const known = new Set(employees.map((e) => e.id));
  const hasRecord = (open: Gap) => records.some((r) => r.employeeId === open.employeeId && r.recordDate === open.gapDate);
  const resolved: Gap[] = [];
  for (const open of openBefore) {
    if (stillOpen.has(gapKey(open)) || !known.has(open.employeeId) || !hasRecord(open)) continue;
    const gap = await store.resolveGap(open.id, "record_arrived", now, "present", null);
    resolved.push(gap);
    await store.appendEvent({ employerId, occurredAt: now, type: "gap_resolved", gapId: gap.id, managerId: gap.managerId, payload: { resolution: "record_arrived", outcome: "present" } });
  }
  return { created, resolved };
}

const gapKey = (g: Pick<Gap, "employeeId" | "gapDate" | "gapType">) => `${g.employeeId}|${g.gapDate}|${g.gapType}`;
