// Read models for emails and the digest page: a gap together with the shift and
// record it was detected against, and employee names. apps/api only — the core
// keeps working with Gap rows.
import { and, eq, gte, inArray } from "drizzle-orm";
import type { Gap, Id } from "@clockcover/core";
import type { Db } from "./store.ts";
import * as s from "./schema.ts";
import type { GapView } from "../email.ts";

export async function employeeNames(db: Db, employerId: Id): Promise<Map<string, string>> {
  const rows = await db.select({ id: s.employees.id, name: s.employees.fullName }).from(s.employees).where(eq(s.employees.employerId, employerId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Joins each gap with its scheduled shift and attendance record (by employee + date). */
export async function gapViews(db: Db, employerId: Id, gaps: Gap[]): Promise<GapView[]> {
  if (gaps.length === 0) return [];
  const names = await employeeNames(db, employerId);
  const employeeIds = [...new Set(gaps.map((g) => g.employeeId))];
  const dates = [...new Set(gaps.map((g) => g.gapDate))];
  const shifts = await db.select().from(s.scheduledShifts).where(and(
    eq(s.scheduledShifts.employerId, employerId), inArray(s.scheduledShifts.employeeId, employeeIds), inArray(s.scheduledShifts.shiftDate, dates),
  ));
  const records = await db.select().from(s.attendanceRecords).where(and(
    eq(s.attendanceRecords.employerId, employerId), inArray(s.attendanceRecords.employeeId, employeeIds), inArray(s.attendanceRecords.recordDate, dates),
  ));
  const key = (e: string, d: string) => `${e}|${d}`;
  const shiftBy = new Map(shifts.map((x) => [key(x.employeeId, x.shiftDate), x]));
  const recordBy = new Map(records.map((x) => [key(x.employeeId, x.recordDate), x]));
  return gaps.map((gap) => {
    const sh = shiftBy.get(key(gap.employeeId, gap.gapDate));
    const rec = recordBy.get(key(gap.employeeId, gap.gapDate));
    return {
      gap,
      employeeName: names.get(gap.employeeId) ?? gap.employeeId,
      shift: sh ? { plannedStart: sh.plannedStart, plannedEnd: sh.plannedEnd } : null,
      record: rec ? { clockIn: rec.clockIn, clockOut: rec.clockOut } : null,
    };
  });
}

export interface UnscheduledView { employeeName: string; recordDate: string; clockIn: string | null; clockOut: string | null }

/** Unscheduled attendance for one manager's current employees since `fromDate`. */
export async function unscheduledFor(db: Db, employerId: Id, managerId: Id, fromDate: string): Promise<UnscheduledView[]> {
  const team = await db.select({ id: s.employees.id, name: s.employees.fullName }).from(s.employees)
    .where(and(eq(s.employees.employerId, employerId), eq(s.employees.managerId, managerId)));
  if (team.length === 0) return [];
  const names = new Map(team.map((e) => [e.id, e.name]));
  const rows = await db.select({
    employeeId: s.unscheduledAttendance.employeeId, recordDate: s.unscheduledAttendance.recordDate,
    clockIn: s.attendanceRecords.clockIn, clockOut: s.attendanceRecords.clockOut,
  }).from(s.unscheduledAttendance)
    .innerJoin(s.attendanceRecords, eq(s.attendanceRecords.id, s.unscheduledAttendance.attendanceRecordId))
    .where(and(
      eq(s.unscheduledAttendance.employerId, employerId),
      inArray(s.unscheduledAttendance.employeeId, [...names.keys()]),
      gte(s.unscheduledAttendance.recordDate, fromDate),
    ));
  return rows.map((r) => ({ employeeName: names.get(r.employeeId) ?? r.employeeId, recordDate: r.recordDate, clockIn: r.clockIn, clockOut: r.clockOut }));
}
