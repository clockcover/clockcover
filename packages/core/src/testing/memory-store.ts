// In-memory Store for tests. Mirrors the unique keys in docs/core-design.md.
// Returns copies, never the stored rows — like a database would.
import type { Store } from "../store.ts";
import type {
  Digest, DomainEvent, Employer, Escalation, Gap, GapType, Id, IsoDate, Manager, NewDigest, NewEscalation,
  NewEvent, NewGap, NewUnscheduledAttendance, Outcome, Resolution, UnscheduledAttendance,
} from "../types.ts";

export class MemoryStore implements Store {
  gaps: Gap[] = [];
  unscheduled: UnscheduledAttendance[] = [];
  digests: Digest[] = [];
  escalations: Escalation[] = [];
  events: DomainEvent[] = [];
  private seq = 0;
  private id = (p: string) => `${p}-${++this.seq}`;

  private employers: Employer[];
  private managers: Manager[];
  constructor(employers: Employer[], managers: Manager[]) {
    this.employers = employers;
    this.managers = managers;
  }

  async getEmployer(employerId: Id) {
    return this.employers.find((e) => e.id === employerId) ?? fail(`employer ${employerId}`);
  }
  async getManager(managerId: Id) {
    return this.managers.find((m) => m.id === managerId) ?? fail(`manager ${managerId}`);
  }

  async upsertGap(g: NewGap) {
    const existing = this.gaps.find(
      (x) => x.employerId === g.employerId && x.employeeId === g.employeeId && x.gapDate === g.gapDate && x.gapType === g.gapType,
    );
    if (existing) return { gap: { ...existing }, created: false };
    const gap: Gap = { ...g, id: this.id("gap"), managerNotifiedAt: null, resolvedAt: null, resolution: null, outcome: null, resolutionNote: null };
    this.gaps.push(gap);
    return { gap: { ...gap }, created: true };
  }
  async upsertUnscheduledAttendance(u: NewUnscheduledAttendance) {
    if (this.unscheduled.some((x) => x.employerId === u.employerId && x.employeeId === u.employeeId && x.recordDate === u.recordDate)) return;
    this.unscheduled.push({ ...u, id: this.id("ua") });
  }
  async listOpenGaps(employerId: Id, range?: { from: IsoDate; to: IsoDate }) {
    return this.gaps
      .filter((g) => g.employerId === employerId && g.resolvedAt === null && (!range || (g.gapDate >= range.from && g.gapDate <= range.to)))
      .sort((a, b) => a.gapDate.localeCompare(b.gapDate) || a.employeeId.localeCompare(b.employeeId))
      .map((g) => ({ ...g }));
  }
  async resolveGap(gapId: Id, resolution: Resolution, resolvedAt: Date, outcome: Outcome | null, note: string | null) {
    const gap = this.gaps.find((g) => g.id === gapId) ?? fail(`gap ${gapId}`);
    if (gap.resolvedAt !== null) throw new Error(`gap already resolved: ${gapId}`);
    Object.assign(gap, { resolution, resolvedAt, outcome, resolutionNote: note });
    return { ...gap };
  }
  async retypeGap(gapId: Id, gapType: GapType) {
    const gap = this.gaps.find((g) => g.id === gapId) ?? fail(`gap ${gapId}`);
    const taken = this.gaps.some(
      (x) => x.employerId === gap.employerId && x.employeeId === gap.employeeId && x.gapDate === gap.gapDate && x.gapType === gapType,
    );
    if (taken) return null;
    gap.gapType = gapType;
    return { ...gap };
  }
  async markNotified(gapIds: Id[], at: Date) {
    for (const g of this.gaps) if (gapIds.includes(g.id) && g.managerNotifiedAt === null) g.managerNotifiedAt = at;
  }

  async findDigest(employerId: Id, managerId: Id, digestDate: IsoDate) {
    return this.digests.find((d) => d.employerId === employerId && d.managerId === managerId && d.digestDate === digestDate) ?? null;
  }
  async saveDigest(d: NewDigest) {
    const digest = { ...d, id: this.id("dig") };
    this.digests.push(digest);
    return digest;
  }

  async hasEscalation(gapId: Id) {
    return this.escalations.some((e) => e.gapId === gapId);
  }
  async saveEscalation(e: NewEscalation) {
    const escalation = { ...e, id: this.id("esc") };
    this.escalations.push(escalation);
    return escalation;
  }

  async appendEvent(e: NewEvent) {
    this.events.push({ ...e, id: this.id("evt") });
  }
}

function fail(what: string): never {
  throw new Error(`not found: ${what}`);
}
