import { test } from "node:test";
import assert from "node:assert/strict";
import { check, appliesTo } from "../synthetic-only.ts";

test("flags real-looking email", () => {
  assert.deepEqual(check("dana.levi@gmail.com"), ["email outside example domains: dana.levi@gmail.com"]);
});
test("allows example.com / .test emails", () => {
  assert.deepEqual(check("a@example.com b@mail.example.org c@acme.test"), []);
});
test("flags phone numbers in common formats", () => {
  assert.equal(check("+972 50 123 4567").length, 1);
  assert.equal(check("050-1234567").length, 1);
  assert.equal(check("+1 (555) 010-9999").length, 1);
});
test("ignores dates, ids, timestamps and package specs", () => {
  assert.deepEqual(check("2026-08-27 08:00 emp-00042 gap_id=12345678 pnpm@11.11.0 @scope/pkg@1.2.3"), []);
});
test("appliesTo targets fixtures and data formats", () => {
  assert.ok(appliesTo("packages/core/fixtures/employees.ts"));
  assert.ok(appliesTo("apps/api/seed/shifts.csv"));
  assert.ok(appliesTo("x/y.json"));
  assert.ok(!appliesTo("packages/core/matching/detect.ts"));
  assert.ok(!appliesTo("docs/scope.md"));
});
test("appliesTo skips tooling manifests", () => {
  for (const p of ["package.json", "apps/api/package.json", "tsconfig.base.json", ".commitlintrc.json", "vitest.config.json"]) {
    assert.ok(!appliesTo(p), p);
  }
});
