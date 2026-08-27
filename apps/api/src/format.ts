// Human dates for emails and API payloads. UTC throughout until an employer
// timezone exists (docs/open-questions.md).

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-27" → "Thu 27 Aug" */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "2026-08-27" → "Thu 27 Aug 2026" */
export function longDate(isoDate: string): string {
  return `${shortDate(isoDate)} ${isoDate.slice(0, 4)}`;
}

/** Instant → "Wed 26 Aug, 08:00" (UTC) */
export function dateTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${shortDate(d.toISOString().slice(0, 10))}, ${hh}:${mm}`;
}

/** Instant → "10 Sep 2026" */
export function dayMonthYear(d: Date): string {
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
