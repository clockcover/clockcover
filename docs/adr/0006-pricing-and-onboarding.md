---
title: "ADR-0006: Per-employer subscription by headcount; onboarding by request, not self-serve"
type: adr
status: accepted
updated: 2026-08-28
tags: [business, scope, onboarding]
superseded_by:
---

# ADR-0006: Per-employer subscription by headcount; onboarding by request, not self-serve

**Date:** 2026-08-28

## Context

The product runs end to end for one synthetic employer. Two questions
were open in `open-questions.md` and are really one decision: how an
employer gets in, and what they pay. Both are one-way doors — the
onboarding path is what prospects learn first, and a price, once
published, anchors every later conversation.

What we know about the buyer:

- The person who feels the pain and signs is the payroll accountant (or
  whoever owns payroll). They buy for the whole employer, not per seat
  of their own.
- The value scales with the number of tracked employees: more people
  clocking → more gaps → more accountant time saved and more managers
  routed. It does *not* scale with the number of managers, and charging
  per manager would punish the exact behaviour we want (spreading
  responsibility to more managers).
- There are zero paying customers. Any price now is a hypothesis to test
  in the first conversations, not a fact to defend.
- ADR-0001 fixes the trigger for leaving Cloudflare: the first paying
  customer or the first real employee data. Pricing therefore also has
  to cover self-hosted infrastructure later.

## Decision

### Money: one subscription per employer, tiered by tracked headcount

- Monthly subscription, **per employer** (one deployment tenant).
- Tiers by the number of **active employees on the roster** — the count
  the product already has, visible to the operator, and honest about
  value. Managers, digests and gaps are unlimited in every tier.
- **30 days free**, no card, on the employer's own export files — the
  trial *is* the onboarding.
- Cancellation any time; data export (roster, corrections CSV) is
  always available so leaving is not hostage-taking.

List — confirmed by the owner on 2026-08-28 and published on the site:

| Tier | Active employees | Monthly |
|---|---|---|
| Team | up to 50 | €49 |
| Company | up to 200 | €149 |
| Site | up to 500 | €349 |
| Larger | over 500 | by agreement (and the trigger for self-hosting) |

The numbers were chosen to be low enough not to need procurement at a
50-person employer and high enough that one avoided payroll correction
per month pays for the tier. They may still move after the first
conversations; the *shape* (per employer, by headcount, no per-manager
fee, free month) is the harder decision.

### Onboarding: by request, not self-serve

- The site offers **Request access**: name, work email, employer, rough
  headcount, which attendance system. Today this is a `mailto:` to
  `hello@clockcover.com`; a form that emails us is a small follow-up.
- The owner creates the employer in the **admin area**
  (`admin.clockcover.com`, same worker as the portal and the console):
  name, payroll email, operator email, timezone. Creating it emails the
  operator their first console sign-in link (ADR-0005). The admin area
  also lists every employer with active headcount, operator, last import
  and open gaps — the billing input and the health check in one table —
  and can change an employer's operator. It is signed in by magic link
  to the owner's address (`ADMIN_EMAIL`, a Worker var), token
  `kind: "admin"`, 7 days; mutually exclusive with the other token kinds.
  No sign-up page, no password, no card.
- Self-serve sign-up is deliberately **not** built until the second
  paying employer: before that we do not know what to ask at
  registration, and every early customer conversation is worth more
  than the friction it removes.

### What the site says

The marketing page shows the four tiers with their prices and states
the model: per employer, by headcount, managers unlimited, 30 days free
on your own files, access by request.

**Reversibility:** one-way door for the shape (customers remember "per
employer, by headcount"); two-way for the numbers while there are no
paying customers. Self-serve can be added without changing the model.

**Revisit when:** the first paying employer (confirm or move the
numbers; start ADR for self-hosting per ADR-0001), the second paying
employer (reconsider self-serve sign-up), or an employer whose tracked
headcount the roster does not reflect (contractors, seasonal staff).

## Consequences

- Sales motion is conversations, not a funnel — right for zero-to-three
  customers, wrong for thirty. That is the revisit trigger.
- The roster becomes a billing input; `employees.active` has to be
  right. A roster re-upload deactivates whoever is missing from it
  (`core-design.md` § Roster), so headcount follows the file.
- No payment provider, invoicing or metering is built now; the first
  invoices are manual. Stripe (or similar) comes with the second
  customer.
- `scope.md` gains the model as a goal and keeps self-serve as a
  non-goal for now; `open-questions.md` closes both items.

## Alternatives considered

1. **Per manager per month** — rejected: taxes the behaviour the product
   exists to create (more managers owning their own gaps); managers do
   not buy.
2. **Per employee per month (metered)** — rejected for now: fairer in
   theory, but invoices that move every month are a procurement burden
   at small employers and need metering we have not built. Tiers
   approximate it.
3. **Per gap or per digest** — rejected: pays us more when the employer
   does worse; misaligned.
4. **Free while on Cloudflare, paid after self-hosting** — rejected: the
   ADR-0001 migration is triggered *by* the first paying customer;
   nothing would ever trigger it.
5. **Self-serve sign-up with a card from day one** — rejected: optimises
   a funnel that does not exist yet and loses the conversations we need
   to set the price.
