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
 * upserts gaps (idempotent), appends `gap_detected` for new ones, and resolves
 * open gaps in the period that detection no longer reports (`record_arrived`).
 */
export async function runDetection(
  store: Store,
  employerId: Id,
  period: { from: IsoDate; to: IsoDate },
  input: DetectionInput,
  now: Date,
): Promise<DetectionOutcome> {
  const { gaps, unscheduled } = detectGaps(input, now);
  const created: Gap[] = [];
  const stillOpen = new Set<string>();

  for (const g of gaps) {
    const { gap, created: isNew } = await store.upsertGap(g);
    stillOpen.add(gapKey(gap));
    if (isNew) {
      created.push(gap);
      await store.appendEvent({ employerId, occurredAt: now, type: "gap_detected", gapId: gap.id, managerId: gap.managerId, payload: { gapType: gap.gapType } });
    }
  }
  for (const u of unscheduled) await store.upsertUnscheduledAttendance(u);

  const resolved: Gap[] = [];
  for (const open of await store.listOpenGaps(employerId, period)) {
    if (stillOpen.has(gapKey(open))) continue;
    const gap = await store.resolveGap(open.id, "record_arrived", now, null);
    resolved.push(gap);
    await store.appendEvent({ employerId, occurredAt: now, type: "gap_resolved", gapId: gap.id, managerId: gap.managerId, payload: { resolution: "record_arrived" } });
  }
  return { created, resolved };
}

const gapKey = (g: Pick<Gap, "employeeId" | "gapDate" | "gapType">) => `${g.employeeId}|${g.gapDate}|${g.gapType}`;
