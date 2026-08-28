---
title: "ADR-0005: An operator console in apps/web, signed in by emailed magic link"
type: adr
status: accepted
updated: 2026-08-28
tags: [scope, security, frontend, backend]
superseded_by:
---

# ADR-0005: An operator console in apps/web, signed in by emailed magic link

**Date:** 2026-08-28

## Context

Until now the operator — the payroll accountant who runs ClockCover for
an employer — configured and fed the system from a terminal: CSV uploads
through `scripts/upload.ts` with a shared API key, employer settings by
SQL against D1, the SLA and sender address in `wrangler.jsonc`. The
first operator asked three times where to "configure the system, import
data, find my account". The terminal model is wrong for the person the
product is for.

`scope.md` had one UI (the manager's digest page) and an explicit
non-goal (no screen for the payroll accountant *as recipient of gaps*).
Both still hold: the console is for the operator role — settings,
imports, the product metric — not a list of gaps to chase. The payroll
accountant still learns about individual gaps only by escalation email.

What has to be decided:

1. Whether the console is in scope at all (it was not).
2. How the operator signs in — the first real account in the product, a
   pattern the operator learns, and a security surface that guards
   uploads which shape everyone's digests.
3. Where the SLA lives, since the console must be able to change it.

## Decision

### Scope

**An operator console is part of the MVP**, as a second area of
`apps/web` served on its own host — `app.clockcover.com` — while the
manager's digest page keeps `digest.clockcover.com`. One worker, two
doors: each audience sees a hostname that names what it gets. It has
four screens and nothing else:

- **Sign in** — email address; a link arrives by email.
- **Imports** — upload the roster CSV and the shift/attendance export;
  see the result (gaps created and resolved, unknown employees, row
  errors) and the history of import runs.
- **Settings** — employer name, payroll email, operator email, timezone,
  SLA hours.
- **Overview** — open gaps per manager, escalations, and the product
  metric "gaps acted on by the manager within the SLA" over the last 30
  days, read from `events`.

Not in it: editing managers or employees by hand (the roster CSV stays
the source of truth), a list of gaps for the accountant to work (still a
non-goal), multi-user roles, multiple employers per operator.

### Sign-in: emailed magic link, bearer token, no passwords

One operator per employer, identified by `employers.operator_email`.
Signing in means: enter the email; if it matches an employer, a link is
emailed; opening it lands on the console with a signed token that the
browser keeps in `sessionStorage` and sends as `Authorization: Bearer`.

- Same token mechanism as ADR-0004 (HMAC-SHA-256 over
  `{ kind: "operator", employerId, email, exp }`, `LINK_SECRET`), with a
  `kind` field so a manager's digest token can never be presented as an
  operator's and vice versa. Tokens issued before this ADR carry no
  `kind` and are treated as manager tokens.
- **Lifetime 7 days**, then sign in again. Shorter than the digest link
  because the console can change everyone's routing.
- The login endpoint answers the same way whether or not the email is
  known (no account enumeration), and is rate-limited to one link per
  employer per minute by the `digests`-style idempotency pattern: an
  `operator_logins` table is *not* introduced; instead the token's `exp`
  is rounded so repeated requests within a minute produce the same link.
- **Revocation**: rotate `LINK_SECRET` (also logs out every manager
  link). Changing `operator_email` in Settings invalidates nothing by
  itself — the old token still names the old email and is rejected once
  it no longer matches the row.
- No passwords, no session table, no cookies (the console is on a
  different origin from the API; bearer tokens avoid cross-site cookie
  rules and CSRF entirely).

### SLA moves into the employer row

`employers.sla_hours` (default 48) replaces the deployment-wide
`SLA_HOURS` var. The daily job and the digest page read it per employer;
the console edits it. `SLA_HOURS` remains only as the default for new
rows.

### Consequences for the code

- `apps/api`: `employers.operator_email`, `employers.sla_hours`
  (migration); `POST /console/login`; bearer-authenticated
  `GET /console/me`, `PATCH /console/employer`, `POST /console/roster`,
  `POST /console/imports`, `GET /console/imports`, `GET /console/overview`.
  The API-key endpoints stay for scripts.
- `apps/web`: on the console host, `/` and `/console` (sign-in),
  `/console/<token>` (landing, stores the token, redirects),
  `/console/{overview,imports,settings}`. `CONSOLE_URL` (api) and
  `VITE_CONSOLE_URL` (web) name that host; `WEB_URL` stays the digest host.
- `packages/core`: `Employer` gains `operatorEmail` and `slaHours`;
  `runEscalations` keeps taking the SLA as an argument. No other change.
- Email adapter: a magic-link template.

**Reversibility:** the sign-in pattern is a one-way door for the
operator's habits; the screens are two-way. The `kind` field keeps the
token format extensible without another migration of trust.

**Revisit when:** a second operator per employer is needed (roles), an
employer requires SSO, or the console gains an action that can change
pay-relevant data.

## Consequences

- The operator never needs a terminal: sign in, upload, adjust, read
  the metric. This removes the last piece of "developer as operator".
- Security of the console rests on the operator's mailbox, as the
  manager's page rests on theirs. Accepted for the same reasons as
  ADR-0004, with the shorter lifetime and the `kind` separation as the
  extra care an upload-capable role deserves.
- `scope.md` grows by one goal; the non-goal "no screen for the payroll
  accountant" is narrowed to "no gap list for the payroll accountant".
- One more email template, one more `Employer` field pair, one more
  migration before real data exists — cheap now, a data migration later.

## Alternatives considered

1. **Keep the terminal, add a friendlier CLI** — rejected: the operator
   is not a developer; a CLI still needs Node, a token file and a shell.
2. **Password login** — rejected as in ADR-0004: a reset flow and a
   password store for one user per employer, no gain over the mailbox.
3. **Reuse the operator API key as the login** — rejected: a shared
   static secret typed into a browser, never expiring, indistinguishable
   between the script and the person.
4. **Session cookie after the magic link** — rejected: cross-origin
   cookies between `digest.clockcover.com` and `api.clockcover.com` need
   `SameSite=None` and CSRF defences; a bearer token in `sessionStorage`
   is simpler and dies with the tab.
5. **Separate `apps/console`** — rejected: same stack, same auth
   mechanics, same deploy; a route prefix is enough until the console
   grows its own release cadence.
