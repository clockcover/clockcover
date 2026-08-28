// Per-employer API keys for the upload endpoints. Issued by the operator in the
// console, shown once, stored hashed (SHA-256), revocable. Replaces the old
// deployment-wide API_KEY.
import { and, eq, isNull } from "drizzle-orm";
import type { Id } from "@clockcover/core";
import type { Db } from "./adapters/store-d1/store.ts";
import * as s from "./adapters/store-d1/schema.ts";

const PREFIX = "ck_";
const enc = new TextEncoder();

async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generates a key. The plaintext is returned exactly once; only the hash is kept. */
export async function createApiKey(db: Db, employerId: Id, name: string, now: Date): Promise<{ id: Id; key: string; prefix: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = PREFIX + btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const prefix = key.slice(0, 12);
  const id = crypto.randomUUID();
  await db.insert(s.apiKeys).values({ id, employerId, name, prefix, keyHash: await sha256(key), createdAt: now.toISOString() });
  return { id, key, prefix };
}

export interface ApiKeyRow { id: Id; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

export async function listApiKeys(db: Db, employerId: Id): Promise<ApiKeyRow[]> {
  const rows = await db.select({ id: s.apiKeys.id, name: s.apiKeys.name, prefix: s.apiKeys.prefix, createdAt: s.apiKeys.createdAt, lastUsedAt: s.apiKeys.lastUsedAt, revokedAt: s.apiKeys.revokedAt })
    .from(s.apiKeys).where(eq(s.apiKeys.employerId, employerId));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Revokes a key of this employer. Returns false when there is no such active key. */
export async function revokeApiKey(db: Db, employerId: Id, keyId: Id, now: Date): Promise<boolean> {
  const [row] = await db.select({ id: s.apiKeys.id }).from(s.apiKeys).where(and(eq(s.apiKeys.id, keyId), eq(s.apiKeys.employerId, employerId), isNull(s.apiKeys.revokedAt)));
  if (!row) return false;
  await db.update(s.apiKeys).set({ revokedAt: now.toISOString() }).where(eq(s.apiKeys.id, keyId));
  return true;
}

/** Resolves a bearer to its employer, or null. Records last use. */
export async function authenticateApiKey(db: Db, bearer: string, now: Date): Promise<{ employerId: Id; keyId: Id } | null> {
  if (!bearer.startsWith(PREFIX)) return null;
  const [row] = await db.select({ id: s.apiKeys.id, employerId: s.apiKeys.employerId }).from(s.apiKeys)
    .where(and(eq(s.apiKeys.keyHash, await sha256(bearer)), isNull(s.apiKeys.revokedAt)));
  if (!row) return null;
  await db.update(s.apiKeys).set({ lastUsedAt: now.toISOString() }).where(eq(s.apiKeys.id, row.id));
  return { employerId: row.employerId, keyId: row.id };
}

export async function countActiveApiKeys(db: Db): Promise<Map<Id, number>> {
  const rows = await db.select({ employerId: s.apiKeys.employerId }).from(s.apiKeys).where(isNull(s.apiKeys.revokedAt));
  const m = new Map<Id, number>();
  for (const r of rows) m.set(r.employerId, (m.get(r.employerId) ?? 0) + 1);
  return m;
}
