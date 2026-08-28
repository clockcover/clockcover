// Client for the operator console API (ADR-0005). The bearer token lives in
// sessionStorage — it dies with the tab — and is never put in a URL after landing.
import { ApiError } from "./api.ts";

export interface EmployerSettings {
  id: string;
  name: string;
  payrollEmail: string;
  operatorEmail: string | null;
  timezone: string;
  slaHours: number;
  /** Daily fetch sources (https CSV); null = uploads only. */
  importUrl: string | null;
  rosterUrl: string | null;
  locale: "en" | "he";
  sessionExpires: string;
}

export interface ImportSummary {
  roster: { employees: number } | null;
  import: ImportOutcome | null;
}

export interface ImportOutcome {
  importId: string;
  period: { from: string; to: string };
  shifts: number;
  records: number;
  gapsCreated: number;
  gapsResolved: number;
  unknownEmployees: string[];
}

export interface ApiKey { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

export interface ImportRun { id: string; source: string; trigger: string; importedAt: string; rowCount: number }

export interface Overview {
  openGaps: number;
  escalated: number;
  byManager: Array<{ managerId: string; managerName: string; openGaps: number; oldestGapDate: string | null }>;
  metric: { windowDays: number; notified: number; actedWithinSla: number; resolvedByRecord: number; closedByPayroll: number; escalated: number; present: number; absent: number };
}

const KEY = "clockcover.console.token";
const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const session = {
  get: (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set: (token: string) => { try { sessionStorage.setItem(KEY, token); } catch { /* private mode */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
};

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (auth) {
    const token = session.get();
    if (!token) throw new ApiError(401, "sign in required");
    headers["authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${base}/console${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
    throw new ApiError(res.status, body.details?.length ? `${body.error}: ${body.details.join("; ")}` : body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const requestLink = (email: string) =>
  call<{ ok: true; message: string }>("/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }, false);
export const me = () => call<EmployerSettings>("/me");
export const updateEmployer = (patch: Partial<Pick<EmployerSettings, "name" | "payrollEmail" | "operatorEmail" | "timezone" | "slaHours" | "importUrl" | "rosterUrl" | "locale">>) =>
  call<EmployerSettings>("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
export const uploadRoster = (csv: string) => call<{ employees: number }>("/roster", { method: "POST", headers: { "content-type": "text/csv" }, body: csv });
export const uploadImport = (csv: string) => call<ImportOutcome>("/imports", { method: "POST", headers: { "content-type": "text/csv" }, body: csv });
export const listImports = () => call<{ imports: ImportRun[] }>("/imports");
export const listApiKeys = () => call<{ keys: ApiKey[] }>("/api-keys");
export const createApiKey = (name: string) => call<{ id: string; key: string; prefix: string }>("/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
export const revokeApiKey = (id: string) => call<{ revoked: true }>(`/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
export const runImportNow = () => call<ImportSummary>("/imports/run", { method: "POST" });

/** Downloads the corrections CSV for [from, to]; the bearer goes in a header, so this is a fetch + blob, not a link. */
export async function downloadCorrections(from: string, to: string): Promise<void> {
  const token = session.get();
  if (!token) throw new ApiError(401, "sign in required");
  const res = await fetch(`${base}/console/resolutions.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `clockcover-corrections-${from}-${to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** Default export range: the last 30 days up to today (UTC). */
export function defaultRange(now: Date): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}
export const overview = () => call<Overview>("/overview");

export type ConsoleRoute =
  | { page: "signin" }
  | { page: "landing"; token: string }
  | { page: "overview" | "imports" | "settings" };

/** The console lives on console.…; the pages people reach from emails on portal.…  Same worker, two doors. */
export const isConsoleHost = (hostname: string) => /^console\./.test(hostname);

/**
 * On the console host the pages sit at the root: `/`, `/<token>`, `/overview|imports|settings`.
 * Elsewhere (the digest host, local dev) they need the `/console` prefix; the prefix is still accepted on the console host for old links.
 */
export function consoleRoute(pathname: string, hostname = ""): ConsoleRoute | null {
  const m = (isConsoleHost(hostname) ? /^(?:\/console)?(?:\/([^/]+))?\/?$/ : /^\/console(?:\/([^/]+))?\/?$/).exec(pathname);
  if (!m) return null;
  const seg = m[1] ? decodeURIComponent(m[1]) : "";
  if (seg === "") return { page: "signin" };
  if (seg === "overview" || seg === "imports" || seg === "settings") return { page: seg };
  return { page: "landing", token: seg };
}

/** The address to show for a console page: no prefix on the console host, `/console/...` elsewhere. */
export function consolePath(page: string, hostname = ""): string {
  const prefix = isConsoleHost(hostname) ? "" : "/console";
  return page === "signin" ? prefix || "/" : `${prefix}/${page}`;
}

/** Percentage string for the metric card; "—" when there is nothing to measure. */
export const pct = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`);
