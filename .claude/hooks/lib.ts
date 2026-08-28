// Shared plumbing for PreToolUse hooks: read the stdin JSON, emit an allow/deny decision.
import { isAbsolute, relative } from "node:path";
export interface HookInput {
  tool_name: string;
  tool_input: { file_path?: string; content?: string; new_string?: string; command?: string };
}

export async function readInput(): Promise<HookInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

function decide(permissionDecision: "deny" | "ask", reason: string): never {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

/** Block the tool call. */
export function deny(reason: string): never { return decide("deny", reason); }
/** Force a confirmation prompt even in auto mode. */
export function ask(reason: string): never { return decide("ask", reason); }

/** Text a Write/Edit is about to put on disk. */
export function writtenText(input: HookInput): string {
  return input.tool_input.content ?? input.tool_input.new_string ?? "";
}

/** Repo-relative path of the file a Write/Edit targets. settings.json `cd`s into $CLAUDE_PROJECT_DIR first; fall back to cwd for direct runs. */
export function targetPath(input: HookInput): string {
  const p = input.tool_input.file_path ?? "";
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  return isAbsolute(p) ? relative(root, p) : p;
}
