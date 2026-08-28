// View logic for the digest/escalation pages, kept out of the components so it is
// testable with node:test. Copy comes from i18n.ts (en/he).
import type { DigestGap, GapType, Outcome } from "./api.ts";
import { dateTime, dayMonthYear, locale, longDate, shortDate, t } from "./i18n.ts";
import type { Locale } from "./i18n.ts";

export { dateTime, dayMonthYear, longDate, shortDate };

export const gapLabel = (g: GapType) => t(`gap.${g}` as const);
export const outcomeLabel = (o: Outcome) => t(`outcome.${o}.label` as const);
export const outcomeSummary = (o: Outcome) => t(`outcome.${o}.short` as const);

/** "shift 07:00–15:00 · clocked in 06:52 · no clock-out" */
export function detail(g: DigestGap): string {
  const shift = g.shift ? t("detail.shift", { start: g.shift.plannedStart, end: g.shift.plannedEnd }) : t("detail.noShift");
  const rec =
    g.gapType === "no_record_at_all" || !g.record ? t("detail.noRecord")
    : g.gapType === "no_clockin" ? t("detail.noClockin", { out: g.record.clockOut ?? "?" })
    : t("detail.noClockout", { in: g.record.clockIn ?? "?" });
  return `${shift} · ${rec}`;
}

export type SlaTone = "muted" | "warn" | "danger";

/** The SLA line under a gap: neutral until 24 h before the deadline, then urgent, then escalated. */
export function slaStatus(g: DigestGap, slaHours: number, now: Date): { text: string; tone: SlaTone } {
  if (g.escalated) return { text: t("sla.escalated"), tone: "danger" };
  if (!g.managerNotifiedAt) return { text: t("sla.notYet"), tone: "muted" };
  const left = Math.round((new Date(g.managerNotifiedAt).getTime() + slaHours * 3_600_000 - now.getTime()) / 3_600_000);
  if (left <= 0) return { text: t("sla.escalated"), tone: "danger" };
  if (left <= 24) return { text: t("sla.soon", { h: left }), tone: "warn" };
  return { text: t("sla.notified", { when: dateTime(g.managerNotifiedAt) }), tone: "muted" };
}

/** Groups gaps by day, newest day first, employees alphabetical within a day. */
export function groupByDay<T extends { gapDate: string; employeeName: string }>(gaps: T[]): Array<{ day: string; gaps: T[] }> {
  const days = new Map<string, T[]>();
  for (const g of gaps.slice().sort((a, b) => b.gapDate.localeCompare(a.gapDate) || a.employeeName.localeCompare(b.employeeName))) {
    days.set(g.gapDate, [...(days.get(g.gapDate) ?? []), g]);
  }
  return [...days].map(([day, list]) => ({ day, gaps: list }));
}

export const currentLocale = (): Locale => locale.value;
