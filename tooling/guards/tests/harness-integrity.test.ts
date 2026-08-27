import { test } from "node:test";
import assert from "node:assert/strict";
import { appliesTo, check, checkCommand } from "../harness-integrity.ts";

test("appliesTo covers guards, hooks, CI and agent config", () => {
  for (const p of [
    ".claude/settings.json", ".claude/hooks/no-secrets.ts", ".husky/pre-commit", "tooling/guards/no-secrets.ts",
    ".github/workflows/ci.yml", "CLAUDE.md", ".commitlintrc.json", "pnpm-workspace.yaml", "tsconfig.json",
  ]) assert.ok(appliesTo(p), p);
  for (const p of ["docs/contributing.md", "packages/core/src/x.ts", "package.json", "apps/api/tsconfig.json", "apps/web/CLAUDE.md"]) {
    assert.ok(!appliesTo(p), p);
  }
});
test("check always reports for harness files", () => {
  assert.equal(check("anything").length, 1);
});
test("checkCommand flags hook bypasses", () => {
  for (const c of [
    "git commit --no-verify -m x", "git commit -n -m x", "git push --no-verify", "HUSKY=0 git commit -m x",
    "git -c core.hooksPath=/dev/null push", "git config core.hooksPath .foo", "rm -rf .husky", "chmod -x .husky/pre-commit",
    "git add . && git commit -m x --no-verify", "git config --local core.hooksPath .foo", "git config --unset core.hooksPath",
    "GIT_CONFIG_PARAMETERS=\"'core.hooksPath=/dev/null'\" git push",
  ]) assert.equal(checkCommand(c).length, 1, c);
});
test("checkCommand allows ordinary git and unrelated -n", () => {
  for (const c of ["git commit -m x", "git push", "git config user.name", "grep -n foo", "git log -n 5", "head -n 3 f", "git diff --name-only",
    "git config core.hooksPath", "git config --get core.hooksPath", "git config --get-all core.hooksPath", "git config --list",
  ]) {
    assert.deepEqual(checkCommand(c), [], c);
  }
});
