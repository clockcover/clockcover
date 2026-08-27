---
title: "ADR-0004: Managers reach their digest through a signed, expiring link — no accounts"
type: adr
status: accepted
updated: 2026-08-27
tags: [security, frontend, backend]
superseded_by:
---

# ADR-0004: Managers reach their digest through a signed, expiring link — no accounts

**Date:** 2026-08-27

## Context

The digest email tells a manager which of their team's clock entries are
missing. To act on it they need a page that shows the same list and lets
them mark a gap resolved (`resolveByManager` in `packages/core`). How
they reach that page is the last open question before `apps/web` can be
built (ADR-0003 § Deferred).

What we know about the users:

- A dozen department managers per employer, not hundreds. They did not
  ask for this tool; the payroll accountant did. Every step between
  "email arrives" and "gap resolved" costs adoption.
- They read email on a phone as often as on a desk. Passwords they must
  remember for a once-a-day tool will be forgotten; a login page is the
  point where the digest stops being read.
- One employer per deployment for the MVP (ADR-0003). No SSO to
  integrate with, and no requirement for one yet.

What is at stake if access is wrong:

- The page shows employee names and which days they missed a clock entry
  — personal data, but not sensitive (no pay, no biometrics; see
  `privacy.md`). It is the same list the manager already has in email.
- The only write is "mark resolved" on a gap already routed to that
  manager. A wrong resolve delays an escalation by one SLA; the events
  table records who did it and when. It cannot alter pay.
- The pattern managers learn (click the link vs. sign in) is a one-way
  door: changing it later re-trains every user.

The import endpoints (`POST /employers/:id/roster`, `/imports`) are a
separate audience — the operator uploading exports — and are covered
here only to say they stay separate.

## Decision

**Each digest email carries a link signed for that manager. Opening it
shows their digest; from it they can mark gaps resolved. There are no
accounts, passwords, or sessions.**

### The link

`https://<web>/d/<token>` where `token` is an HMAC-SHA-256-signed
payload: `{ employerId, managerId, exp }`, base64url, keyed by a
`LINK_SECRET` set with `wrangler secret put`. Stateless: no table of
issued tokens.

- **Scope:** one manager. The page and every action derived from it
  operate on `gaps.manager_id = token.managerId` only — the same
  snapshot the digest was built from. A manager cannot reach another
  manager's list by editing the URL; the signature covers the ids.
- **Lifetime:** `exp` = issue time + 14 days. Long enough that
  yesterday's email still works after a holiday, short enough that a
  forwarded email goes dead within the pay cycle. Every daily digest
  carries a fresh link, so an active manager never sees an expired one.
- **Revocation:** rotate `LINK_SECRET`. All outstanding links die; the
  next digest reissues them. Per-manager revocation is not needed at
  this scale — a leaked link can at worst mark that manager's gaps
  resolved, which the accountant sees in the event log.
- **Resolve action:** `POST /d/<token>/gaps/:gapId/resolve` — the token
  in the path, verified again on the API, `gapId` checked against the
  token's `managerId` before `resolveByManager` runs. No cookie, no
  CSRF surface.

### What is deliberately not built

- **No login page, no passwords, no magic-link-to-session flow.** A
  magic link that then sets a session cookie is the same trust decision
  (possession of the inbox) plus a session store to manage.
- **No per-manager key rotation, no token table.** Stateless HMAC keeps
  `apps/api` free of session state; ADR-0001's D1 → Postgres move stays
  one `Store` implementation.
- **Import endpoints keep the operator API key** (`API_KEY`, bearer
  header). Different audience, different secret; they are never linked
  from an email.

### Consequences for the code

- `apps/api`: `signLink` / `verifyLink` (Web Crypto HMAC, available on
  Workers and Node), `GET /d/:token` returning the manager's open gaps
  with employee names, `POST /d/:token/gaps/:gapId/resolve`. The digest
  email adapter gets `webUrl` and puts the link in the body — the field
  already exists in `EmailConfig` for this.
- `apps/web`: one route, `/d/:token`, that calls the two endpoints. No
  auth state, no router guards.
- `packages/core`: **nothing.** Access is an adapter concern; the core
  keeps taking `managerId` as an argument.
- New secret `LINK_SECRET`; `wrangler.jsonc` gets `WEB_URL`.

**Reversibility:** one-way door for the users (the habit "click the
link in the email" is what they learn). Two-way for the code: a login
flow later would sit in front of the same two endpoints; the token
becomes a session instead of an email link.

**Revisit when:** a second employer shares one deployment (a manager
with teams at two employers), an employer requires SSO, or the page
grows a write that can affect pay. Any of those reopens "possession of
the inbox is enough".

## Consequences

- Zero-friction path from email to action: one tap, on any device, no
  onboarding. This is the property the whole product depends on.
- Security rests on the manager's mailbox. Anyone who can read the
  email can act as the manager for 14 days. Accepted because the write
  is low-impact, attributable, and reversible (the gap stays in the
  event log; the accountant sees resolutions), and because the same
  people already receive the list itself by email.
- Forwarded digests work for the recipient — a feature for deputies, a
  risk for over-sharing. Mitigated by the 14-day expiry and by the page
  naming whose digest it is.
- No user directory to maintain: managers exist only as roster rows.
- Rotating `LINK_SECRET` is the only emergency lever; it logs everyone
  out at once. Fine at this scale.

## Alternatives considered

1. **Email + password login** — rejected: the one step most likely to
   lose the manager; a password store and reset flow for a dozen users
   of a once-a-day tool; no security gain proportional to the data
   shown.
2. **Magic link that creates a session** — rejected for now: same trust
   root (the inbox) plus a session table, cookies, and CSRF handling.
   Becomes the right answer if managers ever need to navigate beyond
   their own digest.
3. **SSO / OIDC with the employer's identity provider** — rejected for
   the MVP: real integration cost per employer, and no employer has
   asked. Listed as a revisit trigger.
4. **Unsigned per-manager URL (a random id)** — rejected: needs a table
   to look up, cannot expire without state, and leaks forever once
   forwarded.
5. **Resolve by replying to the email** — rejected: parsing inbound mail
   is brittle and needs a receiving domain; keeps the decision open as
   a later convenience on top of the link.
