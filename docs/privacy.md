# Privacy

- **Real employee data belongs to the employer**, not to whoever operates
  it technically. Use synthetic data only — made-up employees, managers,
  schedules, and clock entries — until the employer gives explicit
  permission to connect real data. This is not a secret side project,
  it's a formally proposed process.
- If the attendance system uses **biometrics** (fingerprint, etc.),
  that's typically a separately protected data category under local
  privacy law — check the applicable jurisdiction's rules before
  touching it. Never touch biometric data directly — only derived events
  (showed up / didn't), never the biometric templates themselves.
- Keep raw files (CSV/Excel) for the minimum time needed — delete after
  parsing, keep only normalized records.
- TTL and encryption at rest for anything touching real employees, once
  we get there.
- **Import URLs are credentials.** `employers.import_url` / `roster_url`
  are meant to be secret addresses (a token in the path or query); they
  are stored in D1 as plain text and shown in the console Settings to
  the signed-in operator only. Files fetched from them are parsed and
  discarded like uploads — nothing raw is kept.

## What Claude Code must not read

Anything an AI coding agent reads becomes part of its prompt and leaves
the machine. So the rule is not "don't commit secrets" but "don't let
them into the conversation at all". Enforced in `.claude/settings.json`:

- `permissions.deny` blocks the `Read` tool on `.env*`, `.dev.vars`,
  key files (`*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`), `.wrangler/`,
  `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.netrc` — and on `data/real/`,
  the (gitignored) place real employee exports go if we ever get them.
  `.dev.vars`, `.wrangler/` and `data/real/` are also gitignored;
  `apps/api/.dev.vars.example` holds placeholders only. Worker secrets
  are `LINK_SECRET` (signs manager, payroll, operator and admin links)
  and `RESEND_API_KEY`; rotating `LINK_SECRET` invalidates every link at
  once. Upload API keys are per employer, issued in the console, stored
  only as SHA-256 hashes in D1 and shown to the operator once. They are uploaded with `wrangler secret bulk .dev.vars`,
  so values move from the local file to Cloudflare without passing
  through a terminal or a transcript.
- The `no-secrets` guard on `Bash` denies commands that would read those
  paths (`cat .env`, `source .env`, `less ~/.aws/credentials`, …) or dump
  the environment (`env`, `printenv`, `echo $API_TOKEN`).
- The same guard on `Write`/`Edit` denies writing credential-shaped
  values into tracked files; `pre-commit` and CI repeat that check.

These are pattern checks, not a sandbox. Claude Code's sandbox
(`sandbox.credentials` — OS-level masking of env vars and denial of
files, plus network egress control) is the non-heuristic layer; it is
off today. **Turn it on before the first real secret lands in `.env`**
— i.e. before the first `wrangler deploy` — not later. If a secret is in a file that
is otherwise legitimately read (a config with a pasted key), nothing
here stops it — so config files reference `${VARS}` and never hold
values. For real employee data the same logic applies: keep it out of
the working tree except under `data/real/`, and it cannot be read.
