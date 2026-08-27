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
