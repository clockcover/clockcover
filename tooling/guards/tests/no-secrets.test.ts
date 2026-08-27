import { test } from "node:test";
import assert from "node:assert/strict";
import { check, appliesTo } from "../no-secrets.ts";

// Fake material: shapes match, values are made up.
test("flags well-known token formats", () => {
  const cases: Record<string, string> = {
    "private key block": "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n",
    "AWS access key": "AKIAABCDEFGHIJKLMNOP",
    "GitHub token": "ghp_" + "a".repeat(36),
    "OpenAI/Anthropic key": "sk-ant-" + "x".repeat(30),
    "Slack token": "xoxb-1234567890-abcdefghij",
    "JWT": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  };
  for (const [name, sample] of Object.entries(cases)) {
    assert.match(check(sample)[0] ?? "", new RegExp(`^${name}`), name);
  }
});
test("flags secret-ish assignments with opaque values", () => {
  assert.equal(check('CLOUDFLARE_API_TOKEN=abcd1234efgh5678ijkl9012mnop').length, 0, "unknown name alone is not enough");
  assert.equal(check('api_key = "abcd1234efgh5678ijkl9012mnop"').length, 1);
  assert.equal(check("password: Sup3rS3cretPassw0rdValue!!").length, 1);
});
test("allows env references, placeholders, types and short values", () => {
  for (const s of [
    "api_key = process.env.API_KEY", "API_KEY=${API_KEY}", "apiKey: env.CF_TOKEN", "password: <your-password>",
    "secret: string", "token = '{{ secrets.TOKEN }}'", "password: hunter2", "const accessToken = await getToken();",
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
