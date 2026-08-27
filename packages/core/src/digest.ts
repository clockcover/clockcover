// Routing — docs/core-design.md § Routing & Escalation.
import type { Store } from "./store.ts";
import type { Digest, Gap, Id, IsoDate, Manager } from "./types.ts";

export interface DigestMessage {
  manager: Manager;
  gaps: Gap[];
}

/** Delivery is an adapter concern (ADR-0003); the core only calls it. */
export type SendDigest = (message: DigestMessage) => Promise<void>;

/** Calendar date of an instant, UTC. */
export const isoDate = (d: Date): IsoDate => d.toISOString().slice(0, 10);

/**
 * Once a day per employer. Groups open gaps by the snapshotted manager, sends each
 * manager only their own list, records the digest. Idempotent per (manager, day):
 * check `digests`, then send, then record — at-least-once, at most one duplicate.
 */
export async function runDailyDigest(store: Store, employerId: Id, now: Date, send: SendDigest): Promise<Digest[]> {
  const digestDate = isoDate(now);
  const byManager = new Map<Id, Gap[]>();
  for (const gap of await store.listOpenGaps(employerId)) {
    byManager.set(gap.managerId, [...(byManager.get(gap.managerId) ?? []), gap]);
  }

  const sent: Digest[] = [];
  for (const [managerId, gaps] of byManager) {
    if (await store.findDigest(employerId, managerId, digestDate)) continue;
    const manager = await store.getManager(managerId);
    await send({ manager, gaps });
    const digest = await store.saveDigest({ employerId, managerId, digestDate, sentAt: now, gapCount: gaps.length });
    await store.markNotified(gaps.filter((g) => g.managerNotifiedAt === null).map((g) => g.id), now);
    await store.appendEvent({ employerId, occurredAt: now, type: "digest_sent", gapId: null, managerId, payload: { digestId: digest.id, gapCount: gaps.length } });
    sent.push(digest);
  }
  return sent;
}

/** A manager acted on a gap from their digest. */
export async function resolveByManager(store: Store, gapId: Id, now: Date, note: string | null = null): Promise<Gap> {
  const gap = await store.resolveGap(gapId, "manager_action", now, note);
  await store.appendEvent({ employerId: gap.employerId, occurredAt: now, type: "gap_resolved", gapId: gap.id, managerId: gap.managerId, payload: { resolution: "manager_action" } });
  return gap;
}
