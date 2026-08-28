// The Hono app and the scheduled job, with every dependency injected so tests run
// them against an in-memory database and a fake mailer. src/index.ts wires the
// real ones (D1, Resend) — by hand, no DI framework (ADR-0003).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isoDate, resolveByManager, resolveByPayroll, runDailyDigest, runDetection, runEscalations } from "@clockcover/core";
import type { DigestMessage, EscalationMessage, Gap, Store } from "@clockcover/core";
import { eq } from "drizzle-orm";
import type { Db } from "./adapters/store-d1/store.ts";
import { periodOf, saveImport, saveRoster } from "./adapters/store-d1/imports.ts";
import { gapViews, unscheduledFor } from "./adapters/store-d1/views.ts";
import { takeSendSlot } from "./adapters/store-d1/throttle.ts";
import { readCappedText } from "./body.ts";
import * as s from "./adapters/store-d1/schema.ts";
import { parseCsv, parseRoster } from "./adapters/csv.ts";
import { renderContact, renderDigest, renderEscalation, renderImportFailure } from "./adapters/email.ts";
import { ImportError, hasImportSources, runImportFromUrls } from "./import-run.ts";
import type { SendEmail } from "./adapters/email.ts";
import { LINK_TTL_MS, signLink, signPayroll, verifyLink, verifyPayroll } from "./link.ts";
import { consoleRoutes } from "./console.ts";
import { authenticateApiKey } from "./api-keys.ts";
import { adminRoutes } from "./admin.ts";

export interface Deps {
  db: Db;
  store: Store;
  sendEmail: SendEmail;
  /** HMAC key for manager digest links (ADR-0004). */
  linkSecret: string;
  /** Origin of the manager digest page (apps/portal on the digest host) — digest links and CORS for /d/*. */
  webUrl: string;
  /** Origin of the operator console (apps/portal on the app host) — magic links and CORS for /console/*. */
  consoleUrl: string;
  /** Origin of the owner\'s admin area (apps/portal on the admin host) — magic links and CORS for /admin/*. */
  adminUrl: string;
  /** The one address that may sign in to the admin area (ADR-0006). */
  adminEmail: string;
  /** Public site origins allowed to POST the contact form, and where those messages go. */
  siteUrls: string[];
  contactEmail: string;
  /** Default SLA for employers that have not set their own (employers.sla_hours). */
  slaHours: number;
  now?: () => Date;
  /** Outbound HTTP for scheduled imports; injected in tests. */
  fetch?: typeof fetch;
}

const HOUR = 3_600_000;
/** Contact form: this many messages per hour, per sender address and per client IP. */
export const CONTACT_LIMIT = 5;

