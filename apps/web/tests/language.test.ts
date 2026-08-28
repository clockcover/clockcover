import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLanguage } from "../src/language.ts";

test("Hebrew browsers get Hebrew, everyone else English", () => {
  assert.equal(pickLanguage("he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7"), "he");
  assert.equal(pickLanguage("en-US,en;q=0.9,he;q=0.8"), "en");
  assert.equal(pickLanguage("he"), "he");
  assert.equal(pickLanguage("iw-IL"), "he", "legacy Hebrew tag");
  assert.equal(pickLanguage("ru-RU,ru;q=0.9"), "en", "no preference between the two → English");
  assert.equal(pickLanguage(""), "en");
  assert.equal(pickLanguage(null), "en");
  assert.equal(pickLanguage("he;q=0,en;q=0.5"), "en", "Hebrew explicitly refused");
  assert.equal(pickLanguage("he;q=bogus,en"), "en", "garbage q is ignored");
});
