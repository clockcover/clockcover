// Small pieces of state behind the sign-in and contact endpoints: single-use link tokens
// and per-key send cooldowns. apps/api only; the core never sees these tables.
import { eq, lt } from "drizzle-orm";
import type { Db } from "./store.ts";
import * as s from "./schema.ts";

/**
 * Records a redeemed link token by hash. Returns false when the same hash was already
 * there — the link was used before. The primary key makes the check-and-insert atomic,
 * so two concurrent exchanges of one link cannot both succeed.
 */
export async function consumeLinkToken(db: Db, hash: string, expiresAt: Date, now: Date): Promise<boolean> {
  await db.delete(s.usedLinkTokens).where(lt(s.usedLinkTokens.expiresAt, now.toISOString()));
  const inserted = await db.insert(s.usedLinkTokens).values({ hash, expiresAt: expiresAt.toISOString() })
    .onConflictDoNothing().returning({ hash: s.usedLinkTokens.hash });
  return inserted.length === 1;
}

/**
 * Takes one send slot for `key` within a rolling window: at most `limit` sends per
 * `windowMs`, counted from the first send. Returns false when the slot is refused.
 * Best-effort under concurrency — this throttles email, it does not guard data.
 */
export async function takeSendSlot(db: Db, key: string, now: Date, windowMs: number, limit: number): Promise<boolean> {
  const [row] = await db.select().from(s.sendCooldowns).where(eq(s.sendCooldowns.key, key));
  if (row && row.until > now.toISOString()) {
    if (row.count >= limit) return false;
    await db.update(s.sendCooldowns).set({ count: row.count + 1 }).where(eq(s.sendCooldowns.key, key));
    return true;
  }
  const until = new Date(now.getTime() + windowMs).toISOString();
  await db.insert(s.sendCooldowns).values({ key, until, count: 1 })
    .onConflictDoUpdate({ target: s.sendCooldowns.key, set: { until, count: 1 } });
  return true;
}
