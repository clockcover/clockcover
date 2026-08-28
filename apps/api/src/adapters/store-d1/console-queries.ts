// Read models for the operator console (ADR-0005). apps/api only.
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { Id } from "@clockcover/core";
import type { Db } from "./store.ts";
import * as s from "./schema.ts";

export interface ImportRun { id: Id; source: string; trigger: string; importedAt: string; rowCount: number }

export async function listImports(db: Db, employerId: Id, limit = 50): Promise<ImportRun[]> {
  return db.select({ id: s.imports.id, source: s.imports.source, trigger: s.imports.trigger, importedAt: s.imports.importedAt, rowCount: s.imports.rowCount })
    .from(s.imports).where(eq(s.imports.employerId, employerId)).orderBy(desc(s.imports.importedAt)).limit(limit);
}

export interface Overview {
  openGaps: number;
  /** Open gaps that have already been escalated. */
  escalated: number;
  byManager: Array<{ managerId: Id; managerName: string; openGaps: number; oldestGapDate: string | null }>;
  /** Last `windowDays`: gaps that appeared in a digest, and how many the manager resolved within the SLA. */
  metric: { windowDays: number; notified: number; actedWithinSla: number; resolvedByRecord: number; closedByPayroll: number; escalated: number; present: number; absent: number };
}

export async function overview(db: Db, employerId: Id, slaHours: number, now: Date, windowDays = 30): Promise<Overview> {
  const open = await db.select({ id: s.gaps.id, managerId: s.gaps.managerId, gapDate: s.gaps.gapDate })
    .from(s.gaps).where(and(eq(s.gaps.employerId, employerId), isNull(s.gaps.resolvedAt)));
  const escalatedIds = new Set((await db.select({ gapId: s.escalations.gapId }).from(s.escalations).where(eq(s.escalations.employerId, employerId))).map((e) => e.gapId));
  const managers = new Map((await db.select({ id: s.managers.id, name: s.managers.fullName }).from(s.managers).where(eq(s.managers.employerId, employerId))).map((m) => [m.id, m.name]));

  const byManager = new Map<Id, { openGaps: number; oldestGapDate: string | null }>();
  for (const g of open) {
    const cur = byManager.get(g.managerId) ?? { openGaps: 0, oldestGapDate: null };
    cur.openGaps++;
    if (cur.oldestGapDate === null || g.gapDate < cur.oldestGapDate) cur.oldestGapDate = g.gapDate;
    byManager.set(g.managerId, cur);
  }

  // Metric from the event log: first digest_sent per gap in the window → outcome.
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const events = await db.select({ type: s.events.type, gapId: s.events.gapId, managerId: s.events.managerId, occurredAt: s.events.occurredAt, payload: s.events.payload })
    .from(s.events).where(and(eq(s.events.employerId, employerId), gte(s.events.occurredAt, since)));
  // digest_sent events carry managerId but not gapIds; the gap's own manager_notified_at marks its first digest.
  const notifiedGaps = await db.select({ id: s.gaps.id, notifiedAt: s.gaps.managerNotifiedAt })
    .from(s.gaps).where(and(eq(s.gaps.employerId, employerId), gte(s.gaps.managerNotifiedAt, since)));
  const notifiedAt = new Map(notifiedGaps.map((g) => [g.id, g.notifiedAt!]));
  let actedWithinSla = 0, resolvedByRecord = 0, closedByPayroll = 0, escalatedInWindow = 0, present = 0, absent = 0;
  for (const e of events) {
    if (!e.gapId || !notifiedAt.has(e.gapId)) continue;
    if (e.type === "gap_resolved") {
      const { resolution: res, outcome } = e.payload as { resolution?: string; outcome?: string };
      if (outcome === "present" || res === "record_arrived") present++;
      else if (outcome === "absent") absent++;
      if (res === "record_arrived") resolvedByRecord++;
      else if (res === "payroll_action") closedByPayroll++;
      else if (res === "manager_action" && new Date(e.occurredAt).getTime() - new Date(notifiedAt.get(e.gapId)!).getTime() <= slaHours * 3_600_000) actedWithinSla++;
    } else if (e.type === "escalated") escalatedInWindow++;
  }

  return {
    openGaps: open.length,
    escalated: open.filter((g) => escalatedIds.has(g.id)).length,
    byManager: [...byManager].map(([managerId, v]) => ({ managerId, managerName: managers.get(managerId) ?? managerId, ...v }))
      .sort((a, b) => b.openGaps - a.openGaps || a.managerName.localeCompare(b.managerName)),
    metric: { windowDays, notified: notifiedGaps.length, actedWithinSla, resolvedByRecord, closedByPayroll, escalated: escalatedInWindow, present, absent },
  };
}

const TZ_CHECK = new Set<string>();
/** Is this an IANA timezone the runtime knows? */
export function isTimezone(tz: string): boolean {
  if (TZ_CHECK.has(tz)) return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    TZ_CHECK.add(tz);
    return true;
  } catch {
    return false;
  }
}

export interface ResolutionRow {
  date: string; employeeId: string; employeeName: string; managerName: string; gapType: string;
  outcome: string; resolution: string; resolvedBy: string; resolvedAt: string; note: string;
  plannedStart: string; plannedEnd: string; plannedHours: string; clockIn: string; clockOut: string;
}

/**
 * Gaps closed by a person (manager or payroll) with resolved_at in [from, to] — the
 * corrections payroll has to carry into the attendance or payroll system. Records that
 * arrived by import are not corrections and are left out.
 */
