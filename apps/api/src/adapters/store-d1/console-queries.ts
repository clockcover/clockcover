// Read models for the operator console (ADR-0005). apps/api only.
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { Id } from "@clockcover/core";
import type { Db } from "./store.ts";
import * as s from "./schema.ts";

export interface ImportRun { id: Id; source: string; importedAt: string; rowCount: number }

export async function listImports(db: Db, employerId: Id, limit = 50): Promise<ImportRun[]> {
  return db.select({ id: s.imports.id, source: s.imports.source, importedAt: s.imports.importedAt, rowCount: s.imports.rowCount })
    .from(s.imports).where(eq(s.imports.employerId, employerId)).orderBy(desc(s.imports.importedAt)).limit(limit);
}

export interface Overview {
  openGaps: number;
  /** Open gaps that have already been escalated. */
  escalated: number;
  byManager: Array<{ managerId: Id; managerName: string; openGaps: number; oldestGapDate: string | null }>;
  /** Last `windowDays`: gaps that appeared in a digest, and how many the manager resolved within the SLA. */
  metric: { windowDays: number; notified: number; actedWithinSla: number; resolvedByRecord: number; escalated: number };
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
  let actedWithinSla = 0, resolvedByRecord = 0, escalatedInWindow = 0;
  for (const e of events) {
    if (!e.gapId || !notifiedAt.has(e.gapId)) continue;
    if (e.type === "gap_resolved") {
      const res = (e.payload as { resolution?: string }).resolution;
      if (res === "record_arrived") resolvedByRecord++;
      else if (res === "manager_action" && new Date(e.occurredAt).getTime() - new Date(notifiedAt.get(e.gapId)!).getTime() <= slaHours * 3_600_000) actedWithinSla++;
    } else if (e.type === "escalated") escalatedInWindow++;
  }

  return {
    openGaps: open.length,
    escalated: open.filter((g) => escalatedIds.has(g.id)).length,
    byManager: [...byManager].map(([managerId, v]) => ({ managerId, managerName: managers.get(managerId) ?? managerId, ...v }))
      .sort((a, b) => b.openGaps - a.openGaps || a.managerName.localeCompare(b.managerName)),
    metric: { windowDays, notified: notifiedGaps.length, actedWithinSla, resolvedByRecord, escalated: escalatedInWindow },
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
