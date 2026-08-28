import { test } from "node:test";
import assert from "node:assert/strict";
import { check, appliesTo, checkCommand } from "../no-secrets.ts";

// Fake material: shapes match, values are made up.
test("flags well-known token formats", () => {
  const cases: Record<string, string> = {
    "private key block": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n",
    "AWS access key": "AKIAABCDEFGHIJKLMNOP",
    "GitHub token": "ghp_" + "a".repeat(36),
    "OpenAI/Anthropic key": "sk-ant-" + "x".repeat(30),
    "Slack token": "xoxb-1234567890-abcdefghij",
    "Cloudflare token": "cfut_" + "Ab9".repeat(12),
    "Resend key": "re_AbCd1234_" + "x".repeat(24),
    "JWT": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  };
  for (const [name, sample] of Object.entries(cases)) {
    assert.match(check(sample)[0] ?? "", new RegExp(`^${name}`), name);
  }
});
test("flags secret-ish assignments with opaque values", () => {
  assert.equal(check('CLOUDFLARE_API_TOKEN=abcd1234efgh5678ijkl9012mnop').length, 1, "a name ending in TOKEN counts");
  assert.equal(check('RESEND_API_KEY="abcd1234efgh5678ijkl9012mnop"').length, 1, "a name ending in API_KEY counts");
  assert.equal(check('api_key = "abcd1234efgh5678ijkl9012mnop"').length, 1);
  assert.equal(check("password: Sup3rS3cretPassw0rdValue!!").length, 1);
  assert.equal(check("token: abcd1234efgh5678ijkl9012mnop").length, 1);
  assert.equal(check("CLOUDFLARE_ZONE=abcd1234efgh5678ijkl9012mnop").length, 0, "unknown name alone is not enough");
});
test("flags Cloudflare and Resend tokens only in their real shapes", () => {
  assert.equal(check("cfut_short").length, 0);
  assert.equal(check("re_abc_" + "x".repeat(30)).length, 0, "Resend keys have an 8-char middle segment");
});
test("allows env references, placeholders, types and short values", () => {
  for (const s of [
    "api_key = process.env.API_KEY", "API_KEY=${API_KEY}", "apiKey: env.CF_TOKEN", "password: <your-password>",
    "secret: string", "token = '{{ secrets.TOKEN }}'", "password: hunter2", "const accessToken = await getToken();",
    "const escalationToken = escalationTokenFromPath(location.pathname);",
  ]) assert.deepEqual(check(s), [], s);
});
test("truncates the reported match", () => {
  const hit = check("ghp_" + "a".repeat(40))[0] ?? "";
  assert.ok(hit.length < 60 && hit.endsWith("…"));
});
test("appliesTo skips lockfiles, tests and binaries", () => {
  for (const p of ["pnpm-lock.yaml", "tooling/guards/tests/x.test.ts", "apps/web/src/a.spec.ts", "docs/img.png", ".gitignore"]) {
    assert.ok(!appliesTo(p), p);
  }
  for (const p of ["apps/api/wrangler.toml", ".env.example", "packages/core/src/store.ts", "docs/architecture.md"]) {
    assert.ok(appliesTo(p), p);
  }
});

test("checkCommand flags reading protected files", () => {
  for (const c of [
    "cat .env", "cat apps/api/.env.local", "less ~/.aws/credentials", "head -n 5 .dev.vars",
    "grep TOKEN .env.production", "cat ~/.ssh/id_ed25519", "source .env", "cp .env /tmp/x",
    "sed -n 1p data/real/employees.csv", "ls && cat .env", "ls\ncat .env", "cat .claude/settings.local.json",
    "jq .env.CLOUDFLARE_API_TOKEN .claude/settings.local.json", "yq . .dev.vars", "python3 -c \"print(open('.env').read())\"",
    "python -c \"print(open('.dev.vars').read())\"", "node -e \"console.log(require('fs').readFileSync('.env','utf8'))\"",
    "git show HEAD:.env", "git diff .env", "git cat-file -p HEAD:.dev.vars",
  ]) assert.equal(checkCommand(c).length, 1, c);
});
test("checkCommand flags environment dumps", () => {
  for (const c of ["env", "env | grep TOKEN", "printenv", "export -p", "set | grep API", "echo $CLOUDFLARE_API_TOKEN", "echo ${DB_PASSWORD}"]) {
    assert.equal(checkCommand(c).length, 1, c);
  }
});
test("checkCommand allows ordinary commands", () => {
  for (const c of [
    "cat package.json", "cat .env.example", "grep -r Store packages/core", "ls -la", "git status",
    "echo $HOME", "echo $PATH", "printenv HOME", "cat .env.template", "set -e", "cat docs/privacy.md",
    "node --env-file=.env x.ts", "node --env-file=.dev.vars scripts/upload.ts roster e1 f.csv", "jq .name package.json",
    "git show HEAD:package.json", "git diff --stat", "python3 -m http.server", "node x.ts",
  ]) assert.deepEqual(checkCommand(c), [], c);
});
