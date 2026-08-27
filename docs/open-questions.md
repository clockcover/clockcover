# Open Questions

Clarify with the domain expert.

- What form does the shift schedule usually take at the new place — also
  a closed system, or something more flexible?
- Exact SLA escalation threshold — how long is it actually acceptable
  to wait for a manager's reaction before escalating (docs assume 48 h),
  and is that counted in business or calendar days?
- Which timezone defines "today" for the daily digest and for
  `digest_date`? The code uses UTC until an employer timezone is
  configured; for an employer east of UTC an 8:00 job would otherwise
  file the digest under the previous day.
- Can an employee have more than one shift on a day (split shifts), or
  more than one clock-in/out pair? The schema currently holds one of
  each per employee per day.
- Where does the employee → manager roster come from — an HR export,
  the attendance system, or maintained by hand? Today it is a CSV the
  operator uploads.
- Do we need different logic for different employee types (shift/hourly
  vs. fixed schedule)?
- What notification format will managers actually read — is email
  enough, or should we target whatever messenger they already open daily
  (WhatsApp/Slack/Teams — depends on the company)?
- If a missing clock entry appears in a later import (`record_arrived`)
  without the manager doing anything, does that count as the manager
  having acted within the SLA, or should only explicit manager actions
  count? Affects the product's core metric — see ADR-0003.
