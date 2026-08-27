// Entry point for husky pre-push: block non-fast-forward pushes and deletions
// on protected branches. Refs come on stdin from git.
//   node tooling/guards/pre-push.ts   (stdin: <local_ref> <local_sha> <remote_ref> <remote_sha>)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkPushRefs } from "./destructive-git.ts";

const isAncestor = (a: string, b: string): boolean => {
  try { execFileSync("git", ["merge-base", "--is-ancestor", a, b], { stdio: "ignore" }); return true; }
  catch { return false; }
};

const lines = readFileSync(0, "utf8").split("\n").filter(Boolean);
const hits = checkPushRefs(lines, isAncestor);
for (const h of hits) console.error(`destructive-git: ${h}`);
if (hits.length) console.error("Refused. If this is intended, push with --no-verify — and say so in the PR/commit.");
process.exit(hits.length ? 1 : 0);
