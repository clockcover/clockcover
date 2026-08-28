// Entry point for git hooks (husky): run one guard over the given files,
// print findings to stderr, exit 1 if any.
//   node tooling/guards/git-hook.ts [--staged] <guard> <file>...
// `--staged` checks the blob in the index (`git show :<path>`) — what the commit
// will contain — instead of the working tree, which may differ (`git add -p`,
// edits after `git add`). Without it (CLI, `guards:scan`) files are read from disk.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as noAiCoauthor from "./no-ai-coauthor.ts";
import * as syntheticOnly from "./synthetic-only.ts";
import * as noSecrets from "./no-secrets.ts";

const GUARDS: Record<string, { check(text: string): string[]; appliesTo?(path: string): boolean }> = {
  "no-ai-coauthor": noAiCoauthor,
  "synthetic-only": syntheticOnly,
  "no-secrets": noSecrets,
};

const args = process.argv.slice(2);
const staged = args[0] === "--staged";
if (staged) args.shift();
const [name = "", ...files] = args;
const guard = GUARDS[name];
if (!guard) {
  console.error(`git-hook: unknown guard "${name}" (known: ${Object.keys(GUARDS).join(", ")})`);
  process.exit(1);
}

const contents = (f: string): string =>
  staged ? execFileSync("git", ["show", `:${f}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) : readFileSync(f, "utf8");

let failed = false;
for (const f of files.filter((p) => guard.appliesTo?.(p) ?? true)) {
  for (const hit of guard.check(contents(f))) {
    console.error(`${name}: ${f}: ${hit}`);
    failed = true;
  }
}
if (failed) console.error("See docs/contributing.md (Guards).");
process.exit(failed ? 1 : 0);
