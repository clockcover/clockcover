// PreToolUse(Write|Edit): deny writes that put real-looking personal data into data files.
import { check, appliesTo } from "../../tooling/guards/synthetic-only.ts";
import { readInput, deny, writtenText, targetPath } from "./lib.ts";

const input = await readInput();
const path = targetPath(input);
if (appliesTo(path)) {
  const hits = check(writtenText(input));
  if (hits.length) deny(`${hits.join("; ")} in ${path}. Synthetic data only — see docs/privacy.md.`);
}
