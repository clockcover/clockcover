// Test database: libsql in memory with the real migrations applied. Same SQLite
// dialect D1 speaks, so the SqlStore under test is the production one.
import { readdirSync, readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/adapters/store-d1/schema.ts";
import type { Db } from "../src/adapters/store-d1/store.ts";

const migrationsDir = new URL("../migrations/", import.meta.url).pathname;

export async function testDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(migrationsDir + file, "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.execute(stmt);
    }
  }
  return drizzle(client, { schema }) as unknown as Db;
}
