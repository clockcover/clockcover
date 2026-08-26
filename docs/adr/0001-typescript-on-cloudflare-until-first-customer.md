---
title: "ADR-0001: TypeScript on Cloudflare (Workers + D1) until first customer, then self-host"
type: adr
status: accepted
updated: 2026-08-26
tags: [backend, deploy, database]
superseded_by:
---

# ADR-0001: TypeScript on Cloudflare (Workers + D1) until first customer, then self-host

**Date:** 2026-08-26

## Context

The MVP plan previously specified a Go backend deployed via Kamal to a
self-hosted Hetzner VPS with Postgres, chosen for data residency control
and the operational simplicity of a single static binary.

Before any code exists, the priority shifted: stay at $0 infrastructure
cost until there's a first paying customer, since we're running entirely
on synthetic data with no real users yet. Cloudflare's free tier
covers compute (Workers), scheduling (Cron Triggers), and a database
(D1), but D1 is SQLite-based, not Postgres, and Cloudflare's free tier
doesn't run Go natively — only JavaScript/TypeScript/Wasm. Go compiled to
Wasm runs on Workers but is an immature path for an app this size.

Whatever backend language is chosen now also has to survive the eventual
move to self-hosted Postgres (needed once real employee data is involved,
for data residency and control reasons) without becoming a full rewrite.

## Decision

Backend language is **TypeScript**, not Go. Initial deploy target is
**Cloudflare Workers + D1** (free tier), used until the first paying
customer or the first real (non-synthetic) employee data is onboarded —
whichever comes first — at which point we migrate to self-hosted
(Kamal + Hetzner) with Postgres.

To keep that later migration cheap rather than a rewrite, the code is
structured from the start so only two thin layers change:

1. **Core logic stays infrastructure-agnostic.** The matching engine and
   routing/escalation logic are pure TypeScript functions with no
   Workers-specific imports (no `env.DB`, no Durable Objects, no D1 client
   calls inline) — the same principle already applied to attendance
   vendors in the ingestion adapter.
2. **Data access sits behind a `Store` interface** (e.g. `GetGaps`,
   `SaveGap`, ...). D1 gets one implementation now; Postgres gets a second
   implementation later. Callers never change.
3. **Schema and queries go through an ORM that targets both SQLite and
   Postgres from one schema definition** (e.g. Drizzle), so the dialect
   swap doesn't mean hand-rewriting queries.
4. **The daily digest job is a plain function** (`runDailyDigest()`) with
   no knowledge of what invoked it. A Cloudflare Cron Trigger calls it
   now; a cron/systemd timer on Hetzner calls it later.

**Revisit when:** first paying customer, or first real (non-synthetic)
employee data being onboarded — whichever comes first.

## Consequences

- Enables shipping and iterating at $0 infra cost before revenue or real
  data exist.
- Forecloses using Go for the backend.
- Forecloses guaranteed data-residency control while on Cloudflare's
  free tier (jurisdictional controls are an enterprise feature) —
  acceptable only because current data is synthetic; real employee
  data must not go into D1 before the migration happens.
- Requires discipline to keep D1/Workers-specific code out of core logic
  — reinforced by the project's "contracts/logic before infra" rule.
- Migration is still real work (new `Store` implementation, ORM driver
  swap, deploy tooling moving from Wrangler to Kamal) — this decision
  minimizes that work, it doesn't eliminate it.

## Alternatives considered

1. **Go backend, self-hosted Kamal + Hetzner from day one** — rejected
   for now: real infra cost before there's a customer or real data to
   justify it.
2. **Go compiled to Wasm on Cloudflare Workers** — rejected: immature
   path for this kind of app, larger cold starts, no meaningful benefit
   over native TypeScript on the same runtime.
3. **Free-tier real Postgres (Neon/Supabase) with Go, hosted somewhere
   free** — rejected: no free-tier compute host was identified that runs
   a Go binary as cheaply/simply as Workers runs TypeScript.
