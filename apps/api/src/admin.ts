// Owner admin area API (ADR-0006). Mounted at /admin by app.ts. One allowed address
// (ADMIN_EMAIL); sign-in by magic link; bearer token with kind=admin.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Deps } from "./app.ts";
import { renderMagicLink } from "./adapters/email.ts";
import { adminEmployers, isTimezone } from "./adapters/store-d1/console-queries.ts";
import * as s from "./adapters/store-d1/schema.ts";
import { OPERATOR_TTL_MS, signAdmin, signOperator, verifyAdmin } from "./link.ts";
import type { AdminClaims } from "./link.ts";

type Vars = { claims: AdminClaims };

export function adminRoutes(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const adminWeb = deps.adminUrl.replace(/\/$/, "");
  const consoleWeb = deps.consoleUrl.replace(/\/$/, "");
  const owner = () => deps.adminEmail.trim().toLowerCase(); // read per request so a config change applies at once
  const app = new Hono<{ Variables: Vars }>();

  /** Emails an operator their console sign-in link. Used on create, on operator change, and on demand. */
  async function inviteOperator(employer: { id: string; name: string; operatorEmail: string | null; locale: "en" | "he" }, t: Date): Promise<boolean> {
    if (!employer.operatorEmail) return false;
    const exp = Math.floor((t.getTime() + OPERATOR_TTL_MS) / 60_000) * 60_000;
    const token = await signOperator({ kind: "operator", employerId: employer.id, email: employer.operatorEmail, exp }, deps.linkSecret);
    await deps.sendEmail(renderMagicLink({ locale: employer.locale, to: employer.operatorEmail, employerName: employer.name, link: `${consoleWeb}/console/${token}`, expires: new Date(exp) }));
    return true;
  }

  app.post("/login", async (c) => {
    const body = await c.req.json<{ email?: unknown; locale?: unknown }>().catch(() => ({} as { email?: unknown; locale?: unknown }));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const locale = body.locale === "he" ? "he" : "en";
    if (!email.includes("@")) return c.json({ error: "email required" }, 400);
    if (owner() && email === owner()) {
      const t = now();
      const exp = Math.floor((t.getTime() + OPERATOR_TTL_MS) / 60_000) * 60_000;
      const token = await signAdmin({ kind: "admin", email, exp }, deps.linkSecret);
      await deps.sendEmail(renderMagicLink({ locale, to: email, employerName: "ClockCover", link: `${adminWeb}/admin/${token}`, expires: new Date(exp), area: "admin" }));
    }
    return c.json({ ok: true, message: "If that is the owner's address, a sign-in link is on its way." }, 202);
  });

  app.use("/*", async (c, next) => {
    if (c.req.path.endsWith("/login")) return next();
    const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const claims = await verifyAdmin(token, deps.linkSecret, now());
    if (!claims || !owner() || claims.email !== owner()) return c.json({ error: "sign in required" }, 401);
    c.set("claims", claims);
    await next();
  });

  app.get("/me", (c) => c.json({ email: c.get("claims").email, sessionExpires: new Date(c.get("claims").exp).toISOString() }));

  app.get("/employers", async (c) => c.json({ employers: await adminEmployers(deps.db) }));

  const readEmployerBody = async (c: { req: { json: <T>() => Promise<T> } }) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
    const errors: string[] = [];
    const out: { name?: string; payrollEmail?: string; operatorEmail?: string; timezone?: string; locale?: "en" | "he" } = {};
    const name = str("name"); if (name !== undefined) { if (name) out.name = name; else errors.push("name is empty"); }
    for (const k of ["payrollEmail", "operatorEmail"] as const) {
      const v = str(k); if (v !== undefined) { if (v.includes("@")) out[k] = v.toLowerCase(); else errors.push(`${k} is not an email`); }
    }
    const tz = str("timezone"); if (tz !== undefined) { if (isTimezone(tz)) out.timezone = tz; else errors.push("timezone is not an IANA zone name"); }
    const loc = str("locale"); if (loc !== undefined) { if (loc === "en" || loc === "he") out.locale = loc; else errors.push("locale must be en or he"); }
    return { out, errors };
  };

  app.post("/employers", async (c) => {
    const { out, errors } = await readEmployerBody(c);
    for (const k of ["name", "payrollEmail", "operatorEmail"] as const) if (out[k] === undefined && !errors.some((e) => e.startsWith(k))) errors.push(`${k} is required`);
    if (errors.length) return c.json({ error: "invalid employer", details: errors }, 400);
    const row = { id: crypto.randomUUID(), name: out.name!, payrollEmail: out.payrollEmail!, operatorEmail: out.operatorEmail!, timezone: out.timezone ?? "UTC", locale: out.locale ?? "en" as const };
    await deps.db.insert(s.employers).values(row);
    const invited = await inviteOperator(row, now());
    return c.json({ id: row.id, invited }, 201);
  });

  app.patch("/employers/:id", async (c) => {
    const id = c.req.param("id");
    const [existing] = await deps.db.select().from(s.employers).where(eq(s.employers.id, id));
    if (!existing) return c.json({ error: "employer not found" }, 404);
    const { out, errors } = await readEmployerBody(c);
    if (errors.length) return c.json({ error: "invalid employer", details: errors }, 400);
    if (Object.keys(out).length) await deps.db.update(s.employers).set(out).where(eq(s.employers.id, id));
    const [updated] = await deps.db.select().from(s.employers).where(eq(s.employers.id, id));
    const operatorChanged = out.operatorEmail !== undefined && out.operatorEmail !== (existing.operatorEmail ?? "").toLowerCase();
    const invited = operatorChanged ? await inviteOperator(updated!, now()) : false;
    return c.json({ id, invited });
  });

  app.post("/employers/:id/invite", async (c) => {
    const [employer] = await deps.db.select().from(s.employers).where(eq(s.employers.id, c.req.param("id")));
    if (!employer) return c.json({ error: "employer not found" }, 404);
    if (!employer.operatorEmail) return c.json({ error: "employer has no operator email" }, 400);
    await inviteOperator(employer, now());
    return c.json({ invited: true });
  });

  return app;
}
