// PreToolUse(Write|Edit): ask before changing guards, hooks, CI or agent config.
// PreToolUse(Bash): deny commands that bypass or detach the git hooks.
import { appliesTo, check, checkCommand } from "../../tooling/guards/harness-integrity.ts";
import { readInput, deny, ask, targetPath } from "./lib.ts";

const input = await readInput();
if (input.tool_name === "Bash") {
  const hits = checkCommand(input.tool_input.command ?? "");
  if (hits.length) deny(`${hits.join("; ")}. Hooks are not bypassed by the agent — see docs/contributing.md.`);
} else {
  const path = targetPath(input);
  if (appliesTo(path)) ask(`${path} ${check("")[0]}. Confirm this change to the harness — see docs/contributing.md.`);
}
