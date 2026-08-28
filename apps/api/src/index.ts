// Cloudflare Worker entry. The only file that knows about D1 bindings and env vars.
import { drizzle } from "drizzle-orm/d1";
import { createApp, runScheduled } from "./app.ts";
import type { Deps } from "./app.ts";
import { SqlStore } from "./adapters/store-d1/store.ts";
import { resendSender } from "./adapters/email.ts";
import * as schema from "./adapters/store-d1/schema.ts";

interface Env {
  DB: D1Database;
  LINK_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  WEB_URL: string;
  CONSOLE_URL: string;
  ADMIN_URL: string;
  ADMIN_EMAIL: string;
  SITE_URLS: string;
  CONTACT_EMAIL: string;
  SLA_HOURS: string;
}

function deps(env: Env): Deps {
  if (!env.LINK_SECRET || env.LINK_SECRET.length < 32) {
    throw new Error("LINK_SECRET must be at least 32 characters — set it with `wrangler secret put LINK_SECRET` (locally: .dev.vars)");
  }
  const db = drizzle(env.DB, { schema });
  return {
    db,
    store: new SqlStore(db),
    sendEmail: resendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }),
    linkSecret: env.LINK_SECRET,
    webUrl: env.WEB_URL,
    consoleUrl: env.CONSOLE_URL,
    adminUrl: env.ADMIN_URL,
    adminEmail: env.ADMIN_EMAIL,
    siteUrls: env.SITE_URLS.split(",").map((s) => s.trim()).filter(Boolean),
    contactEmail: env.CONTACT_EMAIL,
    slaHours: Number(env.SLA_HOURS) || 48,
  };
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => createApp(deps(env)).fetch(request, env, ctx),
  scheduled: async (_controller: ScheduledController, env: Env) => {
    const result = await runScheduled(deps(env));
    console.log(JSON.stringify({ job: "daily", ...result }));
  },
} satisfies ExportedHandler<Env>;
