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

/**
 * Fetches one configured file. The URL is re-checked at fetch time (it was validated when
 * saved, but the rules may have tightened since), redirects are not followed — a redirect
 * could point the worker at an internal address — and the body is capped while streaming.
 */
async function fetchCsv(url: string, fetchFn: typeof fetch, what: "roster" | "import"): Promise<string> {
  const checked = validateSourceUrl(url);
  if ("error" in checked || !checked.url) throw new ImportError(what, `${what} URL ${"error" in checked ? checked.error : "is empty"}`);
  const host = new URL(checked.url).host;
  let res: Response;
  try {
    res = await fetchFn(checked.url, { headers: { accept: "text/csv, text/plain;q=0.9, */*;q=0.1" }, signal: AbortSignal.timeout(30_000), redirect: "manual" });
  } catch (e) {
    throw new ImportError(what, `could not fetch ${what} file from ${host}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status >= 300 && res.status < 400) throw new ImportError(what, `${what} file: ${host} redirected (HTTP ${res.status}); redirects are not followed — configure the final URL`);
  if (!res.ok) throw new ImportError(what, `${what} file: HTTP ${res.status} from ${host}`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new ImportError(what, `${what} file is larger than 10 MB`);
  const text = await readCapped(res, MAX_BYTES);
  if (text === null) throw new ImportError(what, `${what} file is larger than 10 MB`);
  return text;
}

/** Reads the body as UTF-8, giving up (null) as soon as more than `max` bytes have arrived. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(all);
}

/**
 * Parser messages for a fetched file, with any cell content removed: the operator sees
 * line numbers and field names, never what an outside server put in the body.
 */
export const redactDetails = (details: string[]) =>
  details.map((d) => d.replace(/^(line \d+): second row for .* \(first on line (\d+)\).*$/, "$1: second row for the same employee and day (first on line $2)"));

/** Runs the configured fetches for one employer. Throws ImportError; never partially hides a failure. */
export async function runImportFromUrls(
  db: Db, store: Store, employer: { id: Id; importUrl: string | null; rosterUrl: string | null }, now: Date, fetchFn: typeof fetch = fetch,
): Promise<ImportSummary> {
  const summary: ImportSummary = { roster: null, import: null };
  if (employer.rosterUrl) {
    const { rows, errors } = parseRoster(await fetchCsv(employer.rosterUrl, fetchFn, "roster"));
    if (errors.length) throw new ImportError("roster", "roster file has errors", redactDetails(errors));
    summary.roster = { employees: (await saveRoster(db, employer.id, rows)).length };
  }
  if (employer.importUrl) {
    const parsed = parseCsv(await fetchCsv(employer.importUrl, fetchFn, "import"));
    if (parsed.errors.length) throw new ImportError("import", "export file has errors", redactDetails(parsed.errors));
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

/**
 * An https URL to a public host name, or null for "not configured". Anything else is an
 * error string. Literal IP addresses and local names are refused: the worker fetches this
 * URL itself, so it must never be pointed at something inside a network.
 */
export function validateSourceUrl(v: string): { url: string | null } | { error: string } {
  const t = v.trim();
  if (!t) return { url: null };
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return { error: "must be an https:// URL" };
    if (u.username || u.password) return { error: "must not carry a username or password — put the token in the path or query" };
    const host = u.hostname.toLowerCase();
    if (host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { error: "must use a host name, not an IP address" };
    if (host === "localhost" || !host.includes(".") || /\.(localhost|local|internal|localdomain|home\.arpa)$/.test(host)) return { error: "must be a public host name" };
    return { url: u.toString() };
  } catch {
    return { error: "is not a valid URL" };
  }
}

export type EmployerRow = typeof s.employers.$inferSelect;
