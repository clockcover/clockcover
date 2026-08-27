// Domain types. One-to-one with the schema in docs/core-design.md (camelCase here,
// snake_case in the database). Dates without time are ISO `YYYY-MM-DD` strings;
// instants are `Date`.

export type Id = string;
export type IsoDate = string;

export interface Employer {
  id: Id;
  name: string;
  /** Where escalations go; one payroll accountant per employer. */
  payrollEmail: string;
  /** IANA timezone (e.g. "Europe/Berlin"). Defines "today" for digests and the SLA. */
  timezone: string;
  /** Who may sign in to the operator console (ADR-0005); null until set. */
  operatorEmail: string | null;
  /** SLA in hours before an unresolved gap escalates. */
  slaHours: number;
}

export interface Manager {
  id: Id;
  employerId: Id;
  externalId: string;
  fullName: string;
  email: string;
  whatsappNumber: string | null;
}

export interface Employee {
  id: Id;
  employerId: Id;
  externalId: string;
  fullName: string;
  managerId: Id;
  active: boolean;
}

export type ImportSource = "csv" | "excel" | "pdf";

export interface Import {
  id: Id;
  employerId: Id;
  source: ImportSource;
  importedAt: Date;
  rowCount: number;
}

export interface ScheduledShift {
  id: Id;
  employerId: Id;
  employeeId: Id;
  shiftDate: IsoDate;
  plannedStart: string;
  plannedEnd: string;
  importId: Id;
}

export interface AttendanceRecord {
  id: Id;
  employerId: Id;
  employeeId: Id;
  recordDate: IsoDate;
  clockIn: string | null;
  clockOut: string | null;
  importId: Id;
}

export type GapType = "no_clockin" | "no_clockout" | "no_record_at_all";
export type Resolution = "manager_action" | "record_arrived";

export interface Gap {
  id: Id;
  employerId: Id;
  employeeId: Id;
  gapDate: IsoDate;
  gapType: GapType;
  /** Snapshot of the employee's manager at detection time. Never updated. */
  managerId: Id;
  detectedAt: Date;
  managerNotifiedAt: Date | null;
  resolvedAt: Date | null;
  resolution: Resolution | null;
  resolutionNote: string | null;
}

/** A gap as the matching engine emits it — before the store assigns an id. */
export type NewGap = Pick<Gap, "employerId" | "employeeId" | "gapDate" | "gapType" | "managerId" | "detectedAt">;

export interface UnscheduledAttendance {
  id: Id;
  employerId: Id;
  employeeId: Id;
  recordDate: IsoDate;
  attendanceRecordId: Id;
  detectedAt: Date;
}
export type NewUnscheduledAttendance = Omit<UnscheduledAttendance, "id">;

export interface Digest {
  id: Id;
  employerId: Id;
  managerId: Id;
  digestDate: IsoDate;
  sentAt: Date;
  gapCount: number;
}
export type NewDigest = Omit<Digest, "id">;

export interface Escalation {
  id: Id;
  employerId: Id;
  gapId: Id;
  escalatedAt: Date;
  /** `employers.payrollEmail` at escalation time. */
  escalatedTo: string;
  reason: "sla_breach";
}
export type NewEscalation = Omit<Escalation, "id">;

export type EventType = "gap_detected" | "digest_sent" | "gap_resolved" | "escalated";

export interface Event {
  id: Id;
  employerId: Id;
  occurredAt: Date;
  type: EventType;
  gapId: Id | null;
  managerId: Id | null;
  payload: Record<string, unknown>;
}
export type NewEvent = Omit<Event, "id">;
