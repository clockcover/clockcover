// Generic CSV adapter — the first (and only) ingestion adapter (ADR-0003). One file
// format carries both scheduled shifts and attendance records; a row is a shift if
// it has planned times, a record if it has clock times, or both.
//
//   employee_id,date,planned_start,planned_end,clock_in,clock_out
//   E-001,2026-03-02,08:00,16:00,08:02,16:05
//   E-001,2026-03-03,08:00,16:00,,            ← shift, no record yet → gap
//   E-002,2026-03-02,,,09:00,17:00            ← record, no shift → unscheduled attendance
//
// Roster (employees + managers), a separate file:
//
//   employee_id,employee_name,manager_id,manager_name,manager_email

export interface CsvShift { employeeExternalId: string; date: string; plannedStart: string; plannedEnd: string }
export interface CsvRecord { employeeExternalId: string; date: string; clockIn: string | null; clockOut: string | null }
export interface ParsedCsv { shifts: CsvShift[]; records: CsvRecord[]; errors: string[] }

export interface RosterRow {
  employeeExternalId: string;
  employeeName: string;
  managerExternalId: string;
  managerName: string;
  managerEmail: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Minimal RFC-4180 reader: quoted fields, doubled quotes, CRLF. Returns rows of trimmed cells. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

function table(text: string, required: string[]): { rows: Record<string, string>[]; errors: string[] } {
  const [header, ...body] = readCsv(text);
  if (!header) return { rows: [], errors: ["empty file"] };
  const cols = header.map((h) => h.toLowerCase());
  const missing = required.filter((r) => !cols.includes(r));
  if (missing.length) return { rows: [], errors: [`missing columns: ${missing.join(", ")}`] };
  const rows = body.map((cells) => Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""])));
  return { rows, errors: [] };
}

export function parseCsv(text: string): ParsedCsv {
  const { rows, errors } = table(text, ["employee_id", "date"]);
  const out: ParsedCsv = { shifts: [], records: [], errors };
  const seen = new Map<string, number>(); // one shift and one record per employee per day (open-questions.md)
  rows.forEach((r, i) => {
    const line = i + 2;
    const employeeExternalId = r["employee_id"] ?? "", date = r["date"] ?? "";
    if (!employeeExternalId) { out.errors.push(`line ${line}: employee_id is empty`); return; }
    if (!DATE.test(date)) { out.errors.push(`line ${line}: date must be YYYY-MM-DD`); return; }
    const key = `${employeeExternalId}|${date}`;
    const first = seen.get(key);
    if (first !== undefined) { out.errors.push(`line ${line}: second row for ${employeeExternalId} on ${date} (first on line ${first}); one shift and one record per day`); return; }
    seen.set(key, line);
    const ps = r["planned_start"] || null, pe = r["planned_end"] || null;
    const ci = r["clock_in"] || null, co = r["clock_out"] || null;
    for (const [name, v] of [["planned_start", ps], ["planned_end", pe], ["clock_in", ci], ["clock_out", co]] as const) {
      if (v !== null && !TIME.test(v)) { out.errors.push(`line ${line}: ${name} must be HH:MM`); return; }
    }
    if ((ps === null) !== (pe === null)) { out.errors.push(`line ${line}: planned_start and planned_end must both be set`); return; }
    if (ps !== null && pe !== null) out.shifts.push({ employeeExternalId, date, plannedStart: ps, plannedEnd: pe });
    if (ci !== null || co !== null) out.records.push({ employeeExternalId, date, clockIn: ci, clockOut: co });
    if (ps === null && ci === null && co === null) out.errors.push(`line ${line}: neither planned nor clock times`);
  });
  return out;
}

export function parseRoster(text: string): { rows: RosterRow[]; errors: string[] } {
  const { rows, errors } = table(text, ["employee_id", "employee_name", "manager_id", "manager_name", "manager_email"]);
  const out: RosterRow[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const row: RosterRow = {
      employeeExternalId: r["employee_id"] ?? "", employeeName: r["employee_name"] ?? "",
      managerExternalId: r["manager_id"] ?? "", managerName: r["manager_name"] ?? "", managerEmail: r["manager_email"] ?? "",
    };
    const empty = Object.entries(row).filter(([, v]) => v === "").map(([k]) => k);
    if (empty.length) { errors.push(`line ${line}: empty ${empty.join(", ")}`); return; }
    if (!row.managerEmail.includes("@")) { errors.push(`line ${line}: manager_email is not an email`); return; }
    out.push(row);
  });
  return { rows: out, errors };
}
