---
title: "ADR-0008: One language per employer — a locale column, two dictionaries, RTL for Hebrew"
type: adr
status: accepted
updated: 2026-08-28
tags: [data-model, frontend, backend]
superseded_by:
---

# ADR-0008: One language per employer — a locale column, two dictionaries, RTL for Hebrew

**Date:** 2026-08-28

## Context

The first prospective employers read Hebrew; the product was written in
English. Everything a person reads — digest and escalation emails,
sign-in links, the digest page, the console, the admin area, the site —
had to exist in both, and something had to decide which one a given
reader gets. The candidates were the reader's browser, each recipient's
own preference, or the employer.

Managers reach the product from an email link with no account
(ADR-0004), so there is no per-person profile to store a preference on;
the browser's language is unknown when the email is composed. The one
thing every email and page already has is the employer.

## Decision

**Language is a property of the employer.** `employers.locale`
(migration 0005, `en` | `he`, default `en`) is set by the owner when the
employer is created and editable by the operator in Settings. It
selects the language of every email sent for that employer and of every
page reached through that employer's links. Hebrew renders
right-to-left: `dir="rtl"` on the email body and on `<html>`, mirrored
layout in the portal, a Hebrew-capable face (Heebo) beside the Latin
one.

Copy lives in **two dictionaries** keyed the same way —
`apps/api/src/i18n.ts` (emails, date formatting) and
`apps/portal/src/i18n.ts` (pages) — and nowhere else; a missing key in
either language is a type error. Dates are formatted by hand in both so
that the email and the page a manager opens from it agree. Canonical
Hebrew terms are fixed in `glossary.md`.

The marketing site is static and has no employer: it is served at `/`
(English) and `/he/` (Hebrew), a one-function Worker sends a browser
whose `Accept-Language` prefers Hebrew to `/he/`, and the footer carries
the switch.

`packages/core` knows nothing about language; `Employer` carries
`locale` as a string the adapters read.

**Reversibility:** two-way door for the mechanism (a per-recipient
override would be one more column consulted before the employer's);
one-way for the data — once real employers exist, `locale` is a value
somebody chose and a migration must carry it.

**Revisit when:** an employer has managers who read different
languages (per-recipient locale), a third language is requested (a
third column in both dictionaries — cheap, but the date formatting and
RTL handling must be checked per language), or the site gains
employer-specific pages.

## Consequences

- One decision per employer, made at onboarding; nobody configures
  their own language and nobody sees a mixed-language email.
- Every new string is written twice, in the same commit, or the build
  fails. That is the cost, and the guarantee.
- RTL is a layout property of the whole page, not of a string; a
  component that hard-codes left/right breaks in Hebrew and is caught
  by looking at the Hebrew fixture employer.
- A manager whose own language differs from the employer's reads the
  employer's. Accepted until a real employer reports it.

## Alternatives considered

1. **Browser language (`Accept-Language`) everywhere** — rejected for
   emails (no browser when the email is composed) and for consistency
   between the email and the page it links to; kept only for the site's
   landing redirect.
2. **Per-recipient locale on `managers` and `employers.payroll_email`**
   — rejected for now: a column on a roster row the CSV does not carry,
   so it would be edited by hand, which the roster model forbids
   (ADR-0005 § Scope). Listed as the revisit trigger.
3. **One language per deployment (a Worker var)** — rejected: the
   first two employers already differ, and one worker serves all of
   them (ADR-0003).
4. **A translation library with message files** — rejected: two typed
   dictionaries are smaller than any library's runtime and give
   compile-time completeness; a library can wrap them later.
