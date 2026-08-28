---
title: "ADR-0007: How data gets in — import URLs as credentials, per-employer upload API keys"
type: adr
status: accepted
updated: 2026-08-28
tags: [security, backend, ingestion]
superseded_by:
---

# ADR-0007: How data gets in — import URLs as credentials, per-employer upload API keys

**Date:** 2026-08-28

## Context

Two paths bring an employer's files into ClockCover without a person
in the console: the daily job fetches the export (and optionally the
roster) from an https URL the operator saved in Settings, and scripts
or the employer's own scheduler upload files to
`POST /employers/:id/roster` and `POST /employers/:id/imports`. Both
were built quickly against a single synthetic employer and carried two
assumptions that do not survive a second employer or a first real one:

- Upload endpoints were guarded by one deployment-wide `API_KEY` set
  with `wrangler secret put` (ADR-0004 § What is deliberately not built,
  ADR-0005 § Consequences for the code). One secret for every employer
  means a leaked key at one employer opens all of them, revoking it
  logs every scheduler out at once, and nothing records which key did
  what.
- The daily fetch took whatever URL was saved and followed it. A Worker
  that fetches operator-supplied URLs is a server-side request forgery
  surface: a URL pointing at a private address, a redirect chain, or an
  unbounded body can be used to probe or exhaust what the Worker can
  reach.

Both are decisions about credentials — what proves that a file belongs
to an employer — and about the trust the system extends to an address.
Each is a one-way door for the operator's habits (how they wire their
scheduler) and a schema change (`api_keys`), so they are written down
here rather than left in code.

## Decision

### The import URL is the credential

`employers.import_url` and `employers.roster_url` are treated as
secrets: the operator is expected to use an address that carries a
token in its path or query, exactly as the attendance systems that
publish exports do. The URL is stored in D1 as plain text, shown in
Settings to the signed-in operator only, and never written to logs or
emails. There is no second credential (no header, no basic auth) for the
fetch — one thing to configure, one thing to rotate.

The fetch itself is constrained so that a saved URL cannot be turned
against the Worker:

- **https only**; `http:` and every other scheme are rejected when the
  URL is saved and again before each fetch.
- **No redirects** — the response must come from the address that was
  configured (`redirect: "error"`).
- **No literal-IP or localhost hosts** — the hostname must be a name,
  not an IPv4/IPv6 literal, `localhost` or a `.localhost` name.
- **10 MB cap** on the body; a larger file fails the import and the
  operator is emailed, as for any other bad fetch.

The fetched file is parsed and discarded like an upload
(`privacy.md`); the `imports` row records `trigger = url`.

### Upload API keys are per employer

The shared `API_KEY` is retired. An operator issues keys in the console
(Settings → API keys, `GET/POST /console/api-keys`,
`DELETE /console/api-keys/:id`); the `api_keys` table (migration 0006)
holds `employer_id`, `name`, `prefix`, `key_hash`, `created_at`,
`last_used_at`, `revoked_at`.

- **Hashed at rest.** Only the SHA-256 of the key is stored
  (`key_hash`, unique). The first characters (`prefix`) are kept so the
  operator can tell keys apart in the list.
- **Shown once.** The plain key appears in the response that creates
  it and nowhere else; a lost key is revoked and replaced, never
  recovered.
- **Revocable, individually.** `revoked_at` is set; the key stops
  working immediately; other keys and the daily fetch are unaffected.
  `last_used_at` shows the operator which keys are alive.
- **Path and key must agree.** The key names an employer; the upload
  endpoints check that `:id` in the path is that employer and answer
  404 otherwise. A key can never write into another employer's data,
  whatever the URL says.

`packages/core` is untouched: authentication is an `apps/api` concern
and the core keeps taking `employerId` as an argument.

**Reversibility:** one-way door for the operator's setup (the URL they
publish and the key they paste into a scheduler are what they learn;
changing either re-trains every operator) and for the `api_keys`
schema. Two-way for the fetch rules — tightening or loosening them is
a code change with no data impact.

**Revisit when:** an employer's export lives behind an address that
cannot be made secret (a fixed URL with a separate login), a shared
folder or SFTP (not reachable from Workers), or an email attachment;
when a second Worker or a self-hosted deployment (ADR-0001) changes what
"private address" means; or when an employer needs more than one
operator issuing keys (roles, ADR-0005 § Revisit when).

## Consequences

- One employer's leaked key or URL exposes that employer only; revoking
  it is one click in the console and disturbs nobody else.
- The operator has one more thing to manage (keys) and one more rule
  to follow (the export URL must carry its own token). The console
  copy says so in both languages.
- `scripts/upload.ts` and any employer scheduler must be given a
  per-employer key; the shared `API_KEY` secret is removed from
  `wrangler` and `.dev.vars.example`.
- Exports published over plain `http:` or behind redirects cannot be
  fetched; the operator uploads by hand or fixes the address. Accepted:
  a secret in a URL sent over `http:` is not a secret.
- The 10 MB cap is generous for a daily export at the headcounts
  ADR-0006 prices for; a larger file is a signal to look at the
  employer, not to raise the cap silently.

## Alternatives considered

1. **Keep the shared `API_KEY`** — rejected: one secret across
   employers, no attribution, all-or-nothing rotation.
2. **Basic auth or a header for the fetch, in addition to the URL** —
   rejected for now: a second credential to store and rotate for a
   source that already puts its token in the URL; can be added per
   adapter when an employer's system requires it.
3. **Store keys in plain text so they can be shown again** — rejected:
   a dump of D1 would hand out live credentials; hashing costs nothing
   and matches how every hosted API treats keys.
4. **Allow redirects and private addresses, trust the operator** —
   rejected: the operator is trusted, the address is not; the rules
   cost the honest case nothing.
5. **Pull with a Cloudflare-side scheduler outside the Worker** —
   rejected: another moving part with the same trust question, and the
   Worker already runs the daily job.
