import { test } from "node:test";
import assert from "node:assert/strict";
import { signLink, verifyLink } from "../src/link.ts";

const SECRET = "test-secret";
const NOW = new Date("2026-08-27T08:00:00Z");
const claims = { employerId: "emp-1", managerId: "mgr-north", exp: NOW.getTime() + 3_600_000 };

test("round-trips valid claims", async () => {
  const token = await signLink(claims, SECRET);
  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "url-safe, no padding");
  assert.deepEqual(await verifyLink(token, SECRET, NOW), { kind: "manager", ...claims });
});

test("rejects expiry, tampering, wrong secret and garbage", async () => {
  const token = await signLink(claims, SECRET);
  assert.equal(await verifyLink(token, SECRET, new Date(claims.exp)), null, "expired at exp");
  assert.equal(await verifyLink(token, "other-secret", NOW), null, "wrong secret");
  const [payload, sig] = token.split(".") as [string, string];
  const other = await signLink({ ...claims, managerId: "mgr-south" }, SECRET);
  assert.equal(await verifyLink(`${other.split(".")[0]}.${sig}`, SECRET, NOW), null, "payload swapped");
  assert.equal(await verifyLink(`${payload}.${sig.slice(0, -2)}xx`, SECRET, NOW), null, "signature altered");
  for (const bad of ["", "a", "a.b", "..", "%%%.%%%"]) assert.equal(await verifyLink(bad, SECRET, NOW), null, JSON.stringify(bad));
});
