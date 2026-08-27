// PreToolUse(Write|Edit): deny writes that put credentials into the repo.
import { check, appliesTo } from "../../tooling/guards/no-secrets.ts";
import { readInput, deny, writtenText } from "./lib.ts";

const input = await readInput();
const path = input.tool_input.file_path ?? "";
if (appliesTo(path)) {
  const hits = check(writtenText(input));
  if (hits.length) deny(`Looks like a credential in ${path}: ${hits.join("; ")}. Use an env variable / secret store — see docs/contributing.md.`);
}
