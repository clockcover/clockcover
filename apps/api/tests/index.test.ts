// The Worker entry refuses to start with a weak LINK_SECRET — every link's security rests on it.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const env = (secret: string) => ({
  DB: {} as D1Database, LINK_SECRET: secret, RESEND_API_KEY: "x", EMAIL_FROM: "a@example.com", WEB_URL: "https://w", CONSOLE_URL: "https://c",
  ADMIN_URL: "https://a", ADMIN_EMAIL: "o@example.com", SITE_URLS: "https://s", CONTACT_EMAIL: "h@example.com", SLA_HOURS: "48",
});

test("a LINK_SECRET shorter than 32 characters stops the worker with a clear message", async () => {
  const req = new Request("https://api.example.com/health");
  const ctx = {} as ExecutionContext;
  assert.throws(() => worker.fetch(req, env("short"), ctx), /LINK_SECRET must be at least 32 characters/);
  assert.throws(() => worker.fetch(req, env(""), ctx), /LINK_SECRET/);
  const res = await worker.fetch(req, env("a".repeat(32)), ctx);
  assert.equal(res.status, 200);
});
