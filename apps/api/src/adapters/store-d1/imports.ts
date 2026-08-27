// Writing imported data. Not part of the core's Store port — ingestion is an
// apps/api concern (ADR-0003) — but it shares the schema and the database handle.
import { and, eq, gte, lte } from "drizzle-orm";
import type { AttendanceRecord, Employee, Id, ScheduledShift } from "@clockcover/core";
import type { Db } from "./store.ts";
import * as s from "./schema.ts";
import type { ParsedCsv, RosterRow } from "../csv.ts";

const newId = () => crypto.randomUUID();

/** Upserts managers and employees by external id. Returns the employees as the core sees them. */
export async function saveRoster(db: Db, employerId: Id, rows: RosterRow[]): Promise<Employee[]> {
  for (const r of rows) {
    await db.insert(s.managers)
      .values({ id: newId(), employerId, externalId: r.managerExternalId, fullName: r.managerName, email: r.managerEmail, whatsappNumber: null })
      .onConflictDoUpdate({
        target: [s.managers.employerId, s.managers.externalId],
        set: { fullName: r.managerName, email: r.managerEmail },
      });
  }
  const managerIds = new Map(
    (await db.select({ id: s.managers.id, ext: s.managers.externalId }).from(s.managers).where(eq(s.managers.employerId, employerId)))
      .map((m) => [m.ext, m.id]),
  );
  for (const r of rows) {
    const managerId = managerIds.get(r.managerExternalId);
    if (!managerId) throw new Error(`manager not found after upsert: ${r.managerExternalId}`);
    await db.insert(s.employees)
      .values({ id: newId(), employerId, externalId: r.employeeExternalId, fullName: r.employeeName, managerId, active: true })
      .onConflictDoUpdate({
        target: [s.employees.employerId, s.employees.externalId],
        set: { fullName: r.employeeName, managerId, active: true },
      });
  }
  return db.select().from(s.employees).where(and(eq(s.employees.employerId, employerId), eq(s.employees.active, true)));
}

export interface SavedImport {
  importId: Id;
  shifts: ScheduledShift[];
  records: AttendanceRecord[];
  employees: Employee[];
  /** Employee external ids in the file with no roster entry. Their rows are skipped. */
  unknownEmployees: string[];
}

/**
 * Records one import run and upserts its shifts and records (one per employee per
 * date — a re-import of the same day replaces the earlier values). Returns what the
 * matching engine needs for the dates covered.
 */
export async function saveImport(db: Db, employerId: Id, parsed: ParsedCsv, now: Date): Promise<SavedImport> {
  const employees = await db.select().from(s.employees).where(and(eq(s.employees.employerId, employerId), eq(s.employees.active, true)));
  const byExt = new Map(employees.map((e) => [e.externalId, e]));
  const unknown = new Set<string>();
  const resolve = (ext: string) => {
    const e = byExt.get(ext);
    if (!e) unknown.add(ext);
    return e;
  };

  const importId = newId();
  await db.insert(s.imports).values({ id: importId, employerId, source: "csv", importedAt: now.toISOString(), rowCount: parsed.shifts.length + parsed.records.length });

  for (const sh of parsed.shifts) {
    const e = resolve(sh.employeeExternalId);
    if (!e) continue;
    await db.insert(s.scheduledShifts)
      .values({ id: newId(), employerId, employeeId: e.id, shiftDate: sh.date, plannedStart: sh.plannedStart, plannedEnd: sh.plannedEnd, importId })
      .onConflictDoUpdate({
        target: [s.scheduledShifts.employerId, s.scheduledShifts.employeeId, s.scheduledShifts.shiftDate],
        set: { plannedStart: sh.plannedStart, plannedEnd: sh.plannedEnd, importId },
      });
  }
  for (const rec of parsed.records) {
    const e = resolve(rec.employeeExternalId);
    if (!e) continue;
    await db.insert(s.attendanceRecords)
      .values({ id: newId(), employerId, employeeId: e.id, recordDate: rec.date, clockIn: rec.clockIn, clockOut: rec.clockOut, importId })
      .onConflictDoUpdate({
        target: [s.attendanceRecords.employerId, s.attendanceRecords.employeeId, s.attendanceRecords.recordDate],
        set: { clockIn: rec.clockIn, clockOut: rec.clockOut, importId },
      });
  }

  const dates = [...parsed.shifts.map((x) => x.date), ...parsed.records.map((x) => x.date)];
  if (dates.length === 0) return { importId, shifts: [], records: [], employees, unknownEmployees: [...unknown] };
  const from = dates.reduce((a, b) => (a < b ? a : b));
  const to = dates.reduce((a, b) => (a > b ? a : b));
  const shifts = await db.select().from(s.scheduledShifts).where(and(
    eq(s.scheduledShifts.employerId, employerId), gte(s.scheduledShifts.shiftDate, from), lte(s.scheduledShifts.shiftDate, to),
  ));
  const records = await db.select().from(s.attendanceRecords).where(and(
    eq(s.attendanceRecords.employerId, employerId), gte(s.attendanceRecords.recordDate, from), lte(s.attendanceRecords.recordDate, to),
  ));
  return { importId, shifts, records, employees, unknownEmployees: [...unknown] };
}

export const periodOf = (parsed: ParsedCsv): { from: string; to: string } | null => {
  const dates = [...parsed.shifts.map((x) => x.date), ...parsed.records.map((x) => x.date)];
  if (dates.length === 0) return null;
  return { from: dates.reduce((a, b) => (a < b ? a : b)), to: dates.reduce((a, b) => (a > b ? a : b)) };
};
