// Signed digest links (ADR-0004). Stateless: payload + HMAC-SHA-256, base64url.
// Web Crypto only, so this runs on Workers and Node alike.

/** A manager's digest link (ADR-0004). Tokens issued before ADR-0005 carry no `kind`. */
export interface LinkClaims {
  kind?: "manager";
  employerId: string;
  managerId: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

/** An operator's console session (ADR-0005). */
export interface OperatorClaims {
  kind: "operator";
  employerId: string;
  email: string;
  exp: number;
}

/** The payroll accountant's link to one escalated gap. */
export interface PayrollClaims {
  kind: "payroll";
  employerId: string;
  gapId: string;
  email: string;
  exp: number;
}

export const LINK_TTL_MS = 14 * 24 * 3_600_000;
export const OPERATOR_TTL_MS = 7 * 24 * 3_600_000;

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function sign(claims: object, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  return `${payload}.${b64url(await hmac(secret, payload))}`;
}
export const signLink = (claims: LinkClaims, secret: string) => sign(claims, secret);
export const signOperator = (claims: OperatorClaims, secret: string) => sign(claims, secret);
export const signPayroll = (claims: PayrollClaims, secret: string) => sign(claims, secret);

/** Signature + expiry check; returns the raw claims object or null. */
async function verify(token: string, secret: string, now: Date): Promise<Record<string, unknown> | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let expected: Uint8Array, given: Uint8Array;
  try {
    expected = await hmac(secret, payload);
    given = unb64url(sig);
  } catch {
    return null;
  }
  if (expected.length !== given.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ given[i]!;
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as Record<string, unknown>;
    if (typeof claims["exp"] !== "number" || claims["exp"] <= now.getTime()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Manager digest link: claims or null when malformed, tampered with, expired, or not a manager token. */
export async function verifyLink(token: string, secret: string, now: Date): Promise<LinkClaims | null> {
  const c = await verify(token, secret, now);
  if (!c || (c["kind"] !== undefined && c["kind"] !== "manager")) return null;
  if (typeof c["employerId"] !== "string" || typeof c["managerId"] !== "string") return null;
  return { kind: "manager", employerId: c["employerId"], managerId: c["managerId"], exp: c["exp"] as number };
}

/** Operator console token: claims or null. A manager token is never accepted here. */
export async function verifyOperator(token: string, secret: string, now: Date): Promise<OperatorClaims | null> {
  const c = await verify(token, secret, now);
  if (!c || c["kind"] !== "operator") return null;
  if (typeof c["employerId"] !== "string" || typeof c["email"] !== "string") return null;
  return { kind: "operator", employerId: c["employerId"], email: c["email"], exp: c["exp"] as number };
}

/** Payroll escalation link: claims or null. Bound to one gap. */
export async function verifyPayroll(token: string, secret: string, now: Date): Promise<PayrollClaims | null> {
  const c = await verify(token, secret, now);
  if (!c || c["kind"] !== "payroll") return null;
  if (typeof c["employerId"] !== "string" || typeof c["gapId"] !== "string" || typeof c["email"] !== "string") return null;
  return { kind: "payroll", employerId: c["employerId"], gapId: c["gapId"], email: c["email"], exp: c["exp"] as number };
}
