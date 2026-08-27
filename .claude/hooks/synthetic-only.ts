// PreToolUse(Write|Edit): deny writes that put real-looking personal data into data files.
import { check, appliesTo } from "../../tooling/guards/synthetic-only.ts";
import { readInput, deny, writtenText } from "./lib.ts";

const input = await readInput();
const path = input.tool_input.file_path ?? "";
if (appliesTo(path)) {
  const hits = check(writtenText(input));
  if (hits.length) deny(`${hits.join("; ")} in ${path}. Synthetic data only — see docs/privacy.md.`);
}
