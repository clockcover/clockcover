# Core Design

## Data Model

Schema below, dialect-agnostic. Runs on D1 (SQLite) initially, Postgres
after migration — see ADR-0001. Structural invariants (tenant column,
manager snapshot, idempotency keys, event log) are decided in ADR-0003.

Every table carries `employer_id`. One employer per deployment for the
MVP; the column exists so multi-tenancy is a config change later, not a
data migration.

```text
employers
  id, name, payroll_email          -- where escalations go; one accountant per employer

employees
  id, employer_id, external_id, full_name, manager_id (FK → managers), active

managers
  id, employer_id, external_id, full_name, email,
  whatsapp_number (nullable, until WhatsApp delivery is built)

imports
  id, employer_id, source (csv|excel|pdf), imported_at, row_count
                                   -- one row per import run; the raw file itself is deleted
                                   -- after parsing (privacy.md). `source` grows with adapters.

scheduled_shifts
  id, employer_id, employee_id, shift_date, planned_start, planned_end,
  import_id (FK → imports)

attendance_records
  id, employer_id, employee_id, record_date, clock_in, clock_out,
  import_id (FK → imports)

gaps
  id, employer_id, employee_id, gap_date, gap_type (no_clockin|no_clockout|no_record_at_all),
  manager_id,                      -- snapshot at detection time, see below
  detected_at, manager_notified_at, resolved_at,
  resolution (manager_action|record_arrived, nullable), resolution_note
  UNIQUE (employer_id, employee_id, gap_date, gap_type)

unscheduled_attendance
  id, employer_id, employee_id, record_date, attendance_record_id, detected_at
  UNIQUE (employer_id, employee_id, record_date)

digests
  id, employer_id, manager_id, digest_date, sent_at, gap_count
  UNIQUE (employer_id, manager_id, digest_date)

escalations
  id, employer_id, gap_id, escalated_at, escalated_to (employers.payroll_email at escalation time),
  reason (sla_breach)

events  -- append-only
  id, employer_id, occurred_at,
  type (gap_detected|digest_sent|gap_resolved|escalated),
  gap_id (nullable), manager_id (nullable), payload (json)
```

**`gaps.manager_id` is a snapshot.** It is copied from
`employees.manager_id` when the gap is created. Routing, the SLA timer,
and escalation all use the snapshot — if an employee is reassigned
after detection, the gap stays with the manager who was responsible
when it was detected.

**`events` is the source of the product metric.** "Manager acted within
SLA" is computed as `gap_resolved(resolution=manager_action).occurred_at
− digest_sent.occurred_at` per gap. `gaps` holds current state; `events`
holds the timeline.

**No `status` column on `attendance_records`.** Whether a record is
complete is derived from `clock_in`/`clock_out` being null; a shift with
no record at all has no row. Raw export files are deleted after parsing
(`privacy.md`); `import_id` points at the `imports` row, so a corrected
import (scenario 7) is traceable without keeping the file.

## Matching Engine — Gap Detection Logic

Pure function: `detectGaps(shifts, records, employees) → { gaps, unscheduled }`.
No I/O; the caller persists the result through `Store`.

Pseudocode for the main loop (per period — day/week):

```text
for each employee:
    scheduled = scheduled_shifts.where(employee_id, date_range)
    actual    = attendance_records.where(employee_id, date_range)

    for each scheduled_shift:
        matching_record = actual.find(date == scheduled_shift.date)
        if matching_record is None:
            emit_gap(type = no_record_at_all)
        elif matching_record.clock_in is None:
            emit_gap(type = no_clockin)
        elif matching_record.clock_out is None:
            emit_gap(type = no_clockout)
        # if everything is present — no gap

    for each record in actual with no scheduled_shift on record.date:
        emit_unscheduled_attendance(record)   # sanity signal, not a gap

emit_gap sets manager_id = employee.manager_id (snapshot)
```

Each newly created gap appends a `gap_detected` event; a re-run that
finds the same gap already open appends nothing.

**Idempotency.** The store upserts gaps on
`(employer_id, employee_id, gap_date, gap_type)`. Running detection
twice for the same period is a no-op the second time. If a re-run finds
that a previously detected gap now has its record (e.g. a corrected
import), the gap is resolved with `resolution = record_arrived`.

## Routing & Escalation

- Once a day (e.g. at 8:00), `runDailyDigest(store, now)` collects all
  open `gaps` grouped by `gaps.manager_id` (the snapshot).
- Before sending, it checks `digests` for
  `(manager_id, digest_date = today)`. Already present → skip. This
  makes the job safe to re-run; a crash between "email sent" and
  "digest row written" costs at most one duplicate email.
- Sends each manager **only their own list** (not one company-wide
  feed), then writes the `digests` row, sets `manager_notified_at` on
  the included gaps (first notification only), and appends
  `digest_sent` events.
- SLA timer (e.g. 48 hours, configurable; business vs. calendar days is
  an open question): `computeEscalations(openGaps, now, sla)` returns
  gaps where `manager_notified_at + sla < now` and `resolved_at` is
  null. Each produces an `escalation` to the payroll accountant and an
  `escalated` event. A gap escalates once.
- The payroll accountant only sees **escalations**, not the full stream —
  this is the key difference from the current process, where they see
  everything at once.

## Resolution

A gap is resolved either by the manager (action from the digest →
`resolution = manager_action`) or by a later import supplying the
missing record (`resolution = record_arrived`). Both set `resolved_at`
and append a `gap_resolved` event. Whether `record_arrived` counts as
the manager having acted for SLA purposes is a domain-expert question
(see `open-questions.md`); the data model keeps the two apart so either
answer is computable.

## Acceptance scenarios

"Done" for the matching engine and routing means every scenario below
runs green against synthetic fixtures (`packages/core/fixtures`). Add a
row before changing behaviour, not after.

| #   | Given                                                      | Expect                                                                           |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Shift scheduled, no attendance record                      | one gap `no_record_at_all`, one `gap_detected` event, `manager_id` = employee's manager at detection |
| 2   | Shift scheduled, record with `clock_in` only               | one gap `no_clockout`                                                            |
| 3   | Shift scheduled, record with `clock_out` only              | one gap `no_clockin`                                                             |
| 4   | Shift scheduled, full record                               | no gap                                                                           |
| 5   | Record on a day with no shift                              | one `unscheduled_attendance`, zero gaps                                          |
| 6   | Same period detected twice                                 | identical result, zero duplicate gaps                                            |
| 7   | Gap detected, corrected import supplies the record, re-run | gap resolved with `resolution = record_arrived`, `gap_resolved` event            |
| 8   | Employee reassigned to another manager after detection     | gap keeps original `manager_id`; digest goes to the original manager             |
| 9   | Two managers, mixed gaps                                   | each digest contains only that manager's gaps                                    |
| 10  | `runDailyDigest` run twice on one day                      | one `digests` row per manager, one `digest_sent` event, second run sends nothing |
| 11  | Gap notified, SLA elapsed, unresolved                      | one escalation, one `escalated` event; third run adds nothing                    |
| 12  | Gap notified, resolved before SLA                          | no escalation                                                                    |
