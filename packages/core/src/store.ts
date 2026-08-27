// The Store port — the core's only abstraction over infrastructure (ADR-0001,
// ADR-0003). One implementation per backend lives in apps/api; tests use an
// in-memory one. Ids are assigned by the store.
import type {
  Digest, Employer, Escalation, Gap, Id, IsoDate, Manager, NewDigest, NewEscalation, NewEvent,
  NewGap, NewUnscheduledAttendance, Resolution,
} from "./types.ts";

export interface Store {
  getEmployer(employerId: Id): Promise<Employer>;
  getManager(managerId: Id): Promise<Manager>;

  /** Upsert on (employerId, employeeId, gapDate, gapType). `created` is false when the gap already existed. */
  upsertGap(gap: NewGap): Promise<{ gap: Gap; created: boolean }>;
  /** Upsert on (employerId, employeeId, recordDate). */
  upsertUnscheduledAttendance(u: NewUnscheduledAttendance): Promise<void>;
  /** Gaps with `resolvedAt` null, optionally limited to a date range (inclusive). */
  listOpenGaps(employerId: Id, range?: { from: IsoDate; to: IsoDate }): Promise<Gap[]>;
  resolveGap(gapId: Id, resolution: Resolution, resolvedAt: Date, note: string | null): Promise<Gap>;
  /** Sets `managerNotifiedAt` where it is still null. */
  markNotified(gapIds: Id[], at: Date): Promise<void>;

  findDigest(employerId: Id, managerId: Id, digestDate: IsoDate): Promise<Digest | null>;
  saveDigest(d: NewDigest): Promise<Digest>;

  hasEscalation(gapId: Id): Promise<boolean>;
  saveEscalation(e: NewEscalation): Promise<Escalation>;

  appendEvent(e: NewEvent): Promise<void>;
}