export function createApp(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- Contact form from the public site. No auth; validated, honeypot, size-capped, rate-limited, emailed to us.
  app.use("/contact", cors({ origin: deps.siteUrls, allowMethods: ["POST"], allowHeaders: ["content-type"] }));
  app.post("/contact", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const str = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : "");
    if (str("website", 10)) return c.json({ ok: true }, 202); // honeypot: bots fill it, people never see it
    const name = str("name", 120), email = str("email", 200), employer = str("employer", 200), message = str("message", 4000);
    const locale = body["locale"] === "he" ? "he" : "en";
    const errors: string[] = [];
    if (!name) errors.push("name");
    if (!email.includes("@")) errors.push("email");
    if (message.length < 10) errors.push("message");
    if (errors.length) return c.json({ error: "invalid", fields: errors }, 400);
    const t = now();
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    if (!(await takeSendSlot(deps.db, `contact:ip:${ip}`, t, HOUR, CONTACT_LIMIT)) || !(await takeSendSlot(deps.db, `contact:email:${email.toLowerCase()}`, t, HOUR, CONTACT_LIMIT))) {
      return c.json({ error: "too many messages — please try again in an hour" }, 429);
    }
    await deps.sendEmail(renderContact({ to: deps.contactEmail, name, email, employer, message, locale, receivedAt: t }));
    return c.json({ ok: true }, 202);
  });

  // ---- Upload endpoints for scripts and schedulers: a per-employer API key issued in the
  //      console (api-keys.ts). The key decides the employer; the path must agree with it.
  app.use("/employers/*", async (c, next) => {
    const bearer = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const auth = bearer ? await authenticateApiKey(deps.db, bearer, now()) : null;
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const wanted = c.req.path.split("/")[2];
    if (wanted !== auth.employerId) return c.json({ error: "key belongs to another employer" }, 403);
    await next();
  });

  app.post("/employers/:employerId/roster", async (c) => {
    const employerId = c.req.param("employerId");
    await deps.store.getEmployer(employerId);
    const text = await readCappedText(c.req.raw);
    if (text === null) return c.json({ error: "file is larger than 10 MB" }, 413);
    const { rows, errors } = parseRoster(text);
    if (errors.length) return c.json({ error: "invalid csv", details: errors }, 400);
    const employees = await saveRoster(deps.db, employerId, rows);
    return c.json({ employees: employees.length });
  });

  app.post("/employers/:employerId/imports", async (c) => {
    const employerId = c.req.param("employerId");
    await deps.store.getEmployer(employerId);
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
      importId: saved.importId, period,
      shifts: saved.shifts.length, records: saved.records.length,
      gapsCreated: outcome.created.length, gapsResolved: outcome.resolved.length,
      unknownEmployees: saved.unknownEmployees,
    });
  });

  // ---- Operator console (ADR-0005). Bearer token; called from apps/portal.
  app.use("/console/*", cors({ origin: deps.consoleUrl, allowMethods: ["GET", "POST", "PATCH", "DELETE"], allowHeaders: ["content-type", "authorization"] }));
  app.route("/console", consoleRoutes(deps));

  // ---- Owner admin area (ADR-0006). Bearer token, kind=admin.
  app.use("/admin/*", cors({ origin: deps.adminUrl, allowMethods: ["GET", "POST", "PATCH"], allowHeaders: ["content-type", "authorization"] }));
  app.route("/admin", adminRoutes(deps));

  // ---- Manager endpoints: signed link in the path (ADR-0004). Called from apps/portal.
  app.use("/d/*", cors({ origin: deps.webUrl, allowMethods: ["GET", "POST"], allowHeaders: ["content-type"] }));

  const withClaims = async (token: string) => verifyLink(token, deps.linkSecret, now());

  app.get("/d/:token", async (c) => {
    const claims = await withClaims(c.req.param("token"));
    if (!claims) return c.json({ error: "link invalid or expired" }, 401);
    const t = now();
    const [manager, employer] = await Promise.all([deps.store.getManager(claims.managerId), deps.store.getEmployer(claims.employerId)]);
    const mine = (await deps.store.listOpenGaps(claims.employerId)).filter((g) => g.managerId === claims.managerId);
    const views = await gapViews(deps.db, claims.employerId, mine);
    const escalated = new Set(
      mine.length ? (await Promise.all(mine.map(async (g) => ((await deps.store.hasEscalation(g.id)) ? g.id : null)))).filter(Boolean) : [],
    );
    const since = isoDate(new Date(t.getTime() - 14 * 24 * HOUR));
    return c.json({
      manager: { fullName: manager.fullName },
      employer: { name: employer.name },
      locale: employer.locale,
      digestDate: isoDate(t, employer.timezone),
      slaHours: employer.slaHours,
      linkExpires: new Date(claims.exp).toISOString(),
      gaps: views.map((v) => ({
        id: v.gap.id, employeeName: v.employeeName, gapDate: v.gap.gapDate, gapType: v.gap.gapType,
        shift: v.shift, record: v.record,
        managerNotifiedAt: v.gap.managerNotifiedAt?.toISOString() ?? null,
        escalated: escalated.has(v.gap.id),
      })),
      unscheduled: await unscheduledFor(deps.db, claims.employerId, claims.managerId, since),
    });
  });

  app.post("/d/:token/gaps/:gapId/resolve", async (c) => {
    const claims = await withClaims(c.req.param("token"));
    if (!claims) return c.json({ error: "link invalid or expired" }, 401);
    const gapId = c.req.param("gapId");
    const [row] = await deps.db.select().from(s.gaps).where(eq(s.gaps.id, gapId));
    if (!row || row.employerId !== claims.employerId || row.managerId !== claims.managerId) return c.json({ error: "gap not found" }, 404);
    if (row.resolvedAt) return c.json({ error: "already resolved", resolution: row.resolution }, 409);
    const body = await c.req.json<{ outcome?: unknown; note?: unknown }>().catch(() => ({} as { outcome?: unknown; note?: unknown }));
    const outcome = body.outcome === "present" || body.outcome === "absent" ? body.outcome : null;
    if (!outcome) return c.json({ error: "outcome must be 'present' (worked, entry missing) or 'absent' (did not work)" }, 400);
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    if (outcome === "absent" && !note) return c.json({ error: "an absence needs a note — what happened?" }, 400);
    try {
      const gap = await resolveByManager(deps.store, gapId, now(), outcome, note);
      return c.json({ id: gap.id, resolvedAt: gap.resolvedAt?.toISOString(), resolution: gap.resolution, outcome: gap.outcome, note: gap.resolutionNote });
    } catch (err) {
      if (isAlreadyResolved(err)) return c.json({ error: "already resolved" }, 409);
      throw err;
    }
  });

  // ---- Payroll accountant: one escalated gap per signed link (scope.md, ADR-0004 § extended).
  app.use("/e/*", cors({ origin: deps.webUrl, allowMethods: ["GET", "POST"], allowHeaders: ["content-type"] }));

  const payrollGap = async (token: string) => {
    const claims = await verifyPayroll(token, deps.linkSecret, now());
    if (!claims) return null;
    const [row] = await deps.db.select().from(s.gaps).where(eq(s.gaps.id, claims.gapId));
    if (!row || row.employerId !== claims.employerId) return null;
    const employer = await deps.store.getEmployer(claims.employerId);
    if (employer.payrollEmail.toLowerCase() !== claims.email.toLowerCase()) return null;
    return { claims, row, employer };
  };
  const toGap = (g: typeof s.gaps.$inferSelect): Gap => ({ ...g, detectedAt: new Date(g.detectedAt), managerNotifiedAt: g.managerNotifiedAt ? new Date(g.managerNotifiedAt) : null, resolvedAt: g.resolvedAt ? new Date(g.resolvedAt) : null });

  app.get("/e/:token", async (c) => {
    const found = await payrollGap(c.req.param("token"));
    if (!found) return c.json({ error: "link invalid or expired" }, 401);
    const { claims, row, employer } = found;
    const gap = toGap(row);
    const [view] = await gapViews(deps.db, employer.id, [gap]);
    const manager = await deps.store.getManager(gap.managerId);
    const [esc] = await deps.db.select().from(s.escalations).where(eq(s.escalations.gapId, gap.id));
    return c.json({
      employer: { name: employer.name },
      manager: { fullName: manager.fullName },
      locale: employer.locale,
      gap: {
        id: gap.id, employeeName: view!.employeeName, gapDate: gap.gapDate, gapType: gap.gapType, shift: view!.shift, record: view!.record,
        managerNotifiedAt: gap.managerNotifiedAt?.toISOString() ?? null,
        escalatedAt: esc?.escalatedAt ?? null,
        resolvedAt: gap.resolvedAt?.toISOString() ?? null, resolution: gap.resolution, outcome: gap.outcome, resolutionNote: gap.resolutionNote,
      },
      linkExpires: new Date(claims.exp).toISOString(),
    });
  });

  app.post("/e/:token/handle", async (c) => {
    const found = await payrollGap(c.req.param("token"));
    if (!found) return c.json({ error: "link invalid or expired" }, 401);
    if (found.row.resolvedAt) return c.json({ error: "already resolved", resolution: found.row.resolution }, 409);
    const body = await c.req.json<{ outcome?: unknown; note?: unknown }>().catch(() => ({} as { outcome?: unknown; note?: unknown }));
    const outcome = body.outcome === "present" || body.outcome === "absent" ? body.outcome : null;
    if (!outcome) return c.json({ error: "outcome must be 'present' or 'absent'" }, 400);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (!note) return c.json({ error: "a note is required — say why the entry will never arrive" }, 400);
    try {
      const gap = await resolveByPayroll(deps.store, found.row.id, now(), outcome, note);
      return c.json({ id: gap.id, resolvedAt: gap.resolvedAt?.toISOString(), resolution: gap.resolution, outcome: gap.outcome, note: gap.resolutionNote });
    } catch (err) {
      if (isAlreadyResolved(err)) return c.json({ error: "already resolved" }, 409);
      throw err;
    }
  });

  // Error text never reaches the client: a "not found" from the store becomes a fixed 404
  // body, anything else a fixed 500 (the message may carry ids or SQL).
  app.onError((err, c) => {
    if (/not found/.test(err.message)) return c.json({ error: "not found" }, 404);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

/** The store's signal that a resolve lost the race with another (SqlStore.resolveGap). */
const isAlreadyResolved = (err: unknown) => err instanceof Error && /already resolved/.test(err.message);

/**
 * The daily job: import, digests, then escalations, for every employer. Invoked by the Cron
 * Trigger. Employers are isolated: one failing employer is logged and counted in `failures`;
 * the next one still runs. Every step is at-least-once, so the next run picks up what failed.
 */
export async function runScheduled(deps: Deps): Promise<{ imports: number; importFailures: number; digests: number; escalations: number; failures: number }> {
  const t = (deps.now ?? (() => new Date()))();
  const employers = await deps.db.select().from(s.employers);
  let imports = 0, importFailures = 0, digests = 0, escalations = 0, failures = 0;

  for (const employer of employers) {
    try {
    // 1. Fetch today's files first, so the digest reflects them. A failure is reported to the
    //    operator and does not stop the digest — yesterday's data is better than silence.
    if (hasImportSources(employer)) {
      try {
        await runImportFromUrls(deps.db, deps.store, employer, t, deps.fetch ?? fetch);
        imports++;
      } catch (err) {
        importFailures++;
        const e = err instanceof ImportError ? err : new ImportError("import", err instanceof Error ? err.message : String(err));
        console.error(JSON.stringify({ job: "import", employerId: employer.id, step: e.step, message: e.message }));
        if (employer.operatorEmail) {
          await deps.sendEmail(renderImportFailure({ locale: employer.locale, to: employer.operatorEmail, employerName: employer.name, step: e.step, message: e.message, details: e.details, consoleUrl: deps.consoleUrl.replace(/\/$/, "") }));
        }
      }
    }

    const send = async (m: DigestMessage) => {
      const exp = t.getTime() + LINK_TTL_MS;
      const token = await signLink({ employerId: employer.id, managerId: m.manager.id, exp }, deps.linkSecret);
      await deps.sendEmail(renderDigest({
        locale: employer.locale, manager: m.manager, employerName: employer.name,
        gaps: await gapViews(deps.db, employer.id, m.gaps),
        digestDate: isoDate(t, employer.timezone), slaHours: employer.slaHours,
        link: `${deps.webUrl.replace(/\/$/, "")}/d/${token}`, linkExpires: new Date(exp),
      }));
    };
    digests += (await runDailyDigest(deps.store, employer.id, t, send)).length;

    // The core records the escalation only after this resolves (at-least-once, like the digest).
    const sendEscalation = async (m: EscalationMessage) => {
      const [view] = await gapViews(deps.db, employer.id, [m.gap]);
      if (!view) throw new Error(`gap ${m.gap.id} has no view`);
      const manager = await deps.store.getManager(m.gap.managerId);
      const exp = t.getTime() + LINK_TTL_MS;
      const token = await signPayroll({ kind: "payroll", employerId: employer.id, gapId: m.gap.id, email: employer.payrollEmail, exp }, deps.linkSecret);
      await deps.sendEmail(renderEscalation({
        locale: employer.locale, escalation: m.escalation, view, manager, employerName: employer.name, slaHours: employer.slaHours,
        link: `${deps.webUrl.replace(/\/$/, "")}/e/${token}`, linkExpires: new Date(exp),
      }));
    };
    escalations += (await runEscalations(deps.store, employer.id, t, sendEscalation)).length;
    } catch (err) {
      failures++;
      console.error(JSON.stringify({ job: "daily", employerId: employer.id, message: err instanceof Error ? err.message : String(err) }));
    }
  }
  return { imports, importFailures, digests, escalations, failures };
}
