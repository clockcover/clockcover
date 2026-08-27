import { test } from "node:test";
import assert from "node:assert/strict";
import { check, level, checkPushRefs } from "../destructive-git.ts";

test("denies plain force-push in all spellings", () => {
  for (const c of ["git push --force", "git push -f origin main", "git push origin +main", "git push -fu origin x"]) {
    assert.equal(level(c), "deny", c);
  }
});
test("asks on force-with-lease", () => {
  assert.equal(level("git push --force-with-lease origin main"), "ask");
});
test("asks on commands that discard local work or rewrite history", () => {
  for (const c of [
    "git reset --hard HEAD~1", "git checkout -- src/a.ts", "git checkout .", "git restore docs",
    "git clean -fd", "git branch -D feature", "git stash drop", "git stash clear",
    "git rebase -i HEAD~3", "git commit --amend --no-edit",
  ]) assert.equal(level(c), "ask", c);
});
test("allows everyday git", () => {
  for (const c of [
    "git status", "git push", "git push origin main", "git restore --staged a.ts", "git checkout main",
    "git checkout -b feat/x", "git branch -d merged", "git stash", "git stash pop", "git log --force-order",
    "git reset HEAD~1", "git commit -m 'fix: x'", "git clean -n",
  ]) assert.equal(level(c), null, c);
});
test("inspects each segment of a compound command", () => {
  assert.equal(level("git add -A && git commit -m x && git push --force"), "deny");
  assert.equal(level("git fetch && git reset --hard origin/main"), "ask");
});
test("ignores non-git commands that mention the words", () => {
  assert.equal(level("grep -r 'reset --hard' docs/"), null);
  assert.equal(level("echo git push --force"), null);
});
test("check returns level-prefixed findings", () => {
  assert.match(check("git push -f")[0], /^\[deny\] force-push/);
});

const L = "refs/heads/main 1111 refs/heads/main 2222";
test("checkPushRefs flags non-fast-forward and deletion on protected branch only", () => {
  const notAncestor = () => false;
  assert.deepEqual(checkPushRefs([L], notAncestor), ["non-fast-forward (force) push to main"]);
  assert.deepEqual(checkPushRefs(["refs/heads/main 0000 refs/heads/main 2222"], notAncestor), ["deleting main on the remote"]);
  assert.deepEqual(checkPushRefs(["refs/heads/feat 1111 refs/heads/feat 2222"], notAncestor), []);
});
test("checkPushRefs allows fast-forward and new branch", () => {
  assert.deepEqual(checkPushRefs([L], () => true), []);
  assert.deepEqual(checkPushRefs(["refs/heads/main 1111 refs/heads/main 0000"], () => false), []);
});
