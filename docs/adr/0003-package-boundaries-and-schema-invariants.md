---
title: "ADR-0003: One core package, one Store port, and the schema invariants the core relies on"
type: adr
status: accepted
updated: 2026-08-27
tags: [architecture, data-model, backend]
superseded_by:
---

# ADR-0003: One core package, one Store port, and the schema invariants the core relies on

**Date:** 2026-08-27

## Context

ADR-0001 and ADR-0002 fix the stack (TypeScript, Hono + Vue, Workers +
D1 for now) and the invariant that the core must not know about vendors
or infrastructure. They leave open how the monorepo is actually laid
out, which abstractions the core exposes, and a handful of data-model
questions the core logic cannot be written without.

The first proposal was six workspace packages (`core`, `ingestion`,
`store-d1`, `notifier-email`, `api`, `web`) and four ports (`Store`,
`Clock`, `Notifier`, `IngestionAdapter`). Reviewing it against the
actual surface area — one digest page, a few action endpoints, one
daily cron job — showed most of that was speculative: interfaces with a
single implementation and packages whose only job was to enforce a
boundary that a lint rule enforces just as well.

The review also surfaced schema gaps that are one-way doors if fixed
after data exists: no tenant column, no snapshot of which manager a gap
was routed to, no idempotency keys for detection or notification, and
no record of the events the product's only success metric (manager
acted within SLA) is computed from.

## Decision

### Repo layout

Two apps and one shared package:

```text
packages/core     domain types, matching, routing/escalation, the Store
                  port, synthetic fixtures. No runtime/framework imports.
apps/api          Hono. Routes, the cron entry point, and every adapter:
                  src/adapters/{store-d1, csv, email}. Wires adapters
                  into core by hand (no DI framework).
apps/web          Vue 3 + Tailwind 4. Digest page, resolve action.
```

The "core is infra-agnostic" boundary is enforced by an import check
on `packages/core/src` (banning `cloudflare:*`, `hono`, `drizzle-orm`,
`node:*`, and anything under `apps/`), not by splitting adapters into
their own packages. Planned as an ESLint `no-restricted-imports` rule;
implemented as `packages/core/tests/boundary.test.ts` because
typescript-eslint does not run against TypeScript 7 (2026-08). Same
guarantee, runs in `pnpm test` and CI; swap back to ESLint when it
supports TS 7 if a second lint rule ever justifies the dependency.

`store-d1` becomes its own package only when the second `Store`
implementation (Postgres, per ADR-0001) is actually written.

### Ports

Exactly one port: **`Store`**. It is the only abstraction with a second
implementation already scheduled (ADR-0001).

Not ports, deliberately:

- Time is passed in as a `now: Date` argument to the functions that
  need it (`detectGaps`, `computeEscalations`, `runDailyDigest`).
  Deterministic tests without an interface.
- Notification is a plain function in `apps/api/src/adapters/email`,
  passed to `runDailyDigest` as its `send` argument. An interface is
  extracted when a second channel (WhatsApp) is built, not before.
- CSV ingestion is a plain function `parseCsv(text)` returning shifts
  and records. `architecture.md` already says adapters are added as
  needed; the first one does not justify an interface.

### Schema invariants (details in `core-design.md`)

1. **Every table carries `employer_id`.** One employer per deployment
   for the MVP, but the column exists from the first migration so
   multi-tenancy is a config change, not a data migration.
2. **`gaps` snapshots `manager_id` at detection time.** Routing and the
   SLA timer bind to the manager who was responsible when the gap was
   created; a later reassignment does not silently move the timer.
3. **Detection is idempotent**: `gaps` has a unique key on
   `(employer_id, employee_id, gap_date, gap_type)` and the matching
   engine upserts. Running the job twice produces no duplicates.
4. **Notification is idempotent per day**: a `digests` table keyed
   `(employer_id, manager_id, digest_date)` records what was sent. The
   daily job checks it before sending, so a crash between "email sent"
   and "marked notified" costs at most one duplicate, never a stream.
5. **An append-only `events` table** records `gap_detected`,
   `digest_sent`, `gap_resolved`, `escalated`. The SLA metric
   ("manager acted within N hours") is computed from it. No separate
   analytics wiring.
6. **Unscheduled Attendance** (record with no shift) is stored in its
   own table, not as a gap type — it is a sanity signal, not something
   to route.

### Resolution semantics

A gap is resolved by an explicit manager action **or** by a later
import supplying the missing record. Both set `resolved_at`; the
`resolution` column (`manager_action` | `record_arrived`) distinguishes
them so the SLA metric can count only manager actions if the domain
expert wants that. Recorded here because it changes what
"acted within SLA" means — see revisit trigger.

*Amended 2026-08-28:* a third value, `payroll_action` (the payroll
accountant closes an escalated gap whose entry will never arrive), and
an `outcome` column (`present` | `absent`) set with every resolution.
`payroll_action` counts as "manager did not act" in the metric.

**Reversibility:** the layout and "one port" choices are two-way doors
(splitting a package or extracting an interface later is mechanical).
The schema invariants are one-way doors once real data exists — which
is exactly why they are fixed now, while all data is synthetic.

### Deferred to its own ADR

How a manager reaches their digest (signed token link vs. login) is a
security surface and a UX pattern managers will learn — a one-way door.
It gets ADR-0004 before `apps/web` is started; nothing in `core`
depends on the answer.

**Revisit when:** a second `Store` implementation, a second
notification channel, or a second employer on one deployment is
actually being built — each reopens the corresponding "not a port /
not a package" choice. (The domain expert answered on 2026-08-28:
`record_arrived` does not count as the manager acting — see
`open-questions.md`.)

## Consequences

- Fewer moving parts: one shared package, one boundary check, one
  interface. Adapters live next to the code that wires them.
- The core's boundary is enforced by tooling that runs on every commit,
  not by package topology. Weaker in theory, identical in practice.
- Adding the six schema invariants now costs a few columns and two
  tables; adding them after the first real employer would be a data
  migration on production data.
- `runDailyDigest` must be written to tolerate at-least-once execution
  (check `digests`, then send, then record) rather than assumed
  exactly-once — D1 gives `batch`, not interactive transactions.
- Forecloses nothing structurally: every "not yet" above has a stated
  trigger for when it becomes a "yes".

## Alternatives considered

1. **Six packages, four ports (the first proposal)** — rejected:
   package/interface overhead paid daily to guard against a change
   with no scheduled trigger; contradicts the project's
   minimum-viable-scope rule.
2. **Single employer, no `employer_id`, add it later** — rejected:
   retrofitting a tenant column onto every table with real data in it
   is the migration this ADR exists to avoid.
3. **Compute the SLA metric from `gaps` timestamps alone, no events
   table** — rejected: `gaps` holds current state, not history; a
   re-notified or reopened gap loses the timeline the metric needs.
4. **Route by the employee's *current* manager at digest time** —
   rejected: makes the SLA timer move with org changes and leaves
   `escalations` unable to say who was actually late.
