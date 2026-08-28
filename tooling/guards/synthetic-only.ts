// Guard: synthetic data only (docs/privacy.md) — in data files, emails must use
// reserved example domains and nothing may look like a phone number.

const ALLOWED_EMAIL_DOMAINS = /@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|test|invalid|localhost)$/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
// +972 50 123 4567 / 050-1234567 / +1 (555) 010-9999 — 9..15 digits with separators.
const PHONE = /(?<![\w.])(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)\d{3}[\s-]?\d{4}(?![\w.])/g;

const DATA_FILE = /(?:^|\/)(?:fixtures?|seeds?|synthetic)\/|\.(?:csv|json|sql|xlsx?)$/i;
// Tooling manifests match *.json but hold package metadata, not employee data.
const CONFIG_FILE = /(?:^|\/)(?:package(?:-lock)?|tsconfig[^/]*|\.[\w-]+rc|[^/]+\.config)\.json$/i;

/** Paths where employee-like data may live; the guard applies only there. */
export function appliesTo(path: string): boolean {
  return DATA_FILE.test(path) && !CONFIG_FILE.test(path);
}

export function check(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(EMAIL) ?? []) {
    if (!ALLOWED_EMAIL_DOMAINS.test(m)) out.push(`email outside example domains: ${m}`);
  }
  for (const m of text.match(PHONE) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) out.push(`phone/ID-like number: ${m.trim()}`);
  }
  return out;
}
