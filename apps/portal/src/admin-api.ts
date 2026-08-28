// Client for the owner's admin area (ADR-0006). Separate token from the console's.
import { ApiError } from "./api.ts";

export interface AdminEmployer {
  id: string; name: string; payrollEmail: string; operatorEmail: string | null; timezone: string; slaHours: number;
  importUrl: string | null; locale: string; activeEmployees: number; managers: number; openGaps: number; escalatedOpen: number; lastImportAt: string | null;
}

export interface NewEmployer { name: string; payrollEmail: string; operatorEmail: string; timezone: string; locale: "en" | "he" }

const KEY = "clockcover.admin.token";
const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const adminSession = {
  get: (): string | null => { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set: (token: string) => { try { sessionStorage.setItem(KEY, token); } catch { /* private mode */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
};

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (auth) {
    const token = adminSession.get();
    if (!token) throw new ApiError(401, "sign in required");
    headers["authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${base}/admin${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string[] };
    throw new ApiError(res.status, body.details?.length ? `${body.error}: ${body.details.join("; ")}` : body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

const json = (b: unknown, method = "POST") => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

export const requestAdminLink = (email: string, locale: "en" | "he") => call<{ ok: true; message: string }>("/login", json({ email, locale }), false);
export const adminMe = () => call<{ email: string; sessionExpires: string }>("/me");
export const listEmployers = () => call<{ employers: AdminEmployer[] }>("/employers");
export const createEmployer = (e: NewEmployer) => call<{ id: string; invited: boolean }>("/employers", json(e));
export const updateEmployer = (id: string, patch: Partial<NewEmployer>) => call<{ id: string; invited: boolean }>(`/employers/${encodeURIComponent(id)}`, json(patch, "PATCH"));
export const resendInvite = (id: string) => call<{ invited: boolean }>(`/employers/${encodeURIComponent(id)}/invite`, { method: "POST" });

export type AdminRoute = { page: "signin" } | { page: "landing"; token: string } | { page: "employers" };

export const isAdminHost = (hostname: string) => /^admin\./.test(hostname);

/**
 * On the admin host the pages sit at the root: `/`, `/<token>`, `/employers`.
 * Elsewhere they need the `/admin` prefix; the prefix is still accepted on the admin host for old links.
 */
export function adminRoute(pathname: string, hostname = ""): AdminRoute | null {
  const m = (isAdminHost(hostname) ? /^(?:\/admin)?(?:\/([^/]+))?\/?$/ : /^\/admin(?:\/([^/]+))?\/?$/).exec(pathname);
  if (!m) return null;
  const seg = m[1] ? decodeURIComponent(m[1]) : "";
  if (seg === "") return { page: "signin" };
  if (seg === "employers") return { page: "employers" };
  return { page: "landing", token: seg };
}

/** The address to show for an admin page: no prefix on the admin host, `/admin/...` elsewhere. */
export function adminPath(page: string, hostname = ""): string {
  const prefix = isAdminHost(hostname) ? "" : "/admin";
  return page === "signin" ? prefix || "/" : `${prefix}/${page}`;
}
