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
  sessionExpires: string;
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

export interface ImportRun { id: string; source: string; importedAt: string; rowCount: number }

export interface Overview {
  openGaps: number;
  escalated: number;
  byManager: Array<{ managerId: string; managerName: string; openGaps: number; oldestGapDate: string | null }>;
  metric: { windowDays: number; notified: number; actedWithinSla: number; resolvedByRecord: number; escalated: number };
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
export const updateEmployer = (patch: Partial<Pick<EmployerSettings, "name" | "payrollEmail" | "operatorEmail" | "timezone" | "slaHours">>) =>
  call<EmployerSettings>("/employer", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
export const uploadRoster = (csv: string) => call<{ employees: number }>("/roster", { method: "POST", headers: { "content-type": "text/csv" }, body: csv });
export const uploadImport = (csv: string) => call<ImportOutcome>("/imports", { method: "POST", headers: { "content-type": "text/csv" }, body: csv });
export const listImports = () => call<{ imports: ImportRun[] }>("/imports");
export const overview = () => call<Overview>("/overview");

export type ConsoleRoute =
  | { page: "signin" }
  | { page: "landing"; token: string }
  | { page: "overview" | "imports" | "settings" };

/** `/console`, `/console/<token>`, `/console/overview|imports|settings`. Anything else → null. */
export function consoleRoute(pathname: string): ConsoleRoute | null {
  const m = /^\/console(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m) return null;
  const seg = m[1] ? decodeURIComponent(m[1]) : "";
  if (seg === "") return { page: "signin" };
  if (seg === "overview" || seg === "imports" || seg === "settings") return { page: seg };
  return { page: "landing", token: seg };
}

/** Percentage string for the metric card; "—" when there is nothing to measure. */
export const pct = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`);
