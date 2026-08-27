# ClockCover

## What this is

Routes the signal about missed time-clock entries: detects gaps between
scheduled shifts and actual clock-ins/outs, sends a digest to the right
department manager, escalates to the payroll accountant on SLA breach.
See `docs/` for the full problem statement and architecture.

## Language

All project documents (this file, docs, comments, commit messages) are
written in English.

## Documentation

- `docs/scope.md` — the problem, MVP goals, and non-goals
- `docs/architecture.md` — system design, ingestion adapter pattern,
  infra-agnostic core
- `docs/core-design.md` — schema, gap-detection algorithm, manager
  digest + SLA escalation logic
- `docs/privacy.md` — data-handling rules, read before connecting real
  data
- `docs/open-questions.md` — questions for the domain expert
- `docs/glossary.md` — canonical domain terms; code, docs, and UI copy
  use these words

Read the relevant one when a decision touches that area — don't restate
its contents here. Non-trivial, hard-to-reverse decisions get an ADR in
`docs/adr/` (one file per decision, numbered, template in
`docs/adr/template.md`, index in `docs/adr/INDEX.md`).

## Status

Last confirmed: 2026-08-27. Docs, ADR-0001..0003, and the repo harness
(guards, hooks, CI — see `docs/contributing.md`) exist. No product code
yet: `packages/core` is the next step. Synthetic data only.

Update this block — and its date — in the same commit as any milestone.
A test fails when the date is older than 90 days.

## Guardrails — hard boundaries

- Never use real employee names or data — synthetic only, until the
  employer gives explicit permission. Full rules in `docs/privacy.md`.
- Never handle biometric templates directly — only derived presence
  events (showed up / didn't).
- Out of MVP scope: deep integration with a specific attendance-system
  vendor, WhatsApp delivery, actual payroll calculation.

## Architectural invariants

- The core (matching engine + routing/escalation) must not know about
  any specific attendance vendor. Everything vendor-specific lives in
  the ingestion adapter.
- The core also must not know about the infrastructure it runs on — no
  Cloudflare/D1-specific calls inline. Data access goes through a
  `Store` interface (see ADR-0001).
- Stack: TypeScript throughout. Backend: Hono, its own app. Frontend:
  Vue 3 + Tailwind 4, its own app. DB: D1 now, Postgres after migration.
  Deploy: Cloudflare Workers + D1 until first paying customer or first
  real employee data, then Kamal + Hetzner.
- Details in `docs/architecture.md`; rationale in
  `docs/adr/0001-typescript-on-cloudflare-until-first-customer.md` and
  `docs/adr/0002-hono-vue-tailwind.md`.

## How to work

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  (`type(scope): subject`), enforced by a git hook.
- Never add `Co-Authored-By` (or any similar trailer) naming an AI
  agent to a commit. Commits are authored by humans only; the
  `no-ai-coauthor` guard rejects such trailers.
- Guards (`no-ai-coauthor`, `synthetic-only`, `destructive-git`,
  `no-secrets`, `harness-integrity`), git hooks, CI, and the rules for
  adding new guards: `docs/contributing.md`.
- Don't decide scope/architecture silently — check against the relevant
  doc in `docs/`; if something's unclear or conflicting, ask.
- Order: contracts and logic first (types, matching engine, tests
  against synthetic scenarios), tooling/infra second — not the other
  way around.
- Verify before calling a step done: `pnpm typecheck && pnpm test:guards`
  today;
  `pnpm typecheck && pnpm test` once `packages/core` exists (update this
  line then). For matching/routing changes, the acceptance scenarios in
  `docs/core-design.md` must all pass.

## Ambiguity

If a request could touch real employee data or expand scope beyond what
`docs/scope.md` covers, stop and ask — don't guess.
