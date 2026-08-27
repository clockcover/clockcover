# Contributing

Working conventions for this repo. Product/architecture rules live in
`CLAUDE.md` and `docs/`; this file is about the tooling that enforces
them.

## Guards

Rules that are worth automating live in `tooling/guards/` as pure
TypeScript functions (tests in `tooling/guards/tests/`), and are wired
into two places so they fire whether a change comes from a person or from Claude
Code:

| Guard               | Rule                                                                                                                                                                                                                                                                                                                              | Claude Code hook                                                                                                               | git hook (husky)                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `no-ai-coauthor`    | No `Co-Authored-By`/`Signed-off-by` crediting an AI agent                                                                                                                                                                                                                                                                         | `PreToolUse` on `Bash` → denies the `git commit`                                                                               | `commit-msg`                                                        |
| `destructive-git`   | Force-push without `--force-with-lease` is denied; commands that discard work or rewrite history (`reset --hard`, `checkout --`/`checkout .`, `restore` (not `--staged`), `clean -f/-x/-X`, `branch -D`, `stash drop/clear`, `rebase`, `commit --amend`, `--force-with-lease`) make Claude **ask** first                                                              | `PreToolUse` on `Bash` → deny / ask                                                                                            | `pre-push`: refuses non-fast-forward pushes and deletions on `main` |
| `no-secrets`        | No credentials in tracked files: private-key blocks, AWS/GitHub/OpenAI-Anthropic/Slack token formats, JWTs, and `api_key = "<long opaque value>"`-style assignments. Env references and placeholders pass. Lockfiles, tests and binaries are skipped                                                                              | `PreToolUse` on `Write\|Edit` → denies the write; on `Bash` → denies reading protected files / dumping env (`docs/privacy.md`) | `pre-commit` on staged files                                        |
| `harness-integrity` | The harness is not weakened by the agent: editing `.claude/`, `.husky/`, `tooling/guards/`, `.github/workflows/`, `CLAUDE.md`, `.commitlintrc.json`, `pnpm-workspace.yaml`, `tsconfig.json` **asks** for a human; `--no-verify`/`-n` on commit or push, `HUSKY=0`, setting or unsetting `core.hooksPath` (reading it is fine), removing husky, `chmod` on `.husky/`/`.claude/` are denied | `PreToolUse` on `Write\|Edit` → ask; on `Bash` → deny                                                                          | — (a person may bypass hooks deliberately; say so in the commit)    |
| `synthetic-only`    | Synthetic data only (`docs/privacy.md`): no real-looking personal data — emails outside reserved domains (`example.*`, `.test`, `.invalid`, `localhost`), phone numbers — in data files (`fixtures/`, `seed/`, `synthetic/`, `*.csv`, `*.json`, `*.sql`, `*.xlsx`)                                                                | `PreToolUse` on `Write\|Edit` → denies the write                                                                               | `pre-commit` on staged files                                        |

`pnpm typecheck` typechecks the root tooling (`tsconfig.json` covers
`tooling/` and `.claude/hooks/`) and then every package — see
§ Packages.
`pnpm guards:scan` runs `synthetic-only` and `no-secrets` over every
tracked file — CI runs it on each push and PR.

Run all guard tests with `pnpm test:guards` (Node's built-in runner;
Node ≥ 23.6 executes `.ts` directly, no build step — see `engines`):

- `tooling/guards/tests/<guard>.test.ts` — unit tests for `check` /
  `appliesTo`.
- `tooling/guards/tests/git-hook.test.ts` — runs `git-hook.ts` as a
  process; asserts exit code and stderr. (`pre-push.ts` is covered via
  its pure core `checkPushRefs` in `destructive-git.test.ts`; the git
  call is injected.)
- `.claude/hooks/tests/hooks.test.ts` — runs each Claude hook with a
  stdin payload; asserts the allow/deny decision.
- `tooling/guards/tests/docs-consistency.test.ts` — ADR files ↔
  `INDEX.md` rows and statuses; `CLAUDE.md` Status date < 90 days; the
  guard set is identical across `git-hook.ts`, `.claude/hooks`,
  `settings.json`, `CLAUDE.md` and the table above; `.gitignore` covers
  `data/real/`, `.dev.vars`, `.wrangler/`.

### Rules for guards

