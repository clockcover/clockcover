# Open Questions

Clarify with the domain expert.

- What form does the shift schedule usually take at the new place — also
  a closed system, or something more flexible?
- Exact SLA escalation threshold — how many days is it actually
  acceptable to wait for a manager's reaction before escalating?
- Do we need different logic for different employee types (shift/hourly
  vs. fixed schedule)?
- What notification format will managers actually read — is email
  enough, or should we target whatever messenger they already open daily
  (WhatsApp/Slack/Teams — depends on the company)?
- If a missing clock entry appears in a later import (`record_arrived`)
  without the manager doing anything, does that count as the manager
  having acted within the SLA, or should only explicit manager actions
  count? Affects the product's core metric — see ADR-0003.
