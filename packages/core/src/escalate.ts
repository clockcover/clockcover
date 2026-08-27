// Escalation — docs/core-design.md § Routing & Escalation.
import type { Store } from "./store.ts";
import type { Escalation, Gap, Id } from "./types.ts";

/** SLA window in milliseconds. Whether it is business or calendar time is an open question; the caller decides. */
export type Sla = number;

/** Pure: open gaps whose manager was notified more than `sla` ago. */
export function computeEscalations(openGaps: Gap[], now: Date, sla: Sla): Gap[] {
  return openGaps.filter(
    (g) => g.resolvedAt === null && g.managerNotifiedAt !== null && g.managerNotifiedAt.getTime() + sla < now.getTime(),
  );
}

/** Escalates each SLA-breached gap to the employer's payroll accountant. A gap escalates once. */
export async function runEscalations(store: Store, employerId: Id, now: Date, sla: Sla): Promise<Escalation[]> {
  const employer = await store.getEmployer(employerId);
  const out: Escalation[] = [];
  for (const gap of computeEscalations(await store.listOpenGaps(employerId), now, sla)) {
    if (await store.hasEscalation(gap.id)) continue;
    const escalation = await store.saveEscalation({ employerId, gapId: gap.id, escalatedAt: now, escalatedTo: employer.payrollEmail, reason: "sla_breach" });
    await store.appendEvent({ employerId, occurredAt: now, type: "escalated", gapId: gap.id, managerId: gap.managerId, payload: { escalatedTo: employer.payrollEmail } });
    out.push(escalation);
  }
  return out;
}
