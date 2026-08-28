// Every English page has a Hebrew twin with the same anchors, the same prices and days,
// and hreflang links pointing at each other — so a reader in either language sees the same offer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC = join(import.meta.dirname, "..", "public");
const SITE = "https://clockcover.com";

function pages(dir: string, skip: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (p === skip) return [];
    if (statSync(p).isDirectory()) return pages(p, skip);
    return name === "index.html" ? [relative(PUBLIC, dir).replaceAll("\\", "/")] : [];
  });
}
const HE = join(PUBLIC, "he");
const en = pages(PUBLIC, HE).sort(); // "" for the root, "help", "about", …
const he = pages(HE, "").map((p) => (p === "" ? "" : p.replace(/^he\/?/, ""))).sort();
const read = (rel: string) => readFileSync(join(PUBLIC, rel, "index.html"), "utf8");
const all = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => m[1] ?? m[0]).sort();
const url = (rel: string) => `${SITE}/${rel ? `${rel}/` : ""}`;

test("the same set of pages exists in both languages", () => {
  assert.deepEqual(he, en);
});

for (const rel of en) {
  const enHtml = read(rel), heHtml = read(rel ? `he/${rel}` : "he");
  test(`${url(rel)} ↔ ${url(rel ? `he/${rel}` : "he")}`, () => {
    assert.deepEqual(all(heHtml, /\bid="([^"]+)"/g), all(enHtml, /\bid="([^"]+)"/g), "same anchors");
    for (const token of ["$20", "$50", "$100", "90"]) {
      const re = new RegExp(`(?<![\\d$])${token.replace("$", "\\$")}(?!\\d)`, "g");
      assert.equal(all(heHtml, re).length, all(enHtml, re).length, `same number of "${token}"`);
    }
    assert.ok(enHtml.includes(`hreflang="he" href="${url(rel ? `he/${rel}` : "he")}"`), "EN points at HE");
    assert.ok(heHtml.includes(`hreflang="en" href="${url(rel)}"`), "HE points at EN");
    assert.ok(enHtml.includes(`hreflang="en" href="${url(rel)}"`), "EN names itself");
    assert.ok(heHtml.includes(`hreflang="he" href="${url(rel ? `he/${rel}` : "he")}"`), "HE names itself");
    assert.match(heHtml, /<html lang="he" dir="rtl">/);
  });
}
