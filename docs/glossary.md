# Domain Glossary

The ubiquitous language for ClockCover. Terms here are canonical — docs, future code, and UI
copy use these words. Implementation details do not belong in this file.

> This file is vocabulary only. Architecture, stack, and deploy decisions live in
> `docs/architecture.md` and `docs/adr/`; workflow policy lives in `CLAUDE.md`. Don't add
> architecture rules, tech-stack facts, or commands back here — keep this file scoped to terms.

## People & Roles

**Employee**:
The person whose attendance is tracked. Belongs to exactly one Manager.
_Defined in_: `docs/core-design.md` (`employees` table)

**Manager** (Department Manager):
The person who oversees a group of employees and is the primary recipient of the daily Digest
for their own team. Never sees other managers' employees.
_Defined in_: `docs/core-design.md` (`managers` table)

**Payroll Accountant**:
The person responsible for payroll across the whole company. Receives only Escalations (by
email — there is no gap list for this role), not the full stream of Gaps — the key difference from
the manual process this replaces. Each Escalation carries a link to close that one Gap with an
Outcome and a note. Addressed via `employers.payroll_email`; there is no separate table. Usually
also the Operator.

**Operator**:
The person who runs ClockCover for an Employer — uploads the roster and exports, sets timezone and
SLA, reads the metric. In practice the Payroll Accountant, but a distinct role: the Operator
configures, the Payroll Accountant receives Escalations. One Operator per Employer
(`employers.operator_email`), signed in through the **Console** by emailed link (ADR-0005).

**Console**:
The Operator's area of `apps/web`, on its own host (`app.clockcover.com`): Sign in, Imports,
Settings, Overview. Not a list of Gaps.

**Employer**:
The company that owns the employee data. Real (non-synthetic) data may only be used once the
employer gives explicit permission — see `docs/privacy.md`.

## Time Tracking & Gaps

**Scheduled Shift**:
A planned work shift for an employee on a given date — the shift schedule's record of when they
were supposed to work.
_Defined in_: `docs/core-design.md` (`scheduled_shifts` table)

**Attendance Record**:
The actual clock-in/clock-out data recorded for an employee on a given date.
_Defined in_: `docs/core-design.md` (`attendance_records` table)

**Gap**:
A detected mismatch between a Scheduled Shift and its Attendance Record — the core signal this
product exists to route. Three types: **no_clockin**, **no_clockout**, **no_record_at_all**.
_Defined in_: `docs/core-design.md` (`gaps` table, Matching Engine section)
_Avoid_: "discrepancy," "anomaly" — always "gap," qualified by type when it matters.

**Unscheduled Attendance**:
An Attendance Record with no matching Scheduled Shift — stored as a sanity-check signal, but
explicitly **not** a Gap.
_Defined in_: `docs/core-design.md` (`unscheduled_attendance` table)

## Core Process

**Matching Engine**:
The component that compares Scheduled Shifts against Attendance Records per employee and date,
producing Gaps.
_Defined in_: `docs/core-design.md`
_In code_: `detectGaps` (pure) and `runDetection` (persists the result) in `packages/core`.

**Period**:
The date range one detection run or Digest covers — a day or a week, per the configured cadence.

**Routing**:
Grouping a day's Gaps by Manager and sending each Manager only their own team's list — never a
company-wide feed.

**Digest**:
The per-Manager summary of their team's Gaps for the period (daily/weekly cadence).

**SLA**:
The time window a Manager has to act on a Gap before it triggers an Escalation: 48 hours, calendar
time, counted from the first Digest that carried the Gap.

**Escalation**:
Notifying the Payroll Accountant that a Manager did not act on a Gap within the SLA.
_Defined in_: `docs/core-design.md` (`escalations` table, Routing & Escalation section)

**Resolution**:
How a Gap was closed — `manager_action` (the Manager acted from the Digest), `record_arrived` (a
later import supplied the missing Attendance Record) or `payroll_action` (the Payroll Accountant
closed it from the Escalation because the entry will never arrive).
_Defined in_: `docs/core-design.md` (`gaps.resolution`, Resolution section)

**Outcome**:
What actually happened on the day, recorded with every Resolution — the resolver either
**approves the hours** (`present`: the employee worked, the clock entry is missing) or **reports
an absence** (`absent`: the Gap is real; the note explaining it is required). A record that
arrives later means present.
_Defined in_: `docs/core-design.md` (`gaps.outcome`)

**Event Log**:
Append-only record of `gap_detected`, `digest_sent`, `gap_resolved`, `escalated`. The source
for the SLA metric ("Manager acted within SLA").
_Defined in_: `docs/core-design.md` (`events` table)

## Ingestion

**Ingestion Layer**:
Normalizes attendance or schedule data from any source into one common internal schema, before
it reaches the Matching Engine.

**Adapter**:
Code that imports Attendance Records or Scheduled Shifts from an export into the common schema —
one generic CSV adapter today, vendor-specific ones per employer later, each written only as the
need for it shows up.
_Defined in_: `docs/architecture.md`
_Avoid_: putting vendor-specific logic anywhere outside an adapter — the Matching Engine and
Routing never know which vendor the data came from.

**Import**:
One run of an Adapter over one export file, recorded as an `imports` row with how it started
(`upload` by a person or script, `url` fetched by the daily job). The raw file is deleted after
parsing (`docs/privacy.md`); Scheduled Shifts and Attendance Records keep only the `import_id`,
so a corrected Import stays traceable.

**Corrections export**:
The CSV the Operator downloads from the Console: Gaps closed by a Manager or by Payroll in a
period, with Outcome, note, planned hours and clock times — what has to be carried into the
attendance or payroll system.
_Defined in_: `docs/core-design.md` (`imports` table)

**Attendance System**:
Whatever system an employer uses to track employee clock-ins/outs. The product is deliberately
vendor-agnostic.
_Avoid_: naming a specific vendor/product in docs or code outside of an Adapter's own
implementation notes.

This glossary was bootstrapped from the current project docs (`docs/scope.md`,
`docs/architecture.md`, `docs/core-design.md`, `docs/privacy.md`) on 2026-08-27 — a first pass,
not exhaustive. Extend it as new terms show up in code or product copy.
