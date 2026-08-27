import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(hook: string, input: object) {
  const entry = new URL(`../${hook}.ts`, import.meta.url).pathname;
  const r = spawnSync(process.execPath, [entry], { input: JSON.stringify(input), encoding: "utf8" });
  return { code: r.status, decision: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null };
}

test("no-ai-coauthor denies a git commit with an AI trailer", () => {
  const { code, decision } = run("no-ai-coauthor", {
    tool_name: "Bash",
    tool_input: { command: 'git commit -m "fix: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"' },
  });
  assert.equal(code, 0);
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /not allowed.*contributing\.md/);
});

test("no-ai-coauthor stays silent on a clean commit and on non-commit commands", () => {
  assert.equal(run("no-ai-coauthor", { tool_name: "Bash", tool_input: { command: 'git commit -m "fix: x"' } }).decision, null);
  assert.equal(run("no-ai-coauthor", { tool_name: "Bash", tool_input: { command: "grep Co-authored-by: Claude log" } }).decision, null);
});

test("synthetic-only denies real-looking data written to a data file", () => {
  const { decision } = run("synthetic-only", {
    tool_name: "Write",
    tool_input: { file_path: "packages/core/fixtures/employees.ts", content: "email: dana@gmail.com" },
  });
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /dana@gmail\.com.*privacy\.md/);
});

test("synthetic-only checks Edit's new_string too", () => {
  const { decision } = run("synthetic-only", {
    tool_name: "Edit",
    tool_input: { file_path: "apps/api/seed/shifts.csv", old_string: "x", new_string: "+972 50 123 4567" },
  });
  assert.equal(decision.permissionDecision, "deny");
});

test("synthetic-only stays silent outside data files and on clean data", () => {
  assert.equal(run("synthetic-only", { tool_name: "Write", tool_input: { file_path: "docs/x.md", content: "dana@gmail.com" } }).decision, null);
  assert.equal(run("synthetic-only", { tool_name: "Write", tool_input: { file_path: "fixtures/e.csv", content: "dana@example.com" } }).decision, null);
});

test("destructive-git denies plain force-push", () => {
  const { decision } = run("destructive-git", { tool_name: "Bash", tool_input: { command: "git push --force origin main" } });
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /force-with-lease/);
});
test("destructive-git asks before reset --hard", () => {
  const { decision } = run("destructive-git", { tool_name: "Bash", tool_input: { command: "git reset --hard HEAD~1" } });
  assert.equal(decision.permissionDecision, "ask");
  assert.match(decision.permissionDecisionReason, /discards uncommitted work/);
});
test("destructive-git stays silent on ordinary git", () => {
  assert.equal(run("destructive-git", { tool_name: "Bash", tool_input: { command: "git push && git log -1" } }).decision, null);
});

test("no-secrets denies a credential written to a config file", () => {
  const { decision } = run("no-secrets", { tool_name: "Write", tool_input: { file_path: "apps/api/wrangler.toml", content: "AKIAABCDEFGHIJKLMNOP" } });
  assert.equal(decision.permissionDecision, "deny");
  assert.match(decision.permissionDecisionReason, /AWS access key/);
});
test("no-secrets stays silent on env references", () => {
  assert.equal(run("no-secrets", { tool_name: "Write", tool_input: { file_path: "apps/api/src/env.ts", content: "const key = process.env.API_KEY;" } }).decision, null);
});

test("no-secrets denies shell commands that read protected files or dump env", () => {
  for (const command of ["cat .env", "printenv"]) {
    const { decision } = run("no-secrets", { tool_name: "Bash", tool_input: { command } });
    assert.equal(decision.permissionDecision, "deny", command);
    assert.match(decision.permissionDecisionReason, /privacy\.md/);
  }
  assert.equal(run("no-secrets", { tool_name: "Bash", tool_input: { command: "cat .env.example" } }).decision, null);
});

test("harness-integrity asks before editing harness files and denies hook bypasses", () => {
  const abs = `${process.cwd()}/.claude/settings.json`; // Claude sends absolute paths
  const edit = run("harness-integrity", { tool_name: "Edit", tool_input: { file_path: abs, old_string: "a", new_string: "b" } });
  assert.equal(edit.decision.permissionDecision, "ask");
  const bypass = run("harness-integrity", { tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" } });
  assert.equal(bypass.decision.permissionDecision, "deny");
  assert.equal(run("harness-integrity", { tool_name: "Edit", tool_input: { file_path: "docs/scope.md", old_string: "a", new_string: "b" } }).decision, null);
  assert.equal(run("harness-integrity", { tool_name: "Bash", tool_input: { command: "git commit -m x" } }).decision, null);
});
