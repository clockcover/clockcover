import { test } from "node:test";
import assert from "node:assert/strict";
import { check, level, checkPushRefs } from "../destructive-git.ts";

test("denies plain force-push in all spellings", () => {
  for (const c of ["git push --force", "git push -f origin main", "git push origin +main", "git push -fu origin x"]) {
    assert.equal(level(c), "deny", c);
  }
});
test("asks on force-with-lease / force-if-includes", () => {
  assert.equal(level("git push --force-with-lease origin main"), "ask");
  assert.equal(level("git push --force-with-lease --force-if-includes origin main"), "ask");
});
test("asks on commands that discard local work or rewrite history", () => {
  for (const c of [
    "git reset --hard HEAD~1", "git reset --merge", "git checkout -- src/a.ts", "git checkout .", "git checkout main -- src/a.ts",
    "git checkout HEAD -- .", "git checkout -f main", "git checkout --force main", "git switch --discard-changes main", "git switch -f main",
    "git restore docs", "git clean -fd", "git clean --force", "git branch -D feature", "git branch --delete --force feature",
    "git branch -d --force feature", "git branch -df feature", "git stash drop", "git stash clear",
    "git rebase -i HEAD~3", "git commit --amend --no-edit",
  ]) assert.equal(level(c), "ask", c);
});
test("allows everyday git", () => {
  for (const c of [
    "git status", "git push", "git push origin main", "git restore --staged a.ts", "git checkout main",
    "git checkout -b feat/x", "git switch main", "git switch -c feat/y", "git branch -d merged",
    "git branch --delete merged", "git stash", "git stash pop", "git log --force-order",
    "git reset HEAD~1", "git reset --soft HEAD~1", "git commit -m 'fix: x'", "git clean -n",
  ]) assert.equal(level(c), null, c);
});
test("inspects each segment of a compound command, newlines included", () => {
  assert.equal(level("git add -A && git commit -m x && git push --force"), "deny");
  assert.equal(level("git fetch && git reset --hard origin/main"), "ask");
  assert.equal(level("echo hi\ngit push --force"), "deny");
  assert.equal(level("git status\ngit reset --hard"), "ask");
});
test("catches git invoked indirectly or by path", () => {
  for (const c of [
    "xargs git push --force", "bash -c 'git push --force'", "sh -c \"git push -f\"", "echo $(git push --force)",
    "/usr/bin/git push --force", "./bin/git push -f", "FOO=1 git push --force", "sudo git push --force",
  ]) assert.equal(level(c), "deny", c);
  assert.equal(level("xargs -0 git reset --hard"), "ask");
});
test("ignores non-git commands that mention the words", () => {
  assert.equal(level("grep -r 'reset --hard' docs/"), null);
  assert.equal(level("echo push --force"), null);
  assert.equal(level("cat gitlab.md"), null);
  assert.equal(level("digit reset --hard"), null);
});
test("check returns level-prefixed findings", () => {
  assert.match(check("git push -f")[0] ?? "", /^\[deny\] force-push/);
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
