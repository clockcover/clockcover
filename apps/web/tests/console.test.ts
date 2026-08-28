import { test } from "node:test";
import assert from "node:assert/strict";
import { consoleRoute, defaultRange, pct } from "../src/console-api.ts";

test("console routes", () => {
  assert.deepEqual(consoleRoute("/console"), { page: "signin" });
  assert.deepEqual(consoleRoute("/console/"), { page: "signin" });
  assert.deepEqual(consoleRoute("/console/overview"), { page: "overview" });
  assert.deepEqual(consoleRoute("/console/imports"), { page: "imports" });
  assert.deepEqual(consoleRoute("/console/settings"), { page: "settings" });
  assert.deepEqual(consoleRoute("/console/abc.def"), { page: "landing", token: "abc.def" });
  assert.equal(consoleRoute("/d/abc"), null);
  assert.deepEqual(consoleRoute("/", "app.clockcover.com"), { page: "signin" }, "console host: root is the sign-in");
  assert.equal(consoleRoute("/", "digest.clockcover.com"), null, "digest host: root is not the console");
  assert.equal(consoleRoute("/console/a/b"), null);
});

test("metric percentage", () => {
  assert.equal(pct(1, 2), "50%");
  assert.equal(pct(0, 0), "—");
  assert.equal(pct(2, 3), "67%");
});

test("default export range is the last 30 days", () => {
  assert.deepEqual(defaultRange(new Date("2026-08-28T10:00:00Z")), { from: "2026-07-29", to: "2026-08-28" });
});
