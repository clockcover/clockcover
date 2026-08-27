// Signed digest links (ADR-0004). Stateless: payload + HMAC-SHA-256, base64url.
// Web Crypto only, so this runs on Workers and Node alike.

export interface LinkClaims {
  employerId: string;
  managerId: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const LINK_TTL_MS = 14 * 24 * 3_600_000;

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signLink(claims: LinkClaims, secret: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  return `${payload}.${b64url(await hmac(secret, payload))}`;
}

/** Returns the claims, or null when the token is malformed, tampered with, or expired. */
export async function verifyLink(token: string, secret: string, now: Date): Promise<LinkClaims | null> {
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
    const claims = JSON.parse(new TextDecoder().decode(unb64url(payload))) as Partial<LinkClaims>;
    if (typeof claims.employerId !== "string" || typeof claims.managerId !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp <= now.getTime()) return null;
    return { employerId: claims.employerId, managerId: claims.managerId, exp: claims.exp };
  } catch {
    return null;
  }
}
