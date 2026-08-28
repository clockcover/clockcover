import { test } from "node:test";
import assert from "node:assert/strict";
import { check } from "../no-ai-coauthor.ts";

test("flags Claude trailer", () => {
  assert.match(check("feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>")[0] ?? "", /not allowed/);
});
test("flags trailer embedded in a shell command", () => {
  const cmd = `git commit -m "$(printf 'fix: y\\n\\nCo-authored-by: GitHub Copilot <c@github.com>')"`;
  assert.equal(check(cmd).length, 1);
});
test("flags the trailer= form and Signed-off-by", () => {
  assert.equal(check("git commit --trailer 'Co-authored-by=Claude <noreply@anthropic.com>' -m x").length, 1);
  assert.equal(check("git -c trailer.sign.key=Signed-off-by commit --trailer 'Signed-off-by: Claude <c@anthropic.com>' -m x").length, 1);
  assert.equal(check("Co-authored-by : Claude <noreply@anthropic.com>").length, 1);
});
test("allows human co-author", () => {
  assert.deepEqual(check("feat: x\n\nCo-authored-by: Dana <dana@example.com>"), []);
});
test("allows plain message", () => {
  assert.deepEqual(check("docs: add ADR-0003"), []);
});
