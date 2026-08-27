---
title: "ADR-0002: Hono for the backend, Vue 3 + Tailwind 4 for the frontend, kept as separate apps"
type: adr
status: accepted
updated: 2026-08-27
tags: [backend, frontend]
superseded_by:
---

# ADR-0002: Hono for the backend, Vue 3 + Tailwind 4 for the frontend, kept as separate apps

**Date:** 2026-08-27

## Context

The backend and frontend are both TypeScript, running in a Turborepo
monorepo, deployed on Cloudflare (Workers + D1) until the first paying
customer or first real employee data — none of that changes here. What
was still open was which concrete frameworks to build with, and whether
frontend and backend should be one application or two.

The candidates considered for "how the backend is served" were: raw
Workers with no framework, Hono, Nitro (standalone), Cloudflare Pages +
Pages Functions, and Nuxt (which would also decide the frontend, merging
both into one app). The frontend framework (Vue 3) and CSS approach
(Tailwind 4) were decided separately from that question.

The app's actual surface area right now is small: a per-manager digest
page (behind a token link or a login — decided in ADR-0004), a handful of action endpoints (e.g. mark a gap
resolved), and a daily cron job. That size matters for how much
framework is worth taking on.

## Decision

Backend: **Hono**, as its own app, separate from the frontend.
Frontend: **Vue 3** with **Tailwind 4**, as its own app.

Rejected merging them into one Nuxt app. The deciding factor was risk to
the infra-agnostic-core invariant from ADR-0001: the matching engine and
routing/escalation logic must stay plain functions with no framework
imports. A thin router (Hono) sitting in its own app makes that
boundary a real, physical one (a separate app the core logic doesn't
live in) rather than a matter of discipline not to reach into Nuxt/Nitro
conventions (`server/` directory, auto-imports) from business logic.

## Consequences

- Two deployable apps (frontend, backend) instead of one — more moving
  parts (two configs, CORS between them) than a merged app would have.
- The digest page does not get framework-level SSR for free the way it
  would in Nuxt; if that's needed later, it's built manually in Hono or
  reconsidered.
- Hono stays a thin routing/middleware layer over the core's plain
  functions — adding a route should not require touching matching or
  routing/escalation logic, and vice versa.
- Frontend and backend can be deployed, tested, and reasoned about
  independently.
- Both are common, well-documented choices for Cloudflare Workers and
  Vue respectively — low risk of getting stuck without ecosystem
  support.

## Alternatives considered

1. **Nuxt (frontend + backend merged)** — rejected: real SSR and
   fewer-moving-parts benefits, but risks blurring the infra-agnostic
   core boundary, and is more framework than the current surface area
   (one page, a few actions, one cron job) needs.
2. **Raw Workers, no framework** — rejected for now: viable at this
   size, but manual routing/middleware doesn't scale past a handful of
   routes without becoming its own ad hoc framework.
3. **Nitro standalone** — rejected: a reasonable middle ground (Workers
   preset, cron support, no Vue coupling), but less common/documented
   for this exact use case than Hono, with no clear advantage over it
   here.
4. **Cloudflare Pages + Pages Functions** — rejected: ties routing
   conventions to Cloudflare Pages specifically rather than a portable
   router, which cuts against ADR-0001's goal of an eventual clean move
   off Cloudflare.
