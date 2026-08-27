// Shared plumbing for PreToolUse hooks: read the stdin JSON, emit an allow/deny decision.
export interface HookInput {
  tool_name: string;
  tool_input: { file_path?: string; content?: string; new_string?: string; command?: string };
}

export async function readInput(): Promise<HookInput> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return JSON.parse(raw);
}

export function deny(reason: string): never {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
  process.exit(0);
}

/** Text a Write/Edit is about to put on disk. */
export function writtenText(input: HookInput): string {
  return input.tool_input.content ?? input.tool_input.new_string ?? "";
}
