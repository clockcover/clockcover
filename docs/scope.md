# Scope

## Problem

Department managers don't proactively check attendance systems for gaps
in their team's clock entries — that responsibility ends up concentrated
on a single payroll accountant for the whole company, who has to manually
cross-reference every gap against the shift schedule and follow up with
each employee individually.

The root problem isn't missing data — attendance systems already know
who didn't clock in. It's misrouted responsibility: a manager can't act
on gaps they never see, and even one who _can_ see them still needs a
nudge to act on time. The job isn't to build gap detection from scratch
— it's to route the existing signal to the right manager automatically,
and escalate to payroll only if that manager doesn't act within an SLA.

## Goals

- On a configurable cadence (daily/weekly), produce a **personal digest
  per department manager**: their employees' missing/incomplete clock
  entries for the period.
- Cross-check gaps against the shift schedule, to distinguish "didn't
  clock in despite being scheduled" from "no shift — gap is expected."
- Escalate to the payroll accountant if the manager hasn't acted within
  the SLA: 48 hours, calendar time.
- Every resolution says **what happened**: the employee was present (the
  entry is missing, the hours count) or absent (the gap is real and
  needs an explanation). Managers choose from the digest; payroll from
  the escalation; a record arriving with a later import means present.
- Work **independently of the specific vendor** attendance system —
  because the pain is role-based, not vendor-based (confirmed by the
  domain expert: "it doesn't matter which system we use").
- A public **marketing website** (`apps/site`): what the product does,
  for whom, and a way to get in touch. Static; no accounts, no product
  data.
- An **operator console** (`apps/web/console`, ADR-0005) for the person
  who runs ClockCover at an employer: sign in by emailed link, upload
  the roster and the exports, edit employer settings (timezone, SLA,
  emails), read the "manager acted within SLA" metric.

## Non-goals

- No deep integration with any specific vendor system at launch (no
  costly partnership/certification).
- No automatic WhatsApp Business API delivery at launch (proactive
  messages need pre-approved templates, its own bureaucracy) — start
  with email/web digest.
- No handling of real personal/biometric employee data until the
  employer gives explicit consent — see `privacy.md`.
- No employment-contract generator/parser.
- No payroll calculation itself — only gap detection and routing.
- No gap list for the payroll accountant. Individual gaps reach them
  only as escalation emails — each with a link to close **that one gap**
  when the entry will never arrive (ADR-0004 § extended). The operator
  console shows settings, imports and aggregate numbers, never a queue
  of gaps to chase.
