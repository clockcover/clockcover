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
- A public **marketing website** (`apps/web`): what the product does,
  for whom, and a way to get in touch. Static; no accounts, no product
  data.
- An **operator console** (`apps/portal/console`, ADR-0005) for the person
  who runs ClockCover at an employer: sign in by emailed link, upload
  the roster and the exports, edit employer settings (timezone, SLA,
  emails), read the "manager acted within SLA" metric.
- **Imports without a person**: if the attendance system publishes its
  export at a fixed https URL, the daily job fetches it (and optionally
  the roster) before sending digests; a failed fetch or a bad file is
  emailed to the operator. "Run import now" in the console fetches on
  demand. Uploads by hand keep working.
- **Export of corrections**: a CSV of gaps closed by a manager or by
  payroll in a period — approved hours and reported absences with notes
  — for carrying into the attendance or payroll system.
- **Money** (ADR-0006): one subscription per employer, tiered by the
  number of active employees on the roster; managers, digests and gaps
  unlimited; 30 days free (90 in early access, plus an integration
  adapter built by us within two weeks); access by request. The site
  shows the tiers, prices and early-access terms.
- **Two languages, Hebrew and English.** Every email and every page a
  person sees follows the employer's language (`employers.locale`, set
  by the owner at creation and by the operator in Settings); Hebrew is
  right-to-left. The site is served at `/` (English) and `/he/`
  (Hebrew). Pages carry a switch for the reader; the employer's choice
  is the default. The site has Help (formats, cases), Integrations
  (what we support and build, what we need from an employer), About and
  a contact form.
- **Owner's admin area** (`admin.clockcover.com`, ADR-0006): the list of
  all employers with headcount, operator and last import; create an
  employer and invite its operator; change an operator. Signed in by
  magic link to the owner's address.

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
- No push of corrections into the attendance or payroll system by API
  yet: the target system and its interface are unknown. Corrections
  leave as CSV until a real employer names the system.
- No self-serve sign-up: employers are onboarded by request (ADR-0006)
  from the owner's admin area; the operator then signs in through the
  console. No payment provider or invoicing yet — the first invoices are
  manual.
- No gap list for the payroll accountant. Individual gaps reach them
  only as escalation emails — each with a link to close **that one gap**
  when the entry will never arrive (ADR-0004 § extended). The operator
  console shows settings, imports and aggregate numbers, never a queue
  of gaps to chase.
