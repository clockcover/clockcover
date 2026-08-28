// SQL implementation of the core's Store port (ADR-0001, ADR-0003). Written against
// Drizzle's async SQLite database type, so it runs on D1 in production and on libsql
// in tests — same dialect, same SQL.
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type {
  Digest, Employer, Escalation, Gap, GapType, Id, IsoDate, Manager, NewDigest, NewEscalation, NewEvent, NewGap,
  NewUnscheduledAttendance, Outcome, Resolution, Store,
} from "@clockcover/core";
import * as s from "./schema.ts";

/** Drizzle's async SQLite database plus `batch` — one round trip, one transaction — which both the D1 and the libsql drivers provide. */
export type Db = BaseSQLiteDatabase<"async", unknown, typeof s> & {
  batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(batch: T): Promise<BatchResponse<T>>;
};

const iso = (d: Date) => d.toISOString();
const date = (v: string | null) => (v === null ? null : new Date(v));
const newId = () => crypto.randomUUID();

const toGap = (r: typeof s.gaps.$inferSelect): Gap => ({
  ...r,
  detectedAt: new Date(r.detectedAt),
  managerNotifiedAt: date(r.managerNotifiedAt),
  resolvedAt: date(r.resolvedAt),
});

export class SqlStore implements Store {
  private db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async getEmployer(employerId: Id): Promise<Employer> {
    const [row] = await this.db.select().from(s.employers).where(eq(s.employers.id, employerId));
    if (!row) throw new Error(`employer not found: ${employerId}`);
    return row;
  }

  async getManager(managerId: Id): Promise<Manager> {
    const [row] = await this.db.select().from(s.managers).where(eq(s.managers.id, managerId));
    if (!row) throw new Error(`manager not found: ${managerId}`);
    return row;
  }

  async upsertGap(g: NewGap): Promise<{ gap: Gap; created: boolean }> {
    const key = and(
      eq(s.gaps.employerId, g.employerId), eq(s.gaps.employeeId, g.employeeId),
      eq(s.gaps.gapDate, g.gapDate), eq(s.gaps.gapType, g.gapType),
    );
    const [existing] = await this.db.select().from(s.gaps).where(key);
    if (existing) return { gap: toGap(existing), created: false };
    const row = { id: newId(), ...g, detectedAt: iso(g.detectedAt) };
    await this.db.insert(s.gaps).values(row);
    return { gap: toGap({ ...row, managerNotifiedAt: null, resolvedAt: null, resolution: null, outcome: null, resolutionNote: null }), created: true };
  }

  async upsertUnscheduledAttendance(u: NewUnscheduledAttendance): Promise<void> {
    await this.db.insert(s.unscheduledAttendance)
      .values({ id: newId(), ...u, detectedAt: iso(u.detectedAt) })
      .onConflictDoNothing();
  }

  async listOpenGaps(employerId: Id, range?: { from: IsoDate; to: IsoDate }): Promise<Gap[]> {
    const rows = await this.db.select().from(s.gaps).where(and(
      eq(s.gaps.employerId, employerId), isNull(s.gaps.resolvedAt),
      ...(range ? [gte(s.gaps.gapDate, range.from), lte(s.gaps.gapDate, range.to)] : []),
    )).orderBy(asc(s.gaps.gapDate), asc(s.gaps.employeeId));
    return rows.map(toGap);
  }

  /** Resolves an open gap. Throws "gap already resolved" when another resolve got there first — the caller answers 409. */
  async resolveGap(gapId: Id, resolution: Resolution, resolvedAt: Date, outcome: Outcome | null, note: string | null): Promise<Gap> {
    const updated = await this.db.update(s.gaps)
      .set({ resolution, resolvedAt: iso(resolvedAt), outcome, resolutionNote: note })
      .where(and(eq(s.gaps.id, gapId), isNull(s.gaps.resolvedAt)))
      .returning({ id: s.gaps.id });
    const [row] = await this.db.select().from(s.gaps).where(eq(s.gaps.id, gapId));
    if (!row) throw new Error(`gap not found: ${gapId}`);
    if (updated.length === 0) throw new Error(`gap already resolved: ${gapId}`);
    return toGap(row);
  }

  async retypeGap(gapId: Id, gapType: GapType): Promise<Gap | null> {
    const [row] = await this.db.select().from(s.gaps).where(eq(s.gaps.id, gapId));
    if (!row) throw new Error(`gap not found: ${gapId}`);
    const [taken] = await this.db.select({ id: s.gaps.id }).from(s.gaps).where(and(
      eq(s.gaps.employerId, row.employerId), eq(s.gaps.employeeId, row.employeeId),
      eq(s.gaps.gapDate, row.gapDate), eq(s.gaps.gapType, gapType),
    ));
    if (taken) return null;
    await this.db.update(s.gaps).set({ gapType }).where(eq(s.gaps.id, gapId));
    return toGap({ ...row, gapType });
  }

  async markNotified(gapIds: Id[], at: Date): Promise<void> {
    for (const gapId of gapIds) {
      await this.db.update(s.gaps).set({ managerNotifiedAt: iso(at) })
        .where(and(eq(s.gaps.id, gapId), isNull(s.gaps.managerNotifiedAt)));
    }
  }

  async findDigest(employerId: Id, managerId: Id, digestDate: IsoDate): Promise<Digest | null> {
    const [row] = await this.db.select().from(s.digests).where(and(
      eq(s.digests.employerId, employerId), eq(s.digests.managerId, managerId), eq(s.digests.digestDate, digestDate),
    ));
    return row ? { ...row, sentAt: new Date(row.sentAt) } : null;
  }

  async saveDigest(d: NewDigest): Promise<Digest> {
    const row = { id: newId(), ...d, sentAt: iso(d.sentAt) };
    await this.db.insert(s.digests).values(row);
    return { ...row, sentAt: d.sentAt };
  }

  async hasEscalation(gapId: Id): Promise<boolean> {
    const [row] = await this.db.select({ id: s.escalations.id }).from(s.escalations).where(eq(s.escalations.gapId, gapId));
    return row !== undefined;
  }

  async saveEscalation(e: NewEscalation): Promise<Escalation> {
    const row = { id: newId(), ...e, escalatedAt: iso(e.escalatedAt) };
    await this.db.insert(s.escalations).values(row);
    return { ...row, escalatedAt: e.escalatedAt };
  }

  async appendEvent(e: NewEvent): Promise<void> {
    await this.db.insert(s.events).values({ id: newId(), ...e, occurredAt: iso(e.occurredAt) });
  }
}
