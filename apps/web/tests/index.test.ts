import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

// Fake assets binding: answers with the path it was asked for, so tests can see what was served.
const env = { ASSETS: { fetch: async (req: Request) => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 }) } };
const get = (path: string, headers: Record<string, string> = {}) => worker.fetch(new Request(`https://clockcover.com${path}`, { headers }), env);

test("Hebrew browser at the root → /he/", async () => {
  const res = await get("/", { "accept-language": "he-IL,he;q=0.9,en;q=0.5" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/he/");
  assert.equal(res.headers.get("set-cookie"), null, "a guess is not remembered");
});

test("/?lang=en serves English and remembers the choice", async () => {
  const res = await get("/?lang=en", { "accept-language": "he" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "asset:/");
  assert.match(res.headers.get("set-cookie") ?? "", /^lang=en; Max-Age=31536000; Path=\/; Secure; SameSite=Lax$/);
});

test("the cookie beats Accept-Language", async () => {
  const res = await get("/", { "accept-language": "he", cookie: "other=1; lang=en" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "asset:/");
  const back = await get("/", { "accept-language": "en", cookie: "lang=he" });
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("location"), "/he/");
});

test("/?lang=he redirects to /he/ and remembers; the round trip does not loop", async () => {
  const toHe = await get("/?lang=he");
  assert.equal(toHe.status, 302);
  assert.equal(toHe.headers.get("location"), "/he/");
  assert.match(toHe.headers.get("set-cookie") ?? "", /^lang=he;/);
  const he = await get("/he/", { cookie: "lang=he" });
  assert.equal(he.status, 200, "/he/ is never redirected");
  assert.equal(await he.text(), "asset:/he/");
  const en = await get("/?lang=en", { cookie: "lang=he", "accept-language": "he" });
  assert.equal(en.status, 200, "the switch back to English wins over the old cookie");
  const sub = await get("/help/?lang=en", { cookie: "lang=he" });
  assert.equal(sub.status, 200);
  assert.match(sub.headers.get("set-cookie") ?? "", /^lang=en;/, "the switch on any page sets the cookie");
  const plain = await get("/help/");
  assert.equal(plain.headers.get("set-cookie"), null);
});
