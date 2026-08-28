// View logic for the digest page, kept out of the component so it is testable
// with node:test. Wording follows the "Manager Digest Page" artboard.
import type { DigestGap, GapType, Outcome } from "./api.ts";

export const GAP_LABEL: Record<GapType, string> = {
  no_clockin: "No clock-in",
  no_clockout: "No clock-out",
  no_record_at_all: "No record",
};

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-27" → "Thu 27 Aug" */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "2026-08-27" → "Thu 27 Aug 2026" */
export const longDate = (isoDate: string) => `${shortDate(isoDate)} ${isoDate.slice(0, 4)}`;

/** ISO instant → "Wed 26 Aug, 08:00" (UTC) */
export function dateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${shortDate(iso.slice(0, 10))}, ${hh}:${mm}`;
}

/** ISO instant → "10 Sep 2026" */
export function dayMonthYear(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "shift 07:00–15:00 · clocked in 06:52 · no clock-out" */
export function detail(g: DigestGap): string {
  const shift = g.shift ? `shift ${g.shift.plannedStart}–${g.shift.plannedEnd}` : "no scheduled shift";
  const rec =
    g.gapType === "no_record_at_all" || !g.record ? "no attendance record"
    : g.gapType === "no_clockin" ? `clocked out ${g.record.clockOut ?? "?"} · no clock-in`
    : `clocked in ${g.record.clockIn ?? "?"} · no clock-out`;
  return `${shift} · ${rec}`;
}

export type SlaTone = "muted" | "warn" | "danger";

/** The SLA line under a gap: neutral until 24 h before the deadline, then urgent, then escalated. */
export function slaStatus(g: DigestGap, slaHours: number, now: Date): { text: string; tone: SlaTone } {
  if (g.escalated) return { text: "Escalated to payroll — SLA passed", tone: "danger" };
  if (!g.managerNotifiedAt) return { text: "Not yet in a digest", tone: "muted" };
  const left = Math.round((new Date(g.managerNotifiedAt).getTime() + slaHours * 3_600_000 - now.getTime()) / 3_600_000);
  if (left <= 0) return { text: "Escalated to payroll — SLA passed", tone: "danger" };
  if (left <= 24) return { text: `Escalates to payroll in ${left} h`, tone: "warn" };
  return { text: `Notified ${dateTime(g.managerNotifiedAt)}`, tone: "muted" };
}

/** Groups gaps by day, newest day first, employees alphabetical within a day. */
export function groupByDay<T extends { gapDate: string; employeeName: string }>(gaps: T[]): Array<{ day: string; gaps: T[] }> {
  const days = new Map<string, T[]>();
  for (const g of gaps.slice().sort((a, b) => b.gapDate.localeCompare(a.gapDate) || a.employeeName.localeCompare(b.employeeName))) {
    days.set(g.gapDate, [...(days.get(g.gapDate) ?? []), g]);
  }
  return [...days].map(([day, list]) => ({ day, gaps: list }));
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  present: "Approve the hours — was at work, clock entry missing",
  absent: "Report an absence — was not at work, explain below",
};
export const outcomeSummary = (o: Outcome) => (o === "present" ? "hours approved" : "absence reported");
