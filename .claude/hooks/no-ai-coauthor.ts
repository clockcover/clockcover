// PreToolUse(Bash): deny `git commit` commands that carry an AI-agent trailer.
import { check } from "../../tooling/guards/no-ai-coauthor.ts";
import { readInput, deny } from "./lib.ts";

const input = await readInput();
const cmd = input.tool_input.command ?? "";
if (/\bgit\b.*\bcommit\b/.test(cmd)) {
  const hits = check(cmd);
  if (hits.length) deny(`${hits.join("; ")}. Commits are authored by humans only — see docs/contributing.md.`);
}
