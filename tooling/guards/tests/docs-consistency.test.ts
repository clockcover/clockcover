// Docs that drift silently: the ADR index and the Status block in CLAUDE.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(root + p, "utf8");

test("every ADR file is in INDEX.md, every INDEX row has a file, numbers are contiguous", () => {
  const files = readdirSync(root + "docs/adr").filter((f) => /^\d{4}-.*\.md$/.test(f)).sort();
  const index = read("docs/adr/INDEX.md");
  const rows = [...index.matchAll(/^\| \[(\d{4})\]\((\S+)\)\s+\|/gm)].map((m) => ({ n: m[1], file: m[2] }));
  assert.deepEqual(rows.map((r) => r.file), files, "INDEX rows must list exactly the ADR files, in order");
  files.forEach((f, i) => assert.equal(f.slice(0, 4), String(i + 1).padStart(4, "0"), `ADR numbering gap at ${f}`));
});

test("ADR status in INDEX matches the file's frontmatter", () => {
  const index = read("docs/adr/INDEX.md");
  for (const m of index.matchAll(/^\| \[\d{4}\]\((\S+)\)\s+\| .* \| (\w+)\s+\|$/gm)) {
    const fm = read(`docs/adr/${m[1]}`).match(/^status:\s*(\w+)/m)?.[1];
    assert.equal(m[2], fm, `${m[1]}: INDEX says ${m[2]}, frontmatter says ${fm}`);
  }
});

test("CLAUDE.md Status block carries a date no older than 90 days", () => {
  const status = read("CLAUDE.md").match(/## Status\n([\s\S]*?)\n## /)?.[1] ?? "";
  const date = status.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  assert.ok(date, "Status block must state the date it was last true (YYYY-MM-DD)");
  const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
  assert.ok(ageDays < 90, `Status was last confirmed ${Math.round(ageDays)} days ago — re-check and update the date`);
});

test("the set of guards is the same in git-hook.ts, settings.json hooks, CLAUDE.md and contributing.md", () => {
  const fromGitHook = [...read("tooling/guards/git-hook.ts").matchAll(/^\s+"([a-z-]+)": \w+,$/gm)].map((m) => m[1]);
  const fromHooks = readdirSync(root + ".claude/hooks").filter((f) => f.endsWith(".ts") && f !== "lib.ts").map((f) => f.slice(0, -3));
  const settings = read(".claude/settings.json");
  const fromSettings = [...new Set([...settings.matchAll(/node \.claude\/hooks\/([a-z-]+)\.ts/g)].map((m) => m[1]))];
  const claude = read("CLAUDE.md").match(/- Guards \(([^)]*)\)/)?.[1] ?? "";
  const fromClaude = [...claude.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
  const fromContributing = [...read("docs/contributing.md").matchAll(/^\| `([a-z-]+)`\s+\|/gm)].map((m) => m[1]);

  const all = [...new Set([...fromGitHook, ...fromHooks, ...fromSettings, ...fromClaude, ...fromContributing])].sort();
  // No file-based git-hook mode by design: destructive-git (pre-push.ts covers it) and
  // harness-integrity (a git hook cannot stop --no-verify; CI + branch protection do) — see contributing.md.
  assert.deepEqual([...fromGitHook, "destructive-git", "harness-integrity"].sort(), all, "GUARDS in git-hook.ts");
  assert.deepEqual([...fromHooks].sort(), all, ".claude/hooks/*.ts");
  assert.deepEqual([...fromSettings].sort(), all, ".claude/settings.json hooks");
  assert.deepEqual([...fromClaude].sort(), all, "CLAUDE.md § How to work guard list");
  assert.deepEqual([...fromContributing].sort(), all, "docs/contributing.md guard table");
});

test("every Claude hook runs from the project root and fails closed", () => {
  const settings = JSON.parse(read(".claude/settings.json")) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };
  const commands = Object.values(settings.hooks).flat().flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(commands.length > 0);
  for (const cmd of commands) {
    assert.match(cmd, /^cd "\$CLAUDE_PROJECT_DIR" && node \.claude\/hooks\/[a-z-]+\.ts \|\| exit 2$/, `hook must cd to the project root and block on failure: ${cmd}`);
  }
});

test("packages/core has the boundary test the docs say enforces the infra-agnostic core", () => {
  const t = read("packages/core/tests/boundary.test.ts");
  for (const banned of ["cloudflare:", "hono", "drizzle-orm", "apps"]) assert.match(t, new RegExp(banned), `boundary test must ban ${banned}`);
});

test(".gitignore excludes data/real/ and the wrangler secret paths docs/privacy.md names", () => {
  const gi = read(".gitignore");
  assert.match(gi, /^data\/real\/$/m);
  assert.match(gi, /^\.dev\.vars$/m);
  assert.match(gi, /^\.wrangler\/$/m);
});
