// Cloudflare Worker entry. The only file that knows about D1 bindings and env vars.
import { drizzle } from "drizzle-orm/d1";
import { createApp, runScheduled } from "./app.ts";
import type { Deps } from "./app.ts";
import { SqlStore } from "./adapters/store-d1/store.ts";
import { resendSender } from "./adapters/email.ts";
import * as schema from "./adapters/store-d1/schema.ts";

interface Env {
  DB: D1Database;
  API_KEY: string;
  LINK_SECRET: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  WEB_URL: string;
  CONSOLE_URL: string;
  ADMIN_URL: string;
  ADMIN_EMAIL: string;
  SLA_HOURS: string;
}

function deps(env: Env): Deps {
  const db = drizzle(env.DB, { schema });
  return {
    db,
    store: new SqlStore(db),
    sendEmail: resendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }),
    apiKey: env.API_KEY,
    linkSecret: env.LINK_SECRET,
    webUrl: env.WEB_URL,
    consoleUrl: env.CONSOLE_URL,
    adminUrl: env.ADMIN_URL,
    adminEmail: env.ADMIN_EMAIL,
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
