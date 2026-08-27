// The Hono app and the scheduled job, with every dependency injected so tests run
// them against an in-memory database and a fake mailer. src/index.ts wires the
// real ones (D1, Resend) — by hand, no DI framework (ADR-0003).
import { Hono } from "hono";
import { runDailyDigest, runDetection, runEscalations } from "@clockcover/core";
import type { DigestMessage, Id, Store } from "@clockcover/core";
import type { Db } from "./adapters/store-d1/store.ts";
import { saveImport, saveRoster, periodOf } from "./adapters/store-d1/imports.ts";
import { parseCsv, parseRoster } from "./adapters/csv.ts";
import { renderDigest, renderEscalation } from "./adapters/email.ts";
import type { SendEmail } from "./adapters/email.ts";
import { eq, inArray } from "drizzle-orm";
import * as s from "./adapters/store-d1/schema.ts";

export interface Deps {
  db: Db;
  store: Store;
  sendEmail: SendEmail;
  apiKey: string;
  slaHours: number;
  now?: () => Date;
}

const HOUR = 3_600_000;

export function createApp(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  // Import endpoints are for the operator (a script or the payroll accountant's export),
  // not for managers. Shared secret for the MVP; per-user auth waits for ADR-0004.
  app.use("/employers/*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    if (!deps.apiKey || auth !== `Bearer ${deps.apiKey}`) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.post("/employers/:employerId/roster", async (c) => {
    const employerId = c.req.param("employerId");
    await deps.store.getEmployer(employerId); // 404 semantics via thrown error → 500 is wrong; check first
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
      importId: saved.importId,
      period,
      shifts: saved.shifts.length,
      records: saved.records.length,
      gapsCreated: outcome.created.length,
      gapsResolved: outcome.resolved.length,
      unknownEmployees: saved.unknownEmployees,
    });
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
  const employers = await deps.db.select({ id: s.employers.id }).from(s.employers);
  let digests = 0, escalations = 0;

  for (const { id: employerId } of employers) {
    const names = await employeeNames(deps.db, employerId);
    const send = async (m: DigestMessage) => deps.sendEmail(renderDigest(m, names));
    digests += (await runDailyDigest(deps.store, employerId, t, send)).length;

    const escalated = await runEscalations(deps.store, employerId, t, deps.slaHours * HOUR);
    if (escalated.length) {
      const gaps = await deps.db.select().from(s.gaps).where(inArray(s.gaps.id, escalated.map((e) => e.gapId)));
      for (const e of escalated) {
        const g = gaps.find((x) => x.id === e.gapId);
        if (!g) continue;
        const manager = await deps.store.getManager(g.managerId);
        const gap = { ...g, detectedAt: new Date(g.detectedAt), managerNotifiedAt: g.managerNotifiedAt ? new Date(g.managerNotifiedAt) : null, resolvedAt: g.resolvedAt ? new Date(g.resolvedAt) : null };
        await deps.sendEmail(renderEscalation(e, gap, names.get(g.employeeId) ?? g.employeeId, manager.fullName));
      }
    }
    escalations += escalated.length;
  }
  return { digests, escalations };
}

async function employeeNames(db: Db, employerId: Id): Promise<Map<string, string>> {
  const rows = await db.select({ id: s.employees.id, name: s.employees.fullName }).from(s.employees).where(eq(s.employees.employerId, employerId));
  return new Map(rows.map((r) => [r.id, r.name]));
}
