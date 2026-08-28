# Open Questions

Questions for the domain expert, with the answers once given. Answered
items stay here as the record of *why* the product behaves as it does;
the behaviour itself is specified in `core-design.md`.

## Answered 2026-08-28

- **Timezone for "today".** The employer's local timezone, stored per
  employer (`employers.timezone`, IANA name). `digest_date` and the SLA
  clock are computed in it. The cron still fires at 08:00 UTC; for
  employers between UTC−4 and UTC+10 that is the same calendar day. A
  per-employer send hour is a later refinement.
- **SLA.** 48 hours, calendar time. No business-day or holiday logic.
- **`record_arrived` vs. the SLA metric.** Does *not* count as the
  manager acting. A record that arrives by itself closes the gap, but
  the metric "manager acted within SLA" counts only
  `resolution = manager_action`. The data model already separates the
  two (ADR-0003).
- **Split shifts / multiple clock pairs per day.** Not supported in the
  MVP: one shift and one attendance record per employee per day. An
  export with two rows for the same employee and day is rejected with a
  line-numbered error, never merged or silently overwritten.
- **Schedule source.** An export file (CSV today, Excel next) from the
  attendance or rostering system, uploaded by the operator.
- **Roster source.** An HR/payroll export uploaded as CSV; re-uploading
  records reassignments, detected gaps keep their manager snapshot.
- **Employee types.** No per-type logic. Everyone in the roster is
  expected to clock; staff who should not be tracked are left out of the
  roster.
- **Channel.** Email only for now. WhatsApp remains a non-goal at launch
  (`scope.md`); a second channel is the ADR-0003 trigger for extracting a
  notification interface.

## Still open

- Send hour per employer (today: 08:00 UTC for everyone).
- Excel adapter: which export layout the first real employer produces.
- **Where the export file lives** at a real employer: an https URL the
  system publishes (supported), a shared folder / SFTP (not reachable
  from Workers — the operator's scheduler would run `scripts/upload.ts`),
  or an email attachment (possible via Cloudflare Email Routing; not
  built). Decides whether the daily fetch is enough.
- **Where corrections go**: which attendance or payroll system, and
  whether it has an import API. Until known, corrections leave as CSV.
- **Sign-up and pricing** (one decision, one-way door): who may create
  an employer, whether self-serve, and what is charged. Today one
  employer per deployment, seeded by hand. A proposal is in the chat
  log of 2026-08-28; it needs the owner's decision and an ADR.
