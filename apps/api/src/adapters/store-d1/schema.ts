// Drizzle schema — the tables in docs/core-design.md § Data Model, one to one.
// SQLite dialect for D1 now; the same definition targets Postgres after migration (ADR-0001).
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const employerId = () => text("employer_id").notNull().references(() => employers.id);
/** Instants are stored as ISO-8601 strings; dates without time as YYYY-MM-DD. */
const instant = (name: string) => text(name);

export const employers = sqliteTable("employers", {
  id: id(),
  name: text("name").notNull(),
  payrollEmail: text("payroll_email").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
});

export const managers = sqliteTable(
  "managers",
  {
    id: id(),
    employerId: employerId(),
    externalId: text("external_id").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    whatsappNumber: text("whatsapp_number"),
  },
  (t) => [uniqueIndex("managers_external").on(t.employerId, t.externalId)],
);

export const employees = sqliteTable(
  "employees",
  {
    id: id(),
    employerId: employerId(),
    externalId: text("external_id").notNull(),
    fullName: text("full_name").notNull(),
    managerId: text("manager_id").notNull().references(() => managers.id),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [uniqueIndex("employees_external").on(t.employerId, t.externalId)],
);

export const imports = sqliteTable("imports", {
  id: id(),
  employerId: employerId(),
  source: text("source", { enum: ["csv", "excel", "pdf"] }).notNull(),
  importedAt: instant("imported_at").notNull(),
  rowCount: integer("row_count").notNull(),
});

export const scheduledShifts = sqliteTable(
  "scheduled_shifts",
  {
    id: id(),
    employerId: employerId(),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    shiftDate: text("shift_date").notNull(),
    plannedStart: text("planned_start").notNull(),
    plannedEnd: text("planned_end").notNull(),
    importId: text("import_id").notNull().references(() => imports.id),
  },
  (t) => [uniqueIndex("shifts_employee_date").on(t.employerId, t.employeeId, t.shiftDate)],
);

export const attendanceRecords = sqliteTable(
  "attendance_records",
  {
    id: id(),
    employerId: employerId(),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    recordDate: text("record_date").notNull(),
    clockIn: text("clock_in"),
    clockOut: text("clock_out"),
    importId: text("import_id").notNull().references(() => imports.id),
  },
  (t) => [uniqueIndex("records_employee_date").on(t.employerId, t.employeeId, t.recordDate)],
);

export const gaps = sqliteTable(
  "gaps",
  {
    id: id(),
    employerId: employerId(),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    gapDate: text("gap_date").notNull(),
    gapType: text("gap_type", { enum: ["no_clockin", "no_clockout", "no_record_at_all"] }).notNull(),
    managerId: text("manager_id").notNull().references(() => managers.id), // snapshot at detection
    detectedAt: instant("detected_at").notNull(),
    managerNotifiedAt: instant("manager_notified_at"),
    resolvedAt: instant("resolved_at"),
    resolution: text("resolution", { enum: ["manager_action", "record_arrived"] }),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    uniqueIndex("gaps_idempotency").on(t.employerId, t.employeeId, t.gapDate, t.gapType),
    index("gaps_open_by_manager").on(t.employerId, t.managerId, t.resolvedAt),
  ],
);

export const unscheduledAttendance = sqliteTable(
  "unscheduled_attendance",
  {
    id: id(),
    employerId: employerId(),
    employeeId: text("employee_id").notNull().references(() => employees.id),
    recordDate: text("record_date").notNull(),
    attendanceRecordId: text("attendance_record_id").notNull().references(() => attendanceRecords.id),
    detectedAt: instant("detected_at").notNull(),
  },
  (t) => [uniqueIndex("unscheduled_idempotency").on(t.employerId, t.employeeId, t.recordDate)],
);

export const digests = sqliteTable(
  "digests",
  {
    id: id(),
    employerId: employerId(),
    managerId: text("manager_id").notNull().references(() => managers.id),
    digestDate: text("digest_date").notNull(),
    sentAt: instant("sent_at").notNull(),
    gapCount: integer("gap_count").notNull(),
  },
  (t) => [uniqueIndex("digests_idempotency").on(t.employerId, t.managerId, t.digestDate)],
);

export const escalations = sqliteTable(
  "escalations",
  {
    id: id(),
    employerId: employerId(),
    gapId: text("gap_id").notNull().references(() => gaps.id),
    escalatedAt: instant("escalated_at").notNull(),
    escalatedTo: text("escalated_to").notNull(),
    reason: text("reason", { enum: ["sla_breach"] }).notNull(),
  },
  (t) => [uniqueIndex("escalations_once_per_gap").on(t.gapId)],
);

export const events = sqliteTable(
  "events",
  {
    id: id(),
    employerId: employerId(),
    occurredAt: instant("occurred_at").notNull(),
    type: text("type", { enum: ["gap_detected", "digest_sent", "gap_resolved", "escalated"] }).notNull(),
    gapId: text("gap_id"),
    managerId: text("manager_id"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("events_by_gap").on(t.gapId)],
);
