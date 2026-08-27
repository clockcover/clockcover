// Guard: no credentials in the repo. A leaked key lives in git history forever
// and has to be revoked — catching it before the commit is the only cheap fix.

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: "OpenAI/Anthropic key", re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // KEY = "value" style: a secret-ish name assigned a long opaque literal.
  { name: "assigned secret", re: /\b(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|password|passwd|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"]?(?!\$\{|process\.env|env\.|<|\{\{)[A-Za-z0-9+/_\-=.]{20,}['"]?/i },
];

// Files that are not source of truth or legitimately hold hashes / fake material.
const SKIP = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.gitignore)$|(?:^|\/)tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf)$/i;

export function appliesTo(path: string): boolean {
  return !SKIP.test(path);
}

export function check(text: string): string[] {
  const out: string[] = [];
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (m) out.push(`${name}: ${m[0].length > 24 ? m[0].slice(0, 24) + "…" : m[0]}`);
  }
  return out;
}
