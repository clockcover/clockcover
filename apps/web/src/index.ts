// Static site with one behaviour the assets alone cannot do: the bare root opens in
// the visitor's language (Accept-Language), Hebrew → /he/. Every other request is
// served straight from the assets directory.
import { pickLanguage } from "./language.ts";

interface Env { ASSETS: { fetch(request: Request): Promise<Response> } }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET" && url.searchParams.get("lang") !== "en") {
      if (pickLanguage(request.headers.get("accept-language")) === "he") {
        return new Response(null, { status: 302, headers: { location: "/he/", vary: "Accept-Language", "cache-control": "private, no-store" } });
      }
    }
    const res = await env.ASSETS.fetch(request);
    if (url.pathname === "/") {
      const h = new Headers(res.headers);
      h.set("vary", "Accept-Language");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
} satisfies { fetch(request: Request, env: Env): Promise<Response> };
