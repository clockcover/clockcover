// Entry point for git hooks (husky): run one guard over the given files,
// print findings to stderr, exit 1 if any.
//   node tooling/guards/git-hook.ts <guard> <file>...
import { readFileSync } from "node:fs";
import * as noAiCoauthor from "./no-ai-coauthor.ts";
import * as syntheticOnly from "./synthetic-only.ts";

const GUARDS: Record<string, { check(text: string): string[]; appliesTo?(path: string): boolean }> = {
  "no-ai-coauthor": noAiCoauthor,
  "synthetic-only": syntheticOnly,
};

const [name, ...files] = process.argv.slice(2);
const guard = GUARDS[name];
if (!guard) {
  console.error(`git-hook: unknown guard "${name}" (known: ${Object.keys(GUARDS).join(", ")})`);
  process.exit(1);
}

let failed = false;
for (const f of files.filter((p) => guard.appliesTo?.(p) ?? true)) {
  for (const hit of guard.check(readFileSync(f, "utf8"))) {
    console.error(`${name}: ${f}: ${hit}`);
    failed = true;
  }
}
if (failed) console.error("See docs/contributing.md (Guards).");
process.exit(failed ? 1 : 0);
