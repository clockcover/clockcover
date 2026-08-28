// Which language the front page should open in for a visitor who has not chosen.
// Only the root path is redirected; every other URL is explicit already.

export type Lang = "en" | "he";

/** Parses Accept-Language and returns "he" when Hebrew outranks English (or English is absent). */
export function pickLanguage(acceptLanguage: string | null | undefined): Lang {
  if (!acceptLanguage) return "en";
  let he = 0, en = 0;
  for (const part of acceptLanguage.split(",")) {
    const [tagRaw, ...params] = part.trim().split(";");
    const tag = (tagRaw ?? "").trim().toLowerCase();
    if (!tag) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isNaN(q)) continue;
    if (tag === "he" || tag.startsWith("he-") || tag === "iw" || tag.startsWith("iw-")) he = Math.max(he, q);
    else if (tag === "en" || tag.startsWith("en-")) en = Math.max(en, q);
  }
  return he > en ? "he" : "en";
}
