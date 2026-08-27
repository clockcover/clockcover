import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = new URL("../git-hook.ts", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "guards-"));

function file(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
}
function run(...args: string[]) {
  const r = spawnSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" });
  return { code: r.status, stderr: r.stderr };
}

test("exits 1 and names the guard when no-ai-coauthor finds a trailer", () => {
  const { code, stderr } = run("no-ai-coauthor", file("msg", "fix: x\n\nCo-authored-by: Claude <c@anthropic.com>\n"));
  assert.equal(code, 1);
  assert.match(stderr, /^no-ai-coauthor: .*msg: AI-agent co-author trailer/m);
  assert.match(stderr, /docs\/contributing\.md/);
});

test("exits 0 and stays silent on a clean commit message", () => {
  const { code, stderr } = run("no-ai-coauthor", file("ok", "docs: tidy\n"));
  assert.equal(code, 0);
  assert.equal(stderr, "");
});

test("synthetic-only checks data files and skips the rest", () => {
  const csv = file("employees.csv", "id,email\n1,dana@gmail.com\n");
  const md = file("notes.md", "contact dana@gmail.com");
  const { code, stderr } = run("synthetic-only", csv, md);
  assert.equal(code, 1);
  assert.match(stderr, /employees\.csv: email outside example domains/);
  assert.doesNotMatch(stderr, /notes\.md/);
});

test("synthetic-only ignores package.json", () => {
  const { code, stderr } = run("synthetic-only", file("package.json", '{"packageManager":"pnpm@11.11.0"}'));
  assert.equal(code, 0);
  assert.equal(stderr, "");
});

test("synthetic-only with no matching files exits 0", () => {
  assert.equal(run("synthetic-only").code, 0);
});

test("unknown guard exits 1 and lists known guards", () => {
  const { code, stderr } = run("bogus", "x");
  assert.equal(code, 1);
  assert.match(stderr, /unknown guard "bogus".*no-ai-coauthor, synthetic-only/);
});
