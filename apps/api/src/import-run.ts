// Scheduled import: fetch the roster and the shift/attendance export from the URLs
// configured on the employer, run detection, and tell the operator when it fails.
// Also what "Run import now" in the console calls. Uploads keep working alongside.
import { runDetection } from "@clockcover/core";
import type { Id } from "@clockcover/core";
import type { Db } from "./adapters/store-d1/store.ts";
import { periodOf, saveImport, saveRoster } from "./adapters/store-d1/imports.ts";
import { parseCsv, parseRoster } from "./adapters/csv.ts";
import * as s from "./adapters/store-d1/schema.ts";
import type { Store } from "@clockcover/core";

export interface ImportSummary {
  roster: { employees: number } | null;
  import: { importId: Id; period: { from: string; to: string }; shifts: number; records: number; gapsCreated: number; gapsResolved: number; unknownEmployees: string[] } | null;
}

export class ImportError extends Error {
  step: "roster" | "import";
  details: string[];
  constructor(step: "roster" | "import", message: string, details: string[] = []) {
    super(message);
    this.step = step;
    this.details = details;
  }
}

const MAX_BYTES = 10 * 1024 * 1024;

async function fetchCsv(url: string, fetchFn: typeof fetch, what: "roster" | "import"): Promise<string> {
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { accept: "text/csv, text/plain;q=0.9, */*;q=0.1" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
  } catch (e) {
    throw new ImportError(what, `could not fetch ${what} file: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new ImportError(what, `${what} file: HTTP ${res.status} from ${new URL(url).host}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new ImportError(what, `${what} file is larger than 10 MB`);
  return text;
}

/** Runs the configured fetches for one employer. Throws ImportError; never partially hides a failure. */
export async function runImportFromUrls(
  db: Db, store: Store, employer: { id: Id; importUrl: string | null; rosterUrl: string | null }, now: Date, fetchFn: typeof fetch = fetch,
): Promise<ImportSummary> {
  const summary: ImportSummary = { roster: null, import: null };
  if (employer.rosterUrl) {
    const { rows, errors } = parseRoster(await fetchCsv(employer.rosterUrl, fetchFn, "roster"));
    if (errors.length) throw new ImportError("roster", "roster file has errors", errors);
    summary.roster = { employees: (await saveRoster(db, employer.id, rows)).length };
  }
  if (employer.importUrl) {
    const parsed = parseCsv(await fetchCsv(employer.importUrl, fetchFn, "import"));
    if (parsed.errors.length) throw new ImportError("import", "export file has errors", parsed.errors);
    const period = periodOf(parsed);
    if (!period) throw new ImportError("import", "export file has no rows");
    const saved = await saveImport(db, employer.id, parsed, now, "url");
    const outcome = await runDetection(store, employer.id, period, saved, now);
    summary.import = {
      importId: saved.importId, period, shifts: saved.shifts.length, records: saved.records.length,
      gapsCreated: outcome.created.length, gapsResolved: outcome.resolved.length, unknownEmployees: saved.unknownEmployees,
    };
  }
  return summary;
}

/** True when the employer has at least one URL to fetch. */
export const hasImportSources = (e: { importUrl: string | null; rosterUrl: string | null }) => Boolean(e.importUrl || e.rosterUrl);

/** An https URL, or null for "not configured". Anything else is an error string. */
export function validateSourceUrl(v: string): { url: string | null } | { error: string } {
  const t = v.trim();
  if (!t) return { url: null };
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return { error: "must be an https:// URL" };
    return { url: u.toString() };
  } catch {
    return { error: "is not a valid URL" };
  }
}

export type EmployerRow = typeof s.employers.$inferSelect;
