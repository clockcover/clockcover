// Guard: the harness must not be weakened by the agent it constrains.
// Editing guard/hook/CI/config files asks for a human; bypassing git hooks is denied.

// Paths are repo-relative (entry points normalise them). Root-only files are anchored.
const HARNESS_DIR = /^(?:\.claude|\.husky|tooling\/guards|\.github\/workflows)\//;
const HARNESS_ROOT_FILE = /^(?:CLAUDE\.md|\.commitlintrc\.json|pnpm-workspace\.yaml|tsconfig\.json|package\.json|turbo\.json|\.markdownlint-cli2\.jsonc|\.gitignore)$/;
// husky's user-level init, sourced before every hook (it can set HUSKY=0) — wherever it lives.
const HUSKY_INIT = /(?:^|\/)(?:\.huskyrc|\.config\/husky\/[^/]+|husky\/init\.sh)$/;

export function appliesTo(path: string): boolean {
  return HARNESS_DIR.test(path) || HARNESS_ROOT_FILE.test(path) || HUSKY_INIT.test(path);
}

/** Write/Edit on a harness file: always a finding (the hook turns it into `ask`). */
export function check(_text: string): string[] {
  return ["changes the harness (guards, hooks, CI, or agent config)"];
}

const BYPASS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bgit\b.*\s--no-verify\b/, reason: "--no-verify skips the git hooks" },
  { re: /\bgit\b(?=.*\b(?:commit|push)\b).*\s-n\b/, reason: "-n (--no-verify) skips the git hooks" },
  { re: /\bHUSKY=0\b/, reason: "HUSKY=0 disables the git hooks" },
  // Setting (not reading) hook config: `key=value`, `key value`, `git config [flags] key value`, or --unset/--edit.
  { re: /\bcore\.hooksPath(?:=|\s+[^\s-])/i, reason: "changing core.hooksPath detaches the git hooks" },
  { re: /\bgit\s+config\b(?:\s+-[-\w]+)*\s+\S*hooks?\S*\s+\S/i, reason: "editing hook configuration" },
  { re: /\bgit\s+config\b.*\s--(?:unset|unset-all|edit|remove-section)\b/i, reason: "editing hook configuration" },
  { re: /\bhusky\s+(?:uninstall|--no-install)\b|\brm\b.*\.husky/, reason: "removing husky" },
  { re: /\.huskyrc\b|\.config\/husky\b|\bhusky\/init\.sh\b/, reason: "touching husky's user-level init, which runs before every hook" },
  { re: /\bchmod\b.*\.(?:husky|claude)(?:\/|\s|$)/, reason: "changing hook permissions" },
];

export function checkCommand(command: string): string[] {
  const out: string[] = [];
  for (const seg of command.split(/&&|\|\||;|\||\n/).map((s) => s.trim())) {
    const b = BYPASS.find((x) => x.re.test(seg)); // one finding per segment
    if (b) out.push(`${b.reason}: \`${seg}\``);
  }
  return out;
}
