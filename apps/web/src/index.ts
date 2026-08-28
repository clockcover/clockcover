// Static site with one behaviour the assets alone cannot do: the bare root opens in
// the visitor's language. An explicit choice (`?lang=en|he`, made by the footer switch)
// is remembered in a cookie and wins over Accept-Language; Hebrew → /he/. Every other
// request is served straight from the assets directory.
import { pickLanguage } from "./language.ts";
import type { Lang } from "./language.ts";

interface Env { ASSETS: { fetch(request: Request): Promise<Response> } }

const COOKIE = "lang";
const asLang = (v: string | null | undefined): Lang | null => (v === "en" || v === "he" ? v : null);
const langCookie = (cookieHeader: string | null): Lang | null =>
  asLang(cookieHeader?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1));
const setCookie = (l: Lang) => `${COOKIE}=${l}; Max-Age=31536000; Path=/; Secure; SameSite=Lax`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const chosen = asLang(url.searchParams.get("lang"));
    if (url.pathname === "/" && request.method === "GET") {
      const lang = chosen ?? langCookie(request.headers.get("cookie")) ?? pickLanguage(request.headers.get("accept-language"));
      if (lang === "he") {
        const h = new Headers({ location: "/he/", vary: "Accept-Language, Cookie", "cache-control": "private, no-store" });
        if (chosen) h.set("set-cookie", setCookie(chosen));
        return new Response(null, { status: 302, headers: h });
      }
    }
    const res = await env.ASSETS.fetch(request);
    if (url.pathname === "/" || chosen) {
      const h = new Headers(res.headers);
      if (url.pathname === "/") h.set("vary", "Accept-Language, Cookie");
      if (chosen) { h.set("set-cookie", setCookie(chosen)); h.set("cache-control", "private, no-store"); }
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
} satisfies { fetch(request: Request, env: Env): Promise<Response> };