export async function resolutionsBetween(db: Db, employerId: Id, from: string, to: string): Promise<ResolutionRow[]> {
  const gaps = await db.select().from(s.gaps).where(and(
    eq(s.gaps.employerId, employerId), isNotNull(s.gaps.resolvedAt),
    gte(s.gaps.resolvedAt, `${from}T00:00:00.000Z`), lte(s.gaps.resolvedAt, `${to}T23:59:59.999Z`),
    inArray(s.gaps.resolution, ["manager_action", "payroll_action"]),
  ));
  if (gaps.length === 0) return [];
  const employees = new Map((await db.select().from(s.employees).where(eq(s.employees.employerId, employerId))).map((e) => [e.id, e]));
  const managers = new Map((await db.select().from(s.managers).where(eq(s.managers.employerId, employerId))).map((m) => [m.id, m.fullName]));
  const dates = [...new Set(gaps.map((g) => g.gapDate))];
  const shifts = await db.select().from(s.scheduledShifts).where(and(eq(s.scheduledShifts.employerId, employerId), inArray(s.scheduledShifts.shiftDate, dates)));
  const records = await db.select().from(s.attendanceRecords).where(and(eq(s.attendanceRecords.employerId, employerId), inArray(s.attendanceRecords.recordDate, dates)));
  const key = (e: string, d: string) => `${e}|${d}`;
  const shiftBy = new Map(shifts.map((x) => [key(x.employeeId, x.shiftDate), x]));
  const recordBy = new Map(records.map((x) => [key(x.employeeId, x.recordDate), x]));
  const hours = (a: string, b: string) => {
    const [ah, am] = a.split(":").map(Number), [bh, bm] = b.split(":").map(Number);
    let mins = (bh! * 60 + bm!) - (ah! * 60 + am!);
    if (mins < 0) mins += 24 * 60; // overnight shift
    return (mins / 60).toFixed(2);
  };
  return gaps
    .map((g) => {
      const e = employees.get(g.employeeId);
      const sh = shiftBy.get(key(g.employeeId, g.gapDate));
      const rec = recordBy.get(key(g.employeeId, g.gapDate));
      return {
        date: g.gapDate, employeeId: e?.externalId ?? g.employeeId, employeeName: e?.fullName ?? "",
        managerName: managers.get(g.managerId) ?? "", gapType: g.gapType,
        outcome: g.outcome ?? "", resolution: g.resolution ?? "",
        resolvedBy: g.resolution === "payroll_action" ? "payroll" : "manager",
        resolvedAt: g.resolvedAt ?? "", note: g.resolutionNote ?? "",
        plannedStart: sh?.plannedStart ?? "", plannedEnd: sh?.plannedEnd ?? "",
        plannedHours: sh && g.outcome === "present" ? hours(sh.plannedStart, sh.plannedEnd) : "",
        clockIn: rec?.clockIn ?? "", clockOut: rec?.clockOut ?? "",
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
}

const CSV_COLUMNS: Array<[keyof ResolutionRow, string]> = [
  ["date", "date"], ["employeeId", "employee_id"], ["employeeName", "employee_name"], ["managerName", "manager_name"],
  ["gapType", "gap_type"], ["outcome", "outcome"], ["resolution", "resolution"], ["resolvedBy", "resolved_by"],
  ["resolvedAt", "resolved_at"], ["note", "note"], ["plannedStart", "planned_start"], ["plannedEnd", "planned_end"],
  ["plannedHours", "planned_hours"], ["clockIn", "clock_in"], ["clockOut", "clock_out"],
];

export function resolutionsCsv(rows: ResolutionRow[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const lines = [CSV_COLUMNS.map(([, h]) => h).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([k]) => cell(r[k])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export interface AdminEmployerRow {
  id: Id; name: string; payrollEmail: string; operatorEmail: string | null; timezone: string; slaHours: number;
  importUrl: string | null; activeEmployees: number; managers: number; openGaps: number; escalatedOpen: number; lastImportAt: string | null;
}

/** Every employer with the numbers the owner needs: billing input (headcount) and health. */
export async function adminEmployers(db: Db): Promise<AdminEmployerRow[]> {
  const employers = await db.select().from(s.employers);
  const employees = await db.select({ employerId: s.employees.employerId, active: s.employees.active }).from(s.employees);
  const managers = await db.select({ employerId: s.managers.employerId }).from(s.managers);
  const open = await db.select({ id: s.gaps.id, employerId: s.gaps.employerId }).from(s.gaps).where(isNull(s.gaps.resolvedAt));
  const escalated = new Set((await db.select({ gapId: s.escalations.gapId }).from(s.escalations)).map((e) => e.gapId));
  const imports = await db.select({ employerId: s.imports.employerId, importedAt: s.imports.importedAt }).from(s.imports);
  return employers.map((e) => ({
    id: e.id, name: e.name, payrollEmail: e.payrollEmail, operatorEmail: e.operatorEmail, timezone: e.timezone, slaHours: e.slaHours, importUrl: e.importUrl,
    activeEmployees: employees.filter((x) => x.employerId === e.id && x.active).length,
    managers: managers.filter((m) => m.employerId === e.id).length,
    openGaps: open.filter((g) => g.employerId === e.id).length,
    escalatedOpen: open.filter((g) => g.employerId === e.id && escalated.has(g.id)).length,
    lastImportAt: imports.filter((i) => i.employerId === e.id).map((i) => i.importedAt).sort().at(-1) ?? null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}
