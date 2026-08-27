---
name: docs-audit
description: Cross-check CLAUDE.md, docs/, ADRs and the harness config for semantic drift that tests cannot catch. Run before any milestone commit that touches the Status block.
---

# docs-audit

Deterministic checks (ADR index, guard lists, Status date, `.gitignore`)
already live in `tooling/guards/tests/docs-consistency.test.ts` — run
`pnpm test:guards` first and do not repeat them here. This skill is for
what needs reading.

## Procedure

1. Read, in full: `CLAUDE.md`, every file in `docs/` and `docs/adr/`,
   `.claude/settings.json`, `.husky/*`, `.github/workflows/ci.yml`,
   `.gitignore`, `package.json`.
2. Walk the checklist below. For each hit, quote both sides
   (`file:line` ↔ `file:line`).
3. Report as a numbered list: **real inconsistencies** first, then
   **checked, consistent** (one line per area), then a recommendation
   per item: fix now / needs the user's decision / promote to a test.
4. Do not edit anything unless asked. Never propose weakening a guard.

## Checklist

- **Enums vs prose.** Every `a|b|c` in `core-design.md` — is each value
  used or explained somewhere? Does the prose name a value the enum lacks
  (e.g. an adapter format not in `source`)?
- **Example numbers.** SLA, cadence, retention: the same example value in
  `scope.md`, `core-design.md`, `glossary.md`, `open-questions.md`.
  A genuinely open value is stated once as open, not guessed differently
  per file.
- **"Enforced by X".** Every claim that a rule is enforced (ESLint rule,
  hook, gitignore, CI step, sandbox setting) — does the config actually
  contain it? If it is a promise for later, is the trigger written down
  (`contributing.md` § When `packages/core` lands)?
- **ADR ↔ docs.** Each decision in an ADR appears in `architecture.md`
  or `core-design.md` in the same terms; nothing decided only inside an
  "e.g.". Identifier casing matches the language (camelCase, not Go).
- **Guard table ↔ hook behaviour.** `contributing.md` table columns
  (deny / ask, which hook, which tool) match `settings.json` matchers and
  each `.claude/hooks/*.ts` decision; the Commits section matches the
  table.
- **Privacy ↔ repo.** Every path `privacy.md` says is denied or ignored
  exists in `settings.json` `permissions.deny` and `.gitignore`.
- **Glossary.** New terms in code/docs since the glossary's date; terms
  the glossary says to avoid still appearing.
- **Voice.** Roles, not real people; they/them for any person.
- **Status block.** Reflects what actually exists on disk.
