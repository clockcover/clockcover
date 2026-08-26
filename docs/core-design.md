# Core Design

## Data Model

Schema below, dialect-agnostic. Runs on D1 (SQLite) initially, Postgres
after migration — see ADR-0001.

```
employees
  id, external_id, full_name, manager_id (FK → managers), company_branch, active

managers
  id, external_id, full_name, email, whatsapp_number (nullable, until WhatsApp delivery is built)

scheduled_shifts
  id, employee_id, shift_date, planned_start, planned_end, source (pdf|excel|manual)

attendance_records
  id, employee_id, record_date, clock_in, clock_out, status (complete|partial|missing),
  raw_source_ref

gaps
  id, employee_id, gap_date, gap_type (no_clockin|no_clockout|no_record_at_all),
  detected_at, manager_notified_at, resolved_at, resolution_note

escalations
  id, gap_id, escalated_at, escalated_to (payroll accountant), reason (sla_breach)
```

## Matching Engine — Gap Detection Logic

Pseudocode for the main loop (per period — day/week):

```
for each employee:
    scheduled = scheduled_shifts.where(employee_id, date_range)
    actual    = attendance_records.where(employee_id, date_range)

    for each scheduled_shift:
        matching_record = actual.find(date == scheduled_shift.date)
        if matching_record is None:
            create_gap(type = no_record_at_all)
        elif matching_record.clock_in is None:
            create_gap(type = no_clockin)
        elif matching_record.clock_out is None:
            create_gap(type = no_clockout)
        # if everything is present — no gap, do nothing

    # records with no matching scheduled shift — logged separately, not a
    # gap, but useful as a sanity check (employee clocked in with no
    # scheduled shift)
```

## Routing & Escalation

- Once a day (e.g. at 8:00), a batch job collects all `gaps` from
  yesterday, grouped by `manager_id`.
- Sends each manager **only their own list** (not one company-wide feed).
- SLA timer (e.g. 48 hours): if `manager_notified_at` is set but
  `resolved_at` isn't by the time the SLA expires → create an
  `escalation` to the payroll accountant.
- The payroll accountant only sees **escalations**, not the full stream —
  this is the key difference from the current process, where she sees
  everything at once.
