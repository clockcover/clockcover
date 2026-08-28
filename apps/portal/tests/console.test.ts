import { test } from "node:test";
import assert from "node:assert/strict";
import { consolePath, consoleRoute, defaultRange, pct } from "../src/console-api.ts";
import { adminPath, adminRoute } from "../src/admin-api.ts";

test("console routes", () => {
  assert.deepEqual(consoleRoute("/console"), { page: "signin" });
  assert.deepEqual(consoleRoute("/console/"), { page: "signin" });
  assert.deepEqual(consoleRoute("/console/overview"), { page: "overview" });
  assert.deepEqual(consoleRoute("/console/imports"), { page: "imports" });
  assert.deepEqual(consoleRoute("/console/settings"), { page: "settings" });
  assert.deepEqual(consoleRoute("/console/abc.def"), { page: "landing", token: "abc.def" });
  assert.equal(consoleRoute("/d/abc"), null);
  assert.deepEqual(consoleRoute("/", "console.clockcover.com"), { page: "signin" }, "console host: root is the sign-in");
  assert.equal(consoleRoute("/", "portal.clockcover.com"), null, "digest host: root is not the console");
  assert.equal(consoleRoute("/console/a/b"), null);
  // own host: no prefix in the address, the old prefixed links still work
  assert.deepEqual(consoleRoute("/overview", "console.clockcover.com"), { page: "overview" });
  assert.deepEqual(consoleRoute("/abc.def", "console.clockcover.com"), { page: "landing", token: "abc.def" });
  assert.deepEqual(consoleRoute("/console/overview", "console.clockcover.com"), { page: "overview" });
  assert.equal(consoleRoute("/overview", "portal.clockcover.com"), null);
  assert.equal(consolePath("overview", "console.clockcover.com"), "/overview");
  assert.equal(consolePath("signin", "console.clockcover.com"), "/");
  assert.equal(consolePath("overview", "localhost"), "/console/overview");
  assert.equal(consolePath("signin", "localhost"), "/console");
});

test("metric percentage", () => {
  assert.equal(pct(1, 2), "50%");
  assert.equal(pct(0, 0), "—");
  assert.equal(pct(2, 3), "67%");
});

test("default export range is the last 30 days", () => {
  assert.deepEqual(defaultRange(new Date("2026-08-28T10:00:00Z")), { from: "2026-07-29", to: "2026-08-28" });
});

test("admin routes: own host root, /admin paths, never the console's", () => {
  assert.deepEqual(adminRoute("/", "admin.clockcover.com"), { page: "signin" });
  assert.equal(adminRoute("/", "console.clockcover.com"), null);
  assert.deepEqual(adminRoute("/admin"), { page: "signin" });
  assert.deepEqual(adminRoute("/admin/employers"), { page: "employers" });
  assert.deepEqual(adminRoute("/admin/tok.en"), { page: "landing", token: "tok.en" });
  assert.equal(adminRoute("/console/overview"), null);
  assert.deepEqual(adminRoute("/employers", "admin.clockcover.com"), { page: "employers" });
  assert.deepEqual(adminRoute("/tok.en", "admin.clockcover.com"), { page: "landing", token: "tok.en" });
  assert.deepEqual(adminRoute("/admin/employers", "admin.clockcover.com"), { page: "employers" });
  assert.equal(adminPath("employers", "admin.clockcover.com"), "/employers");
  assert.equal(adminPath("signin", "localhost"), "/admin");
});
