// Client for the two manager endpoints (ADR-0004). The token comes from the URL path
// and is never stored anywhere else.

export type GapType = "no_clockin" | "no_clockout" | "no_record_at_all";

export interface DigestGap {
  id: string;
  employeeName: string;
  gapDate: string;
  gapType: GapType;
  shift: { plannedStart: string; plannedEnd: string } | null;
  record: { clockIn: string | null; clockOut: string | null } | null;
  managerNotifiedAt: string | null;
  escalated: boolean;
}

export interface UnscheduledDay { employeeName: string; recordDate: string; clockIn: string | null; clockOut: string | null }

export interface Digest {
  manager: { fullName: string };
  employer: { name: string };
  digestDate: string;
  slaHours: number;
  linkExpires: string;
  gaps: DigestGap[];
  unscheduled: UnscheduledDay[];
}

export interface Resolved { id: string; resolvedAt: string; resolution: string; note: string | null }

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const base = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const fetchDigest = (token: string) => call<Digest>(`/d/${encodeURIComponent(token)}`);

export const resolveGap = (token: string, gapId: string, note: string) =>
  call<Resolved>(`/d/${encodeURIComponent(token)}/gaps/${encodeURIComponent(gapId)}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });

/** `/d/<token>` → token, or null on any other path. */
export function tokenFromPath(pathname: string): string | null {
  const m = /^\/d\/([^/]+)\/?$/.exec(pathname);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}
