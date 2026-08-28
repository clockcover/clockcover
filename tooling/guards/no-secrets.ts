// Guard: no credentials in the repo. A leaked key lives in git history forever
// and has to be revoked — catching it before the commit is the only cheap fix.

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: "OpenAI/Anthropic key", re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Cloudflare token", re: /\bcfut_[A-Za-z0-9_-]{30,}\b/ },
  { name: "Resend key", re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // KEY = "value" style: a secret-ish name — or one ending in it, `CLOUDFLARE_API_TOKEN` — assigned a long opaque literal.
  { name: "assigned secret", re: /\b[\w-]*?(?:api[_-]?key|secret(?:[_-]?key)?|access[_-]?token|auth[_-]?token|token|password|passwd|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"]?(?!\$\{|process\.env|env\.|<|\{\{)[A-Za-z0-9+/_\-=.]{20,}['"]?(?![\w(])/i },
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

// Shell commands that would put a secret into the transcript (and so into the
// model's context) without writing any file. `node --env-file=.env` loads the
// file into the process, not the transcript, so `--env-file=` does not count.
const PROTECTED_PATH = /(?:^|[\s/'":]|(?<!--env-file)=)(?:\.env(?!\.(?:example|sample|template)\b)(?:\.[\w.-]+)?|\.dev\.vars|[\w.-]*\.pem|[\w.-]*\.key|id_rsa\S*|id_ed25519\S*|~?\/?\.(?:ssh|aws|netrc|config\/gh)(?:\/\S*)?|\.wrangler\/\S*|data\/real\/\S*|\.claude\/settings\.local\.json)(?=$|[\s'";|&)])/;
const READER = /^(?:\S+=\S+\s+)*(?:sudo\s+)?(?:cat|less|more|head|tail|grep|rg|sed|awk|bat|cut|sort|uniq|strings|xxd|hexdump|base64|cp|scp|rsync|source|\.|jq|yq|python3?|node|git\s+(?:show|diff|cat-file))\b/;
const ENV_DUMP = /^(?:\S+=\S+\s+)*(?:env|printenv|export\s+-p|set)\s*(?:$|[|;&>])|\becho\b.*\$\{?\w*(?:TOKEN|SECRET|KEY|PASSWORD|PASSWD)\w*\}?/i;

export function checkCommand(command: string): string[] {
  const out: string[] = [];
  for (const seg of command.split(/&&|\|\||;|\||\n/).map((s) => s.trim())) {
    if (READER.test(seg) && PROTECTED_PATH.test(seg)) out.push(`reads a protected file: \`${seg}\``);
    else if (ENV_DUMP.test(seg)) out.push(`dumps environment variables: \`${seg}\``);
  }
  return out;
}
