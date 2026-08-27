// PreToolUse(Write|Edit): deny writes that put credentials into the repo.
// PreToolUse(Bash): deny commands that would read secrets into the transcript.
import { check, appliesTo, checkCommand } from "../../tooling/guards/no-secrets.ts";
import { readInput, deny, writtenText } from "./lib.ts";

const input = await readInput();
if (input.tool_name === "Bash") {
  const hits = checkCommand(input.tool_input.command ?? "");
  if (hits.length) deny(`${hits.join("; ")}. Secrets must not enter the conversation — see docs/privacy.md.`);
}
const path = input.tool_input.file_path ?? "";
if (input.tool_name !== "Bash" && appliesTo(path)) {
  const hits = check(writtenText(input));
  if (hits.length) deny(`Looks like a credential in ${path}: ${hits.join("; ")}. Use an env variable / secret store — see docs/contributing.md.`);
}
