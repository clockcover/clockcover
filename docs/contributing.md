# Contributing

Working conventions for this repo. Product/architecture rules live in
`CLAUDE.md` and `docs/`; this file is about the tooling that enforces
them.

## Guards

Rules that are worth automating live in `tooling/guards/` as pure
TypeScript functions with tests next to them, and are wired into two
places so they fire whether a change comes from a person or from Claude
Code:

| Guard | Rule | Claude Code hook | git hook (husky) |
|---|---|---|---|
| `no-ai-coauthor` | No `Co-Authored-By`/`Signed-off-by` crediting an AI agent | `PreToolUse` on `Bash` → denies the `git commit` | `commit-msg` |
| `synthetic-only` | Synthetic data only (`docs/privacy.md`): no real-looking personal data — emails outside reserved domains (`example.*`, `.test`, `.invalid`, `localhost`), phone numbers — in data files (`fixtures/`, `seed/`, `synthetic/`, `*.csv`, `*.json`, `*.sql`, `*.xlsx`) | `PreToolUse` on `Write\|Edit` → denies the write | `pre-commit` on staged files |

Run the guard tests with `pnpm test:guards` (Node's built-in runner;
Node ≥ 23.6 executes `.ts` directly, no build step — see `engines`).

### Rules for guards

- A guard module exports `check(text): string[]` (findings, empty when
  clean) and optionally `appliesTo(path): boolean`. Pure functions, no
  I/O. I/O lives only in the thin entry points, one per caller:
  `.claude/hooks/<guard>.ts` (stdin JSON → allow/deny) and
  `tooling/guards/git-hook.ts <guard> <files>` (files → exit code).
- Guard, hook file, and git-hook mode share one name (`no-ai-coauthor`,
  `synthetic-only`); stderr lines are prefixed with it.
- An entry point either denies with the findings as the reason or stays
  silent. No advisory warnings.
- Anything a Claude Code hook blocks is also blocked by a git hook or
  CI. Hooks shorten the feedback loop; they are not the only defence.
- Timeout ≤ 10 s. Slow checks are not hooks.
- New guard = `tooling/guards/<guard>.ts` + `<guard>.test.ts` +
  `.claude/hooks/<guard>.ts` registered in `.claude/settings.json` +
  entry in `GUARDS` in `git-hook.ts` wired into `.husky/` + row in the
  table above.
- `.claude/settings.json` is committed (team rules). Personal overrides
  go in `.claude/settings.local.json` (gitignored).

## Commits

Conventional Commits (`type(scope): subject`), enforced by commitlint in
the `commit-msg` hook. Human authors only — see `no-ai-coauthor` above.

Git hooks are managed by husky and installed automatically by
`pnpm install` (the `prepare` script). `.husky/commit-msg` runs
`no-ai-coauthor` then commitlint; `.husky/pre-commit` runs
`synthetic-only` over staged files.
