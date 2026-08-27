// PreToolUse(Bash): deny unsafe force-pushes; ask before commands that discard
// work or rewrite history.
import { findings, level } from "../../tooling/guards/destructive-git.ts";
import { readInput, deny, ask } from "./lib.ts";

const input = await readInput();
const cmd = input.tool_input.command ?? "";
const lvl = level(cmd);
if (lvl) {
  const reasons = findings(cmd).filter((f) => f.level === lvl).map((f) => f.reason).join("; ");
  const tail = "Destructive git — see docs/contributing.md.";
  if (lvl === "deny") deny(`${reasons}. Use --force-with-lease and confirm. ${tail}`);
  ask(`${reasons}. ${tail}`);
}
