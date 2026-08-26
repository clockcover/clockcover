# Architecture

## High-level flow

An attendance export adapter and a schedule export adapter (both
vendor-specific per employer) feed into ingestion. Both normalize into
one common schema, which feeds:

1. **Ingestion layer** — normalizes any source into one internal schema.
2. **Matching engine** — compares clock entries vs. schedule, per
   employee_id + date.
3. **Routing/escalation engine** — groups by manager_id, tracks SLA
   timers.
4. **Digest delivery** — email/web view at launch, WhatsApp later.

Schema, matching algorithm, and routing/escalation logic are in
`core-design.md`.

## Ingestion layer — vendor-agnostic by design

The only thing that changes per employer is the **adapter** at the input.
The core (matching + routing) never depends on the vendor.

- **Adapter interface:** `importAttendance(source): AttendanceRecord[]`,
  `importSchedule(source): ScheduledShift[]`.
- **First implementation:** a generic CSV/Excel importer, used for both
  attendance and schedule data (most systems export at least one of
  these).
- **When a new employer is known** — write a specific adapter for
  whatever they actually provide (CSV/API/PDF/etc.), without touching
  the rest of the code. Adapters get added as the need for them shows
  up, not ahead of time.

## Repo layout

Monorepo managed with Turborepo: backend and frontend/website live in
this one repository, under the standard `apps/*` / `packages/*`
workspace convention.

## Infra-agnostic core

Same principle as the vendor-agnostic ingestion adapter, applied to
infrastructure: the matching engine, routing/escalation logic, and the
daily digest job are plain functions with no Cloudflare/D1-specific
calls inline. Data access goes through a `Store` interface (one
implementation per backend); see ADR-0001 for the full rationale and
what changes on migration.
