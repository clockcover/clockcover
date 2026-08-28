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
  `data/real/`, `.dev.vars`, `.wrangler/`; hook commands run from the
  project root and fail closed; every acceptance-scenario row in
  `core-design.md` has a core test with the same number.

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
- Hook commands in `settings.json` are
  `cd "$CLAUDE_PROJECT_DIR" && node .claude/hooks/<guard>.ts || exit 2`:
  they run from the project root whatever the shell's cwd is (a bare
  `node .claude/hooks/…` silently fails once the agent has `cd`-ed into
  a package), and a crashed hook **blocks** the tool call (exit 2)
  instead of letting it through as a "non-blocking" error. Fail closed.
  `docs-consistency.test.ts` enforces the shape.
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
- `apps/api/tests/` — CSV parsing, the SQL `Store` and import writers
  against libsql in memory with the real `migrations/` applied (same
  SQLite dialect as D1), the Hono app + scheduled job with a fake mailer
  and a fake `fetch` (scheduled imports), the operator console, the
  signed links. `pnpm db:generate` (drizzle-kit) regenerates migrations
  from `src/adapters/store-d1/schema.ts`; wrangler applies them. CI runs
  `drizzle-kit generate` and fails if it produces a file — a schema
  change without its migration never reaches `main`.
  `wrangler deploy --dry-run` checks the Worker bundles.
- `apps/portal/tests/` — view logic (`src/digest.ts`, `src/api.ts`,
  `src/console-api.ts`) with node:test. The `.vue` templates are checked by `pnpm build` (Vite),
  which CI runs; there is no vue-tsc because it does not support
  TypeScript 7 yet.
- `apps/web` has no tests or build: it is two static files.

## Deploy

Cloudflare, per ADR-0001. Wrangler authenticates with
`CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID`) from
`.claude/settings.local.json` or the shell — a User API token with
*Edit Cloudflare Workers* and *Account · D1 · Edit*; `wrangler login`
does not persist in this WSL setup.

- `apps/api`: `pnpm db:migrate:remote`, then `pnpm deploy`. Secrets come
  from the gitignored `.dev.vars` via `wrangler secret bulk .dev.vars`
  (`API_KEY`, `LINK_SECRET`, `RESEND_API_KEY`); `WEB_URL`, `CONSOLE_URL`, `EMAIL_FROM`
  and `SLA_HOURS` (default for new employers; each employer's own value
  lives in `employers.sla_hours`) are plain vars in `wrangler.jsonc`.
- `apps/portal`: `VITE_API_URL=<api origin> VITE_CONSOLE_URL=<app origin> pnpm build && pnpm exec wrangler deploy`
  (static assets, SPA fallback so `/d/<token>` and `/console/…` resolve).
- `apps/web`: `pnpm deploy`.
- Seeding an employer is a one-off `wrangler d1 execute … INSERT INTO
  employers (id, name, payroll_email, operator_email, timezone)`. From
  there the operator signs in at `/console` and does everything else in
  the browser (ADR-0005), including pointing the daily job at an
  export URL; `scripts/upload.ts` remains for automation
  (`node --env-file=.dev.vars scripts/upload.ts roster|imports <employerId> <file>`).

Current deployment (Workers custom domains on the `clockcover.com`
zone, declared as `routes` in each `wrangler.jsonc`):
`clockcover.com` + `www` → `clockcover-web`, `portal.clockcover.com`
and `console.clockcover.com` → `clockcover-portal` (managers / operators),
`api.clockcover.com` → `clockcover-api`; D1
`clockcover` (WEUR). Declaring routes turns the `*.workers.dev` URLs off,
so the custom domains are the only entry points. Synthetic fixtures only.

## Tests

Tests live in a `tests/` folder next to the code they cover, never mixed
into the source folder (`tooling/guards/tests/`, `packages/core/tests/`,
and the same layout in `apps/*` once they exist).

## Supply chain

- `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (3 days): a
  freshly published package version is not installed until it has been
  public long enough for a compromised release to be noticed.
- pnpm does not run dependency lifecycle scripts unless allowed in
  `allowBuilds` (`pnpm-workspace.yaml`). Packages that would run one
  are listed there as `false` — esbuild and workerd ship prebuilt
  binaries and work without it. Set one to `true` only when a package
  genuinely needs its build step.
- GitHub Actions are pinned to a commit SHA (with the version as a
  comment), never to a movable tag.
- CI runs `pnpm audit --prod --audit-level high`.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR:
`pnpm typecheck`, `pnpm lint:md`, `pnpm test`, `pnpm build`,
`pnpm guards:scan`, commitlint over the pushed/PR commit range, and (on
PRs) commitlint over the PR title. It is the backstop for a clone where
hooks were never installed. `main` is protected by a GitHub ruleset
(linear history, no force-push, no deletion, signed commits, CodeQL code
scanning) — configured in GitHub, not in the repo. Because CodeQL must
scan a commit before it lands, nothing is pushed to `main` directly:
push a branch, open a PR, let CI and CodeQL pass, **squash-merge**. The
squash commit is signed by GitHub and titled with the PR title, so the
PR title must itself be a Conventional Commit (`type(scope): subject`,
subject starting lower-case — `ADR-0004 …` fails `subject-case`). CI
lints the PR title on every PR run, because commitlint on `main` can
only complain after the commit has landed. Rebase-merge is enabled but cannot be
used: GitHub re-creates the commits unsigned and the ruleset rejects
them.

## Commits

Conventional Commits (`type(scope): subject`), enforced by commitlint in
the `commit-msg` hook. Human authors only — see `no-ai-coauthor` above.

History on `main` stays linear: no merge commits. Rebase onto `main`
before pushing (`git pull --rebase`, or set `pull.rebase = true`); merge
PRs by squash (see § CI), never with a merge commit. One PR = one
logical change, since it lands as one commit.

Git hooks are managed by husky and installed automatically by
`pnpm install` (the `prepare` script). `.husky/commit-msg` runs
`no-ai-coauthor` then commitlint; `.husky/pre-commit` runs
`synthetic-only`, `no-secrets` and markdownlint (`pnpm lint:md`, config in
`.markdownlint-cli2.jsonc`) over staged files; `.husky/pre-push` refuses
non-fast-forward pushes to `main` and deletion of `main`. Bypassing a hook (`--no-verify`) is
a deliberate act — say so in the commit or PR.
