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
  an SLA (e.g. 48 hours; business vs. calendar days is an open question).
- Work **independently of the specific vendor** attendance system —
  because the pain is role-based, not vendor-based (confirmed by the
  domain expert: "it doesn't matter which system we use").

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
