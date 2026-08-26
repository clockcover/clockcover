# Privacy

- **Real employee data belongs to the employer**, not to whoever operates
  it technically. Use synthetic data only — made-up employees, managers,
  schedules, and clock entries — until the employer gives explicit
  permission to connect real data. This is not a secret side project,
  it's a formally proposed process.
- If the attendance system uses **biometrics** (fingerprint, etc.),
  that's typically a separately protected data category under local
  privacy law — check the applicable jurisdiction's rules before
  touching it. Never touch biometric data directly — only derived events
  (showed up / didn't), never the biometric templates themselves.
- Keep raw files (PDF/CSV) for the minimum time needed — delete after
  parsing, keep only normalized records.
- TTL and encryption at rest for anything touching real employees, once
  we get there.
