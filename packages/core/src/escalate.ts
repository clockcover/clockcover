// Escalation — docs/core-design.md § Routing & Escalation.
import type { Store } from "./store.ts";
import type { Escalation, Gap, Id, NewEscalation, Outcome } from "./types.ts";

/** SLA window in milliseconds. Calendar time, not business hours (decided 2026-08-28). */
export type SlaMs = number;

const HOUR_MS = 3_600_000;

export interface EscalationMessage {
  gap: Gap;
  /** What is about to be recorded; it gets its id only after `send` succeeds. */
  escalation: NewEscalation;
}

/** Delivery is an adapter concern (ADR-0003); the core only calls it. */
export type SendEscalation = (message: EscalationMessage) => Promise<void>;

/** Pure: open gaps whose manager was notified more than `sla` ago. */
export function computeEscalations(openGaps: Gap[], now: Date, sla: SlaMs): Gap[] {
  return openGaps.filter(
    (g) => g.resolvedAt === null && g.managerNotifiedAt !== null && g.managerNotifiedAt.getTime() + sla < now.getTime(),
  );
}

/**
 * Escalates each SLA-breached gap (`employers.slaHours`, calendar time) to the
 * employer's payroll accountant. At-least-once, like the digest: check
 * `escalations`, then send, then record — a failed send records nothing and the
 * next run retries; a crash between send and record costs at most one duplicate.
 * A gap escalates once.
 */
export async function runEscalations(store: Store, employerId: Id, now: Date, send: SendEscalation): Promise<Escalation[]> {
  const employer = await store.getEmployer(employerId);
  const out: Escalation[] = [];
  for (const gap of computeEscalations(await store.listOpenGaps(employerId), now, employer.slaHours * HOUR_MS)) {
    if (await store.hasEscalation(gap.id)) continue;
    const escalation: NewEscalation = { employerId, gapId: gap.id, escalatedAt: now, escalatedTo: employer.payrollEmail, reason: "sla_breach" };
    await send({ gap, escalation });
    const saved = await store.saveEscalation(escalation);
    await store.appendEvent({ employerId, occurredAt: now, type: "escalated", gapId: gap.id, managerId: gap.managerId, payload: { escalatedTo: employer.payrollEmail } });
    out.push(saved);
  }
  return out;
}

/**
 * The payroll accountant closes an escalated gap that will never get its record
 * (leaver, retroactive leave, broken terminal). Counts as "manager did not act"
 * in the SLA metric. The note is the only trace of why — callers require it.
 */
export async function resolveByPayroll(store: Store, gapId: Id, now: Date, outcome: Outcome, note: string): Promise<Gap> {
  const gap = await store.resolveGap(gapId, "payroll_action", now, outcome, note);
  await store.appendEvent({ employerId: gap.employerId, occurredAt: now, type: "gap_resolved", gapId: gap.id, managerId: gap.managerId, payload: { resolution: "payroll_action", outcome } });
  return gap;
}
