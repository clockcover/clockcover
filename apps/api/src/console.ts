// Operator console API (ADR-0005). Mounted at /console by app.ts. Bearer token =
// an operator claim signed with LINK_SECRET; obtained by exchanging the emailed link.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { runDetection } from "@clockcover/core";
import type { Deps } from "./app.ts";
import { parseCsv, parseRoster } from "./adapters/csv.ts";
import { renderMagicLink } from "./adapters/email.ts";
import { periodOf, saveImport, saveRoster } from "./adapters/store-d1/imports.ts";
import { isTimezone, listImports, overview, resolutionsBetween, resolutionsCsv } from "./adapters/store-d1/console-queries.ts";
import { consumeLinkToken, takeSendSlot } from "./adapters/store-d1/throttle.ts";
import { ImportError, hasImportSources, runImportFromUrls, validateSourceUrl } from "./import-run.ts";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-keys.ts";
import { readCappedText } from "./body.ts";
import * as s from "./adapters/store-d1/schema.ts";
import { OPERATOR_TTL_MS, SIGNIN_LINK_TTL_MS, signConsoleLink, signOperator, tokenHash, verifyConsoleLink, verifyOperator } from "./link.ts";
import type { OperatorClaims } from "./link.ts";

type Vars = { claims: OperatorClaims; employer: typeof s.employers.$inferSelect };

/** One sign-in email per address per minute. */
export const LOGIN_COOLDOWN_MS = 60_000;

/**
 * Emails an operator a console sign-in link: a 15-minute, single-use token in the URL
 * fragment, which the console exchanges for a 7-day session. Also used by admin invites.
 */
export async function sendConsoleLink(deps: Deps, employer: { id: string; name: string; locale: "en" | "he" }, email: string, t: Date): Promise<void> {
  const exp = t.getTime() + SIGNIN_LINK_TTL_MS;
  const token = await signConsoleLink({ kind: "console_link", employerId: employer.id, email, exp, t: crypto.randomUUID() }, deps.linkSecret);
  const web = deps.consoleUrl.replace(/\/$/, "");
  await deps.sendEmail(renderMagicLink({ locale: employer.locale, to: email, employerName: employer.name, link: `${web}/#${token}`, expires: new Date(exp) }));
}

