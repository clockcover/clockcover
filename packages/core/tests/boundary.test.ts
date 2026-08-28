// The core is vendor- and infra-agnostic (ADR-0001, ADR-0003): nothing under src/
// imports a runtime, framework, ORM or app. Enforced here — a test, not package
// topology — because typescript-eslint does not yet run against TypeScript 7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const src = new URL("../src/", import.meta.url).pathname;

const BANNED: Array<{ re: RegExp; why: string }> = [
  { re: /^cloudflare:/, why: "core must not know about Cloudflare (ADR-0001)" },
  { re: /^hono(?:\/|$)/, why: "core must not import the web framework (ADR-0003)" },
  { re: /^drizzle-orm(?:\/|$)/, why: "data access goes through the Store port (ADR-0003)" },
  { re: /(?:^|\/)apps\/|^@clockcover\/(?:api|web|portal)(?:\/|$)/, why: "core must not depend on apps (ADR-0003)" },
  { re: /^node:/, why: "core is plain TypeScript; no Node built-ins (ADR-0001)" },
];

const IMPORT = /\b(?:import|export)\b[^'"]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;

function* tsFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(p);
    else if (e.name.endsWith(".ts")) yield p;
  }
}

test("packages/core/src imports nothing vendor-, infra- or app-specific", () => {
  const offences: string[] = [];
  for (const file of tsFiles(src)) {
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? "";
      for (const b of BANNED) if (b.re.test(spec)) offences.push(`${file.slice(src.length)}: "${spec}" — ${b.why}`);
    }
  }
  assert.deepEqual(offences, []);
});

test("the boundary check itself catches a banned specifier", () => {
  for (const spec of ["cloudflare:workers", "hono", "hono/cors", "drizzle-orm/d1", "../../apps/api/x", "@clockcover/api", "@clockcover/portal", "node:fs"]) {
    assert.ok(BANNED.some((b) => b.re.test(spec)), spec);
  }
  for (const spec of ["./types.ts", "./store.ts"]) {
    assert.ok(!BANNED.some((b) => b.re.test(spec)), spec);
  }
});
