import { test } from "node:test";
import assert from "node:assert/strict";
import { apiError, setLocale, tr } from "../src/i18n.ts";
import { ApiError } from "../src/api.ts";

test("known server messages are translated, unknown ones fall back", () => {
  setLocale("en", false);
  assert.equal(apiError(new ApiError(409, "already resolved")), "This gap was already closed.");
  assert.equal(apiError(new ApiError(400, "invalid csv: line 3: two rows for E1 on 2026-08-01")), "The file is not valid CSV. line 3: two rows for E1 on 2026-08-01");
  assert.equal(apiError(new ApiError(500, "internal error")), "Server error. Please try again in a moment.");
  assert.equal(apiError(new ApiError(502, "Bad Gateway")), "Something went wrong. Please try again.");
  assert.equal(apiError(new TypeError("Failed to fetch"), "c.signin.api"), "Could not reach the API.");
  setLocale("he", false);
  assert.equal(apiError(new ApiError(401, "sign in required")), "נדרשת כניסה.");
  setLocale("en", false);
});

test("the payroll accountant is a person in both languages", () => {
  assert.equal(tr("en", "sla.soon", { h: 3 }), "Escalates to the payroll accountant in 3 h");
  assert.match(tr("he", "sla.soon", { h: 3 }), /חשב\/ת השכר/);
});