- A guard module exports `check(text): string[]` (findings, empty when
  clean) and optionally `appliesTo(path): boolean`. Pure functions, no
  I/O. I/O lives only in the thin entry points, one per caller:
  `.claude/hooks/<guard>.ts` (stdin JSON → allow/deny) and
  `tooling/guards/git-hook.ts <guard> <files>` (files → exit code).
- Guard, hook file, and git-hook mode share one name (`no-ai-coauthor`,
  `synthetic-only`); stderr lines are prefixed with it.
- An entry point either denies, asks (Claude Code only — forces a
  confirmation prompt even in auto mode), or stays silent. No advisory
  warnings. `ask` is for actions that are sometimes right but never
  routine; `deny` for actions that are never right from an agent.
- Anything a Claude Code hook blocks is also blocked by a git hook or
  CI. Hooks shorten the feedback loop; they are not the only defence.
  The one exception is `harness-integrity`: a git hook cannot stop
  `--no-verify`, so its git-side backstop is the CI run and branch
  protection, and it has no `git-hook.ts` mode (nor does
  `destructive-git`, whose git side is `pre-push.ts`).
- Timeout ≤ 10 s. Slow checks are not hooks.
- New guard = `tooling/guards/<guard>.ts` + `tests/<guard>.test.ts` +
  `.claude/hooks/<guard>.ts` registered in `.claude/settings.json` +
  entry in `GUARDS` in `git-hook.ts` wired into `.husky/` + cases in
  both entry-point test files + row in the table above.
- `.claude/settings.json` is committed (team rules). Personal overrides
  go in `.claude/settings.local.json` (gitignored).

## Packages

`pnpm typecheck` runs the root `tsc` (tooling) then `turbo run typecheck`
in every package; `pnpm test` runs `turbo run test` then the guard tests.

- `packages/core/tests/boundary.test.ts` — the infra-agnostic core
  (ADR-0003): fails if anything under `src/` imports `cloudflare:*`,
  `hono`, `drizzle-orm`, `node:*` or `apps/`. `docs-consistency.test.ts`
  asserts this file exists and names those patterns.
- `packages/core/tests/scenarios.test.ts` — the acceptance scenarios from
  `core-design.md`, same numbering, against `packages/core/fixtures`
  (synthetic people, `example.com` addresses — `synthetic-only` applies
  to `fixtures/`).

## Tests

Tests live in a `tests/` folder next to the code they cover, never mixed
into the source folder (`tooling/guards/tests/`, `packages/core/tests/`,
and the same layout in `apps/*` once they exist).

## Supply chain

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (3 days): a
  freshly published package version is not installed until it has been
  public long enough for a compromised release to be noticed.
- pnpm ≥ 10 does not run dependency lifecycle scripts unless listed in
  `onlyBuiltDependencies` — keep that list empty unless a package
  genuinely needs it.
- GitHub Actions are pinned to a commit SHA (with the version as a
  comment), never to a movable tag.
- CI runs `pnpm audit --prod --audit-level high`.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR:
`pnpm typecheck`, `pnpm lint:md`, `pnpm test`, `pnpm guards:scan`,
and commitlint over the pushed/PR commit range. It is the backstop for a clone where
hooks were never installed. `main` is protected by a GitHub ruleset
(linear history, no force-push, no deletion, signed commits, CodeQL code
scanning) — configured in GitHub, not in the repo. Because CodeQL must
scan a commit before it lands, nothing is pushed to `main` directly:
push a branch, open a PR, let CI and CodeQL pass, rebase-merge (the only
merge method enabled).

## Commits

Conventional Commits (`type(scope): subject`), enforced by commitlint in
the `commit-msg` hook. Human authors only — see `no-ai-coauthor` above.

History on `main` stays linear: no merge commits. Rebase onto `main`
before pushing (`git pull --rebase`, or set `pull.rebase = true`); merge
PRs by rebase or squash, never with a merge commit. A merge commit on
`main` is fixed by rebasing before anyone pulls it, not by another merge.

Git hooks are managed by husky and installed automatically by
`pnpm install` (the `prepare` script). `.husky/commit-msg` runs
`no-ai-coauthor` then commitlint; `.husky/pre-commit` runs
`synthetic-only`, `no-secrets` and markdownlint (`pnpm lint:md`, config in
`.markdownlint-cli2.jsonc`) over staged files; `.husky/pre-push` refuses
non-fast-forward pushes to `main` and deletion of `main`. Bypassing a hook (`--no-verify`) is
a deliberate act — say so in the commit or PR.