export function consoleRoutes(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Variables: Vars }>();

  // Same answer whether or not the address is known, and whether or not a link was sent
  // (one per address per minute) — no account enumeration, no mail flood.
  app.post("/login", async (c) => {
    const body = await c.req.json<{ email?: unknown }>().catch(() => ({} as { email?: unknown }));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email.includes("@")) return c.json({ error: "email required" }, 400);
    const t = now();
    if (await takeSendSlot(deps.db, `console_login:${email}`, t, LOGIN_COOLDOWN_MS, 1)) {
      const [employer] = await deps.db.select().from(s.employers).where(eq(s.employers.operatorEmail, email));
      if (employer) await sendConsoleLink(deps, employer, email, t);
    }
    return c.json({ ok: true, message: "If that address runs a ClockCover employer, a sign-in link is on its way." }, 202);
  });

  // The emailed token, once, within 15 minutes → a 7-day session token. A session token
  // presented here is refused: only `console_link` tokens are exchangeable.
  app.post("/exchange", async (c) => {
    const body = await c.req.json<{ token?: unknown }>().catch(() => ({} as { token?: unknown }));
    const token = typeof body.token === "string" ? body.token : "";
    const t = now();
    const link = await verifyConsoleLink(token, deps.linkSecret, t);
    if (!link) return c.json({ error: "link invalid or expired" }, 401);
    if (!(await consumeLinkToken(deps.db, await tokenHash(token), new Date(link.exp), t))) return c.json({ error: "link already used" }, 401);
    const [employer] = await deps.db.select().from(s.employers).where(eq(s.employers.id, link.employerId));
    if (!employer || employer.operatorEmail?.toLowerCase() !== link.email) return c.json({ error: "link invalid or expired" }, 401);
    const exp = t.getTime() + OPERATOR_TTL_MS;
    const session = await signOperator({ kind: "operator", employerId: employer.id, email: link.email, exp }, deps.linkSecret);
    return c.json({ token: session, sessionExpires: new Date(exp).toISOString() });
  });

  app.use("/*", async (c, next) => {
    if (c.req.path.endsWith("/login") || c.req.path.endsWith("/exchange")) return next();
    const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const claims = await verifyOperator(token, deps.linkSecret, now());
    if (!claims) return c.json({ error: "sign in required" }, 401);
    const [employer] = await deps.db.select().from(s.employers).where(eq(s.employers.id, claims.employerId));
    if (!employer || employer.operatorEmail?.toLowerCase() !== claims.email) return c.json({ error: "sign in required" }, 401);
    c.set("claims", claims);
    c.set("employer", employer);
    await next();
  });

  const employerView = (e: typeof s.employers.$inferSelect, exp: number) => ({
    id: e.id, name: e.name, payrollEmail: e.payrollEmail, operatorEmail: e.operatorEmail, timezone: e.timezone, slaHours: e.slaHours,
    importUrl: e.importUrl, rosterUrl: e.rosterUrl, locale: e.locale,
    sessionExpires: new Date(exp).toISOString(),
  });

  app.get("/me", (c) => c.json(employerView(c.get("employer"), c.get("claims").exp)));

  app.patch("/employer", async (c) => {
    const e = c.get("employer");
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const patch: Partial<typeof s.employers.$inferInsert> = {};
    const errors: string[] = [];
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : undefined);
    const name = str("name"); if (name !== undefined) { if (name) patch.name = name; else errors.push("name is empty"); }
    for (const k of ["payrollEmail", "operatorEmail"] as const) {
      const v = str(k); if (v !== undefined) { if (v.includes("@")) patch[k] = v.toLowerCase(); else errors.push(`${k} is not an email`); }
    }
    const tz = str("timezone"); if (tz !== undefined) { if (isTimezone(tz)) patch.timezone = tz; else errors.push("timezone is not an IANA zone name"); }
    for (const k of ["importUrl", "rosterUrl"] as const) {
      const v = str(k);
      if (v !== undefined) {
        const r = validateSourceUrl(v);
        if ("error" in r) errors.push(`${k} ${r.error}`); else patch[k] = r.url;
      }
    }
    const loc = str("locale"); if (loc !== undefined) { if (loc === "en" || loc === "he") patch.locale = loc; else errors.push("locale must be en or he"); }
    if (body["slaHours"] !== undefined) {
      const n = Number(body["slaHours"]);
      if (Number.isInteger(n) && n >= 1 && n <= 24 * 14) patch.slaHours = n; else errors.push("slaHours must be a whole number of hours, 1–336");
    }
    if (errors.length) return c.json({ error: "invalid settings", details: errors }, 400);
    if (Object.keys(patch).length) await deps.db.update(s.employers).set(patch).where(eq(s.employers.id, e.id));
    const [updated] = await deps.db.select().from(s.employers).where(eq(s.employers.id, e.id));
    return c.json(employerView(updated!, c.get("claims").exp));
  });

  app.post("/roster", async (c) => {
    const text = await readCappedText(c.req.raw);
    if (text === null) return c.json({ error: "file is larger than 10 MB" }, 413);
    const { rows, errors } = parseRoster(text);
    if (errors.length) return c.json({ error: "invalid csv", details: errors }, 400);
    const employees = await saveRoster(deps.db, c.get("employer").id, rows);
    return c.json({ employees: employees.length });
  });

  app.post("/imports", async (c) => {
    const employerId = c.get("employer").id;
    const text = await readCappedText(c.req.raw);
    if (text === null) return c.json({ error: "file is larger than 10 MB" }, 413);
    const parsed = parseCsv(text);
    if (parsed.errors.length) return c.json({ error: "invalid csv", details: parsed.errors }, 400);
    const period = periodOf(parsed);
    if (!period) return c.json({ error: "no rows" }, 400);
    const t = now();
    const saved = await saveImport(deps.db, employerId, parsed, t);
    const outcome = await runDetection(deps.store, employerId, period, saved, t);
    return c.json({
      importId: saved.importId, period, shifts: saved.shifts.length, records: saved.records.length,
      gapsCreated: outcome.created.length, gapsResolved: outcome.resolved.length, unknownEmployees: saved.unknownEmployees,
    });
  });

  app.get("/imports", async (c) => c.json({ imports: await listImports(deps.db, c.get("employer").id) }));

  // "Run import now": fetch the configured URLs on demand.
  app.post("/imports/run", async (c) => {
    const e = c.get("employer");
    if (!hasImportSources(e)) return c.json({ error: "no import URL configured — set one in Settings or upload a file" }, 400);
    try {
      return c.json(await runImportFromUrls(deps.db, deps.store, e, now(), deps.fetch ?? fetch));
    } catch (err) {
      if (err instanceof ImportError) return c.json({ error: err.message, step: err.step, details: err.details }, 502);
      throw err;
    }
  });

  // API keys for scripts and schedulers: shown once, hashed, revocable.
  app.get("/api-keys", async (c) => c.json({ keys: await listApiKeys(deps.db, c.get("employer").id) }));
  app.post("/api-keys", async (c) => {
    const body = await c.req.json<{ name?: unknown }>().catch(() => ({} as { name?: unknown }));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return c.json({ error: "name required — what will use this key?" }, 400);
    return c.json(await createApiKey(deps.db, c.get("employer").id, name, now()), 201);
  });
  app.delete("/api-keys/:id", async (c) => {
    const ok = await revokeApiKey(deps.db, c.get("employer").id, c.req.param("id"), now());
    return ok ? c.json({ revoked: true }) : c.json({ error: "no such active key" }, 404);
  });

  // Corrections made by people, for payroll to carry into the attendance/payroll system.
  app.get("/resolutions.csv", async (c) => {
    const e = c.get("employer");
    const from = c.req.query("from") ?? "", to = c.req.query("to") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return c.json({ error: "from and to must be YYYY-MM-DD, from ≤ to" }, 400);
    const rows = await resolutionsBetween(deps.db, e.id, from, to, e.timezone);
    return c.body(resolutionsCsv(rows), 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="clockcover-corrections-${from}-${to}.csv"`,
    });
  });

  app.get("/overview", async (c) => {
    const e = c.get("employer");
    return c.json(await overview(deps.db, e.id, e.slaHours, now()));
  });

  return app;
}
