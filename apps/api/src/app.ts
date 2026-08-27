// The Hono app and the scheduled job, with every dependency injected so tests run
// them against an in-memory database and a fake mailer. src/index.ts wires the
// real ones (D1, Resend) — by hand, no DI framework (ADR-0003).
import { Hono } from "hono";
import { cors } from "hono/cors";
import { isoDate, resolveByManager, runDailyDigest, runDetection, runEscalations } from "@clockcover/core";
import type { DigestMessage, Gap, Store } from "@clockcover/core";
import { eq } from "drizzle-orm";
import type { Db } from "./adapters/store-d1/store.ts";
import { periodOf, saveImport, saveRoster } from "./adapters/store-d1/imports.ts";
import { gapViews, unscheduledFor } from "./adapters/store-d1/views.ts";
import * as s from "./adapters/store-d1/schema.ts";
import { parseCsv, parseRoster } from "./adapters/csv.ts";
import { renderDigest, renderEscalation } from "./adapters/email.ts";
import type { SendEmail } from "./adapters/email.ts";
import { LINK_TTL_MS, signLink, verifyLink } from "./link.ts";

export interface Deps {
  db: Db;
  store: Store;
  sendEmail: SendEmail;
  /** Operator key for the import endpoints. */
  apiKey: string;
  /** HMAC key for manager digest links (ADR-0004). */
  linkSecret: string;
  /** Origin of apps/web, e.g. https://digest.example.com — used to build links and allow CORS. */
  webUrl: string;
  slaHours: number;
  now?: () => Date;
}

const HOUR = 3_600_000;

export function createApp(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- Operator endpoints: shared secret. Different audience from managers.
  app.use("/employers/*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    if (!deps.apiKey || auth !== `Bearer ${deps.apiKey}`) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.post("/employers/:employerId/roster", async (c) => {
    const employerId = c.req.param("employerId");
    await deps.store.getEmployer(employerId);
    const { rows, errors } = parseRoster(await c.req.text());
    if (errors.length) return c.json({ error: "invalid csv", details: errors }, 400);
    const employees = await saveRoster(deps.db, employerId, rows);
    return c.json({ employees: employees.length });
  });

  app.post("/employers/:employerId/imports", async (c) => {
    const employerId = c.req.param("employerId");
    await deps.store.getEmployer(employerId);
    const parsed = parseCsv(await c.req.text());
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

  // ---- Manager endpoints: signed link in the path (ADR-0004). Called from apps/web.
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
      digestDate: isoDate(t, employer.timezone),
      slaHours: deps.slaHours,
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
    const body = await c.req.json<{ note?: unknown }>().catch(() => ({} as { note?: unknown }));
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    const gap = await resolveByManager(deps.store, gapId, now(), note);
    return c.json({ id: gap.id, resolvedAt: gap.resolvedAt?.toISOString(), resolution: gap.resolution, note: gap.resolutionNote });
  });

  app.onError((err, c) => {
    if (/not found/.test(err.message)) return c.json({ error: err.message }, 404);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}

/** The daily job: digests, then escalations, for every employer. Invoked by the Cron Trigger. */
export async function runScheduled(deps: Deps): Promise<{ digests: number; escalations: number }> {
  const t = (deps.now ?? (() => new Date()))();
  const employers = await deps.db.select().from(s.employers);
  let digests = 0, escalations = 0;

  for (const employer of employers) {
    const send = async (m: DigestMessage) => {
      const exp = t.getTime() + LINK_TTL_MS;
      const token = await signLink({ employerId: employer.id, managerId: m.manager.id, exp }, deps.linkSecret);
      await deps.sendEmail(renderDigest({
        manager: m.manager, employerName: employer.name,
        gaps: await gapViews(deps.db, employer.id, m.gaps),
        digestDate: isoDate(t, employer.timezone), slaHours: deps.slaHours,
        link: `${deps.webUrl.replace(/\/$/, "")}/d/${token}`, linkExpires: new Date(exp),
      }));
    };
    digests += (await runDailyDigest(deps.store, employer.id, t, send)).length;

    const escalated = await runEscalations(deps.store, employer.id, t, deps.slaHours * HOUR);
    if (escalated.length) {
      const rows = await deps.db.select().from(s.gaps);
      const gaps: Gap[] = escalated.map((e) => rows.find((x) => x.id === e.gapId)).filter((x) => x !== undefined)
        .map((g) => ({ ...g, detectedAt: new Date(g.detectedAt), managerNotifiedAt: g.managerNotifiedAt ? new Date(g.managerNotifiedAt) : null, resolvedAt: g.resolvedAt ? new Date(g.resolvedAt) : null }));
      const views = await gapViews(deps.db, employer.id, gaps);
      for (const e of escalated) {
        const view = views.find((v) => v.gap.id === e.gapId);
        if (!view) continue;
        const manager = await deps.store.getManager(view.gap.managerId);
        await deps.sendEmail(renderEscalation({ escalation: e, view, manager, employerName: employer.name, slaHours: deps.slaHours }));
      }
    }
    escalations += escalated.length;
  }
  return { digests, escalations };
}
